import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Page } from "playwright";
import { TestSchema } from "@/lib/test-schema";
import { readSixFactorDeliveredConfigMetadata } from "@/lib/ml-six-factor-decision-metadata";
import { exportRealUserTrainingObservations } from "@/lib/ml-six-factor-real-user-export";
import { loadLocalServerLlmEnv } from "./local-server-env";

type CliOptions = {
  port: number | null;
  headed: boolean;
  out: string;
  exportOut: string;
  artifact: string;
  keepServer: boolean;
};

type BrowserPilotStatus =
  | "BROWSER_LIVE_PILOT_PASS"
  | "BROWSER_LIVE_PILOT_PARTIAL"
  | "BROWSER_LIVE_PILOT_FAIL"
  | "DB_UNAVAILABLE"
  | "LIVE_PROVIDER_UNAVAILABLE";

const DEFAULT_OUT = "exports/browser_live_user_journey_pilot_results.json";
const DEFAULT_EXPORT_OUT =
  "exports/browser_live_user_journey_pilot_training_observations.jsonl";
const REQUIRED_FACTOR_KEYS = [
  "difficulty",
  "depth",
  "support_level",
  "presentation_format",
  "examples_level",
  "terminology_level",
] as const;
const FORBIDDEN_FEATURE_FIELDS = [
  "postScore",
  "post_score",
  "nextStepSuccess",
  "next_step_success",
  "normalizedLearningGain",
  "normalized_learning_gain",
  "outcome",
  "outcomeAvailable",
  "outcome_available",
  "rawAnswers",
  "answersJson",
] as const;
const HIDDEN_DISCLOSURE_MARKERS = [
  /sixFactor/i,
  /featuresSnapshot/i,
  /candidateConfig/i,
  /deliveredConfig/i,
  /OPENAI_API_KEY/i,
  /artifactPath/i,
  /normalizedLearningGain/i,
  /nextStepSuccess/i,
  /postScore/i,
] as const;
const GUIDED_MARKER_RE =
  /\b(Check|Check your solution|Hint|Mini-question|Next step|Try|Проверка понимания|Подсказка|Мини-вопрос|Попробуй|Следующий шаг)\b/i;
