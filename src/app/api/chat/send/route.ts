import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/auth";
import { llmChatText } from "@/lib/llm/provider";
import { getPromptTemplate, renderPrompt } from "@/lib/prompts";

const ChatSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().optional(),
  subject: z.string().optional(),
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
  const payload = ChatSchema.parse(await request.json());
  const user = await getOrCreateUser(request);

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

  const promptTemplate = await getPromptTemplate("chat_system_v1");
  const session =
    payload.sessionId &&
    (await prisma.chatSession.findUnique({ where: { id: payload.sessionId } }));

  const activeSession =
    session ??
    (await prisma.chatSession.create({
      data: {
        userId: user.id,
        declaredPreferencesJson: declaredPreferences,
        effectivePreferencesJson: effectivePreferences,
        personalizationReady: user.personalizationReady,
        promptTemplateId: promptTemplate.id,
        subjectId: payload.subject
          ? (
              await prisma.subject.upsert({
                where: { name: payload.subject },
                update: {},
                create: { name: payload.subject },
              })
            ).id
          : null,
      },
    }));

  const systemPrompt = renderPrompt(promptTemplate.template, {
    declared: JSON.stringify(declaredPreferences),
    effective: JSON.stringify(effectivePreferences),
    ready: user.personalizationReady,
  });

  const reply = await llmChatText({
    model: "gpt-4o-mini",
    temperature: 0.6,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: payload.message },
    ],
  });

  const signals = extractSignals(payload.message);

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
}
