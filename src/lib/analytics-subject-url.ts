export type AnalyticsSubjectUrlState = {
  selectedSubjectId: string;
  replaceHref: string | null;
};

export function buildAnalyticsSubjectHref(
  pathname: string,
  search: string,
  subjectId: string | null,
) {
  const searchParams = new URLSearchParams(search);
  const normalizedSubjectId = subjectId?.trim() ?? "";

  if (normalizedSubjectId) {
    searchParams.set("subjectId", normalizedSubjectId);
  } else {
    searchParams.delete("subjectId");
  }

  const nextSearch = searchParams.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

export function resolveAnalyticsSubjectUrlState(params: {
  pathname: string;
  search: string;
  validSubjectIds: readonly string[];
  subjectsLoaded: boolean;
}): AnalyticsSubjectUrlState {
  const searchParams = new URLSearchParams(params.search);
  const querySubjectId = searchParams.get("subjectId")?.trim() ?? "";

  if (!querySubjectId) {
    return {
      selectedSubjectId: "",
      replaceHref: null,
    };
  }

  if (!params.subjectsLoaded) {
    return {
      selectedSubjectId: querySubjectId,
      replaceHref: null,
    };
  }

  const validSubjectIds = new Set(params.validSubjectIds);
  if (validSubjectIds.has(querySubjectId)) {
    return {
      selectedSubjectId: querySubjectId,
      replaceHref: null,
    };
  }

  return {
    selectedSubjectId: "",
    replaceHref: buildAnalyticsSubjectHref(params.pathname, params.search, null),
  };
}
