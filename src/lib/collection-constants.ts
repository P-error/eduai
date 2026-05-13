export const DEFAULT_COLLECTION_NAME = "Unassigned";
const LEGACY_DEFAULT_COLLECTION_NAMES = [DEFAULT_COLLECTION_NAME, "Без темы"];

export function isDefaultCollectionName(name: string) {
  const normalized = name.trim().toLowerCase();
  return LEGACY_DEFAULT_COLLECTION_NAMES.some(
    (candidate) => candidate.toLowerCase() === normalized,
  );
}
