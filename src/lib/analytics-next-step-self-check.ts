import { buildAnalyticsNextStepDecision } from "@/lib/analytics-next-step";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function runAnalyticsNextStepSelfCheck() {
  const empty = buildAnalyticsNextStepDecision({});
  assert(empty.kind === "thin_data", "empty analytics payload must fall back to thin_data");
  assert(empty.learnHref === "/learn/start", "empty analytics payload must route to learner entry");

  const partial = buildAnalyticsNextStepDecision({
    summary: {},
    attempts: [{ score: undefined }, null as never],
  });
  assert(partial.kind === "thin_data", "partial analytics payload must stay fail-safe");

  const weakTopic = buildAnalyticsNextStepDecision({
    subjectId: "topic_1",
    topicLabel: "Fractions",
    summary: {
      attemptsRecorded: 5,
      attemptsLearningEligible: 5,
      recentAccuracy: { value: 0.42 },
    },
    attempts: [],
  });
  assert(weakTopic.kind === "weak_topic", "weak selected topic must recommend Learn");
  assert(
    weakTopic.learnHref === "/learn?subjectId=topic_1",
    "weak selected topic must keep subject in Learn href",
  );

  const unstablePractice = buildAnalyticsNextStepDecision({
    subjectId: "topic_2",
    topicLabel: "Linear equations",
    summary: {
      attemptsRecorded: 5,
      attemptsLearningEligible: 5,
      recentAccuracy: { value: 0.8 },
    },
    attempts: [{ score: 0.95 }, { score: 0.35 }, { actualAccuracy: 0.9 }],
  });
  assert(
    unstablePractice.kind === "practice_instability",
    "unstable selected topic must recommend quick practice",
  );
  assert(
    unstablePractice.practiceHref.includes("subjectId=topic_2"),
    "practice href must keep subject",
  );

  const noTopic = buildAnalyticsNextStepDecision({
    summary: {
      attemptsRecorded: 5,
      attemptsLearningEligible: 5,
      recentAccuracy: { value: 0.4 },
    },
    attempts: [{ score: 0.2 }, { score: 0.9 }],
  });
  assert(
    noTopic.kind === "continue_learning",
    "global or topicless data must not invent a weak topic recommendation",
  );

  return {
    ok: true,
    checks: [
      "empty payload -> thin_data",
      "partial payload -> thin_data",
      "weak selected topic -> Learn",
      "unstable selected topic -> quick practice",
      "topicless data -> continue learning",
    ],
  };
}
