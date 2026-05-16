import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendPromptBlocks,
  buildChatSystemPrompt,
  buildLearningContentSystemPrompt,
  buildTestSystemPrompt,
  type LlmPromptMessage,
  type PromptLearnerStateAggregates,
  type PromptSubjectTopicContext,
} from "@/lib/llm-prompt-builders";
import { buildAppliedSixFactorPromptInstructions } from "@/lib/ml-six-factor-apply";
import {
  buildLearningContentPrompt,
  buildTestGenerationPrompt,
  type LearningContentGenerationPackage,
  type TestGenerationPackage,
} from "@/lib/episode-generation";

type PromptSnapshot = {
  path: string;
  llm: string;
  response_format: { type: "json_object" } | null;
  messages: LlmPromptMessage[];
  flags: Record<string, string>;
  mlRuntimeStatus: "ML_RUNTIME_NOT_REQUESTED" | "ML_RUNTIME_OK" | "ML_RUNTIME_FALLBACK";
  appliedToLearnerFacingOutput: boolean;
  decisionSource: string | null;
  candidateCount: number | null;
  fallbackUsed: boolean | null;
  judgeStatus: string | null;
  notes: string[];
};

type AssertionResult = {
  name: string;
  passed: boolean;
  details?: string;
};

const exportDir = join(process.cwd(), "exports", "prompt_audit");
const applyEnv = {
  EDUAI_SIX_FACTOR_SHADOW: "1",
  EDUAI_SIX_FACTOR_APPLY: "1",
  EDUAI_SIX_FACTOR_ML_POLICY: "0",
};
const realMlApplyEnv = {
  EDUAI_SIX_FACTOR_SHADOW: "1",
  EDUAI_SIX_FACTOR_APPLY: "1",
  EDUAI_SIX_FACTOR_ML_POLICY: "1",
  ...(process.env.EDUAI_SIX_FACTOR_ARTIFACT_PATH
    ? { EDUAI_SIX_FACTOR_ARTIFACT_PATH: process.env.EDUAI_SIX_FACTOR_ARTIFACT_PATH }
    : {}),
};
const offEnv = {
  EDUAI_SIX_FACTOR_SHADOW: "0",
  EDUAI_SIX_FACTOR_APPLY: "0",
  EDUAI_SIX_FACTOR_ML_POLICY: "0",
};

const forbiddenOutcomeFields = [
  "postScore",
  "post_score",
  "nextStepSuccess",
  "next_step_success",
  "normalizedLearningGain",
  "normalized_learning_gain",
  "raw TestAttempt answers",
  "answersJson",
  "selectedAnswers",
  "rawAnswers",
];

const factorLabels = [
  "difficulty:",
  "depth:",
  "support_level:",
  "presentation_format:",
  "examples_level:",
  "terminology_level:",
];

const realMlRuntimeRequested =
  process.argv.includes("--real-ml-policy") || process.argv.includes("--ml-runtime");
const activeApplyEnv = realMlRuntimeRequested ? realMlApplyEnv : applyEnv;

const profile = {
  userRef: "audit_learner_1",
  personalizationReady: true,
  declaredPreferences: {
    tone: "formal",
    explanation_style: "stepwise",
    response_format: "mcq",
    difficulty_target: "medium",
    depth: "standard",
    presentation_format: "step_by_step",
  },
  effectivePreferences: {
    tone: "formal",
    explanation_style: "stepwise",
    response_format: "mcq",
    difficulty_target: "medium",
    depth: "standard",
  },
};

const subjectTopic: PromptSubjectTopicContext = {
  subjectId: "subject_algebra",
  subjectTitle: "Algebra",
  sectionId: "section_equations",
  sectionPath: "Algebra -> Linear equations",
  topic: "Linear equations",
  conceptKey: "linear_equations",
  skillKey: "solve_one_variable_equation",
  familyKey: "linear_equations_core",
};

const firstAggregates: PromptLearnerStateAggregates = {
  priorAttemptsCount: 0,
  priorCorrectRate: null,
  recentCorrectRate: null,
  recentAttemptsCount: 0,
  topicSeenCount: 0,
  minutesSinceLastActivity: null,
  sessionPosition: 1,
};

const secondAggregates: PromptLearnerStateAggregates = {
  priorAttemptsCount: 1,
  priorCorrectRate: 0.75,
  recentCorrectRate: 0.75,
  recentAttemptsCount: 1,
  topicSeenCount: 1,
  minutesSinceLastActivity: 2,
  sessionPosition: 2,
};

