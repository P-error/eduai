import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { llmChatText } from "@/lib/llm/provider";
import { getPromptTemplate, renderPrompt } from "@/lib/prompts";

const ChatSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().optional().nullable(),
  subjectId: z.string().optional().nullable(),
  declaredPreferences: z.record(z.string()).optional(),
});

function extractSignals(message: string) {
  const lower = message.toLowerCase();
  return {
    simplify: lower.includes("simplify") || lower.includes("simpler"),
    deeper: lower.includes("deeper") || lower.includes("more detail"),
    example: lower.includes("example"),
    paraphrase: lower.includes("paraphrase"),
    repeat: lower.includes("repeat"),
  };
}

export async function POST(request: Request) {
  const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  let payload: z.infer<typeof ChatSchema>;
  try {
    payload = ChatSchema.parse(await request.json());
  } catch (error) {
    const message = errorMessage(error);
    console.error("Chat input error", error);
    return NextResponse.json(
      { error: "INVALID_INPUT", message },
      { status: 400 },
    );
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Invalid or missing token." },
      { status: 401 },
    );
  }

  const effectivePreferences = (user.effectivePreferencesJson ?? {}) as Record<
    string,
    string
  >;

  const declaredPreferences =
    payload.declaredPreferences ??
    ((user.declaredPreferencesJson ?? {}) as Record<string, string>);

  if (payload.declaredPreferences) {
    await prisma.user.update({
      where: { id: user.id },
      data: { declaredPreferencesJson: declaredPreferences },
    });
  }

  let promptTemplate;
  try {
    promptTemplate = await getPromptTemplate("chat_system_v1");
  } catch (error) {
    const message = errorMessage(error);
    console.error("Chat prompt error", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message },
      { status: 500 },
    );
  }
  const session =
    payload.sessionId != null
      ? await prisma.chatSession.findUnique({ where: { id: payload.sessionId } })
      : null;

  const subject =
    payload.subjectId != null
      ? await prisma.subject.findFirst({
          where: {
            id: payload.subjectId,
            userId: user.id,
            archivedAt: null,
          },
        })
      : null;

  if (payload.subjectId && !subject) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Subject not found." },
      { status: 400 },
    );
  }

  const activeSession =
    session ??
    (await prisma.chatSession.create({
      data: {
        userId: user.id,
        declaredPreferencesJson: declaredPreferences,
        effectivePreferencesJson: effectivePreferences,
        personalizationReady: user.personalizationReady,
        promptTemplateId: promptTemplate.id,
        subjectId: subject?.id ?? null,
      },
    }));

  const systemPrompt = renderPrompt(promptTemplate.template, {
    declared: JSON.stringify(declaredPreferences),
    effective: JSON.stringify(effectivePreferences),
    ready: user.personalizationReady,
  });

  let reply: string;
  try {
    reply = await llmChatText({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: payload.message },
      ],
    });
  } catch (error) {
    const message = errorMessage(error);
    console.error("Chat LLM error", error);
    return NextResponse.json(
      { error: "LLM_BAD_RESPONSE", message },
      { status: 502 },
    );
  }

  const signals = extractSignals(payload.message);

  try {
    await prisma.chatMessage.createMany({
      data: [
        {
          sessionId: activeSession.id,
          role: "user",
          content: payload.message,
          signalsJson: signals,
        },
        {
          sessionId: activeSession.id,
          role: "assistant",
          content: reply,
        },
      ],
    });

    return NextResponse.json({
      sessionId: activeSession.id,
      reply,
    });
  } catch (error) {
    const message = errorMessage(error);
    console.error("Chat persistence error", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message },
      { status: 500 },
    );
  }
}
