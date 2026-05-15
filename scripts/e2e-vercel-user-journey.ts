import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type Severity = "Critical" | "High" | "Medium" | "Low";
type StepStatus = "PASS" | "FAIL" | "WARN" | "SKIP";

type StepRecord = {
  step: string;
  status: StepStatus;
  endpoint: string;
  expected: string;
  actual: string;
  httpStatus?: number;
  notes?: string;
};

type IssueRecord = {
  severity: Severity;
  step: string;
  expected: string;
  actual: string;
  requestStatus?: number;
  responseStatus?: number;
  relevantIds?: Record<string, string | null | undefined>;
  suspectedModule: string;
  fixNow: boolean;
};

type JsonObject = Record<string, unknown>;

const PERSONALIZATION_MIN_AXES_READY = 4;
const PERSONALIZATION_MIN_TESTS_FOR_READY = 5;
const PERSONALIZATION_MIN_TOTAL_PER_TAG = 5;
const MAX_EPISODES = 12;
const REPORT_DIR = "codex-report";

function timestampForIds() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join("");
}

function timestampForReport() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(
    now.getUTCDate(),
  )}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(
    now.getUTCSeconds(),
  )}`;
}

function asRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function mdEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function buildPassword() {
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

function normalizeBaseUrl(raw: string) {
  const parsed = new URL(raw);
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function safeBaseUrl(raw: string | null) {
  if (!raw) return "not set";
  try {
    const parsed = new URL(raw);
    return parsed.origin;
  } catch {
    return "invalid url";
  }
}

function splitSetCookieHeader(header: string) {
  return header.split(/,(?=\s*[^;,=\s]+=[^;,]*)/g).map((part) => part.trim());
}

class CookieJar {
  private cookies = new Map<string, string>();

  read(headers: Headers) {
    const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] })
      .getSetCookie;
    const values =
      typeof getSetCookie === "function"
        ? getSetCookie.call(headers)
        : headers.get("set-cookie")
          ? splitSetCookieHeader(headers.get("set-cookie") ?? "")
          : [];

    for (const raw of values) {
      const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const lowerAttrs = attributes.map((attr) => attr.toLowerCase());
      const maxAgeAttr = lowerAttrs.find((attr) => attr.startsWith("max-age="));
      const expiresAttr = lowerAttrs.find((attr) => attr.startsWith("expires="));
      const expiredByMaxAge = maxAgeAttr === "max-age=0";
      const expiredByDate =
        expiresAttr != null &&
        Number.isFinite(Date.parse(expiresAttr.slice("expires=".length))) &&
        Date.parse(expiresAttr.slice("expires=".length)) <= Date.now();

      if (expiredByMaxAge || expiredByDate || value.length === 0) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  header() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  hasCookies() {
    return this.cookies.size > 0;
  }
}

class E2ERunner {
  private readonly baseUrl: string;
  private readonly jar = new CookieJar();
  readonly stamp = timestampForIds();
  readonly reportStamp = timestampForReport();
  readonly prefix = `E2E_${this.stamp}`;
  readonly email = `eduai.e2e.${this.stamp}@example.com`;
  readonly password = buildPassword();
  readonly name = `EduAI E2E User ${this.stamp}`;
  readonly steps: StepRecord[] = [];
  readonly issues: IssueRecord[] = [];
  readonly ids: Record<string, string | string[]> = {};
  readonly checks: Array<{ name: string; status: StepStatus; notes: string }> = [];
  episodeCount = 0;
  validLearningAttempts = 0;
  personalizationReady = false;
  lowUxComplianceSeen = false;
  uiClickCoverage = "API-level smoke: pages are fetched, but UI controls are not clicked.";
  logsChecked = false;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  reportPath() {
    return path.join(REPORT_DIR, `e2e_user_journey_${this.reportStamp}.md`);
  }

  private log(record: StepRecord) {
    const safe = {
      step: record.step,
      status: record.status,
      endpoint: record.endpoint,
      httpStatus: record.httpStatus ?? null,
      actual: record.actual,
    };
    console.log(JSON.stringify(safe));
  }

  recordStep(record: StepRecord) {
    this.steps.push(record);
    this.log(record);
  }

  addIssue(issue: IssueRecord) {
    this.issues.push(issue);
  }

  private async wait(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async rawRequest(
    endpoint: string,
    init: RequestInit = {},
  ): Promise<{ status: number; ok: boolean; body: unknown; headers: Headers }> {
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${this.baseUrl}${endpoint}`;
    const headers = new Headers(init.headers ?? {});
    const cookieHeader = this.jar.header();
    if (cookieHeader) {
      headers.set("Cookie", cookieHeader);
    }
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, {
      ...init,
      headers,
      redirect: init.redirect ?? "manual",
    });
    this.jar.read(response.headers);
    const text = await response.text();
    let body: unknown = text;
    if (text.trim().length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text.slice(0, 500);
      }
    } else {
      body = null;
    }
    return {
      status: response.status,
      ok: response.ok,
      body,
      headers: response.headers,
    };
  }

  async request(
    step: string,
    endpoint: string,
    expected: string,
    init: RequestInit = {},
    options: {
      ok?: (status: number, body: unknown) => boolean;
      issueSeverity?: Severity;
      suspectedModule?: string;
      fixNow?: boolean;
      notes?: string;
    } = {},
  ) {
    let result = await this.rawRequest(endpoint, init);
    if (result.status === 429) {
      const retryAfterRaw = result.headers.get("retry-after");
      const retryAfterSec = Number.parseInt(retryAfterRaw ?? "0", 10);
      const waitMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? Math.min(retryAfterSec, 65) * 1000
          : 5000;
      this.recordStep({
        step: `${step} rate-limit wait`,
        status: "WARN",
        endpoint,
        expected: "retry once after 429",
        actual: `waiting ${Math.round(waitMs / 1000)}s`,
        httpStatus: 429,
      });
      await this.wait(waitMs);
      result = await this.rawRequest(endpoint, init);
    }

    const ok = options.ok
      ? options.ok(result.status, result.body)
      : result.status >= 200 && result.status < 300;
    this.recordStep({
      step,
      status: ok ? "PASS" : "FAIL",
      endpoint,
      expected,
      actual: ok
        ? "ok"
        : `HTTP ${result.status}: ${JSON.stringify(result.body).slice(0, 240)}`,
      httpStatus: result.status,
      notes: options.notes,
    });

    if (!ok) {
      this.addIssue({
        severity: options.issueSeverity ?? "Critical",
        step,
        expected,
        actual: JSON.stringify(result.body).slice(0, 500),
        requestStatus: result.status,
        responseStatus: result.status,
        relevantIds: {
          userId: asString(this.ids.userId),
          subjectId: asString(this.ids.subjectId),
          episodeId: Array.isArray(this.ids.episodeIds)
            ? this.ids.episodeIds[this.ids.episodeIds.length - 1]
            : null,
        },
        suspectedModule: options.suspectedModule ?? endpoint,
        fixNow: options.fixNow ?? false,
      });
    }

    return result;
  }

  async pageCheck(endpoint: string) {
    return this.request(
      `Page ${endpoint}`,
      endpoint,
      "page returns without server error",
      { method: "GET", headers: { Accept: "text/html" } },
      {
        ok: (status) => status < 500 && status !== 404,
        issueSeverity: "Medium",
        suspectedModule: `src/app/(main)${endpoint}/page.tsx`,
        fixNow: false,
      },
    );
  }

  extractId(payload: unknown, keys: string[] = ["id"]) {
    const root = asRecord(payload);
    const data = asRecord(root.data);
    for (const key of keys) {
      const fromRoot = asString(root[key]);
      if (fromRoot) return fromRoot;
      const fromData = asString(data[key]);
      if (fromData) return fromData;
    }
    return null;
  }

  async registerAndLogin() {
    await this.pageCheck("/register");
    await this.pageCheck("/login");

    const register = await this.request(
      "Register user",
      "/api/auth/register",
      "new user is created and authenticated",
      {
        method: "POST",
        body: JSON.stringify({
          email: this.email,
          password: this.password,
          name: this.name,
          researchConsent: true,
        }),
      },
      { suspectedModule: "src/app/api/auth/register/route.ts" },
    );
    const registerUser = asRecord(asRecord(register.body).user);
    const userId = asString(registerUser.id);
    if (userId) this.ids.userId = userId;

    await this.request(
      "Get current user after register",
      "/api/users/me",
      "registered session cookie authenticates /api/users/me",
      { method: "GET" },
      {
        ok: (status, body) => status === 200 && asString(asRecord(body).email) === this.email,
        suspectedModule: "src/app/api/users/me/route.ts",
      },
    );

    await this.request(
      "Logout",
      "/api/auth/logout",
      "session cookie can be cleared",
      { method: "POST" },
      {
        ok: (status) => status >= 200 && status < 300,
        issueSeverity: "Medium",
        suspectedModule: "src/app/api/auth/logout/route.ts",
      },
    );

    await this.request(
      "Verify logged out",
      "/api/users/me",
      "cleared session no longer authenticates",
      { method: "GET" },
      {
        ok: (status) => status === 401,
        issueSeverity: "Medium",
        suspectedModule: "src/lib/auth.ts",
      },
    );

    const login = await this.request(
      "Login user",
      "/api/auth/login",
      "user can log in with created credentials",
      {
        method: "POST",
        body: JSON.stringify({
          identifier: this.email,
          password: this.password,
        }),
      },
      { suspectedModule: "src/app/api/auth/login/route.ts" },
    );
    const loginUser = asRecord(asRecord(login.body).user);
    const loginUserId = asString(loginUser.id);
    if (loginUserId) this.ids.userId = loginUserId;

    await this.request(
      "Get current user after login",
      "/api/users/me",
      "login session cookie authenticates /api/users/me",
      { method: "GET" },
      {
        ok: (status, body) =>
          status === 200 &&
          asString(asRecord(body).email) === this.email &&
          this.jar.hasCookies(),
        suspectedModule: "src/lib/auth.ts",
      },
    );
  }

  async createTopicStructure() {
    await this.pageCheck("/topics");

    const collection = await this.request(
      "Create collection/group",
      "/api/collections",
      "Collection model represents topic group and is created for the user",
      {
        method: "POST",
        body: JSON.stringify({
          name: `${this.prefix}_Group`,
          sortOrder: 10,
        }),
      },
      { suspectedModule: "src/app/api/collections/route.ts" },
    );
    const collectionId = this.extractId(collection.body);
    if (collectionId) this.ids.collectionId = collectionId;

    const subject = await this.request(
      "Create subject/topic",
      "/api/subjects",
      "subject/topic is created inside collection",
      {
        method: "POST",
        body: JSON.stringify({
          title: `${this.prefix}_Subject`,
          description: `${this.prefix}_Description`,
          collectionId,
        }),
      },
      { suspectedModule: "src/app/api/subjects/route.ts" },
    );
    const subjectId = this.extractId(subject.body);
    if (subjectId) this.ids.subjectId = subjectId;

    if (!subjectId) {
      throw new Error("subject id missing after creation");
    }

    const section = await this.request(
      "Create section/subtopic",
      `/api/subjects/${subjectId}/sections`,
      "root section/subtopic is created",
      {
        method: "POST",
        body: JSON.stringify({
          title: `${this.prefix}_Section`,
          description: `${this.prefix}_Section_Description`,
          sortOrder: 0,
        }),
      },
      { suspectedModule: "src/app/api/subjects/[subjectId]/sections/route.ts" },
    );
    const sectionId = this.extractId(section.body);
    if (sectionId) this.ids.sectionId = sectionId;

    const nested = await this.request(
      "Create nested section/subtopic",
      `/api/subjects/${subjectId}/sections`,
      "nested SubjectSection is created when parentId is supplied",
      {
        method: "POST",
        body: JSON.stringify({
          title: `${this.prefix}_Nested_Section`,
          description: `${this.prefix}_Nested_Description`,
          parentId: sectionId,
          sortOrder: 1,
        }),
      },
      { suspectedModule: "src/app/api/subjects/[subjectId]/sections/route.ts" },
    );
    const nestedSectionId = this.extractId(nested.body);
    if (nestedSectionId) this.ids.nestedSectionId = nestedSectionId;

    await this.request(
      "Read collections",
      "/api/collections",
      "created collection is visible in collection list",
      { method: "GET" },
      {
        ok: (status, body) =>
          status === 200 &&
          asArray(body).some((item) => asString(asRecord(item).id) === collectionId),
        issueSeverity: "High",
        suspectedModule: "src/app/api/collections/route.ts",
      },
    );

    await this.request(
      "Read subjects",
      "/api/subjects",
      "created subject is visible in subject list",
      { method: "GET" },
      {
        ok: (status, body) =>
          status === 200 &&
          asArray(body).some((item) => asString(asRecord(item).id) === subjectId),
        issueSeverity: "High",
        suspectedModule: "src/app/api/subjects/route.ts",
      },
    );

    await this.request(
      "Read sections",
      `/api/subjects/${subjectId}/sections`,
      "root and nested sections are visible and preserve parentId",
      { method: "GET" },
      {
        ok: (status, body) => {
          const sections = asArray(body).map(asRecord);
          return (
            status === 200 &&
            sections.some((item) => asString(item.id) === sectionId) &&
            sections.some(
              (item) =>
                asString(item.id) === nestedSectionId &&
                asString(item.parentId) === sectionId,
            )
          );
        },
        issueSeverity: "High",
        suspectedModule: "src/app/api/subjects/[subjectId]/sections/route.ts",
      },
    );
  }

  deterministicAnswers(questionCount: number) {
    return Array.from({ length: questionCount }).map(() => 0);
  }

  telemetry(questionCount: number) {
    const totalDurationMs = Math.max(60_000, questionCount * 25_000);
    return {
      totalDurationMs,
      perQuestionFirstAnswerMs: Array.from({ length: questionCount }).map(
        (_, index) => Math.min(totalDurationMs, (index + 1) * 8_000),
      ),
      answerChangeCount: 0,
    };
  }

  async submitCurrentTest(
    episodeId: string,
    step: JsonObject,
    episodeIndex: number,
  ) {
    const test = asRecord(step.test);
    const testId = asString(test.id) ?? asString(step.contentId);
    const role = asString(step.sequenceRole) ?? "unknown";
    const questions = asArray(test.questions);
    if (!testId || questions.length === 0) {
      this.addIssue({
        severity: "Critical",
        step: `Episode ${episodeIndex} ${role} submit`,
        expected: "current generated_test step includes test id and questions",
        actual: JSON.stringify(step).slice(0, 500),
        suspectedModule: "src/lib/learning-episode.ts",
        fixNow: true,
        relevantIds: { episodeId, testId },
      });
      throw new Error("current test step is malformed");
    }

    const submit = await this.request(
      `Episode ${episodeIndex} submit ${role}`,
      `/api/tests/${testId}/submit`,
      "test attempt is recorded and outcome is linked to episode",
      {
        method: "POST",
        body: JSON.stringify({
          answers: this.deterministicAnswers(questions.length),
          ...this.telemetry(questions.length),
        }),
      },
      {
        ok: (status, body) => {
          const root = asRecord(body);
          const meta = asRecord(root.meta);
          const dataQuality = asRecord(meta.dataQuality);
          const reasonCode = asString(dataQuality.reasonCode);
          if (reasonCode === "LOW_UX_COMPLIANCE") {
            this.lowUxComplianceSeen = true;
          }
          return status === 200 && asNumber(root.score) != null;
        },
        issueSeverity: "Critical",
        suspectedModule: "src/app/api/tests/[id]/submit/route.ts",
        fixNow: true,
      },
    );

    const submitRoot = asRecord(submit.body);
    const meta = asRecord(submitRoot.meta);
    const evidence = asRecord(meta.evidence);
    const learning = asRecord(evidence.learning);
    const dataQuality = asRecord(meta.dataQuality);
    const learningEligible = asBoolean(learning.eligible);
    const reasonCode =
      asString(dataQuality.reasonCode) ?? asString(learning.exclusionReasonCode);

    if (reasonCode === "LOW_UX_COMPLIANCE") {
      this.lowUxComplianceSeen = true;
      this.addIssue({
        severity: "High",
        step: `Episode ${episodeIndex} submit ${role}`,
        expected: "normal fresh episode attempt is not excluded as LOW_UX_COMPLIANCE",
        actual: "submission returned LOW_UX_COMPLIANCE",
        requestStatus: submit.status,
        responseStatus: submit.status,
        relevantIds: { episodeId, testId },
        suspectedModule:
          "src/lib/learning-quality-gate.ts, src/app/api/tests/[id]/submit/route.ts",
        fixNow: true,
      });
    }

    return {
      testId,
      role,
      score: asNumber(submitRoot.score),
      learningEligible,
      reasonCode,
    };
  }

  async loadEpisode(episodeId: string, episodeIndex: number) {
    const response = await this.request(
      `Episode ${episodeIndex} load state`,
      `/api/evaluation/episodes/${episodeId}`,
      "episode state is readable by authenticated user",
      { method: "GET" },
      {
        ok: (status, body) =>
          status === 200 && Boolean(asRecord(asRecord(body).episode).episodeId),
        issueSeverity: "Critical",
        suspectedModule: "src/app/api/evaluation/episodes/[id]/route.ts",
      },
    );
    return asRecord(response.body);
  }

  async advanceEpisode(
    episodeId: string,
    episodeIndex: number,
    acknowledgeLearningContent: boolean,
  ) {
    const response = await this.request(
      `Episode ${episodeIndex} advance`,
      `/api/evaluation/episodes/${episodeId}/next`,
      acknowledgeLearningContent
        ? "learning content is acknowledged and next test is materialized"
        : "next missing episode step is materialized",
      {
        method: "POST",
        body: JSON.stringify({ acknowledgeLearningContent }),
      },
      {
        ok: (status, body) =>
          status === 200 && Boolean(asRecord(asRecord(body).episode).episodeId),
        issueSeverity: "Critical",
        suspectedModule: "src/app/api/evaluation/episodes/[id]/next/route.ts",
      },
    );
    return asRecord(response.body);
  }

  async sendDialogue(
    episodeId: string,
    episodeIndex: number,
    message: string,
  ) {
    const response = await this.request(
      `Episode ${episodeIndex} dialogue`,
      `/api/evaluation/episodes/${episodeId}/dialogue`,
      "learning dialogue accepts learner message during learning_content",
      {
        method: "POST",
        body: JSON.stringify({ message }),
      },
      {
        ok: (status, body) =>
          status === 200 && Boolean(asRecord(asRecord(body).episode).episodeId),
        issueSeverity: "High",
        suspectedModule: "src/app/api/evaluation/episodes/[id]/dialogue/route.ts",
        fixNow: false,
      },
    );
    return asRecord(response.body);
  }

  async runEpisode(episodeIndex: number, includeHoldout: boolean) {
    const subjectId = asString(this.ids.subjectId);
    const sectionId = asString(this.ids.nestedSectionId) ?? asString(this.ids.sectionId);
    if (!subjectId || !sectionId) {
      throw new Error("subject/section ids are missing");
    }

    await this.pageCheck("/learn");
    const create = await this.request(
      `Episode ${episodeIndex} start`,
      "/api/evaluation/episodes",
      includeHoldout
        ? "episode starts with precheck -> learning_content -> postcheck -> holdout"
        : "episode starts with precheck -> learning_content -> postcheck",
      {
        method: "POST",
        body: JSON.stringify({
          subjectId,
          sectionId,
          topic: `${this.prefix}_Focus_${episodeIndex}`,
          clientKey: `${this.prefix}_episode_${episodeIndex}_${randomBytes(4).toString(
            "hex",
          )}`,
          questionCount: 5,
          mode: "practice",
          personalizationMode: "on",
          assignmentArm: "predicted",
          includeHoldout,
        }),
      },
      {
        ok: (status, body) =>
          status === 200 && Boolean(asRecord(asRecord(body).episode).episodeId),
        suspectedModule: "src/app/api/evaluation/episodes/route.ts",
      },
    );

    let state = asRecord(create.body);
    const episodeId = asString(asRecord(state.episode).episodeId);
    if (!episodeId) {
      throw new Error("episode id missing after start");
    }
    this.ids.episodeIds = [
      ...(Array.isArray(this.ids.episodeIds) ? this.ids.episodeIds : []),
      episodeId,
    ];
    this.episodeCount += 1;

    const episodeTestIds: string[] = [];
    const rolesSeen: string[] = [];

    for (let guard = 0; guard < 12; guard += 1) {
      const step = asRecord(state.currentStep);
      const status = asString(step.status);
      const role = asString(step.sequenceRole);
      const contentKind = asString(step.contentKind);
      if (role && !rolesSeen.includes(role)) {
        rolesSeen.push(role);
      }

      if (status === "completed") {
        this.recordStep({
          step: `Episode ${episodeIndex} completed`,
          status: "PASS",
          endpoint: `/api/evaluation/episodes/${episodeId}`,
          expected: "episode reaches completed state",
          actual: `roles seen: ${rolesSeen.join(", ")}`,
          notes: includeHoldout
            ? "Holdout is the current post-postcheck evaluation step; no separate final_test role was observed."
            : "No postcheck-after final test was requested.",
        });
        break;
      }

      if (contentKind === "generated_test") {
        const submitted = await this.submitCurrentTest(
          episodeId,
          step,
          episodeIndex,
        );
        episodeTestIds.push(submitted.testId);
        if (submitted.learningEligible === false) {
          this.addIssue({
            severity:
              submitted.reasonCode === "LOW_UX_COMPLIANCE" ? "High" : "Medium",
            step: `Episode ${episodeIndex} ${submitted.role}`,
            expected: "fresh episode attempt is learning-eligible unless generation/data quality guard justifies exclusion",
            actual: `learningEligible=false reason=${submitted.reasonCode ?? "unknown"}`,
            relevantIds: { episodeId, testId: submitted.testId },
            suspectedModule:
              "src/lib/test-generation.ts, src/app/api/tests/[id]/submit/route.ts",
            fixNow: submitted.reasonCode === "LOW_UX_COMPLIANCE",
          });
        }
        state = await this.loadEpisode(episodeId, episodeIndex);
        continue;
      }

      if (contentKind === "chat_session") {
        if (episodeIndex === 1) {
          try {
            state = await this.sendDialogue(
              episodeId,
              episodeIndex,
              `Explain the key idea for ${this.prefix} in one concise example.`,
            );
            state = await this.sendDialogue(
              episodeId,
              episodeIndex,
              `Give one quick check question about ${this.prefix}.`,
            );
          } catch {
            state = await this.loadEpisode(episodeId, episodeIndex);
          }
        }
        state = await this.advanceEpisode(episodeId, episodeIndex, true);
        continue;
      }

      if (status === "pending_materialization") {
        state = await this.advanceEpisode(episodeId, episodeIndex, false);
        continue;
      }

      if (status === "waiting_delay") {
        this.addIssue({
          severity: "Medium",
          step: `Episode ${episodeIndex}`,
          expected: "smoke episode does not block on delayed recheck",
          actual: "episode returned waiting_delay",
          relevantIds: { episodeId },
          suspectedModule: "src/lib/learning-episode.ts",
          fixNow: false,
        });
        break;
      }

      this.addIssue({
        severity: "Critical",
        step: `Episode ${episodeIndex}`,
        expected: "known currentStep status/contentKind",
        actual: JSON.stringify(step).slice(0, 500),
        relevantIds: { episodeId },
        suspectedModule: "src/lib/learning-episode.ts",
        fixNow: true,
      });
      throw new Error(`unknown episode step at guard ${guard}`);
    }

    const finalState = await this.loadEpisode(episodeId, episodeIndex);
    const summary = asRecord(finalState.episode);
    const sequence = asRecord(summary.sequence);
    const completed = asArray(sequence.completed).map(String);
    const expected = asArray(sequence.expected).map(String);
    const primaryOutcomes = asArray(summary.primaryOutcomes).map(asRecord);
    const lowUxOutcomes = primaryOutcomes.filter(
      (outcome) => asString(outcome.learningSkipReason) === "LOW_UX_COMPLIANCE",
    );
    if (lowUxOutcomes.length > 0) {
      this.lowUxComplianceSeen = true;
    }

    this.ids.testIds = [
      ...(Array.isArray(this.ids.testIds) ? this.ids.testIds : []),
      ...episodeTestIds,
    ];

    this.recordStep({
      step: `Episode ${episodeIndex} sequence audit`,
      status:
        expected.length > 0 && expected.every((role) => completed.includes(role))
          ? "PASS"
          : "FAIL",
      endpoint: `/api/evaluation/episodes/${episodeId}`,
      expected: `completed expected roles: ${expected.join(", ")}`,
      actual: `completed: ${completed.join(", ")}; outcomes=${primaryOutcomes.length}`,
      notes:
        expected.includes("holdout")
          ? "Current UI full flow has holdout after postcheck; no separate final_test role is present."
          : "No final test role present in this episode sequence.",
    });

    return {
      episodeId,
      expected,
      completed,
      primaryOutcomes,
    };
  }

  async checkPersonalizationAndAnalytics(episodeIndex: number) {
    const subjectId = asString(this.ids.subjectId);
    const [me, stats, dashboard, subjectStats, predictions, metrics, metricsIncluded] =
      await Promise.all([
        this.request(
          `Episode ${episodeIndex} user state`,
          "/api/users/me",
          "user adaptive fields are readable",
          { method: "GET" },
          {
            ok: (status) => status === 200,
            issueSeverity: "High",
            suspectedModule: "src/app/api/users/me/route.ts",
          },
        ),
        this.request(
          `Episode ${episodeIndex} learner stats`,
          "/api/users/me/stats",
          "tag stats and computedReady are readable",
          { method: "GET" },
          {
            ok: (status) => status === 200,
            issueSeverity: "High",
            suspectedModule: "src/app/api/users/me/stats/route.ts",
          },
        ),
        this.request(
          `Episode ${episodeIndex} dashboard`,
          subjectId
            ? `/api/users/me/dashboard?subjectId=${encodeURIComponent(
                subjectId,
              )}&limit=20`
            : "/api/users/me/dashboard?limit=20",
          "dashboard shows learner attempts for this user/subject",
          { method: "GET" },
          {
            ok: (status) => status === 200,
            issueSeverity: "High",
            suspectedModule: "src/app/api/users/me/dashboard/route.ts",
          },
        ),
        subjectId
          ? this.request(
              `Episode ${episodeIndex} subject stats`,
              `/api/subjects/${subjectId}/stats`,
              "subject stats show attempts for created subject",
              { method: "GET" },
              {
                ok: (status) => status === 200,
                issueSeverity: "High",
                suspectedModule: "src/app/api/subjects/[subjectId]/stats/route.ts",
              },
            )
          : Promise.resolve({ body: null, status: 0, ok: false, headers: new Headers() }),
        subjectId
          ? this.request(
              `Episode ${episodeIndex} predictions`,
              `/api/users/me/predictions?subjectId=${encodeURIComponent(subjectId)}`,
              "prediction endpoint returns a recommendation payload",
              { method: "GET" },
              {
                ok: (status) => status === 200,
                issueSeverity: "Medium",
                suspectedModule: "src/app/api/users/me/predictions/route.ts",
              },
            )
          : Promise.resolve({ body: null, status: 0, ok: false, headers: new Headers() }),
        subjectId
          ? this.request(
              `Episode ${episodeIndex} prediction metrics eligible-only`,
              `/api/users/me/prediction-metrics?subjectId=${encodeURIComponent(
                subjectId,
              )}`,
              "prediction metrics excludes ineligible attempts by default",
              { method: "GET" },
              {
                ok: (status) => status === 200,
                issueSeverity: "Medium",
                suspectedModule:
                  "src/app/api/users/me/prediction-metrics/route.ts",
              },
            )
          : Promise.resolve({ body: null, status: 0, ok: false, headers: new Headers() }),
        subjectId
          ? this.request(
              `Episode ${episodeIndex} prediction metrics include excluded`,
              `/api/users/me/prediction-metrics?subjectId=${encodeURIComponent(
                subjectId,
              )}&includeExcluded=1`,
              "prediction metrics can include excluded attempts explicitly",
              { method: "GET" },
              {
                ok: (status) => status === 200,
                issueSeverity: "Medium",
                suspectedModule:
                  "src/app/api/users/me/prediction-metrics/route.ts",
              },
            )
          : Promise.resolve({ body: null, status: 0, ok: false, headers: new Headers() }),
      ]);

    const meRoot = asRecord(me.body);
    const summary = asRecord(meRoot.learnerSummary);
    const statsRoot = asRecord(stats.body);
    const dashboardRoot = asRecord(dashboard.body);
    const dashboardSummary = asRecord(dashboardRoot.summary);
    const subjectStatsRoot = asRecord(subjectStats.body);
    const subjectTotals = asRecord(subjectStatsRoot.totals);
    const userId = asString(meRoot.id);
    if (userId) this.ids.userId = userId;

    const testsTaken = asNumber(meRoot.testsTaken) ?? 0;
    const personalizationReady = asBoolean(meRoot.personalizationReady) === true;
    const attemptsLearningEligible =
      asNumber(summary.attemptsLearningEligible) ??
      asNumber(dashboardSummary.attemptsLearningEligible) ??
      asNumber(subjectTotals.attemptsLearningEligible) ??
      0;
    this.validLearningAttempts = attemptsLearningEligible;
    this.personalizationReady = personalizationReady;

    const dashboardAttempts = asArray(dashboardRoot.attempts).map(asRecord);
    const subjectAttempts = asArray(subjectStatsRoot.attempts).map(asRecord);
    const newAttemptIds = [...dashboardAttempts, ...subjectAttempts]
      .map((attempt) => asString(attempt.id))
      .filter((id): id is string => Boolean(id));
    this.ids.attemptIds = [...new Set(newAttemptIds)];

    const excludedLowUx = [...dashboardAttempts, ...subjectAttempts].some(
      (attempt) =>
        asString(attempt.exclusionReasonCode) === "LOW_UX_COMPLIANCE" ||
        asString(attempt.reasonCode) === "LOW_UX_COMPLIANCE",
    );
    if (excludedLowUx) this.lowUxComplianceSeen = true;

    this.recordStep({
      step: `Episode ${episodeIndex} personalization audit`,
      status:
        testsTaken >= PERSONALIZATION_MIN_TESTS_FOR_READY && !personalizationReady
          ? "WARN"
          : "PASS",
      endpoint: "/api/users/me + /api/users/me/stats",
      expected:
        "testsTaken increments only for learning-eligible attempts; personalizationReady follows local threshold",
      actual: `testsTaken=${testsTaken}; eligible=${attemptsLearningEligible}; personalizationReady=${personalizationReady}; axesReady=${asNumber(
        statsRoot.axesReady,
      )}`,
      notes: `threshold: axesReady>=${PERSONALIZATION_MIN_AXES_READY}, testsTaken>=${PERSONALIZATION_MIN_TESTS_FOR_READY}, minTotalPerTag=${PERSONALIZATION_MIN_TOTAL_PER_TAG}`,
    });

    void predictions;
    void metrics;
    void metricsIncluded;
    return { testsTaken, attemptsLearningEligible, personalizationReady };
  }

  async checkAdminAndLogsAccess() {
    await this.pageCheck("/analytics");
    await this.request(
      "Admin analytics endpoint access",
      "/api/admin/prediction-metrics",
      "non-admin E2E user must not read admin metrics",
      { method: "GET" },
      {
        ok: (status) => status === 403,
        issueSeverity: "Low",
        suspectedModule: "src/app/api/admin/prediction-metrics/route.ts",
        notes: "Admin endpoints require admin account; learner-level analytics endpoints were checked separately.",
      },
    );
    this.recordStep({
      step: "Vercel runtime logs",
      status: "SKIP",
      endpoint: "vercel logs",
      expected:
        "check [eduai.learning_quality_gate], LLM, Prisma, episode orchestration and analytics errors",
      actual:
        "not checked by this script; requires Vercel project/log access outside learner HTTP session",
      notes:
        "Owner should inspect Vercel logs for [eduai.learning_quality_gate], LLM_BAD_RESPONSE, Prisma errors, episode orchestration errors, analytics endpoint errors.",
    });
  }

  async run() {
    await this.registerAndLogin();
    await this.createTopicStructure();

    if (PERSONALIZATION_MIN_TESTS_FOR_READY > MAX_EPISODES * 3) {
      this.recordStep({
        step: "Personalization threshold feasibility",
        status: "SKIP",
        endpoint: "local code constants",
        expected: `threshold <= ${MAX_EPISODES} smoke episodes`,
        actual: `threshold ${PERSONALIZATION_MIN_TESTS_FOR_READY} tests is above smoke limit`,
        notes:
          "threshold higher than smoke-test limit, requires separate seeded/self-check",
      });
      return;
    }

    for (let episodeIndex = 1; episodeIndex <= MAX_EPISODES; episodeIndex += 1) {
      await this.runEpisode(episodeIndex, true);
      const state = await this.checkPersonalizationAndAnalytics(episodeIndex);
      if (state.personalizationReady) {
        break;
      }
      if (
        episodeIndex >= 3 &&
        state.testsTaken >= PERSONALIZATION_MIN_TESTS_FOR_READY &&
        state.attemptsLearningEligible >= PERSONALIZATION_MIN_TESTS_FOR_READY
      ) {
        this.addIssue({
          severity: "High",
          step: "Personalization readiness",
          expected:
            "personalizationReady becomes true after local threshold is met",
          actual: `testsTaken=${state.testsTaken}; eligible=${state.attemptsLearningEligible}; personalizationReady=false`,
          relevantIds: {
            userId: asString(this.ids.userId),
            subjectId: asString(this.ids.subjectId),
          },
          suspectedModule: "src/lib/statistics.ts, src/app/api/tests/[id]/submit/route.ts",
          fixNow: true,
        });
        break;
      }
    }

    await this.checkAdminAndLogsAccess();

    if (!this.personalizationReady) {
      this.addIssue({
        severity: "High",
        step: "Personalization readiness",
        expected: `personalizationReady=true once axesReady>=${PERSONALIZATION_MIN_AXES_READY} and testsTaken>=${PERSONALIZATION_MIN_TESTS_FOR_READY}`,
        actual: `personalizationReady=false after ${this.episodeCount} episodes; learningEligible=${this.validLearningAttempts}`,
        relevantIds: {
          userId: asString(this.ids.userId),
          subjectId: asString(this.ids.subjectId),
        },
        suspectedModule: "src/lib/statistics.ts, src/app/api/tests/[id]/submit/route.ts",
        fixNow: true,
      });
    }
  }

  writeReport(exitCode: number) {
    mkdirSync(REPORT_DIR, { recursive: true });
    const grouped = (severity: Severity) =>
      this.issues.filter((issue) => issue.severity === severity);
    const lines: string[] = [];
    lines.push(`# Vercel E2E User Journey Report`);
    lines.push("");
    lines.push(`- Base URL: ${safeBaseUrl(this.baseUrl)}`);
    lines.push(`- Test email: ${this.email}`);
    lines.push(`- Test user name: ${this.name}`);
    lines.push(`- Password: generated locally for this run, not printed`);
    lines.push(`- Entity prefix: ${this.prefix}`);
    lines.push(`- Exit code: ${exitCode}`);
    lines.push(`- UI coverage: ${this.uiClickCoverage}`);
    lines.push(`- Logs checked: ${this.logsChecked ? "yes" : "no"}`);
    lines.push("");
    lines.push("## Discovered Local Criteria");
    lines.push("");
    lines.push(
      `- personalizationReady criterion from code: axesReady >= ${PERSONALIZATION_MIN_AXES_READY} and testsTaken >= ${PERSONALIZATION_MIN_TESTS_FOR_READY}.`,
    );
    lines.push(
      `- UserTagStat readiness uses minTotalPerTag >= ${PERSONALIZATION_MIN_TOTAL_PER_TAG}.`,
    );
    lines.push(
      "- testsTaken increments only when a submission is not excluded from learning updates.",
    );
    lines.push(
      "- Current `/learn` full UI start requests holdout after postcheck; no separate `final_test` role was found.",
    );
    lines.push("");
    lines.push("## Created IDs");
    lines.push("");
    for (const [key, value] of Object.entries(this.ids)) {
      lines.push(
        `- ${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`,
      );
    }
    lines.push("");
    lines.push("## Step Table");
    lines.push("");
    lines.push("| Step | Status | Endpoint/Page | Expected | Actual | Notes |");
    lines.push("|---|---:|---|---|---|---|");
    for (const step of this.steps) {
      lines.push(
        `| ${mdEscape(step.step)} | ${step.status} | ${mdEscape(
          step.endpoint,
        )} | ${mdEscape(step.expected)} | ${mdEscape(
          step.actual,
        )} | ${mdEscape(step.notes ?? "")} |`,
      );
    }
    lines.push("");
    lines.push("## Episode And Personalization Summary");
    lines.push("");
    lines.push(`- Episodes completed/attempted: ${this.episodeCount}`);
    lines.push(`- Learning-eligible attempts observed: ${this.validLearningAttempts}`);
    lines.push(
      `- personalizationReady: ${this.personalizationReady ? "yes" : "no"}`,
    );
    lines.push(
      `- LOW_UX_COMPLIANCE observed: ${this.lowUxComplianceSeen ? "yes" : "no"}`,
    );
    lines.push(
      `- Analytics visibility: ${
        this.steps.some(
          (step) =>
            step.endpoint.includes("/api/users/me/dashboard") &&
            step.status === "PASS",
        )
          ? "learner dashboard endpoint passed"
          : "not confirmed"
      }`,
    );
    lines.push("");
    lines.push("## Checks");
    lines.push("");
    lines.push("| Check | Status | Notes |");
    lines.push("|---|---:|---|");
    lines.push(
      `| e2e-vercel-user-journey | ${
        exitCode === 0 ? "PASS" : "FAIL"
      } | HTTP smoke against deployed app |`,
    );
    for (const check of this.checks) {
      lines.push(
        `| ${mdEscape(check.name)} | ${check.status} | ${mdEscape(
          check.notes,
        )} |`,
      );
    }
    lines.push("");
    lines.push("## Bugs By Severity");
    for (const severity of ["Critical", "High", "Medium", "Low"] as Severity[]) {
      lines.push("");
      lines.push(`### ${severity}`);
      const items = grouped(severity);
      if (items.length === 0) {
        lines.push("");
        lines.push("- None found in this run.");
        continue;
      }
      lines.push("");
      for (const issue of items) {
        lines.push(
          `- Step: ${issue.step}; expected: ${issue.expected}; actual: ${issue.actual}; request/response status: ${
            issue.requestStatus ?? "-"
          }/${issue.responseStatus ?? "-"}; ids: ${JSON.stringify(
            issue.relevantIds ?? {},
          )}; suspected module: ${issue.suspectedModule}; fix now: ${
            issue.fixNow ? "yes" : "no"
          }.`,
        );
      }
    }
    lines.push("");
    lines.push("## Next Separate Prompt");
    lines.push("");
    if (this.issues.length === 0) {
      lines.push(
        "- No runtime bug patch prompt is needed from this smoke result. A browser-click Playwright pass can be added separately.",
      );
    } else {
      const top =
        grouped("Critical")[0] ?? grouped("High")[0] ?? grouped("Medium")[0] ?? this.issues[0];
      lines.push(
        `- Fix first: ${top.step} in ${top.suspectedModule}. Keep production behavior changes scoped to the failing path.`,
      );
    }

    writeFileSync(this.reportPath(), `${lines.join("\n")}\n`, "utf8");
    console.log(
      JSON.stringify({
        step: "write_report",
        status: "PASS",
        path: this.reportPath(),
      }),
    );
  }

  hasFailingSeverity() {
    return this.issues.some(
      (issue) => issue.severity === "Critical" || issue.severity === "High",
    );
  }
}

