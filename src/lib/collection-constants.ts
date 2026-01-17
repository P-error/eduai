export const DEFAULT_COLLECTION_NAME = "Без темы";

export function isDefaultCollectionName(name: string) {
  return name.trim().toLowerCase() === DEFAULT_COLLECTION_NAME.toLowerCase();
}