const EXAMPLE_MARKER_RE =
  /\b(One example|Example|Один пример|Пример)\s*:/gi;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    port: null,
    headed: false,
    out: DEFAULT_OUT,
    exportOut: DEFAULT_EXPORT_OUT,
    artifact: "ml/examples/candidate_scorer_artifact.example.json",
    keepServer: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") {
      const parsed = Number(argv[index + 1]);
      options.port = Number.isFinite(parsed) ? Math.floor(parsed) : null;
      index += 1;
    } else if (arg === "--headed") {
      options.headed = true;
    } else if (arg === "--out") {
      options.out = argv[index + 1] ?? options.out;
      index += 1;
    } else if (arg === "--export-out") {
      options.exportOut = argv[index + 1] ?? options.exportOut;
      index += 1;
    } else if (arg === "--artifact") {
      options.artifact = argv[index + 1] ?? options.artifact;
      index += 1;
    } else if (arg === "--keep-server") {
      options.keepServer = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function timestampForRunId(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "")
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function writeJson(outPath: string, value: unknown) {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonl(outPath: string, rows: unknown[]) {
  mkdirSync(path.dirname(outPath), { recursive: true });
  const content =
    rows.length > 0 ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "";
  writeFileSync(outPath, content, "utf8");
}

function canConnect(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(700, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function findFreePort(preferred: number | null) {
  const start = preferred ?? 3131;
  for (let port = start; port < start + 20; port += 1) {
    if (!(await canConnect(port))) return port;
  }
  throw new Error("NO_FREE_PORT_FOR_BROWSER_PILOT");
}

function commandPath(command: string) {
  const result = spawnSync("bash", ["-lc", `command -v ${command}`], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function resolveChromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    commandPath("chromium"),
    commandPath("chromium-browser"),
    commandPath("google-chrome"),
    commandPath("google-chrome-stable"),
  ].filter((entry): entry is string => Boolean(entry));
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function startDevServer(params: { port: number; artifact: string }) {
  loadLocalServerLlmEnv();
  const env = {
    ...process.env,
    EDUAI_SIX_FACTOR_SHADOW: "1",
    EDUAI_SIX_FACTOR_ML_POLICY: "1",
    EDUAI_SIX_FACTOR_APPLY: "1",
    EDUAI_SIX_FACTOR_ARTIFACT_PATH: params.artifact,
  };
  const child = spawn(
    "npm",
    [
      "run",
      "dev",
      "--",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(params.port),
    ],
    {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const redactSecrets = (value: unknown) =>
    String(value).replace(/sk-[A-Za-z0-9_*.-]+/g, "[REDACTED_OPENAI_API_KEY]");
  child.stdout.on("data", (chunk) => {
    process.stderr.write(`[browser-pilot-dev] ${redactSecrets(chunk)}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[browser-pilot-dev] ${redactSecrets(chunk)}`);
  });

  return child;
}

async function waitForHttp(baseUrl: string, timeoutMs = 120_000) {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        cache: "no-store",
      });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`DEV_SERVER_UNAVAILABLE: ${lastError}`);
}

async function stopDevServer(child: ChildProcess | null) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  if (!child.killed) child.kill("SIGKILL");
}

async function ensureDbReady(prisma: PrismaClient) {
  await prisma.$connect();
  await Promise.all([
    prisma.user.count(),
    prisma.subject.count(),
    prisma.generatedTest.count(),
    prisma.testAttempt.count(),
    prisma.chatSession.count(),
    prisma.evaluationEpisode.count(),
  ]);
}

async function waitForUrlIncludes(page: Page, value: string) {
  await page.waitForFunction(
    (needle) => window.location.pathname.includes(String(needle)),
    value,
    { timeout: 30_000 },
  );
}

async function fillProfilePreferences(page: Page) {
  await page.goto("/profile");
  await page.getByRole("tab", { name: "My preferences" }).click();
  await page
    .locator(".sys-control-group")
    .filter({ hasText: "Preferred difficulty" })
    .getByRole("button", { name: "Medium" })
    .click();
  await page
    .locator(".sys-control-group")
    .filter({ hasText: "Preferred explanation depth" })
    .getByRole("button", { name: "Standard" })
    .click();
  await page
    .locator(".sys-control-group")
    .filter({ hasText: "Preferred tone" })
    .getByRole("button", { name: "Friendly" })
    .click();
  await page
    .locator(".sys-control-group")
    .filter({ hasText: "Preferred explanation style" })
    .getByRole("button", { name: "Stepwise" })
    .click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.getByText("Declared preferences updated.").waitFor({ timeout: 30_000 });
}

async function createTopicThroughUi(page: Page, params: {
  groupName: string;
  subjectTitle: string;
  description: string;
}) {
  await page.goto("/topics");
  await page.getByText("Canonical topic structure").waitFor({ timeout: 30_000 });

  const groupForm = page.locator("form").filter({ hasText: "Create topic group" });
  await groupForm.locator("input").first().fill(params.groupName);
  await groupForm.getByRole("button", { name: "Create topic group" }).click();
  await page.locator("option").filter({ hasText: params.groupName }).first().waitFor({
    state: "attached",
    timeout: 30_000,
  });

  const topicForm = page.locator("form").filter({ has: page.locator("#topic-title") });
  await topicForm.locator("#topic-title").fill(params.subjectTitle);
  await topicForm.locator("textarea").fill(params.description);
  await topicForm.locator("select").selectOption({ label: params.groupName });
  await topicForm.getByRole("button", { name: "Create topic" }).click();
  await waitForUrlIncludes(page, "/topics/");
}

async function openEpisodeStartForm(page: Page, subjectId: string) {
  const currentUrl = page.url();
  if (!currentUrl.includes("/learn")) {
    await page.goto(`/learn?subjectId=${encodeURIComponent(subjectId)}`);
  }

  const startHeading = page.getByRole("heading", { name: "Start a new episode" });
  const startAnother = page.getByRole("button", { name: "Start another episode" }).first();

  await page
    .waitForFunction(() => !document.body.innerText.includes("Restoring learner episode"), null, {
      timeout: 120_000,
    })
    .catch(() => undefined);

  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return text.includes("Start a new episode") || text.includes("Start another episode");
    },
    null,
    { timeout: 120_000 },
  );

  if (!(await startHeading.isVisible().catch(() => false))) {
    await startAnother.waitFor({ state: "visible", timeout: 120_000 });
    await startAnother.click();
  }

  await startHeading.waitFor({ timeout: 120_000 });
}

async function startExplanationEpisodeThroughUi(page: Page, params: {
  subjectId: string;
  topic: string;
}) {
  await openEpisodeStartForm(page, params.subjectId);
  await page.getByLabel("Lesson focus").fill(params.topic);
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/evaluation/episodes") &&
        candidate.request().method() === "POST",
      { timeout: 180_000 },
    ),
    page.getByRole("button", { name: "Start with explanation" }).click(),
  ]);
  const state = (await response.json()) as Record<string, unknown>;
  if (!response.ok()) {
    throw new Error(`EPISODE_UI_START_FAILED:${response.status()}`);
  }
  await page.getByText("Learning dialogue").waitFor({ timeout: 180_000 });
  return state;
}

