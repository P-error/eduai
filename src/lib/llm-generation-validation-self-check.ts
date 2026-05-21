import { z } from "zod";
import { llmChatJsonWithRepair } from "@/lib/llm/provider";
import { buildAppliedSixFactorPromptInstructions } from "@/lib/ml-six-factor-apply";
import {
  GeneratedTestJudgeSchema,
} from "@/lib/generated-test-judge";
import {
  LearningContentCardSchema,
  attachLearningContentSchemaVersion,
  validateLearningContentCard,
} from "@/lib/learning-content-schema";
import {
  TestSchema,
  validateGeneratedTestArtifact,
  type TestPayload,
} from "@/lib/test-schema";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const validTest: TestPayload = {
  title: "Algebra: linear equations",
  questions: [
    {
      prompt: "Solve the linear equation 2x + 3 = 11.",
      options: ["x = 3", "x = 4", "x = 5"],
      answerIndex: 1,
      explanation: "Subtract 3 to get 2x = 8, then divide by 2.",
    },
  ],
};

async function checkJsonRepair() {
  const schema = z.object({ ok: z.boolean() }).strict();
  let calls = 0;
  const repaired = await llmChatJsonWithRepair(
    {
      model: "mock",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: "return JSON" }],
    },
    schema,
    {
      requester: async () => {
        calls += 1;
        return calls === 1 ? "{not json" : JSON.stringify({ ok: true });
      },
    },
  );
  assert(repaired.data?.ok === true, "invalid JSON must trigger repair");
  assert(repaired.diagnostics.finalSource === "llm_repaired", "repair source must be recorded");

  calls = 0;
  const schemaRepair = await llmChatJsonWithRepair(
    {
      model: "mock",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: "return JSON" }],
    },
    schema,
    {
      requester: async () => {
        calls += 1;
        return calls === 1 ? JSON.stringify({ ok: "yes" }) : JSON.stringify({ ok: true });
      },
    },
  );
  assert(schemaRepair.data?.ok === true, "invalid schema must trigger repair");

  const failed = await llmChatJsonWithRepair(
    {
      model: "mock",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: "return JSON" }],
    },
    schema,
    {
      requester: async () => JSON.stringify({ ok: "still wrong" }),
      repairAttempts: 1,
    },
  );
  assert(failed.data === null, "repair failure must not return data");
  assert(failed.diagnostics.finalSource === "fallback", "repair failure must mark fallback");
}

function checkTestValidation() {
  assert(TestSchema.safeParse(validTest).success, "valid strict TestSchema must pass");
  assert(
    !TestSchema.safeParse({
      ...validTest,
      extra: true,
    }).success,
    "extra top-level keys must be rejected",
  );
  assert(
    !TestSchema.safeParse({
      ...validTest,
      questions: [{ ...validTest.questions[0], explanation: "" }],
    }).success,
    "empty explanation must be rejected",
  );

  const invalidAnswerIndex = validateGeneratedTestArtifact({
    artifact: {
      ...validTest,
      questions: [{ ...validTest.questions[0], answerIndex: 7 }],
    },
    requestedQuestionCount: 1,
    topic: "linear equations",
    subjectTitle: "Algebra",
    source: "llm",
  });
  assert(!invalidAnswerIndex.valid, "answerIndex outside options must be rejected");
  assert(
    invalidAnswerIndex.errors.some((issue) => issue.code === "answer_index_out_of_range"),
    "answerIndex rejection must be explicit",
  );

  const duplicateOptions = validateGeneratedTestArtifact({
    artifact: {
      ...validTest,
      questions: [{ ...validTest.questions[0], options: ["x = 4", " X = 4 "] }],
    },
    requestedQuestionCount: 1,
    topic: "linear equations",
    subjectTitle: "Algebra",
    source: "llm",
  });
  assert(!duplicateOptions.valid, "duplicate options must be rejected");

  const wrongCount = validateGeneratedTestArtifact({
    artifact: validTest,
    requestedQuestionCount: 2,
    topic: "linear equations",
    subjectTitle: "Algebra",
    source: "llm",
  });
  assert(!wrongCount.valid, "wrong question count must be rejected");
}