function writeMissingEnvReport(reportStamp: string) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(
    REPORT_DIR,
    `e2e_user_journey_${reportStamp}.md`,
  );
  const lines = [
    "# Vercel E2E User Journey Report",
    "",
    "- Base URL: not set",
    "- Test email: not created",
    "- Created ids: none",
    "- Status: blocked before HTTP run",
    "- Episodes completed/attempted: 0",
    "- personalizationReady: no",
    "- Analytics visible: no",
    "- LOW_UX_COMPLIANCE observed: no runtime attempts were created",
    "",
    "## Blocking Error",
    "",
    "`E2E_BASE_URL` is not set. The script intentionally stops before creating a user or calling the deployed app.",
    "",
    "## Step Table",
    "",
    "| Step | Status | Endpoint/Page | Expected | Actual | Notes |",
    "|---|---:|---|---|---|---|",
    "| Environment | FAIL | E2E_BASE_URL | deployed Vercel base URL is provided | missing | no HTTP requests were sent |",
    "",
    "## Personalization Criterion From Local Code",
    "",
    `- personalizationReady criterion: axesReady >= ${PERSONALIZATION_MIN_AXES_READY} and testsTaken >= ${PERSONALIZATION_MIN_TESTS_FOR_READY}.`,
    `- Per-tag readiness uses totalCount >= ${PERSONALIZATION_MIN_TOTAL_PER_TAG}.`,
    "- testsTaken increments only for learning-eligible submissions.",
    "- `/learn` full UI flow can request holdout after postcheck; no separate `final_test` role was found in the current episode roles.",
    "",
    "## Checks",
    "",
    "| Check | Status | Notes |",
    "|---|---:|---|",
    "| e2e-vercel-user-journey | FAIL | Missing E2E_BASE_URL |",
    "",
    "## Bugs By Severity",
    "",
    "### Critical",
    "",
    "- Step: Environment; expected: `E2E_BASE_URL` points to deployed Vercel app; actual: missing; request/response status: -/-; ids: {}; suspected module: local execution environment; fix now: yes.",
    "",
    "### High",
    "",
    "- None found because runtime was not exercised.",
    "",
    "### Medium",
    "",
    "- UI click coverage was not run; only the runner preflight executed.",
    "",
    "### Low",
    "",
    "- None.",
    "",
    "## Next Separate Prompt",
    "",
    "- Re-run `E2E_BASE_URL=<vercel-url> scripts/e2e-vercel-user-journey.sh` after exporting the deployed app URL. Use Vercel credentials separately if server logs must be inspected.",
  ];
  writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
  console.error(
    JSON.stringify({
      step: "env",
      status: "FAIL",
      error: "E2E_BASE_URL is not set",
      reportPath,
    }),
  );
  return reportPath;
}

async function main() {
  const rawBaseUrl = process.env.E2E_BASE_URL?.trim() ?? "";
  const reportStamp = timestampForReport();
  if (!rawBaseUrl) {
    writeMissingEnvReport(reportStamp);
    return 1;
  }

  let runner: E2ERunner | null = null;
  let exitCode = 0;
  try {
    runner = new E2ERunner(rawBaseUrl);
    await runner.run();
    exitCode = runner.hasFailingSeverity() ? 1 : 0;
    return exitCode;
  } catch (error) {
    exitCode = 1;
    if (runner) {
      runner.addIssue({
        severity: "Critical",
        step: "Unhandled E2E runner error",
        expected: "runner completes the deployed user journey",
        actual: error instanceof Error ? error.message : String(error),
        suspectedModule: "scripts/e2e-vercel-user-journey.ts",
        fixNow: true,
      });
    } else {
      console.error(error);
    }
    return exitCode;
  } finally {
    if (runner) {
      runner.writeReport(exitCode);
    }
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