function buildPolicyContext(aggregates: PromptLearnerStateAggregates) {
  return {
    userRef: profile.userRef,
    subjectRef: subjectTopic.subjectId,
    topicRef: subjectTopic.conceptKey,
    conceptKey: subjectTopic.conceptKey,
    skillKey: subjectTopic.skillKey,
    familyKey: subjectTopic.familyKey,
    topic: subjectTopic.topic,
    sessionRef: "episode_prompt_audit",
    ...aggregates,
    previousDifficulty: "medium",
    previousDepth: "standard",
    declaredPreferences: profile.declaredPreferences,
    policyId: "prompt_audit_policy",
    backendKind: "heuristic_baseline",
    modelVersion: null,
    postScore: 1,
    nextStepSuccess: true,
    normalizedLearningGain: 1,
  };
}

function appliedResult(
  path: "chat" | "learning_content" | "test_generation",
  aggregates: PromptLearnerStateAggregates,
) {
  const result = buildAppliedSixFactorPromptInstructions({
    context: buildPolicyContext(aggregates),
    env: activeApplyEnv,
    path,
  });
  if (!result.applied || result.promptInstructionBlock == null) {
    throw new Error(`six-factor apply did not produce prompt block for ${path}`);
  }
  return result;
}

function runtimeSnapshotFields(
  result: ReturnType<typeof appliedResult>,
): Pick<
  PromptSnapshot,
  | "mlRuntimeStatus"
  | "appliedToLearnerFacingOutput"
  | "decisionSource"
  | "candidateCount"
  | "fallbackUsed"
  | "judgeStatus"
> {
  const metadata = result.metadata;
  const fallbackUsed = metadata?.fallbackUsed ?? null;
  const decisionSource = metadata?.decisionSource ?? null;
  const mlRuntimeStatus = !realMlRuntimeRequested
    ? "ML_RUNTIME_NOT_REQUESTED"
    : decisionSource === "ml_policy" && fallbackUsed === false
      ? "ML_RUNTIME_OK"
      : "ML_RUNTIME_FALLBACK";

  return {
    mlRuntimeStatus,
    appliedToLearnerFacingOutput: metadata?.appliedToLearnerFacingOutput === true,
    decisionSource,
    candidateCount: metadata?.candidateCount ?? null,
    fallbackUsed,
    judgeStatus:
      process.env.EDUAI_LLM_TEST_JUDGE === "1" ? "enabled_by_env" : "disabled",
  };
}

function buildTestPackage(): TestGenerationPackage {
  return {
    schemaVersion: "episode_generation_package_v1_2026_03",
    episodeId: "episode_prompt_audit",
    protocolKey: "prompt_audit_protocol",
    contentKind: "generated_test",
    sequenceRole: "precheck",
    touchpointType: "pre_check",
    questionCount: 3,
    mode: "practice",
    pedagogicalDecision: {
      difficulty: "medium",
      depth: "standard",
    },
    rendering: {
      tone: "formal",
      explanationStyle: "stepwise",
      responseFormat: "mcq",
      rulesLayer: {
        id: "rendering_rules_v1_2026_03",
        basis: "prompt_audit",
      },
      renderingDecision: {
        tone: "formal",
        explanationStyle: "stepwise",
        responseFormat: "mcq",
        presentationMode: "mcq_test",
        formattingHint: "balanced",
      },
    },
    policy: {
      arm: "predicted",
      policyMode: "prompt_audit",
      policyId: "prompt_audit_policy",
      assignmentSource: "runtime_default",
      personalizationMode: "on",
    },
    scope: {
      subjectId: subjectTopic.subjectId ?? "",
      subjectTitle: subjectTopic.subjectTitle ?? "",
      sectionId: subjectTopic.sectionId ?? null,
      sectionPath: subjectTopic.sectionPath ?? null,
      topic: subjectTopic.topic ?? "",
      conceptKey: subjectTopic.conceptKey ?? null,
      skillKey: subjectTopic.skillKey ?? null,
      familyKey: subjectTopic.familyKey ?? "",
    },
    linkage: {
      linkageKind: "none",
      linkedContentId: null,
      holdoutStrategy: "none",
    },
    outputContract: {
      kind: "mcq_test",
      schema: "TestSchema",
    },
  };
}