async function askDialogueQuestion(page: Page, question: string) {
  await page.getByLabel("Ask about this topic").fill(question);
  await page.getByRole("button", { name: "Send question" }).click();
  await page.waitForFunction(
    () => !document.body.innerText.includes("Generating reply..."),
    null,
    { timeout: 120_000 },
  );
  await page
    .waitForFunction(() => {
      const textarea = [...document.querySelectorAll("textarea")].find((node) =>
        (node.textContent ?? "").includes(""),
      ) as HTMLTextAreaElement | undefined;
      return textarea ? textarea.value === "" : true;
    }, null, { timeout: 30_000 })
    .catch(() => undefined);
}

async function submitCurrentEpisodeTest(page: Page) {
  await page.locator("input[type='radio']").first().waitFor({ timeout: 120_000 });
  const questionCount = await page.locator("input[type='radio']").evaluateAll((nodes) => {
    return new Set(
      nodes.map((node) => (node as HTMLInputElement).name).filter(Boolean),
    ).size;
  });
  if (questionCount < 1) {
    throw new Error("NO_TEST_QUESTIONS_VISIBLE");
  }
  for (let index = 0; index < questionCount; index += 1) {
    await page.locator(`input[name="episode-question-${index}"][value="0"]`).check();
  }
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByText("Outcome recorded").waitFor({ timeout: 60_000 });
  return questionCount;
}

function currentStepLearningContentSessionId(state: Record<string, unknown>) {
  const currentStep = isRecord(state.currentStep) ? state.currentStep : {};
  const learningContent = isRecord(currentStep.learningContent)
    ? currentStep.learningContent
    : {};
  const sessionId = learningContent.sessionId;
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new Error("EPISODE_LEARNING_CONTENT_SESSION_MISSING");
  }
  return sessionId;
}

function currentEpisodeId(state: Record<string, unknown>) {
  const episode = isRecord(state.episode) ? state.episode : {};
  const episodeId = episode.episodeId;
  if (typeof episodeId !== "string" || episodeId.trim().length === 0) {
    throw new Error("EPISODE_ID_MISSING");
  }
  return episodeId;
}

function hasAllSixFactors(value: unknown) {
  if (!isRecord(value)) return false;
  return REQUIRED_FACTOR_KEYS.every((key) => key in value);
}

function containsForbiddenFeatureField(value: unknown) {
  if (!isRecord(value)) return false;
  return FORBIDDEN_FEATURE_FIELDS.some((field) => field in value);
}

function hiddenDisclosureViolations(text: string) {
  return HIDDEN_DISCLOSURE_MARKERS
    .filter((pattern) => pattern.test(text))
    .map((pattern) => String(pattern));
}

function countExampleMarkers(text: string) {
  return [...text.matchAll(EXAMPLE_MARKER_RE)].length;
}

function hasGuidedMarker(text: string) {
  return GUIDED_MARKER_RE.test(text);
}

function visibleMessageText(params: {
  content: string;
  signalsJson: unknown;
}) {
  const signals = isRecord(params.signalsJson) ? params.signalsJson : {};
  if (typeof signals.uiThreadText === "string" && signals.uiThreadText.length > 0) {
    return signals.uiThreadText;
  }
  if (isRecord(signals.learningContentCard)) {
    return JSON.stringify(signals.learningContentCard);
  }
  return params.content;
}

async function readSessionEvidence(prisma: PrismaClient, sessionId: string) {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          signalsJson: true,
          createdAt: true,
        },
      },
    },
  });
  if (!session) throw new Error(`CHAT_SESSION_NOT_FOUND:${sessionId}`);

  const learningContentAssistant =
    session.messages.find((message) => {
      const signals = isRecord(message.signalsJson) ? message.signalsJson : {};
      return (
        message.role === "assistant" &&
        signals.deliveryMode === "episode_learning_content"
      );
    }) ?? null;
  if (!learningContentAssistant) {
    throw new Error(`LEARNING_CONTENT_ASSISTANT_MESSAGE_NOT_FOUND:${sessionId}`);
  }
  const dialogueAssistants = session.messages.filter((message) => {
    const signals = isRecord(message.signalsJson) ? message.signalsJson : {};
    return (
      message.role === "assistant" &&
      signals.deliveryMode === "episode_learning_dialogue"
    );
  });
  const seedMetadata = readSixFactorDeliveredConfigMetadata(
    learningContentAssistant.signalsJson,
  );
  if (!seedMetadata) {
    throw new Error(`SIX_FACTOR_METADATA_MISSING:${sessionId}`);
  }
  const latestDialogue = dialogueAssistants[dialogueAssistants.length - 1] ?? null;
  const latestDialogueMetadata = latestDialogue
    ? readSixFactorDeliveredConfigMetadata(latestDialogue.signalsJson)
    : null;
  const seedSignals = isRecord(learningContentAssistant.signalsJson)
    ? learningContentAssistant.signalsJson
    : {};
  const latestDialogueSignals =
    latestDialogue && isRecord(latestDialogue.signalsJson)
      ? latestDialogue.signalsJson
      : {};

  return {
    sessionId,
    seedMessageId: learningContentAssistant.id,
    seedContent: visibleMessageText({
      content: learningContentAssistant.content,
      signalsJson: learningContentAssistant.signalsJson,
    }),
    seedGenerationSource:
      typeof seedSignals.generationSource === "string"
        ? seedSignals.generationSource
        : "unknown",
    seedMetadata,
    dialogueAssistantCount: dialogueAssistants.length,
    latestDialogueContent: latestDialogue
      ? visibleMessageText({
          content: latestDialogue.content,
          signalsJson: latestDialogue.signalsJson,
        })
      : "",
    latestDialogueGenerationSource:
      typeof latestDialogueSignals.generationSource === "string"
        ? latestDialogueSignals.generationSource
        : null,
    latestDialogueMetadata,
  };
}

