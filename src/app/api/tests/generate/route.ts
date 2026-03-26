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
import {
  getRequestIp,
  RateLimitExceededError,
  rateLimitOrThrow,
} from "@/lib/rate-limit";
import {
  assertNoAnswerIndexLeak,
  sanitizeQuestionsForClient,
} from "@/lib/test-payload";
import {
  MAX_RETRIES,
  UX_AVG_THRESHOLD,
  UX_AXES,
  UX_MIN_AXIS_THRESHOLD,
} from "@/lib/tags";

export const runtime = "nodejs";

const DeliverySchema = z
  .object({
    tone: z.string().optional(),
    explanation_style: z.string().optional(),
    response_format: z.string().optional(),
    difficulty_target: z.string().optional(),
    cognitive_process: z.string().optional(),
    task_family: z.string().optional(),
    context: z.string().optional(),
  })
  .optional();

const DeliveryComplianceSchema = z
  .object({
    tone: z.string().optional(),
    explanation_style: z.string().optional(),
    response_format: z.string().optional(),
    difficulty_target: z.string().optional(),
    cognitive_process: z.string().optional(),
    task_family: z.string().optional(),
    context: z.string().optional(),
  })
  .optional();

const GenerateSchema = z.object({
  subjectId: z.string().min(1),
  sectionId: z.string().optional().nullable(),
  topic: z.string().min(2),
  questionCount: z.number().int().min(1).max(20),
  mode: z.enum(["quiz", "exam", "practice"]).default("quiz"),
  personalizationMode: z.enum(["on", "off"]).optional().default("on"),
  delivery: DeliverySchema,
  recommended: z.boolean().optional(),
  recommendationSnapshot: z.unknown().optional(),
});

type DeliveryRequest = NonNullable<z.infer<typeof DeliveryComplianceSchema>>;

type ObservedQuestionTags = Record<string, string>;

type UxCompliance = {
  perAxis: Array<{
    axis: string;
    requested: string;
    matchCount: number;
    total: number;
    matchRate: number;
  }>;
  averageMatchRate: number;
  minAxisMatchRate: number;
};

