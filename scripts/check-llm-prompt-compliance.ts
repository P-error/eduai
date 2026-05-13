import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { llmChatText, type LLMMessage } from "@/lib/llm/provider";
import { TestSchema } from "@/lib/test-schema";
import { loadLocalServerLlmEnv } from "./local-server-env";

type ProviderMode = "mock-provider" | "live-provider";

type PromptSnapshot = {
  path: "chat" | "test_generation" | "learning_content";
  llm: string;
  response_format: { type: "json_object" } | null;
  messages: LLMMessage[];
  flags: Record<string, string>;
  notes: string[];
};

type PromptCheckResult = {
  snapshotFile: string;
  path: PromptSnapshot["path"];
  providerMode: ProviderMode;
  providerStatus:
    | "MOCK_PROVIDER"
    | "LIVE_PROVIDER"
    | "LIVE_PROVIDER_UNAVAILABLE"
    | "LIVE_PROVIDER_ERROR";
  passed: boolean;
  snapshotValidation: CheckBlock;
  schemaValidation: CheckBlock;
  sixFactorCompliance: CheckBlock;
  leakageValidation: CheckBlock;
  strictRulesValidation: CheckBlock;
  responsePreview: string | null;
  violations: string[];
  recommendations: string[];
};

type CheckBlock = {
  passed: boolean;
  notes: string[];
  violations: string[];
};

type ComplianceResults = {
  status: "LLM_COMPLIANCE_PASS" | "LLM_COMPLIANCE_PARTIAL" | "LLM_COMPLIANCE_FAIL";
  generatedAtIso: string;
  providerMode: ProviderMode;
  providerStatus:
    | "MOCK_PROVIDER"
    | "LIVE_PROVIDER"
    | "LIVE_PROVIDER_UNAVAILABLE"
    | "LIVE_PROVIDER_ERROR";
  externalLlmCalled: boolean;
  promptsChecked: string[];
  results: PromptCheckResult[];
  violations: string[];
  recommendations: string[];
};

const LearningContentCardSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    sections: z
      .array(
        z
          .object({
            heading: z.string().min(1),
            body: z.string().min(1),
          })
          .strict(),
      )
      .min(2),
    reflectionPrompt: z.string().min(1),
  })
  .strict();

const SNAPSHOT_FILES = [
  "chat_first_prompt.json",
  "test_generation_prompt.json",
  "learning_content_second_prompt.json",
  "chat_second_prompt.json",
] as const;

const exportDir = join(process.cwd(), "exports", "prompt_audit");
const resultPath = join(process.cwd(), "exports", "llm_prompt_compliance_results.json");

const forbiddenFields = [
  "postScore",
  "post_score",
  "nextStepSuccess",
  "next_step_success",
  "normalizedLearningGain",
  "normalized_learning_gain",
  "answersJson",
  "selectedAnswers",
  "rawAnswers",
  "raw TestAttempt answers",
];

const hiddenMetadataTerms = [
  "system prompt",
  "hidden policies",
  "internal metadata",
  "package json",
  "candidate configs",
  "delivered_config",
  "featuresSnapshot",
  "six-factor render instructions",
];

const learnerMetricDisclosureTerms = [
  "priorAttemptsCount",
  "priorCorrectRate",
  "recentCorrectRate",
  "recentAttemptsCount",
  "topicSeenCount",
  "minutesSinceLastActivity",
  "sessionPosition",
  "0.75",
  "75%",
];

function emptyCheck(): CheckBlock {
  return {
    passed: true,
    notes: [],
    violations: [],
  };
}

function addViolation(check: CheckBlock, violation: string) {
  check.passed = false;
  check.violations.push(violation);
}

function redactSecrets(value: unknown) {
  return String(value).replace(/sk-[A-Za-z0-9_*.-]+/g, "[REDACTED_OPENAI_API_KEY]");
}

function parseMode(argv: string[]): ProviderMode {
  const hasMock = argv.includes("--mock-provider");
  const hasLive = argv.includes("--live-provider");
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("Usage: scripts/check-llm-prompt-compliance.sh [--mock-provider|--live-provider]");
    process.exit(0);
  }
  if (hasMock && hasLive) {
    throw new Error("Use only one provider mode.");
  }
  return hasLive ? "live-provider" : "mock-provider";
}