function buildLearningContentPackage(
  aggregates: PromptLearnerStateAggregates,
): LearningContentGenerationPackage {
  return {
    schemaVersion: "episode_generation_package_v1_2026_03",
    episodeId: "episode_prompt_audit",
    protocolKey: "prompt_audit_protocol",
    contentKind: "chat_session",
    sequenceRole: "learning_content",
    touchpointType: "content_delivery",
    pedagogicalDecision: {
      difficulty: "medium",
      depth: "standard",
    },
    rendering: {
      tone: "formal",
      explanationStyle: "stepwise",
      responseFormat: "mcq",
      rulesLayer: {
        id: "rendering_rules_v1_2026_03",
        basis: "prompt_audit",
      },
      renderingDecision: {
        tone: "formal",
        explanationStyle: "stepwise",
        responseFormat: "mcq",
        presentationMode: "structured_chat",
        formattingHint: "balanced",
      },
    },
    policy: {
      arm: "predicted",
      policyMode: "prompt_audit",
      policyId: "prompt_audit_policy",
      assignmentSource: "runtime_default",
      personalizationMode: "on",
    },
    scope: {
      subjectId: subjectTopic.subjectId ?? "",
      subjectTitle: subjectTopic.subjectTitle ?? "",
      sectionId: subjectTopic.sectionId ?? null,
      sectionPath: subjectTopic.sectionPath ?? null,
      topic: subjectTopic.topic ?? "",
      conceptKey: subjectTopic.conceptKey ?? null,
      skillKey: subjectTopic.skillKey ?? null,
      familyKey: subjectTopic.familyKey ?? "",
    },
    linkage: {
      linkageKind: "none",
      linkedContentId: null,
      holdoutStrategy: "none",
    },
    priorTestOutcome:
      aggregates.priorAttemptsCount > 0
        ? {
            contentId: "postcheck_prompt_audit",
            accuracy: aggregates.recentCorrectRate,
            questionCount: 4,
            totalDurationMs: 90000,
            submittedAtIso: "2026-05-08T09:55:00.000Z",
          }
        : null,
    contentFormat: "structured_explanation_card",
    outputContract: {
      kind: "learning_content_card",
      schemaVersion: "learning_content_card_v1_2026_03",
    },
  };
}

function snapshots() {
  const chatFirstApply = appliedResult("chat", firstAggregates);
  const testApply = appliedResult("test_generation", firstAggregates);
  const learningSecondApply = appliedResult("learning_content", secondAggregates);
  const chatSecondApply = appliedResult("chat", secondAggregates);
  const chatFirstSystem = buildChatSystemPrompt({
    baseInstruction:
      "You are an educational assistant. Declared preferences and effective preferences are supplied below.",
    profile,
    subjectTopic,
    learnerStateAggregates: firstAggregates,
    sixFactorPromptInstructionBlock: chatFirstApply.promptInstructionBlock,
    tone: "formal",
    explanationStyle: "stepwise",
    responseFormat: "mcq",
    difficulty: "medium",
    depth: "standard",
  });
  const testUserPrompt = appendPromptBlocks(
    buildTestGenerationPrompt(buildTestPackage()),
    [testApply.promptInstructionBlock],
  );
  const learningSecondPrompt = appendPromptBlocks(
    buildLearningContentPrompt(buildLearningContentPackage(secondAggregates)),
    [learningSecondApply.promptInstructionBlock],
  );
  const chatSecondSystem = buildChatSystemPrompt({
    baseInstruction:
      "You are an educational assistant. Declared preferences and effective preferences are supplied below.",
    profile,
    subjectTopic,
    learnerStateAggregates: secondAggregates,
    sixFactorPromptInstructionBlock: chatSecondApply.promptInstructionBlock,
    tone: "formal",
    explanationStyle: "stepwise",
    responseFormat: "mcq",
    difficulty: "medium",
    depth: "standard",
  });

  return {
    chatFirst: {
      path: "chat",
      llm: "gpt-4o-mini",
      response_format: null,
      messages: [
        { role: "system", content: chatFirstSystem },
        {
          role: "user",
          content: "Please help me solve one-variable linear equations.",
        },
      ],
      flags: activeApplyEnv,
      ...runtimeSnapshotFields(chatFirstApply),
      notes: ["first chat/content prompt before test"],
    } satisfies PromptSnapshot,
    testGeneration: {
      path: "test_generation",
      llm: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildTestSystemPrompt({
            baseInstruction:
              "You are a test generator. Return strict JSON matching the test schema.",
            profile,
          }),
        },
        { role: "user", content: testUserPrompt },
      ],
      flags: activeApplyEnv,
      ...runtimeSnapshotFields(testApply),
      notes: ["test generation prompt; no external LLM call"],
    } satisfies PromptSnapshot,
    learningContentSecond: {
      path: "learning_content",
      llm: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildLearningContentSystemPrompt({
            baseInstruction:
              "You are an instructional content generator. Use only the package and return the requested JSON contract.",
            profile,
          }),
        },
        { role: "user", content: learningSecondPrompt },
      ],
      flags: activeApplyEnv,
      ...runtimeSnapshotFields(learningSecondApply),
      notes: ["learning content prompt after one submitted test"],
    } satisfies PromptSnapshot,
    chatSecond: {
      path: "chat",
      llm: "gpt-4o-mini",
      response_format: null,
      messages: [
        { role: "system", content: chatSecondSystem },
        {
          role: "user",
          content: "Can you explain the mistake after my check?",
        },
      ],
      flags: activeApplyEnv,
      ...runtimeSnapshotFields(chatSecondApply),
      notes: ["second chat/content prompt after test submit"],
    } satisfies PromptSnapshot,
  };
}