const BASELINE_DELIVERY_PRESET: DeliveryRequest = {
  tone: "formal",
  explanation_style: "stepwise",
  response_format: "mcq",
  difficulty_target: "medium",
  cognitive_process: "apply",
  task_family: "problem_solving",
  context: "abstract",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const GENERATE_LIMIT_PER_USER_PER_DAY = 40;
const GENERATE_LIMIT_PER_IP_PER_DAY = 100;

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

function pickRequestedUxAxes(
  requestedDelivery: DeliveryRequest,
): Record<string, string> {
  const picked: Record<string, string> = {};
  const source = (requestedDelivery ?? {}) as Record<string, unknown>;

  for (const axis of UX_AXES) {
    const value = source[axis];
    if (typeof value === "string" && value.trim().length > 0) {
      picked[axis] = value;
    }
  }

  return picked;
}

function computeUxCompliance(
  requestedDelivery: DeliveryRequest,
  observedTagsPerQuestion: ObservedQuestionTags[],
): { ux: UxCompliance } {
  const requestedUx = pickRequestedUxAxes(requestedDelivery);
  const requestedAxes = Object.keys(requestedUx);

  if (requestedAxes.length === 0) {
    return {
      ux: {
        perAxis: [],
        averageMatchRate: 1,
        minAxisMatchRate: 1,
      },
    };
  }

  const total = observedTagsPerQuestion.length;
  const perAxis = requestedAxes.map((axis) => {
    const requested = requestedUx[axis];
    const matchCount = observedTagsPerQuestion.reduce((count, observed) => {
      return count + (observed?.[axis] === requested ? 1 : 0);
    }, 0);
    const matchRate = total > 0 ? matchCount / total : 0;

    return {
      axis,
      requested,
      matchCount,
      total,
      matchRate,
    };
  });

  const averageMatchRate =
    perAxis.length > 0
      ? perAxis.reduce((sum, axis) => sum + axis.matchRate, 0) / perAxis.length
      : 1;
  const minAxisMatchRate =
    perAxis.length > 0
      ? Math.min(...perAxis.map((axis) => axis.matchRate))
      : 1;

  return {
    ux: {
      perAxis,
      averageMatchRate,
      minAxisMatchRate,
    },
  };
}

function buildStrictDeliveryReinforcement(
  requestedUx: Record<string, string>,
): string {
  const requirements = Object.entries(requestedUx)
    .map(([axis, value]) => `${axis} MUST be ${value}`)
    .join("; ");

  return `STRICT DELIVERY REQUIREMENTS: For EVERY question ${requirements}. If you cannot comply, rewrite the question until it matches. Do not explain these requirements. Output JSON only.`;
}

function maybeRateLimitGenerate(request: Request, userId: string) {
  try {
    const ip = getRequestIp(request);
    rateLimitOrThrow(
      `tests:generate:user:${userId}`,
      GENERATE_LIMIT_PER_USER_PER_DAY,
      DAY_MS,
    );
    rateLimitOrThrow(
      `tests:generate:ip:${ip}`,
      GENERATE_LIMIT_PER_IP_PER_DAY,
      DAY_MS,
    );
    return null;
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          message: "Test generation limit reached. Please try again later.",
          retryAfterSeconds: error.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.json();
  const payload = GenerateSchema.parse(rawBody);
  const clientRequestedDelivery: DeliveryRequest =
    DeliveryComplianceSchema.parse(payload.delivery ?? {}) ?? {};
  if (
    clientRequestedDelivery.response_format &&
    clientRequestedDelivery.response_format !== "mcq"
  ) {
    return NextResponse.json(
      {
        error: "UNSUPPORTED_FEATURE",
        message: "response_format supports only mcq in this prototype.",
      },
      { status: 400 },
    );
  }

  const hasManualDeliveryOverride =
    Boolean(rawBody) &&
    typeof rawBody === "object" &&
    Object.prototype.hasOwnProperty.call(rawBody, "delivery");
  const personalizationMode = payload.personalizationMode ?? "on";

  const appliedDelivery: DeliveryRequest = hasManualDeliveryOverride
    ? clientRequestedDelivery
    : personalizationMode === "off"
      ? BASELINE_DELIVERY_PRESET
      : clientRequestedDelivery;

  const policyMode = hasManualDeliveryOverride
    ? "manual_delivery_override"
    : personalizationMode === "off"
      ? "personalization_off"
      : "personalization_on";
  const policyId = hasManualDeliveryOverride
    ? "v2_manual"
    : personalizationMode === "off"
      ? "v2_baseline"
      : "v2_personalized";
  const policyMeta = {
    personalizationMode,
    usedRecommendation: false,
    usedBaseline: personalizationMode === "off" && !hasManualDeliveryOverride,
    usedManualDelivery: hasManualDeliveryOverride,
  };

  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid token." },
      { status: 401 },
    );
  }

  const rateLimited = maybeRateLimitGenerate(request, user.id);
  if (rateLimited) {
    return rateLimited;
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
  const promptTemplate = await getActivePromptTemplate("test_generation_v1");
  const requestedUx = pickRequestedUxAxes(appliedDelivery);
  const hasRequestedUx = Object.keys(requestedUx).length > 0;

  const sectionLine = sectionSnapshot
    ? `Section context: ${sectionSnapshot}`
    : "Section context: none";
  const deliveryLine =
    Object.keys(appliedDelivery).length > 0
      ? `Delivery focus: ${Object.entries(appliedDelivery)
          .map(([key, value]) => `${key}=${value}`)
          .join(", ")}`
      : "Delivery focus: none";

  const systemPrompt = renderPrompt(promptTemplate.template, {
    declared: JSON.stringify(user.declaredPreferencesJson ?? {}),
    effective: JSON.stringify(user.effectivePreferencesJson ?? {}),
    ready: user.personalizationReady,
  });

  const axes = await prisma.tagAxis.findMany({ include: { tags: true } });
  const axisMap = new Map(axes.map((axis) => [axis.key, axis]));

  let attempts = 0;
  let hadRetry = false;

  let finalTestPayload: z.infer<typeof TestSchema> | ReturnType<typeof fallbackTest> =
    fallbackTest(subject.title, payload.topic, payload.questionCount);
  let finalRawLlmOutput = "";
  let finalGenerationSource: "llm" | "fallback" = "fallback";
  let finalGenerationError: string | null = "LLM_NOT_ATTEMPTED";

  let finalNormalizedQuestions: z.infer<typeof TestSchema>["questions"] = [];
  let finalTaggingWarnings: string[] = [];
  let finalTaggingFallbackCount = 0;
  let finalTaggingSource: "llm" | "rule_fallback" | "mixed" = "rule_fallback";
  let finalFilteredAssignments: {
    questionIndex: number;
    axisId: string;
    tagId: string;
  }[] = [];
  let finalCompliance = computeUxCompliance(appliedDelivery, []);
  let finalComplianceFailed = false;

  const maxAttempts = 1 + MAX_RETRIES;

  while (attempts < maxAttempts) {
    attempts += 1;
    hadRetry = attempts > 1;

    let currentTestPayload: z.infer<typeof TestSchema> | ReturnType<typeof fallbackTest>;
    let currentRawLlmOutput = "";
    let currentGenerationSource: "llm" | "fallback" = "llm";
    let currentGenerationError: string | null = null;

    const strictClause =
      hasRequestedUx && attempts > 1
        ? ` ${buildStrictDeliveryReinforcement(requestedUx)}`
        : "";

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
              content: `Generate ${payload.questionCount} multiple-choice questions on ${payload.topic} for ${subject.title}. ${sectionLine} ${deliveryLine} Keep answers clear.${strictClause}`,
            },
          ],
        },
        TestSchema,
      );
      currentTestPayload = response.data;
      currentRawLlmOutput = response.raw;
    } catch (error) {
      currentGenerationSource = "fallback";
      currentGenerationError = errorMessage(error);
      currentRawLlmOutput = "";
      currentTestPayload = fallbackTest(
        subject.title,
        payload.topic,
        payload.questionCount,
      );
    }

    const currentNormalizedQuestions = currentTestPayload.questions.map((question) => {
      const answerIndex =
        question.answerIndex >= 0 && question.answerIndex < question.options.length
          ? question.answerIndex
          : 0;
      return { ...question, answerIndex };
    });

    let taggedQuestions: Awaited<ReturnType<typeof tagQuestionsWithLLM>> | null = null;
    try {
      taggedQuestions = await tagQuestionsWithLLM(currentNormalizedQuestions);
    } catch (error) {
      console.error("LLM tagger failed, using fallback", error);
      taggedQuestions = null;
    }

    const taggingWarnings: string[] = [];
    let taggingFallbackCount = 0;
    const observedTagsPerQuestion: ObservedQuestionTags[] = [];
    const assignments = currentNormalizedQuestions.flatMap((question, index) => {
      const diagnostics = taggedQuestions?.[index] ?? null;
      const llmTags = diagnostics?.tags ?? null;
      if (!llmTags) {
        taggingFallbackCount += 1;
        if (diagnostics?.warnings && diagnostics.warnings.length > 0) {
          taggingWarnings.push(
            `question_${index}:llm_invalid_tags:${diagnostics.warnings.join(",")}`,
          );
        }
        taggingWarnings.push(`question_${index}:rule_fallback_applied`);
      }

      const tags = llmTags ?? tagQuestion(question.prompt);
      observedTagsPerQuestion[index] = tags;

      return Object.entries(tags).map(([axisKey, tagKey]) => {
        const axis = axisMap.get(axisKey);
        const tag = axis?.tags.find((entry) => entry.key === tagKey);
        if (!axis || !tag) {
          taggingWarnings.push(`question_${index}:invalid_${axisKey}_${tagKey}`);
          return null;
        }
        return {
          questionIndex: index,
          axisId: axis.id,
          tagId: tag.id,
        };
      });
    });

    const filteredAssignments = assignments.filter(Boolean) as {
      questionIndex: number;
      axisId: string;
      tagId: string;
    }[];

    let taggingSource: "llm" | "rule_fallback" | "mixed";
    if (taggingFallbackCount === 0) {
      taggingSource = "llm";
    } else if (taggingFallbackCount === currentNormalizedQuestions.length) {
      taggingSource = "rule_fallback";
    } else {
      taggingSource = "mixed";
    }

    const compliance = computeUxCompliance(appliedDelivery, observedTagsPerQuestion);
    const complianceFailed =
      compliance.ux.averageMatchRate < UX_AVG_THRESHOLD ||
      compliance.ux.minAxisMatchRate < UX_MIN_AXIS_THRESHOLD;

    finalTestPayload = currentTestPayload;
    finalRawLlmOutput = currentRawLlmOutput;
    finalGenerationSource = currentGenerationSource;
    finalGenerationError = currentGenerationError;
    finalNormalizedQuestions = currentNormalizedQuestions;
    finalTaggingWarnings = taggingWarnings;
    finalTaggingFallbackCount = taggingFallbackCount;
    finalTaggingSource = taggingSource;
    finalFilteredAssignments = filteredAssignments;
    finalCompliance = compliance;
    finalComplianceFailed = hasRequestedUx ? complianceFailed : false;

    const shouldRetry =
      hasRequestedUx &&
      complianceFailed &&
      attempts < maxAttempts &&
      taggingSource === "llm";
    if (shouldRetry) {
      continue;
    }

    break;
  }

  const generationIsLlm = finalGenerationSource === "llm";
  const hasInvalidTagWarnings = finalTaggingWarnings.some(
    (warning) =>
      warning.includes(":llm_invalid_tags:") || warning.includes(":invalid_"),
  );
  const taggingIsLlm = finalTaggingSource === "llm" && !hasInvalidTagWarnings;
  const learningEligible =
    generationIsLlm && taggingIsLlm && !finalComplianceFailed;

  let learningExcludedReason: string | null = null;
  if (!generationIsLlm) {
    learningExcludedReason = "FALLBACK_GENERATION";
  } else if (!taggingIsLlm) {
    learningExcludedReason = "FALLBACK_TAGGING";
  } else if (finalComplianceFailed) {
    learningExcludedReason = "LOW_UX_COMPLIANCE";
  }

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
      rawLlmOutput: finalRawLlmOutput,
      normalizedJson: finalNormalizedQuestions,
      validationMetaJson: {
        schemaVersion: 2,
        attempts,
        hadRetry,
        lastError: finalGenerationError,
        fallback: finalGenerationSource === "fallback",
        generationSource: finalGenerationSource,
        generationError: finalGenerationError,
        taggingSource: finalTaggingSource,
        taggingFallback: finalTaggingFallbackCount > 0,
        taggingFallbackCount: finalTaggingFallbackCount,
        taggingWarnings: finalTaggingWarnings,
        learningEligible,
        learningExcludedReason,
        requestedDelivery: clientRequestedDelivery,
        appliedDelivery,
        deliveryCompliance: {
          ux: finalCompliance.ux,
        },
        deliveryComplianceFailed: finalComplianceFailed,
        policyMode,
        policyId,
        policyMeta,
      },
      sectionSnapshot,
      recommended: payload.recommended ?? false,
      recommendationSnapshot: payload.recommendationSnapshot ?? undefined,
      topic: payload.topic,
      questionCount: payload.questionCount,
      mode: payload.mode,
      questionsJson: finalNormalizedQuestions,
      profileSnapshotJson: {
        declared: user.declaredPreferencesJson ?? {},
        effective: user.effectivePreferencesJson ?? {},
        personalizationReady: user.personalizationReady,
      },
    },
  });

  if (finalFilteredAssignments.length) {
    await prisma.tagAssignment.createMany({
      data: finalFilteredAssignments.map((assignment) => ({
        testId: savedTest.id,
        questionIndex: assignment.questionIndex,
        axisId: assignment.axisId,
        tagId: assignment.tagId,
      })),
    });
  }

  const responsePayload = {
    id: savedTest.id,
    test: {
      title: finalTestPayload.title,
      questions: sanitizeQuestionsForClient(finalNormalizedQuestions),
    },
  };

  assertNoAnswerIndexLeak(responsePayload, "POST /api/tests/generate response");

  return NextResponse.json(responsePayload);
}
