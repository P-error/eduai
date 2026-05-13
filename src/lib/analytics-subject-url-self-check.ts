import {
  buildAnalyticsSubjectHref,
  resolveAnalyticsSubjectUrlState,
} from "@/lib/analytics-subject-url";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function runAnalyticsSubjectUrlSelfCheck() {
  const noSubject = resolveAnalyticsSubjectUrlState({
    pathname: "/analytics",
    search: "",
    validSubjectIds: ["topic_1"],
    subjectsLoaded: true,
  });
  assert(noSubject.selectedSubjectId === "", "empty URL must keep global analytics");
  assert(noSubject.replaceHref == null, "empty URL must not be rewritten");

  const validSubject = resolveAnalyticsSubjectUrlState({
    pathname: "/analytics",
    search: "subjectId=topic_1",
    validSubjectIds: ["topic_1"],
    subjectsLoaded: true,
  });
  assert(validSubject.selectedSubjectId === "topic_1", "valid subjectId must be selected");
  assert(validSubject.replaceHref == null, "valid subjectId must not be rewritten");

  const invalidSubject = resolveAnalyticsSubjectUrlState({
    pathname: "/analytics",
    search: "subjectId=missing",
    validSubjectIds: ["topic_1"],
    subjectsLoaded: true,
  });
  assert(invalidSubject.selectedSubjectId === "", "invalid subjectId must clear selection");
  assert(invalidSubject.replaceHref === "/analytics", "invalid subjectId must normalize once");

  const invalidWithOtherParams = resolveAnalyticsSubjectUrlState({
    pathname: "/analytics",
    search: "view=summary&subjectId=missing",
    validSubjectIds: ["topic_1"],
    subjectsLoaded: true,
  });
  assert(
    invalidWithOtherParams.replaceHref === "/analytics?view=summary",
    "invalid subjectId normalization must preserve unrelated params",
  );

  const loadingSubjects = resolveAnalyticsSubjectUrlState({
    pathname: "/analytics",
    search: "subjectId=topic_1",
    validSubjectIds: [],
    subjectsLoaded: false,
  });
  assert(
    loadingSubjects.selectedSubjectId === "topic_1",
    "loading subjects must not clear a valid-looking subjectId prematurely",
  );
  assert(loadingSubjects.replaceHref == null, "loading subjects must not rewrite URL");

  assert(
    buildAnalyticsSubjectHref("/analytics", "", null) === "/analytics",
    "global href must stay /analytics",
  );
  assert(
    buildAnalyticsSubjectHref("/analytics", "", "topic_1") ===
      "/analytics?subjectId=topic_1",
    "selected subject href must add subjectId",
  );
  assert(
    buildAnalyticsSubjectHref("/analytics", "view=summary", null) ===
      "/analytics?view=summary",
    "clearing subject must preserve unrelated params",
  );

  return {
    ok: true,
    checks: [
      "no subjectId -> global analytics",
      "valid subjectId -> stable selected topic",
      "invalid subjectId -> one normalization to /analytics",
      "loading subjects -> no premature cleanup",
      "subject href builder preserves unrelated params",
    ],
  };
}