function serialize(snapshot: PromptSnapshot) {
  return JSON.stringify(snapshot);
}

function hasSystemOrEquivalent(snapshot: PromptSnapshot) {
  return snapshot.messages.some((message) => message.role === "system");
}

function hasAllFactors(value: string) {
  return factorLabels.every((label) => value.includes(label));
}

function hasContradiction(value: string) {
  const lower = value.toLowerCase();
  const contradictions = [
    lower.includes("answer briefly") && lower.includes("detailed explanation"),
    lower.includes("avoid terminology") && lower.includes("technical terminology"),
    lower.includes("return json only") &&
      lower.includes("conversational text"),
    lower.includes("return only json") &&
      lower.includes("return educational conversational text"),
  ];
  return contradictions.some(Boolean);
}

function assertPrompt(
  assertions: AssertionResult[],
  name: string,
  condition: unknown,
  details?: string,
) {
  assertions.push({
    name,
    passed: Boolean(condition),
    ...(details ? { details } : {}),
  });
}

function runAssertions(all: ReturnType<typeof snapshots>) {
  const assertions: AssertionResult[] = [];
  const promptList = [
    all.chatFirst,
    all.testGeneration,
    all.learningContentSecond,
    all.chatSecond,
  ];

  for (const snapshot of promptList) {
    const content = serialize(snapshot);
    assertPrompt(
      assertions,
      `${snapshot.path}: system/developer instruction equivalent present`,
      hasSystemOrEquivalent(snapshot),
    );
    assertPrompt(
      assertions,
      `${snapshot.path}: subject/topic context present`,
      content.includes("Algebra") && content.includes("Linear equations"),
    );
    assertPrompt(
      assertions,
      `${snapshot.path}: declared preferences present`,
      content.includes("declaredPreferences") &&
        content.includes("difficulty_target"),
    );
    assertPrompt(
      assertions,
      `${snapshot.path}: all six-factor instructions present`,
      content.includes("Six-factor render instructions") && hasAllFactors(content),
    );
    assertPrompt(
      assertions,
      `${snapshot.path}: forbidden outcome fields absent`,
      forbiddenOutcomeFields.every((field) => !content.includes(field)),
    );
    assertPrompt(
      assertions,
      `${snapshot.path}: no raw ML candidate/features payload leaked into prompt`,
      !content.includes("candidateConfig") &&
        !content.includes("candidate_config") &&
        !content.includes("featuresSnapshot") &&
        !content.includes("features_snapshot"),
    );
    assertPrompt(
      assertions,
      `${snapshot.path}: no known contradictory instruction pair`,
      !hasContradiction(content),
    );
    if (realMlRuntimeRequested) {
      assertPrompt(
        assertions,
        `${snapshot.path}: real ML policy selected`,
        snapshot.decisionSource === "ml_policy",
        `decisionSource=${snapshot.decisionSource ?? "null"}`,
      );
      assertPrompt(
        assertions,
        `${snapshot.path}: real ML candidates available`,
        typeof snapshot.candidateCount === "number" && snapshot.candidateCount > 1,
        `candidateCount=${snapshot.candidateCount ?? "null"}`,
      );
      assertPrompt(
        assertions,
        `${snapshot.path}: ML applied to learner-facing output`,
        snapshot.appliedToLearnerFacingOutput === true,
      );
      assertPrompt(
        assertions,
        `${snapshot.path}: ML runtime did not fallback`,
        snapshot.fallbackUsed === false &&
          snapshot.mlRuntimeStatus !== "ML_RUNTIME_FALLBACK",
        `mlRuntimeStatus=${snapshot.mlRuntimeStatus}; fallbackUsed=${String(
          snapshot.fallbackUsed,
        )}`,
      );
    }
  }

  const offApply = buildAppliedSixFactorPromptInstructions({
    context: buildPolicyContext(firstAggregates),
    env: offEnv,
    path: "chat",
  });
  const offChat = buildChatSystemPrompt({
    baseInstruction: "You are an educational assistant.",
    profile,
    subjectTopic,
    learnerStateAggregates: null,
    sixFactorPromptInstructionBlock: offApply.promptInstructionBlock,
    tone: "formal",
    explanationStyle: "stepwise",
    responseFormat: "mcq",
    difficulty: "medium",
    depth: "standard",
  });
  assertPrompt(
    assertions,
    "apply disabled: no six-factor instructions",
    !offChat.includes("Six-factor render instructions") &&
      !offChat.includes("support_level:") &&
      !offChat.includes("examples_level:") &&
      !offChat.includes("terminology_level:"),
  );

  const testContent = serialize(all.testGeneration);
  const testMessageContent = all.testGeneration.messages
    .map((message) => message.content)
    .join("\n");
  assertPrompt(
    assertions,
    "test generation: strict MCQ schema preserved",
    testContent.includes("TestSchema") &&
      testContent.includes("answerIndex") &&
      testContent.includes("response_format=mcq"),
  );
  assertPrompt(
    assertions,
    "test generation: strict schema requirements visible",
    testMessageContent.includes('"explanation": string') &&
      testMessageContent.includes("answerIndex") &&
      testMessageContent.includes("options"),
  );
  assertPrompt(
    assertions,
    "test generation: presentation_format does not replace MCQ output",
    testContent.includes("presentation_format") &&
      testContent.includes("must not change JSON keys") &&
      testMessageContent.includes('"responseFormat": "mcq"'),
  );
  assertPrompt(
    assertions,
    "test generation: support/example rules stay inside MCQ fields",
    testContent.includes("For MCQ/TestSchema") &&
      testContent.includes("allowed prompt or explanation fields") &&
      testContent.includes("never add extra JSON keys"),
  );
  assertPrompt(
    assertions,
    "test generation: support/example rules do not change MCQ count",
    testContent.includes("Test generation requirement") &&
      testContent.includes("keep the requested number of MCQ questions") &&
      testContent.includes("must not create extra items or non-MCQ output"),
  );

  const secondContent = serialize(all.chatSecond);
  assertPrompt(
    assertions,
    "second prompt: updated aggregate priorAttemptsCount present",
    secondContent.includes('"priorAttemptsCount":1') ||
      secondContent.includes('"priorAttemptsCount": 1') ||
      secondContent.includes("priorAttemptsCount=1"),
  );
  assertPrompt(
    assertions,
    "second prompt: updated aggregate rates and topic count present",
    (secondContent.includes('"priorCorrectRate":0.75') ||
      secondContent.includes('"priorCorrectRate": 0.75') ||
      secondContent.includes("priorCorrectRate=0.75")) &&
      (secondContent.includes('"recentCorrectRate":0.75') ||
        secondContent.includes('"recentCorrectRate": 0.75') ||
        secondContent.includes("recentCorrectRate=0.75")) &&
      (secondContent.includes('"recentAttemptsCount":1') ||
        secondContent.includes('"recentAttemptsCount": 1') ||
        secondContent.includes("recentAttemptsCount=1")) &&
      (secondContent.includes('"topicSeenCount":1') ||
        secondContent.includes('"topicSeenCount": 1') ||
        secondContent.includes("topicSeenCount=1")),
  );
  assertPrompt(
    assertions,
    "second prompt: guided support requires visible marker",
    secondContent.includes("support_level=guided") &&
      secondContent.includes("visible guided support element") &&
      secondContent.includes("Check:") &&
      secondContent.includes("Mini-question:"),
  );
  assertPrompt(
    assertions,
    "second prompt: single example requires one visible marker",
    secondContent.includes("examples_level=single") &&
      secondContent.includes("exactly one visible example marker") &&
      secondContent.includes("Example:") &&
      secondContent.includes("One example:"),
  );
  assertPrompt(
    assertions,
    "second prompt: underspecified mistake still gets example and support",
    secondContent.includes("Chat requirement") &&
      secondContent.includes("do not respond only by asking for more context") &&
      secondContent.includes("Next step:"),
  );

  const learningContentSecond = serialize(all.learningContentSecond);
  const chatFirstContent = serialize(all.chatFirst);
  assertPrompt(
    assertions,
    "chat prompt: does not require JSON response",
    all.chatFirst.response_format === null &&
      chatFirstContent.includes("Return educational conversational text") &&
      !chatFirstContent.includes("Return JSON only"),
  );
  assertPrompt(
    assertions,
    "learning content second prompt: guided support marker allowed in schema fields",
    learningContentSecond.includes("support_level=guided") &&
      learningContentSecond.includes("For learning_content_card JSON") &&
      learningContentSecond.includes("existing allowed fields"),
  );
  assertPrompt(
    assertions,
    "learning content second prompt: single example constrained to one heading",
    learningContentSecond.includes("examples_level=single") &&
      learningContentSecond.includes("must appear exactly once") &&
      learningContentSecond.includes("dedicated section heading exactly") &&
      learningContentSecond.includes("One example:") &&
      learningContentSecond.includes("without labeling it again"),
  );
  assertPrompt(
    assertions,
    "learning content second prompt: schema section count explicit",
    learningContentSecond.includes("sections array must contain 2-4 items") &&
      learningContentSecond.includes("return 2-4 sections"),
  );
  assertPrompt(
    assertions,
    "learning content second prompt: learning_content_card contract preserved",
    learningContentSecond.includes("learning_content_card") &&
      learningContentSecond.includes("reflectionPrompt") &&
      all.learningContentSecond.response_format?.type === "json_object",
  );

  return assertions;
}