function ensureSnapshots() {
  const missing = SNAPSHOT_FILES.filter((fileName) => {
    return !existsSync(join(exportDir, fileName));
  });
  if (missing.length === 0) return;

  execFileSync("bash", ["scripts/audit-llm-prompts.sh"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}

function readSnapshot(fileName: (typeof SNAPSHOT_FILES)[number]): PromptSnapshot {
  const raw = readFileSync(join(exportDir, fileName), "utf8");
  const parsed = JSON.parse(raw) as PromptSnapshot;
  return parsed;
}

function includesAny(value: string, terms: string[]) {
  const lower = value.toLowerCase();
  return terms.filter((term) => lower.includes(term.toLowerCase()));
}

function serializeMessages(snapshot: PromptSnapshot) {
  return snapshot.messages.map((message) => message.content).join("\n\n");
}

function collectTextValues(value: unknown, output: string[] = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTextValues(item, output));
    return output;
  }
  if (value != null && typeof value === "object") {
    Object.values(value).forEach((item) => collectTextValues(item, output));
  }
  return output;
}

function responseTextForPedagogyChecks(raw: string) {
  try {
    return collectTextValues(JSON.parse(raw)).join("\n");
  } catch {
    return raw;
  }
}

function hasGuidedSupportSignal(raw: string) {
  const text = responseTextForPedagogyChecks(raw);
  const markers = [
    /\bcheck(?: yourself| your solution| your answer| understanding)?(?:\s|\*)*[:：-]/i,
    /\bunderstanding check\s*[:：-]/i,
    /\bhint\s*[:：-]/i,
    /\bmini[- ]?question\s*[:：-]/i,
    /\bnext step\s*[:：-]/i,
    /\btry(?: this)?\s*[:：-]/i,
    /проверка понимания\s*[:：-]/i,
    /проверь себя\s*[:：-]/i,
    /подсказка\s*[:：-]/i,
    /мини[- ]?вопрос\s*[:：-]/i,
    /попробуй\s*[:：-]/i,
    /следующий шаг\s*[:：-]/i,
  ];
  return markers.some((marker) => marker.test(text));
}