function checkLearningContentValidation() {
  const validCard = attachLearningContentSchemaVersion({
    title: "Linear equations",
    summary: "A linear equation can be solved by inverse operations.",
    sections: [
      {
        heading: "Core idea",
        body: "Keep both sides balanced while isolating the variable.",
      },
      {
        heading: "One example:",
        body: "For 2x + 3 = 11, subtract 3 first and then divide by 2.",
      },
      {
        heading: "Check:",
        body: "Check: substitute the answer back into the linear equation.",
      },
    ],
    reflectionPrompt: "Which inverse operation comes first?",
  });

  assert(
    LearningContentCardSchema.safeParse({
      ...validCard,
      schemaVersion: undefined,
    }).success === false,
    "extra schemaVersion key must be rejected before runtime attachment",
  );
  assert(
    !LearningContentCardSchema.safeParse({
      title: "Too short",
      summary: "Too short",
      sections: [{ heading: "Only", body: "One section" }],
      reflectionPrompt: "Reflect",
    }).success,
    "too few sections must be rejected",
  );
  assert(
    validateLearningContentCard({
      card: validCard,
      topic: "linear equations",
      subjectTitle: "Algebra",
      sixFactorConfig: { support_level: "guided", examples_level: "single" },
    }).valid,
    "valid guided content must pass",
  );
  const missingGuided = validateLearningContentCard({
    card: {
      ...validCard,
      sections: [
        { heading: "Core idea", body: "Linear equations need balance." },
        { heading: "Practice", body: "Solve by inverse operations." },
      ],
    },
    topic: "linear equations",
    subjectTitle: "Algebra",
    sixFactorConfig: { support_level: "guided", examples_level: "single" },
  });
  assert(!missingGuided.valid, "missing guided support marker must be rejected");
}

function checkJudgeSchema() {
  const validJudge = {
    valid: true,
    overallIssues: [],
    questions: [
      {
        index: 0,
        valid: true,
        issues: [],
        topicAligned: true,
        singleCorrectAnswer: true,
        answerIndexMatchesExplanation: true,
        explanationQuality: "good",
      },
    ],
  };
  assert(GeneratedTestJudgeSchema.safeParse(validJudge).success, "judge schema must accept valid result");
  assert(
    !GeneratedTestJudgeSchema.safeParse({ ...validJudge, extra: true }).success,
    "judge schema must reject extra keys",
  );
}

function checkPromptAuditMlFallback() {
  const result = buildAppliedSixFactorPromptInstructions({
    path: "test_generation",
    env: {
      EDUAI_SIX_FACTOR_SHADOW: "1",
      EDUAI_SIX_FACTOR_APPLY: "1",
      EDUAI_SIX_FACTOR_ML_POLICY: "1",
      EDUAI_SIX_FACTOR_ARTIFACT_PATH: "/tmp/eduai-missing-six-factor-artifact.json",
    },
    context: {
      userRef: "self_check_user",
      subjectRef: "self_check_subject",
      topicRef: "linear_equations",
      topic: "linear equations",
      priorAttemptsCount: 0,
      priorCorrectRate: null,
      recentCorrectRate: null,
      recentAttemptsCount: 0,
      topicSeenCount: 0,
      minutesSinceLastActivity: null,
      sessionPosition: 1,
      previousDifficulty: "medium",
      previousDepth: "standard",
      declaredPreferences: {},
      policyId: "self_check",
      backendKind: null,
      modelVersion: null,
    },
  });

  assert(result.applied === true, "six-factor prompt block must still materialize");
  assert(
    result.metadata.decisionSource !== "ml_policy" && result.metadata.fallbackUsed === true,
    "missing artifact must be detected as runtime ML fallback",
  );
  assert(
    result.promptInstructionBlock.includes("Selected six-factor pedagogical profile"),
    "six-factor prompt block must be present",
  );
  assert(
    !result.promptInstructionBlock.includes("normalizedLearningGain"),
    "prompt block must not leak outcome fields",
  );
}

export async function runLlmGenerationValidationSelfCheck() {
  await checkJsonRepair();
  checkTestValidation();
  checkLearningContentValidation();
  checkJudgeSchema();
  checkPromptAuditMlFallback();

  return {
    ok: true,
    checks: [
      "json_repair_parse_and_schema_failures",
      "strict_test_schema_and_post_validator",
      "learning_content_schema_and_post_validator",
      "generated_test_judge_schema",
      "prompt_audit_ml_runtime_fallback_detection",
    ],
  };
}