function writeSnapshot(fileName: string, payload: unknown) {
  writeFileSync(join(exportDir, fileName), `${JSON.stringify(payload, null, 2)}\n`);
}

function main() {
  mkdirSync(exportDir, { recursive: true });
  const all = snapshots();
  const assertions = runAssertions(all);
  const failed = assertions.filter((assertion) => !assertion.passed);
  const promptList = [
    all.chatFirst,
    all.testGeneration,
    all.learningContentSecond,
    all.chatSecond,
  ];
  const mlRuntimeStatus = promptList.some(
    (snapshot) => snapshot.mlRuntimeStatus === "ML_RUNTIME_FALLBACK",
  )
    ? "ML_RUNTIME_FALLBACK"
    : promptList.some((snapshot) => snapshot.mlRuntimeStatus === "ML_RUNTIME_OK")
      ? "ML_RUNTIME_OK"
      : "ML_RUNTIME_NOT_REQUESTED";
  const summary = {
    ok: failed.length === 0,
    status: failed.length === 0 ? "PROMPT_AUDIT_PASS" : "PROMPT_AUDIT_FAIL",
    generatedAtIso: new Date().toISOString(),
    externalLlmCalled: false,
    realMlRuntimeRequested,
    mlRuntimeStatus,
    appliedToLearnerFacingOutput: promptList.every(
      (snapshot) => snapshot.appliedToLearnerFacingOutput,
    ),
    decisionSource: all.testGeneration.decisionSource,
    candidateCount: all.testGeneration.candidateCount,
    fallbackUsed: all.testGeneration.fallbackUsed,
    judgeStatus: all.testGeneration.judgeStatus,
    snapshots: [
      "chat_first_prompt.json",
      "test_generation_prompt.json",
      "learning_content_second_prompt.json",
      "chat_second_prompt.json",
    ],
    assertions,
    failed,
  };

  writeSnapshot("chat_first_prompt.json", all.chatFirst);
  writeSnapshot("test_generation_prompt.json", all.testGeneration);
  writeSnapshot("learning_content_second_prompt.json", all.learningContentSecond);
  writeSnapshot("chat_second_prompt.json", all.chatSecond);
  writeSnapshot("prompt_audit_summary.json", summary);

  console.log(JSON.stringify(summary));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main();
