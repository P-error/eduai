import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ensureTagLegend } from "@/lib/tag-seed";
import { llmChatJson } from "@/lib/llm/provider";
import { TestSchema } from "@/lib/test-schema";
import { tagQuestion } from "@/lib/tagger";
import { getOrCreateUser } from "@/lib/auth";
import { getPromptTemplate, renderPrompt } from "@/lib/prompts";

const GenerateSchema = z.object({
  subject: z.string().min(2),
  topic: z.string().min(2),
  questionCount: z.number().int().min(1).max(20),
  mode: z.enum(["quiz", "exam", "practice"]).default("quiz"),
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
  const user = await getOrCreateUser(request);

  await ensureTagLegend();

  const subject = await prisma.subject.upsert({
    where: { name: payload.subject },
    update: {},
    create: { name: payload.subject },
  });

  let testPayload;
  const promptTemplate = await getPromptTemplate("test_generation_v1");
  const systemPrompt = renderPrompt(promptTemplate.template, {
    declared: JSON.stringify(user.declaredPreferencesJson ?? {}),
    effective: JSON.stringify(user.effectivePreferencesJson ?? {}),
    ready: user.personalizationReady,
  });
  try {
    testPayload = await llmChatJson(
      {
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `Generate ${payload.questionCount} multiple-choice questions on ${payload.topic} for ${payload.subject}. Keep answers clear.`,
          },
        ],
      },
      TestSchema,
    );
  } catch (error) {
    testPayload = fallbackTest(
      payload.subject,
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
      promptTemplateId: promptTemplate.id,
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

  const assignments = normalizedQuestions.flatMap((question, index) => {
    const tags = tagQuestion(question.prompt);
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
