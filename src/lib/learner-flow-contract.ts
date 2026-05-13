export const DEFAULT_LEARNER_ENTRY_HREF = "/learn/start";

export type LearnerFlowEntryState = {
  hasSubjects: boolean;
  activeEpisodeId?: string | null;
};

export type LearnerFlowEntryTarget =
  | {
      kind: "topics";
      href: string;
      reason: "missing_subjects";
    }
  | {
      kind: "learn";
      href: string;
      reason: "ready_for_learn";
    }
  | {
      kind: "resume";
      href: string;
      reason: "active_episode";
      episodeId: string;
    };

function buildTopicsSetupHref() {
  return "/topics?entry=setup";
}

function buildResumeEpisodeHref(episodeId: string) {
  const searchParams = new URLSearchParams({
    episode: episodeId,
    resume: "1",
  });
  return `/learn?${searchParams.toString()}`;
}

export function resolveLearnerFlowEntryTarget(
  state: LearnerFlowEntryState,
): LearnerFlowEntryTarget {
  if (state.activeEpisodeId) {
    return {
      kind: "resume",
      href: buildResumeEpisodeHref(state.activeEpisodeId),
      reason: "active_episode",
      episodeId: state.activeEpisodeId,
    };
  }

  if (!state.hasSubjects) {
    return {
      kind: "topics",
      href: buildTopicsSetupHref(),
      reason: "missing_subjects",
    };
  }

  return {
    kind: "learn",
    href: "/learn",
    reason: "ready_for_learn",
  };
}

export function buildRelativeHref(pathname: string, search?: string | null) {
  if (!pathname.startsWith("/")) {
    return DEFAULT_LEARNER_ENTRY_HREF;
  }

  const normalizedSearch = search && search.length > 0 ? search : "";
  if (!normalizedSearch) {
    return pathname;
  }

  return normalizedSearch.startsWith("?")
    ? `${pathname}${normalizedSearch}`
    : `${pathname}?${normalizedSearch}`;
}

export function readSafeNextHref(raw: string | null | undefined) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return null;
  }

  try {
    const normalized = new URL(raw, "http://eduai.local");
    const path = `${normalized.pathname}${normalized.search}${normalized.hash}`;
    if (path === "/login" || path === "/register") {
      return null;
    }

    if (path === "/learn") {
      return DEFAULT_LEARNER_ENTRY_HREF;
    }

    return path;
  } catch {
    return null;
  }
}

function buildAuthRouteHref(basePath: "/login" | "/register", nextHref?: string | null) {
  const safeNextHref = readSafeNextHref(nextHref);
  if (!safeNextHref) {
    return basePath;
  }

  return `${basePath}?next=${encodeURIComponent(safeNextHref)}`;
}

export function buildLoginHrefForNext(nextHref?: string | null) {
  return buildAuthRouteHref("/login", nextHref);
}

export function buildRegisterHrefForNext(nextHref?: string | null) {
  return buildAuthRouteHref("/register", nextHref);
}

export function pickPostAuthRedirectHref(nextHref?: string | null) {
  return readSafeNextHref(nextHref) ?? DEFAULT_LEARNER_ENTRY_HREF;
}
