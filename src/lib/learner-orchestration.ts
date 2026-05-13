import {
  buildPendingStartFingerprint,
  startLearnerEpisode,
  reservePendingLearnerEpisodeStartKey,
  type LearnerEpisodeState,
} from "@/lib/learner-episode-client";
import { DEFAULT_LEARNER_ENTRY_HREF } from "@/lib/learner-flow-contract";

type ApiFetcher = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

export type OwnerPathEpisodeLaunchInput = {
  subjectId: string;
  subjectTitle: string;
  sectionId?: string | null;
  sectionTitle?: string | null;
  topic?: string | null;
  questionCount?: number;
  personalizationMode?: "on" | "off";
};

export function buildTopicDetailsHref(subjectId: string) {
  return `/topics/${encodeURIComponent(subjectId)}`;
}

export function buildStartedLearnerEpisodeHref(episodeId: string) {
  return `/learn?episode=${encodeURIComponent(episodeId)}`;
}

export function buildCustomPracticeHref(params: {
  subjectId?: string | null;
  sectionId?: string | null;
  topic?: string | null;
}) {
  if (!params.subjectId) {
    return "/practice";
  }

  const searchParams = new URLSearchParams({
    subjectId: params.subjectId,
  });

  if (params.sectionId) {
    searchParams.set("sectionId", params.sectionId);
  }

  const topic = params.topic?.trim();
  if (topic) {
    searchParams.set("topic", topic);
  }

  return `/practice?${searchParams.toString()}`;
}

export function buildPracticeResultCtaHierarchy(params: {
  subjectId?: string | null;
  sectionId?: string | null;
  topic?: string | null;
}) {
  return {
    primaryHref: DEFAULT_LEARNER_ENTRY_HREF,
    secondaryHref: buildCustomPracticeHref(params),
  };
}

export function resolveOwnerPathEpisodeTopic(input: OwnerPathEpisodeLaunchInput) {
  const explicitTopic = input.topic?.trim();
  if (explicitTopic) {
    return explicitTopic;
  }

  const sectionTitle = input.sectionTitle?.trim();
  if (sectionTitle) {
    return sectionTitle;
  }

  return input.subjectTitle.trim();
}

export async function launchOwnerPathEpisode(
  fetcher: ApiFetcher,
  input: OwnerPathEpisodeLaunchInput,
): Promise<{ state: LearnerEpisodeState; href: string }> {
  const personalizationMode = input.personalizationMode ?? "on";
  const topic = resolveOwnerPathEpisodeTopic(input);
  const clientKey = reservePendingLearnerEpisodeStartKey(
    buildPendingStartFingerprint({
      subjectId: input.subjectId,
      sectionId: input.sectionId ?? null,
      topic,
      mode: "practice",
      personalizationMode,
      includeHoldout: true,
    }),
  );

  const state = await startLearnerEpisode(fetcher, {
    subjectId: input.subjectId,
    sectionId: input.sectionId ?? null,
    topic,
    clientKey,
    questionCount: input.questionCount ?? 3,
    mode: "practice",
    personalizationMode,
    assignmentArm: personalizationMode === "on" ? "predicted" : "baseline",
    includeHoldout: true,
  });

  return {
    state,
    href: buildStartedLearnerEpisodeHref(state.episode.episodeId),
  };
}
