export const TRAINING_DATASET_SCHEMA_VERSION =
  "eduai_training_dataset_v1_2026_03" as const;
export const TRAINING_DATASET_METADATA_VERSION =
  "eduai_training_dataset_metadata_v1_2026_03" as const;
export const TRAINING_DATASET_MANIFEST_VERSION =
  "eduai_training_dataset_manifest_v1_2026_03" as const;

export const TRAINING_DATASET_PHASES = ["synthetic", "real"] as const;
export type TrainingDatasetPhase = (typeof TRAINING_DATASET_PHASES)[number];

export const TRAINING_DATASET_FILE_FORMAT = "csv" as const;
export const TRAINING_DATASET_PREFERRED_FUTURE_FORMAT = "parquet" as const;
export const TRAINING_DATASET_ROOT_RELATIVE_PATH = "training_datasets" as const;
export const DEFAULT_TRAINING_DATASET_PHASE = "synthetic" as const;
export const DEFAULT_OPERATIONAL_DATASET_PHASE = "real" as const;
export const DEFAULT_OPERATIONAL_DATASET_ORIGIN = "runtime_user" as const;

export const TRAINING_DATASET_PHASE_ROOTS: Record<
  TrainingDatasetPhase,
  string
> = {
  synthetic: `${TRAINING_DATASET_ROOT_RELATIVE_PATH}/synthetic`,
  real: `${TRAINING_DATASET_ROOT_RELATIVE_PATH}/real`,
};

export type TrainingDatasetCollectionMeta = {
  datasetPhase?: TrainingDatasetPhase | null;
  datasetOrigin?: string | null;
};

export type TrainingDatasetSchemaColumn = {
  name: string;
  type:
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "json_string"
    | "datetime";
  nullable: boolean;
  description: string;
};

export function isTrainingDatasetPhase(
  value: unknown,
): value is TrainingDatasetPhase {
  return TRAINING_DATASET_PHASES.some((phase) => phase === value);
}

export function normalizeTrainingDatasetPhase(
  value: unknown,
  fallback: TrainingDatasetPhase = DEFAULT_OPERATIONAL_DATASET_PHASE,
): TrainingDatasetPhase {
  return isTrainingDatasetPhase(value) ? value : fallback;
}

export function normalizeTrainingDatasetOrigin(
  value: unknown,
  fallback = DEFAULT_OPERATIONAL_DATASET_ORIGIN,
) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

  return normalized.length > 0 ? normalized : fallback;
}
