import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ensureTagLegend } from "@/lib/tag-seed";
import { llmChatJsonWithRaw } from "@/lib/llm/provider";
import { TestSchema } from "@/lib/test-schema";
import { tagQuestion } from "@/lib/tagger";
import { getUserFromRequest } from "@/lib/auth";
import { getActivePromptTemplate, renderPrompt } from "@/lib/prompts";
import { tagQuestionsWithLLM } from "@/lib/llm-tagger";

const DeliverySchema = z
  .object({
    depth: z.string().optional(),
    cognitive_level: z.string().optional(),
    task_type: z.string().optional(),
    micro_complexity: z.string().optional(),
    format: z.string().optional(),
    tone: z.string().optional(),
    style: z.string().optional(),
  })
  .optional();

const GenerateSchema = z.object({
  subjectId: z.string().min(1),
  sectionId: z.string().optional().nullable(),
  topic: z.string().min(2),
  questionCount: z.number().int().min(1).max(20),
  mode: z.enum(["quiz", "exam", "practice"]).default("quiz"),
  delivery: DeliverySchema,
  recommended: z.boolean().optional(),
  recommendationSnapshot: z.unknown().optional(),
});

function fallbackTest(subject: string, topic: string, count: number) {
  return {
    title: `${subject}: ${topic}`,
    questions: Array.from({ length: count }).map((_, index) => ({
      prompt: `Sample question ${index + 1} on ${topic}.`,
      options: ["Option A", "Option B", "Option C", "Option D"],
      answerIndex: 0,
      explanation: "Generated fallback question.",
    })),
  };
}

export async function POST(request: Request) {
  const payload = GenerateSchema.parse(await request.json());
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  await ensureTagLegend();

  const subject = await prisma.subject.findFirst({
    where: {
      id: payload.subjectId,
      userId: user.id,
      archivedAt: null,
    },
  });

  if (!subject) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Subject not found." },
      { status: 400 },
    );
  }

  let sectionSnapshot: string | null = null;
  let resolvedSectionId: string | null = null;
  if (payload.sectionId) {
    const section = await prisma.subjectSection.findFirst({
      where: { id: payload.sectionId, subjectId: subject.id },
    });

    if (!section) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Section not found." },
        { status: 400 },
      );
    }

    const path: string[] = [];
    let current: typeof section | null = section;
    let guard = 0;
    while (current && guard < 10) {
      path.unshift(current.title);
      if (!current.parentId) break;
      current = await prisma.subjectSection.findFirst({
        where: { id: current.parentId, subjectId: subject.id },
      });
      guard += 1;
    }

    const description = section.description
      ? `Description: ${section.description}`
      : "Description: none";
    sectionSnapshot = `Section path: ${path.join(" → ")}. ${description}`;
    resolvedSectionId = section.id;
  }

  const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  const llmModel = "gpt-4o-mini";
  let testPayload;
  let rawLlmOutput = "";
  let validationMeta = {
    attempts: 1,
    hadRetry: false,
    lastError: null as string | null,
    fallback: false,
  };
  const promptTemplate = await getActivePromptTemplate("test_generation_v1");
  const sectionLine = sectionSnapshot
    ? `Section context: ${sectionSnapshot}`
    : "Section context: none";
  const deliveryLine =
    payload.delivery && Object.keys(payload.delivery).length > 0
      ? `Delivery focus: ${Object.entries(payload.delivery)
          .map(([key, value]) => `${key}=${value}`)
          .join(", ")}`
      : "Delivery focus: none";
  const systemPrompt = renderPrompt(promptTemplate.template, {
    declared: JSON.stringify(user.declaredPreferencesJson ?? {}),
    effective: JSON.stringify(user.effectivePreferencesJson ?? {}),
    ready: user.personalizationReady,
  });
  try {
    const response = await llmChatJsonWithRaw(
      {
        model: llmModel,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `Generate ${payload.questionCount} multiple-choice questions on ${payload.topic} for ${subject.title}. ${sectionLine} ${deliveryLine} Keep answers clear.`,
          },
        ],
      },
      TestSchema,
    );
    testPayload = response.data;
    rawLlmOutput = response.raw;
  } catch (error) {
    validationMeta = {
      attempts: 1,
      hadRetry: false,
      lastError: errorMessage(error),
      fallback: true,
    };
    rawLlmOutput = "";
    testPayload = fallbackTest(
      subject.title,
      payload.topic,
      payload.questionCount,
    );
  }

  const normalizedQuestions = testPayload.questions.map((question) => {
    const answerIndex =
      question.answerIndex >= 0 && question.answerIndex < question.options.length
        ? question.answerIndex
        : 0;
    return { ...question, answerIndex };
  });

  const savedTest = await prisma.generatedTest.create({
    data: {
      userId: user.id,
      subjectId: subject.id,
      sectionId: resolvedSectionId,
      promptTemplateId: promptTemplate.id,
      llmModel,
      promptTemplateKey: promptTemplate.key,
      promptTemplateVersion: promptTemplate.version,
      promptTemplateSnapshot: promptTemplate.template,
      rawLlmOutput,
      normalizedJson: normalizedQuestions,
      validationMetaJson: validationMeta,
      sectionSnapshot,
      recommended: payload.recommended ?? false,
      recommendationSnapshot: payload.recommendationSnapshot ?? null,
      topic: payload.topic,
      questionCount: payload.questionCount,
      mode: payload.mode,
      questionsJson: normalizedQuestions,
      profileSnapshotJson: {
        declared: user.declaredPreferencesJson ?? {},
        effective: user.effectivePreferencesJson ?? {},
        personalizationReady: user.personalizationReady,
      },
    },
  });

  const axes = await prisma.tagAxis.findMany({ include: { tags: true } });
  const axisMap = new Map(axes.map((axis) => [axis.key, axis]));

  let taggedQuestions: Record<string, string>[] | null = null;
  try {
    taggedQuestions = await tagQuestionsWithLLM(normalizedQuestions);
  } catch (error) {
    console.error("LLM tagger failed, using fallback", error);
    taggedQuestions = null;
  }

  const assignments = normalizedQuestions.flatMap((question, index) => {
    const tags = taggedQuestions?.[index] ?? tagQuestion(question.prompt);
    return Object.entries(tags).map(([axisKey, tagKey]) => {
      const axis = axisMap.get(axisKey);
      const tag = axis?.tags.find((entry) => entry.key === tagKey);
      if (!axis || !tag) return null;
      return {
        testId: savedTest.id,
        questionIndex: index,
        axisId: axis.id,
        tagId: tag.id,
      };
    });
  });

  const filteredAssignments = assignments.filter(Boolean) as {
    testId: string;
    questionIndex: number;
    axisId: string;
    tagId: string;
  }[];

  if (filteredAssignments.length) {
    await prisma.tagAssignment.createMany({ data: filteredAssignments });
  }

  return NextResponse.json({
    id: savedTest.id,
    test: {
      title: testPayload.title,
      questions: normalizedQuestions,
    },
  });
}