async function runDatasetValidation(outPath: string) {
  const pythonPath = existsSync("ml/.venv/bin/python")
    ? "ml/.venv/bin/python"
    : "python";
  const result = spawnSync(
    pythonPath,
    ["ml/scripts/validate_dataset.py", "--input", outPath],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
    },
  );
  return {
    ok: result.status === 0,
    command: `${pythonPath} ml/scripts/validate_dataset.py --input ${outPath}`,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

async function buildExportForUser(params: {
  prisma: PrismaClient;
  userId: string;
  sinceIso: string;
  outPath: string;
}) {
  const result = await exportRealUserTrainingObservations(params.prisma, {
    since: params.sinceIso,
    includeOutcomeMissing: true,
    limit: 1000,
  });
  const observations = result.observations.filter(
    (row) => row.ids.user_ref === params.userId,
  );
  writeJsonl(params.outPath, observations);
  const withOutcome = observations.filter((row) => row.outcome.outcome_available).length;
  const leakageViolationsCount = observations.filter(
    (row) =>
      row.leakage_guard.uses_only_pre_decision_data !== true ||
      containsForbiddenFeatureField(row.pre_decision_features),
  ).length;
  return {
    out: params.outPath,
    filteredByUserRef: params.userId,
    scannedSummary: result.summary,
    exportedObservations: observations.length,
    withOutcome,
    withoutOutcome: observations.length - withOutcome,
    leakageViolationsCount,
    sourceKinds: [...new Set(observations.map((row) => row.source.source_kind))],
  };
}

function summarizeFeatureComparison(first: unknown, second: unknown) {
  const left = isRecord(first) ? first : {};
  const right = isRecord(second) ? second : {};
  const fields = [
    "priorAttemptsCount",
    "priorCorrectRate",
    "recentCorrectRate",
    "recentAttemptsCount",
    "topicSeenCount",
    "minutesSinceLastActivity",
    "sessionPosition",
    "previousDifficulty",
    "previousDepth",
  ];
  return Object.fromEntries(
    fields.map((field) => [
      field,
      {
        first: left[field] ?? null,
        second: right[field] ?? null,
        changed: JSON.stringify(left[field] ?? null) !== JSON.stringify(right[field] ?? null),
      },
    ]),
  );
}

function numericFeature(snapshot: unknown, key: string) {
  if (!isRecord(snapshot)) return null;
  const value = snapshot[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildAssertionFailures(params: {
  firstEvidence: Awaited<ReturnType<typeof readSessionEvidence>>;
  secondEvidence: Awaited<ReturnType<typeof readSessionEvidence>>;
  testValidationOk: boolean;
  testHasAttempt: boolean;
  exportSummary: Awaited<ReturnType<typeof buildExportForUser>>;
  exportValidationOk: boolean;
}) {
  const failures: string[] = [];
  const firstMetadata = params.firstEvidence.seedMetadata;
  const secondMetadata = params.secondEvidence.seedMetadata;
  const secondFeatures = secondMetadata.featuresSnapshot;

  if (!hasAllSixFactors(firstMetadata.deliveredConfig)) {
    failures.push("first_learning_content_missing_six_factor_config");
  }
  if (!hasAllSixFactors(secondMetadata.deliveredConfig)) {
    failures.push("second_learning_content_missing_six_factor_config");
  }
  if (firstMetadata.decisionSource !== "ml_policy") {
    failures.push("first_decision_source_not_ml_policy");
  }
  if (secondMetadata.decisionSource !== "ml_policy") {
    failures.push("second_decision_source_not_ml_policy");
  }
  if (firstMetadata.fallbackUsed) {
    failures.push("first_six_factor_policy_fallback_used");
  }
  if (secondMetadata.fallbackUsed) {
    failures.push("second_six_factor_policy_fallback_used");
  }
  if (!firstMetadata.appliedToLearnerFacingOutput) {
    failures.push("first_six_factor_not_applied_to_learner_output");
  }
  if (!secondMetadata.appliedToLearnerFacingOutput) {
    failures.push("second_six_factor_not_applied_to_learner_output");
  }
  if (containsForbiddenFeatureField(firstMetadata.featuresSnapshot)) {
    failures.push("first_features_contain_forbidden_outcome_fields");
  }
  if (containsForbiddenFeatureField(secondMetadata.featuresSnapshot)) {
    failures.push("second_features_contain_forbidden_outcome_fields");
  }
  if ((numericFeature(secondFeatures, "priorAttemptsCount") ?? 0) < 1) {
    failures.push("second_features_missing_prior_attempts");
  }
  if ((numericFeature(secondFeatures, "recentAttemptsCount") ?? 0) < 1) {
    failures.push("second_features_missing_recent_attempts");
  }
  if (numericFeature(secondFeatures, "priorCorrectRate") == null) {
    failures.push("second_features_missing_prior_correct_rate");
  }
  if (numericFeature(secondFeatures, "recentCorrectRate") == null) {
    failures.push("second_features_missing_recent_correct_rate");
  }
  if ((numericFeature(secondFeatures, "topicSeenCount") ?? 0) < 1) {
    failures.push("second_features_missing_topic_seen_count");
  }
  if (
    firstMetadata.decisionCreatedAt === secondMetadata.decisionCreatedAt &&
    firstMetadata.featuresSnapshot.sessionRef === secondMetadata.featuresSnapshot.sessionRef
  ) {
    failures.push("second_policy_not_recomputed");
  }
  if (!params.testValidationOk) {
    failures.push("generated_test_schema_or_mcq_invalid");
  }
  if (!params.testHasAttempt) {
    failures.push("test_attempt_missing_after_ui_submit");
  }
  if (params.exportSummary.exportedObservations < 1) {
    failures.push("export_has_no_observations_for_pilot_user");
  }
  if (params.exportSummary.withOutcome < 1) {
    failures.push("export_has_no_observation_with_outcome");
  }
  if (params.exportSummary.leakageViolationsCount > 0) {
    failures.push("export_has_leakage_violations");
  }
  if (!params.exportValidationOk) {
    failures.push("export_validation_failed");
  }

  const firstSeedText = params.firstEvidence.seedContent;
  const firstDialogueText = params.firstEvidence.latestDialogueContent;
  const secondSeedText = params.secondEvidence.seedContent;
  const secondDialogueText = params.secondEvidence.latestDialogueContent;
  const firstText = [firstSeedText, firstDialogueText].join("\n");
  const secondText = [secondSeedText, secondDialogueText].join("\n");
  const hiddenFirst = hiddenDisclosureViolations(firstText);
  const hiddenSecond = hiddenDisclosureViolations(secondText);
  if (hiddenFirst.length > 0) failures.push("first_content_hidden_metadata_disclosure");
  if (hiddenSecond.length > 0) failures.push("second_content_hidden_metadata_disclosure");

  if (
    secondMetadata.deliveredConfig.support_level === "guided" &&
    !hasGuidedMarker(secondText)
  ) {
    failures.push("second_content_guided_support_marker_not_visible");
  }
  if (
    secondMetadata.deliveredConfig.examples_level === "single" &&
    countExampleMarkers(secondSeedText) !== 1
  ) {
    failures.push("second_seed_content_single_example_marker_not_exactly_one");
  }
  if (
    params.secondEvidence.latestDialogueMetadata &&
    params.secondEvidence.latestDialogueMetadata.deliveredConfig.examples_level === "single" &&
    countExampleMarkers(secondDialogueText) !== 1
  ) {
    failures.push("second_dialogue_single_example_marker_not_exactly_one");
  }

  return {
    failures,
    hiddenDisclosure: {
      first: hiddenFirst,
      second: hiddenSecond,
    },
    visibleSignals: {
      firstGuidedMarker: hasGuidedMarker(firstText),
      firstSeedExampleMarkers: countExampleMarkers(firstSeedText),
      firstDialogueExampleMarkers: countExampleMarkers(firstDialogueText),
      secondGuidedMarker: hasGuidedMarker(secondText),
      secondSeedExampleMarkers: countExampleMarkers(secondSeedText),
      secondDialogueExampleMarkers: countExampleMarkers(secondDialogueText),
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const runStart = new Date();
  const runId = `browser_pilot_user_${timestampForRunId(runStart)}`;
  const email = `${runId}@example.invalid`;
  const password = "BrowserPilot#12345";
  const subjectTitle = "Browser Pilot Algebra";
  const topic = "Linear equations";
  const groupName = `Browser Pilot Group ${timestampForRunId(runStart)}`;
  const chromiumExecutable = resolveChromiumExecutable();
  let server: ChildProcess | null = null;
  let browser: Browser | null = null;

  try {
    await ensureDbReady(prisma);
    if (!chromiumExecutable) {
      throw new Error("BROWSER_AUTOMATION_UNAVAILABLE: Chromium executable not found.");
    }

    const port = await findFreePort(options.port);
    const baseUrl = `http://127.0.0.1:${port}`;
    server = startDevServer({ port, artifact: options.artifact });
    await waitForHttp(baseUrl);

    browser = await chromium.launch({
      headless: !options.headed,
      executablePath: chromiumExecutable,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const context = await browser.newContext({ baseURL: baseUrl });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);

    await page.goto("/register");
    await page.locator("input[type='email']").fill(email);
    await page.locator("input[type='password']").fill(password);
    await page
      .locator("input:not([type]), input[type='text']")
      .first()
      .fill("Browser Pilot User");
    await page.locator("input[type='checkbox']").check();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/auth/register") && response.status() === 200,
        { timeout: 30_000 },
      ),
      page.getByRole("button", { name: "Create account" }).click(),
    ]);
    await page.goto("about:blank", { waitUntil: "domcontentloaded" }).catch(() => undefined);
    await context.clearCookies();

    await page.goto("/login?next=/profile", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const loginForm = page.locator("form").filter({ hasText: "Sign in" }).first();
    await loginForm.locator("input[type='email']").fill(email);
    await loginForm.locator("input[type='password']").fill(password);
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/auth/login") && response.status() === 200,
        { timeout: 30_000 },
      ),
      loginForm.getByRole("button", { name: "Sign in" }).click(),
    ]);
    await waitForUrlIncludes(page, "/profile");

    await fillProfilePreferences(page);
    const preferencesPersisted = await page.evaluate(async () => {
      const response = await fetch("/api/users/me/preferences", {
        credentials: "same-origin",
      });
      return response.ok ? response.json() : null;
    });

    await createTopicThroughUi(page, {
      groupName,
      subjectTitle,
      description: "Controlled browser/live pilot topic for linear equations.",
    });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, declaredPreferencesJson: true },
    });
    if (!user) throw new Error("PILOT_USER_NOT_FOUND_AFTER_UI_REGISTRATION");
    const subject = await prisma.subject.findFirst({
      where: { userId: user.id, title: subjectTitle, archivedAt: null },
      select: { id: true, title: true, collectionId: true },
    });
    if (!subject) throw new Error("PILOT_SUBJECT_NOT_FOUND_AFTER_UI_CREATE");

    const firstState = await startExplanationEpisodeThroughUi(page, {
      subjectId: subject.id,
      topic,
    });
    const firstEpisodeId = currentEpisodeId(firstState);
    const firstSessionId = currentStepLearningContentSessionId(firstState);
    await askDialogueQuestion(
      page,
      "Can you show one guided step for solving a simple linear equation?",
    );

    await page.getByRole("button", { name: "Continue to next test" }).click();
    const submittedQuestionCount = await submitCurrentEpisodeTest(page);

    const firstAttempt = await prisma.testAttempt.findFirst({
      where: {
        userId: user.id,
        test: {
          evaluationEpisodeId: firstEpisodeId,
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, testId: true, score: true },
    });
    const generatedTest = firstAttempt
      ? await prisma.generatedTest.findUnique({
          where: { id: firstAttempt.testId },
          select: {
            id: true,
            questionCount: true,
            questionsJson: true,
            validationMetaJson: true,
          },
        })
      : null;
    const testSchemaCheck = generatedTest
      ? TestSchema.safeParse({
          title: topic,
          questions: generatedTest.questionsJson,
        })
      : { success: false };
    const mcqShapeOk =
      testSchemaCheck.success &&
      Array.isArray(generatedTest?.questionsJson) &&
      generatedTest.questionsJson.every((question) => {
        if (!isRecord(question)) return false;
        return (
          Array.isArray(question.options) &&
          question.options.length >= 2 &&
          typeof question.answerIndex === "number" &&
          Number.isInteger(question.answerIndex) &&
          question.answerIndex >= 0 &&
          question.answerIndex < question.options.length
        );
      });
    const testSignals = isRecord(generatedTest?.validationMetaJson)
      ? generatedTest?.validationMetaJson
      : {};
    const testGenerationSource =
      typeof testSignals.generationSource === "string"
        ? testSignals.generationSource
        : "unknown";

    const secondState = await startExplanationEpisodeThroughUi(page, {
      subjectId: subject.id,
      topic,
    });
    const secondEpisodeId = currentEpisodeId(secondState);
    const secondSessionId = currentStepLearningContentSessionId(secondState);
    await askDialogueQuestion(
      page,
      "Now that I tried the test, what is the next guided step with one example?",
    );

    const [firstEvidence, secondEvidence, userStats] = await Promise.all([
      readSessionEvidence(prisma, firstSessionId),
      readSessionEvidence(prisma, secondSessionId),
      prisma.userTagStat.findMany({
        where: { userId: user.id },
        select: { id: true },
      }),
    ]);

    const exportSummary = await buildExportForUser({
      prisma,
      userId: user.id,
      sinceIso: runStart.toISOString(),
      outPath: options.exportOut,
    });
    const validation = await runDatasetValidation(options.exportOut);
    const generationSources = [
      firstEvidence.seedGenerationSource,
      firstEvidence.latestDialogueGenerationSource,
      testGenerationSource,
      secondEvidence.seedGenerationSource,
      secondEvidence.latestDialogueGenerationSource,
    ];
    const liveContentUsed = generationSources.every((source) => source === "llm");
    const assertions = buildAssertionFailures({
      firstEvidence,
      secondEvidence,
      testValidationOk: mcqShapeOk,
      testHasAttempt: firstAttempt != null,
      exportSummary,
      exportValidationOk: validation.ok,
    });
    const featureComparison = summarizeFeatureComparison(
      firstEvidence.seedMetadata.featuresSnapshot,
      secondEvidence.seedMetadata.featuresSnapshot,
    );
    const fallbackOnlyResponseGaps = new Set([
      "second_content_guided_support_marker_not_visible",
      "second_seed_content_single_example_marker_not_exactly_one",
      "second_dialogue_single_example_marker_not_exactly_one",
    ]);
    const blockingFailures = liveContentUsed
      ? assertions.failures
      : assertions.failures.filter((failure) => !fallbackOnlyResponseGaps.has(failure));
    const nonBlockingGaps = liveContentUsed
      ? []
      : assertions.failures.filter((failure) => fallbackOnlyResponseGaps.has(failure));
    if (!liveContentUsed && userStats.length === 0) {
      nonBlockingGaps.push(
        "prediction_stats_not_updated_because_live_generation_was_unavailable_or_fallback_excluded_learning_update",
      );
    }
    const browserHybridGaps: string[] = [];
    const status: BrowserPilotStatus =
      blockingFailures.length > 0
        ? "BROWSER_LIVE_PILOT_FAIL"
        : liveContentUsed
          ? "BROWSER_LIVE_PILOT_PASS"
          : "BROWSER_LIVE_PILOT_PARTIAL";
    const result = {
      ok: status !== "BROWSER_LIVE_PILOT_FAIL",
      status,
      runId,
      mode: "browser_live_user_journey_pilot",
      browserLevel: true,
      browserAutomation: "playwright_chromium",
      browserHybrid: false,
      browserHybridGaps,
      keyJourneyEventsCreatedThroughUi: true,
      baseUrl,
      liveProvider: liveContentUsed ? "LIVE_PROVIDER_USED" : "LIVE_PROVIDER_UNAVAILABLE",
      userJourney: {
        registration: true,
        login: true,
        profilePreferences: preferencesPersisted != null,
        subjectCreation: true,
        firstChatLearningContent: true,
        firstDialogueQuestion: firstEvidence.dialogueAssistantCount >= 1,
        testGeneration: generatedTest != null,
        testSubmit: firstAttempt != null,
        outcomePersisted: firstAttempt != null,
        predictionStatsUpdated: userStats.length > 0,
        secondChatLearningContent: true,
        secondDialogueQuestion: secondEvidence.dialogueAssistantCount >= 1,
        exportValidation: validation.ok,
      },
      evidence: {
        userId: user.id,
        subjectId: subject.id,
        subjectCollectionId: subject.collectionId,
        firstEpisodeId,
        firstSessionId,
        secondEpisodeId,
        secondSessionId,
        testId: generatedTest?.id ?? null,
        attemptId: firstAttempt?.id ?? null,
        attemptScore: firstAttempt?.score ?? null,
        submittedQuestionCount,
        userTagStatCount: userStats.length,
      },
      generationSources: {
        firstLearningContent: firstEvidence.seedGenerationSource,
        firstDialogue: firstEvidence.latestDialogueGenerationSource,
        postcheckTest: testGenerationSource,
        secondLearningContent: secondEvidence.seedGenerationSource,
        secondDialogue: secondEvidence.latestDialogueGenerationSource,
      },
      testGenerationSchemaCompliance: {
        validTestSchema: testSchemaCheck.success,
        mcqShapeOk,
        responseFormat: "mcq",
        answerIndexPresent: mcqShapeOk,
        generatedQuestionCount: generatedTest?.questionCount ?? null,
      },
      secondChatPersonalization: {
        policyRecomputed:
          firstEvidence.seedMetadata.decisionCreatedAt !==
            secondEvidence.seedMetadata.decisionCreatedAt ||
          firstEvidence.seedMetadata.featuresSnapshot.sessionRef !==
            secondEvidence.seedMetadata.featuresSnapshot.sessionRef,
        aggregateEvidencePresent:
          (numericFeature(
            secondEvidence.seedMetadata.featuresSnapshot,
            "priorAttemptsCount",
          ) ?? 0) >= 1 &&
          (numericFeature(
            secondEvidence.seedMetadata.featuresSnapshot,
            "recentAttemptsCount",
          ) ?? 0) >= 1 &&
          numericFeature(
            secondEvidence.seedMetadata.featuresSnapshot,
            "priorCorrectRate",
          ) != null &&
          numericFeature(
            secondEvidence.seedMetadata.featuresSnapshot,
            "recentCorrectRate",
          ) != null &&
          (numericFeature(
            secondEvidence.seedMetadata.featuresSnapshot,
            "topicSeenCount",
          ) ?? 0) >= 1,
        firstFeatures: firstEvidence.seedMetadata.featuresSnapshot,
        secondFeatures: secondEvidence.seedMetadata.featuresSnapshot,
        featureComparison,
        decisionSource: secondEvidence.seedMetadata.decisionSource,
        fallbackUsed: secondEvidence.seedMetadata.fallbackUsed,
        firstConfig: firstEvidence.seedMetadata.deliveredConfig,
        secondConfig: secondEvidence.seedMetadata.deliveredConfig,
        visibleSignals: assertions.visibleSignals,
      },
      leakage: {
        firstFeaturesContainForbiddenFields: containsForbiddenFeatureField(
          firstEvidence.seedMetadata.featuresSnapshot,
        ),
        secondFeaturesContainForbiddenFields: containsForbiddenFeatureField(
          secondEvidence.seedMetadata.featuresSnapshot,
        ),
        hiddenDisclosure: assertions.hiddenDisclosure,
        exportLeakageViolationsCount: exportSummary.leakageViolationsCount,
      },
      exportSummary,
      validation,
      assertionFailures: blockingFailures,
      nonBlockingGaps,
      outputPaths: {
        result: path.resolve(options.out),
        export: path.resolve(options.exportOut),
      },
      interpretation:
        status === "BROWSER_LIVE_PILOT_FAIL"
          ? "The browser pilot reached a failing assertion. See assertionFailures."
          : status === "BROWSER_LIVE_PILOT_PASS"
            ? "Pure UI key journey events used live LLM content and provenance/export checks passed."
            : "Browser path and provenance ran with fallback/mock content; live provider was unavailable to the server runtime.",
    };

    writeJson(options.out, result);
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    browser = null;
    await context.close().catch(() => undefined);
    await prisma.$disconnect();
    if (!options.keepServer) {
      await stopDevServer(server);
      server = null;
    }
    if (status === "BROWSER_LIVE_PILOT_FAIL") {
      process.exit(1);
    }
  } catch (error) {
    await browser?.close().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    if (!options.keepServer) {
      await stopDevServer(server);
    }

    const message = error instanceof Error ? error.message : String(error);
    const status: BrowserPilotStatus =
      message.includes("Can't reach database server") ||
      message.includes("ECONNREFUSED") ||
      message.includes("DATABASE_URL")
        ? "DB_UNAVAILABLE"
        : message.includes("OPENAI_API_KEY")
          ? "LIVE_PROVIDER_UNAVAILABLE"
          : "BROWSER_LIVE_PILOT_FAIL";
    const result = {
      ok: false,
      status,
      runId,
      mode: "browser_live_user_journey_pilot",
      browserLevel: status !== "DB_UNAVAILABLE",
      error: message,
      outputPaths: {
        result: path.resolve(options.out),
        export: path.resolve(options.exportOut),
      },
    };
    writeJson(options.out, result);
    console.log(JSON.stringify(result, null, 2));
    process.exit(status === "LIVE_PROVIDER_UNAVAILABLE" ? 0 : 1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