function countExampleSignalsInText(text: string) {
  const matches = text.match(
    /(?:^|[\n\r#>\s])(?:\*{1,2})?(?:one example|worked example|example)(?:\*{1,2})?\s*[:：-]|\bfor example\s*[,：:]|(?:^|[\n\r#>\s])(?:один пример|пример)(?:\*{1,2})?\s*[:：-]|например\s*[,：:]/gi,
  );
  return matches?.length ?? 0;
}

function countExampleSignals(raw: string, snapshot: PromptSnapshot) {
  if (snapshot.path !== "learning_content") {
    return countExampleSignalsInText(responseTextForPedagogyChecks(raw));
  }

  try {
    const parsed = JSON.parse(raw) as {
      title?: unknown;
      summary?: unknown;
      sections?: Array<{ heading?: unknown; body?: unknown }>;
      reflectionPrompt?: unknown;
    };
    let count = 0;
    for (const value of [parsed.title, parsed.summary, parsed.reflectionPrompt]) {
      if (typeof value === "string") {
        count += countExampleSignalsInText(value);
      }
    }
    for (const section of parsed.sections ?? []) {
      const sectionText = [section.heading, section.body]
        .filter((value): value is string => typeof value === "string")
        .join("\n");
      if (countExampleSignalsInText(sectionText) > 0) count += 1;
    }
    return count;
  } catch {
    return countExampleSignalsInText(responseTextForPedagogyChecks(raw));
  }
}

function validateSnapshot(snapshot: PromptSnapshot) {
  const check = emptyCheck();
  const content = serializeMessages(snapshot);

  if (!snapshot.messages.some((message) => message.role === "system")) {
    addViolation(check, "missing_system_instruction");
  }
  if (!content.includes("Linear equations") || !content.includes("Algebra")) {
    addViolation(check, "missing_subject_topic_context");
  }
  if (!content.includes("declaredPreferences")) {
    addViolation(check, "missing_declared_preferences");
  }
  for (const factor of [
    "difficulty:",
    "depth:",
    "support_level:",
    "presentation_format:",
    "examples_level:",
    "terminology_level:",
  ]) {
    if (!content.includes(factor)) {
      addViolation(check, `missing_six_factor_instruction:${factor}`);
    }
  }
  const leakedFields = includesAny(content, forbiddenFields);
  if (leakedFields.length > 0) {
    addViolation(check, `forbidden_prompt_fields:${leakedFields.join(",")}`);
  }

  check.notes.push("snapshot structure checked locally; no provider call in this validator");
  return check;
}

function makeMockResponse(snapshot: PromptSnapshot, fileName: string) {
  if (snapshot.path === "test_generation") {
    return JSON.stringify({
      title: "Algebra: Linear equations",
      questions: [
        {
          prompt: "Solve the linear equation 2x + 3 = 11.",
          options: ["x = 3", "x = 4", "x = 5", "x = 7"],
          answerIndex: 1,
          explanation:
            "Step 1 subtract 3 from both sides to get 2x = 8. Step 2 divide by 2, so x = 4.",
        },
        {
          prompt: "Which first step correctly starts solving x - 6 = 10?",
          options: ["Add 6 to both sides", "Subtract 6 from both sides", "Multiply both sides by 6", "Divide both sides by 6"],
          answerIndex: 0,
          explanation:
            "Use the inverse operation. Adding 6 to both sides isolates the variable and gives x = 16.",
        },
        {
          prompt: "Solve 3x = 15.",
          options: ["x = 3", "x = 4", "x = 5", "x = 6"],
          answerIndex: 2,
          explanation:
            "Divide both sides by the coefficient 3. A coefficient is the number multiplying the variable, so x = 5.",
        },
      ],
    });
  }

  if (snapshot.path === "learning_content") {
    return JSON.stringify({
      title: "Linear equations: step-by-step guide",
      summary:
        "A linear equation asks you to find the value of the variable that makes both sides equal.",
      sections: [
        {
          heading: "Core idea",
          body:
            "First identify the variable and undo operations in reverse order. Keep both sides balanced by doing the same operation to each side.",
        },
        {
          heading: "One example:",
          body:
            "For 2x + 3 = 11, subtract 3 to get 2x = 8, then divide by 2 to get x = 4.",
        },
        {
          heading: "Check",
          body:
            "Check: Substitute the answer back: 2 * 4 + 3 = 11. This confirms the equation is balanced.",
        },
      ],
      reflectionPrompt:
        "What inverse operation would you choose first for x - 6 = 10?",
    });
  }

  const second = fileName.includes("second");
  return [
    second
      ? "Let's use the same step-by-step structure and focus on the mistake without exposing hidden learner metrics."
      : "Let's solve linear equations with a step-by-step structure.",
    "A linear equation keeps the variable to the first power. The goal is to isolate the variable by using inverse operations.",
    "Example: for 2x + 3 = 11, first subtract 3 from both sides, then divide by 2. The answer is x = 4.",
    "Check: substitute x = 4 back into the equation to confirm both sides match.",
  ].join("\n\n");
}

async function getProviderResponse(
  snapshot: PromptSnapshot,
  fileName: string,
  mode: ProviderMode,
) {
  if (mode === "mock-provider") {
    return {
      providerStatus: "MOCK_PROVIDER" as const,
      externalLlmCalled: false,
      response: makeMockResponse(snapshot, fileName),
      error: null,
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return {
      providerStatus: "LIVE_PROVIDER_UNAVAILABLE" as const,
      externalLlmCalled: false,
      response: null,
      error: null,
    };
  }

  try {
    const response = await llmChatText({
      model: snapshot.llm,
      temperature: 0.2,
      response_format: snapshot.response_format ?? undefined,
      messages: snapshot.messages,
    });

    return {
      providerStatus: "LIVE_PROVIDER" as const,
      externalLlmCalled: true,
      response,
      error: null,
    };
  } catch (error) {
    return {
      providerStatus: "LIVE_PROVIDER_ERROR" as const,
      externalLlmCalled: true,
      response: null,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
    };
  }
}

function parseJsonResponse(raw: string, schemaValidation: CheckBlock) {
  try {
    return JSON.parse(raw);
  } catch {
    addViolation(schemaValidation, "response_is_not_valid_json");
    return null;
  }
}

function hasExactKeys(value: unknown, keys: string[]) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  return JSON.stringify(actual) === JSON.stringify([...keys].sort());
}

function validateTestResponse(raw: string) {
  const schemaValidation = emptyCheck();
  const parsed = parseJsonResponse(raw, schemaValidation);
  if (!parsed) return schemaValidation;

  const strictParsed = TestSchema.safeParse(parsed);
  if (!strictParsed.success) {
    addViolation(schemaValidation, `test_schema_invalid:${strictParsed.error.message}`);
    return schemaValidation;
  }

  if (!hasExactKeys(parsed, ["title", "questions"])) {
    addViolation(schemaValidation, "extra_or_missing_top_level_keys");
  }

  strictParsed.data.questions.forEach((question, index) => {
    const rawQuestion = Array.isArray(parsed.questions) ? parsed.questions[index] : null;
    if (
      !hasExactKeys(rawQuestion, [
        "answerIndex",
        "explanation",
        "options",
        "prompt",
      ])
    ) {
      addViolation(schemaValidation, `question_${index}:extra_or_missing_keys`);
    }
    if (question.options.length < 2 || question.options.length > 6) {
      addViolation(schemaValidation, `question_${index}:invalid_options_count`);
    }
    if (question.answerIndex < 0 || question.answerIndex >= question.options.length) {
      addViolation(schemaValidation, `question_${index}:answer_index_out_of_range`);
    }
    if (typeof question.options[question.answerIndex] !== "string") {
      addViolation(schemaValidation, `question_${index}:correct_answer_not_parseable`);
    }
  });

  if (typeof raw === "string" && !raw.trim().startsWith("{")) {
    addViolation(schemaValidation, "presentation_format_replaced_json_with_text");
  }
  schemaValidation.notes.push("TestSchema, answerIndex, MCQ options, and strict top-level keys checked");
  return schemaValidation;
}

function validateLearningContentResponse(raw: string) {
  const schemaValidation = emptyCheck();
  const parsed = parseJsonResponse(raw, schemaValidation);
  if (!parsed) return schemaValidation;

  const result = LearningContentCardSchema.safeParse(parsed);
  if (!result.success) {
    addViolation(schemaValidation, `learning_content_schema_invalid:${result.error.message}`);
  }
  schemaValidation.notes.push("learning_content_card JSON contract checked");
  return schemaValidation;
}

function validateChatResponse(raw: string) {
  const schemaValidation = emptyCheck();
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    addViolation(schemaValidation, "chat_response_unexpected_json");
  }
  if (trimmed.length < 40) {
    addViolation(schemaValidation, "chat_response_too_short_for_compliance_probe");
  }
  schemaValidation.notes.push("chat response checked as conversational educational text");
  return schemaValidation;
}

function validateSchema(snapshot: PromptSnapshot, raw: string | null) {
  if (raw == null) {
    return {
      passed: true,
      notes: ["live provider unavailable; response schema not evaluated"],
      violations: [],
    } satisfies CheckBlock;
  }
  if (snapshot.path === "test_generation") return validateTestResponse(raw);
  if (snapshot.path === "learning_content") {
    return validateLearningContentResponse(raw);
  }
  return validateChatResponse(raw);
}

function validateSixFactorCompliance(snapshot: PromptSnapshot, raw: string | null) {
  const check = emptyCheck();
  if (raw == null) {
    check.notes.push("live provider unavailable; response six-factor style not evaluated");
    return check;
  }

  const responseText = responseTextForPedagogyChecks(raw);
  const content = responseText.toLowerCase();
  if (!content.includes("linear") && !content.includes("equation") && !content.includes("algebra")) {
    addViolation(check, "response_not_anchored_to_subject_topic");
  }
  if (!content.includes("step") && !content.includes("first") && !content.includes("then")) {
    addViolation(check, "presentation_format_step_by_step_not_visible");
  }
  if (snapshot.path !== "test_generation") {
    const exampleSignals = countExampleSignals(raw, snapshot);
    if (exampleSignals === 0) {
      addViolation(check, "examples_level_single_not_visible");
    } else if (exampleSignals > 1) {
      addViolation(check, "examples_level_single_multiple_visible");
    }
    if (snapshot.path === "learning_content") {
      try {
        const parsed = JSON.parse(raw) as {
          sections?: Array<{ heading?: unknown }>;
        };
        const oneExampleHeadingCount =
          parsed.sections?.filter((section) => {
            return (
              typeof section.heading === "string" &&
              section.heading.trim().toLowerCase() === "one example:"
            );
          }).length ?? 0;
        if (oneExampleHeadingCount !== 1) {
          addViolation(
            check,
            `learning_content_single_example_heading_count:${oneExampleHeadingCount}`,
          );
        }
      } catch {
        addViolation(check, "learning_content_single_example_structure_not_json");
      }
    }
    if (!hasGuidedSupportSignal(raw)) {
      addViolation(check, "support_level_guided_signal_not_visible");
    }
  }
  if (snapshot.path === "test_generation") {
    let parsed: { questions?: Array<{ explanation?: string }> };
    try {
      parsed = JSON.parse(raw) as {
        questions?: Array<{ explanation?: string }>;
      };
    } catch {
      addViolation(check, "test_response_not_json_for_six_factor_check");
      return check;
    }
    const explanations = parsed.questions?.map((question) => question.explanation ?? "") ?? [];
    if (explanations.some((explanation) => explanation.trim().length === 0)) {
      addViolation(check, "test_explanations_missing_depth_support");
    }
  }

  check.notes.push(
    "checked subject/topic anchoring, stepwise structure, example/support visibility, and explanation depth",
  );
  return check;
}

function validateLeakage(raw: string | null) {
  const check = emptyCheck();
  if (raw == null) {
    check.notes.push("live provider unavailable; response leakage not evaluated");
    return check;
  }

  const forbidden = includesAny(raw, forbiddenFields);
  if (forbidden.length > 0) {
    addViolation(check, `forbidden_outcome_fields_in_response:${forbidden.join(",")}`);
  }

  const hidden = includesAny(raw, hiddenMetadataTerms);
  if (hidden.length > 0) {
    addViolation(check, `hidden_metadata_disclosure:${hidden.join(",")}`);
  }

  const metrics = includesAny(raw, learnerMetricDisclosureTerms);
  if (metrics.length > 0) {
    addViolation(check, `raw_learner_metric_disclosure:${metrics.join(",")}`);
  }

  check.notes.push("checked forbidden outcome fields, hidden metadata, and raw metric disclosure");
  return check;
}

function validateStrictRules(snapshot: PromptSnapshot, raw: string | null) {
  const check = emptyCheck();
  const prompt = serializeMessages(snapshot).toLowerCase();
  const response = (raw ?? "").toLowerCase();

  if (prompt.includes("return json only") && raw != null && !raw.trim().startsWith("{")) {
    addViolation(check, "json_only_prompt_received_non_json_response");
  }
  if (
    snapshot.path === "test_generation" &&
    raw != null &&
    (response.includes("short answer") || response.includes("open-ended"))
  ) {
    addViolation(check, "mcq_prompt_replaced_by_non_mcq_format");
  }
  if (
    response.includes("answer briefly") &&
    response.includes("detailed explanation")
  ) {
    addViolation(check, "contradictory_response_instruction_pair");
  }

  check.notes.push("checked JSON-only, MCQ, and known contradiction rules");
  return check;
}

function recommendationsFor(violations: string[]) {
  if (violations.length === 0) {
    return ["No remediation needed for this provider mode."];
  }
  const recommendations = new Set<string>();
  for (const violation of violations) {
    if (violation.includes("schema") || violation.includes("json") || violation.includes("mcq")) {
      recommendations.add("Tighten schema-format wording or add provider-specific JSON retry handling.");
    } else if (violation.includes("six") || violation.includes("step") || violation.includes("support")) {
      recommendations.add("Strengthen six-factor response requirements or add response-level retries.");
    } else if (violation.includes("leak") || violation.includes("metadata") || violation.includes("metric")) {
      recommendations.add("Add stricter anti-disclosure wording and response redaction checks.");
    } else {
      recommendations.add("Inspect the prompt snapshot and response for path-specific compliance gaps.");
    }
  }
  return [...recommendations];
}

async function checkOne(
  fileName: (typeof SNAPSHOT_FILES)[number],
  mode: ProviderMode,
) {
  const snapshot = readSnapshot(fileName);
  const snapshotValidation = validateSnapshot(snapshot);
  const provider = await getProviderResponse(snapshot, fileName, mode);
  const schemaValidation = validateSchema(snapshot, provider.response);
  const sixFactorCompliance = validateSixFactorCompliance(snapshot, provider.response);
  const leakageValidation = validateLeakage(provider.response);
  const strictRulesValidation = validateStrictRules(snapshot, provider.response);
  const violations = [
    ...snapshotValidation.violations,
    ...schemaValidation.violations,
    ...sixFactorCompliance.violations,
    ...leakageValidation.violations,
    ...strictRulesValidation.violations,
    ...(provider.providerStatus === "LIVE_PROVIDER_ERROR"
      ? [`live_provider_error:${provider.error ?? "unknown"}`]
      : []),
  ];

  return {
    snapshotFile: fileName,
    path: snapshot.path,
    providerMode: mode,
    providerStatus: provider.providerStatus,
    passed: violations.length === 0,
    snapshotValidation,
    schemaValidation,
    sixFactorCompliance,
    leakageValidation,
    strictRulesValidation,
    responsePreview:
      provider.response == null ? null : provider.response.slice(0, 700),
    violations,
    recommendations: recommendationsFor(violations),
    externalLlmCalled: provider.externalLlmCalled,
  };
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  if (mode === "live-provider") {
    loadLocalServerLlmEnv();
  }
  ensureSnapshots();
  mkdirSync(join(process.cwd(), "exports"), { recursive: true });

  const checked: PromptCheckResult[] = [];
  let externalLlmCalled = false;
  for (const fileName of SNAPSHOT_FILES) {
    const result = await checkOne(fileName, mode);
    externalLlmCalled = externalLlmCalled || result.externalLlmCalled;
    checked.push({
      snapshotFile: result.snapshotFile,
      path: result.path,
      providerMode: result.providerMode,
      providerStatus: result.providerStatus,
      passed: result.passed,
      snapshotValidation: result.snapshotValidation,
      schemaValidation: result.schemaValidation,
      sixFactorCompliance: result.sixFactorCompliance,
      leakageValidation: result.leakageValidation,
      strictRulesValidation: result.strictRulesValidation,
      responsePreview: result.responsePreview,
      violations: result.violations,
      recommendations: result.recommendations,
    });
  }

  const providerStatus =
    checked.find((result) => result.providerStatus === "LIVE_PROVIDER")
      ?.providerStatus ??
    checked.find((result) => result.providerStatus === "LIVE_PROVIDER_ERROR")
      ?.providerStatus ??
    checked.find((result) => result.providerStatus === "LIVE_PROVIDER_UNAVAILABLE")
      ?.providerStatus ??
    "MOCK_PROVIDER";
  const violations = checked.flatMap((result) =>
    result.violations.map((violation) => `${result.snapshotFile}:${violation}`),
  );
  const status =
    violations.length > 0
      ? "LLM_COMPLIANCE_FAIL"
      : providerStatus === "LIVE_PROVIDER_UNAVAILABLE"
        ? "LLM_COMPLIANCE_PARTIAL"
        : "LLM_COMPLIANCE_PASS";
  const recommendations =
    providerStatus === "LIVE_PROVIDER_UNAVAILABLE"
      ? [
          "Live provider was unavailable; rerun with OPENAI_API_KEY and optional OPENAI_BASE_URL to check external LLM compliance.",
        ]
      : [...new Set(checked.flatMap((result) => result.recommendations))];

  const payload: ComplianceResults = {
    status,
    generatedAtIso: new Date().toISOString(),
    providerMode: mode,
    providerStatus,
    externalLlmCalled,
    promptsChecked: [...SNAPSHOT_FILES],
    results: checked,
    violations,
    recommendations,
  };

  writeFileSync(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload));

  if (status === "LLM_COMPLIANCE_FAIL") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = redactSecrets(error instanceof Error ? error.message : String(error));
  const payload: ComplianceResults = {
    status: "LLM_COMPLIANCE_FAIL",
    generatedAtIso: new Date().toISOString(),
    providerMode: process.argv.includes("--live-provider")
      ? "live-provider"
      : "mock-provider",
    providerStatus: process.argv.includes("--live-provider")
      ? "LIVE_PROVIDER_ERROR"
      : "MOCK_PROVIDER",
    externalLlmCalled: false,
    promptsChecked: [],
    results: [],
    violations: [`script_error:${message}`],
    recommendations: ["Inspect the compliance script error and rerun."],
  };
  mkdirSync(join(process.cwd(), "exports"), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.error(JSON.stringify(payload));
  process.exitCode = 1;
});
