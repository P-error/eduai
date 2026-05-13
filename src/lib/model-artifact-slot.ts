import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { TRAINING_DATASET_SCHEMA_VERSION } from "@/lib/training-dataset-contract";

export const EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SLOT_KIND =
  "eduai_native_pedagogy_artifact_slot" as const;
export const EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SLOT_SCHEMA_VERSION =
  "eduai_native_pedagogy_artifact_slot_v1_2026_03" as const;
export const EDUAI_NATIVE_PEDAGOGY_ARTIFACT_KIND =
  "eduai_native_pedagogy_artifact" as const;
export const EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SCHEMA_VERSION =
  "eduai_native_pedagogy_artifact_v1_2026_03" as const;
export const EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SLOT_RELATIVE_DIR =
  "artifacts/runtime/eduai_native_pedagogy/current" as const;
export const EDUAI_NATIVE_PEDAGOGY_ARTIFACT_FILE_NAME =
  "artifact.json" as const;
export const EDUAI_NATIVE_PEDAGOGY_ARTIFACT_METADATA_FILE_NAME =
  "slot_metadata.json" as const;
export const EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SUPPORT_DIR_NAME =
  "files" as const;
export const EDUAI_NATIVE_PEDAGOGY_RUNTIME_TARGETS = [
  "difficulty",
  "depth",
] as const;

export type EduAiNativePedagogyArtifactSlotStatus =
  | "placeholder"
  | "artifact_present";
export type EduAiNativePedagogyRuntimeIntegrationStatus =
  | "deferred"
  | "inactive_pending_activation";

export type EduAiNativePedagogyArtifactSlotSnapshot = {
  status: "default_placeholder" | "loaded" | "invalid";
  slotDir: string;
  metadataPath: string;
  artifactPath: string;
  artifactExists: boolean;
  warning: string | null;
  metadata: EduAiNativePedagogyArtifactSlotMetadata;
};

export type EduAiNativePedagogyArtifactSlotMetadata = {
  slotKind: typeof EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SLOT_KIND;
  slotSchemaVersion: typeof EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SLOT_SCHEMA_VERSION;
  slotStatus: EduAiNativePedagogyArtifactSlotStatus;
  runtimeIntegrationStatus: EduAiNativePedagogyRuntimeIntegrationStatus;
  expectedTargets: (typeof EDUAI_NATIVE_PEDAGOGY_RUNTIME_TARGETS)[number][];
  expectedTrainingDatasetSchemaVersion: typeof TRAINING_DATASET_SCHEMA_VERSION;
  artifactRelativePath: string;
  metadataRelativePath: string;
  supportFilesRelativeDir: string;
  provenance: {
    sourcePhase: "synthetic" | "real" | null;
    datasetOrigin: string | null;
    generationRunId: string | null;
    trainingRunId: string | null;
    handedOffAtIso: string | null;
  };
  notes: string[];
};

export function resolveEduAiNativePedagogyArtifactSlotDir() {
  return path.join(process.cwd(), EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SLOT_RELATIVE_DIR);
}

export function resolveEduAiNativePedagogyArtifactPath() {
  return path.join(
    resolveEduAiNativePedagogyArtifactSlotDir(),
    EDUAI_NATIVE_PEDAGOGY_ARTIFACT_FILE_NAME,
  );
}

export function resolveEduAiNativePedagogyArtifactMetadataPath() {
  return path.join(
    resolveEduAiNativePedagogyArtifactSlotDir(),
    EDUAI_NATIVE_PEDAGOGY_ARTIFACT_METADATA_FILE_NAME,
  );
}

export function resolveEduAiNativePedagogyArtifactSupportFilesDir() {
  return path.join(
    resolveEduAiNativePedagogyArtifactSlotDir(),
    EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SUPPORT_DIR_NAME,
  );
}

export function buildEduAiNativePedagogyArtifactSlotMetadata(
  overrides: Partial<EduAiNativePedagogyArtifactSlotMetadata> = {},
): EduAiNativePedagogyArtifactSlotMetadata {
  return {
    slotKind: EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SLOT_KIND,
    slotSchemaVersion: EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SLOT_SCHEMA_VERSION,
    slotStatus: overrides.slotStatus ?? "placeholder",
    runtimeIntegrationStatus:
      overrides.runtimeIntegrationStatus ?? "deferred",
    expectedTargets: [...EDUAI_NATIVE_PEDAGOGY_RUNTIME_TARGETS],
    expectedTrainingDatasetSchemaVersion: TRAINING_DATASET_SCHEMA_VERSION,
    artifactRelativePath:
      overrides.artifactRelativePath ??
      `${EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SLOT_RELATIVE_DIR}/${EDUAI_NATIVE_PEDAGOGY_ARTIFACT_FILE_NAME}`,
    metadataRelativePath:
      overrides.metadataRelativePath ??
      `${EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SLOT_RELATIVE_DIR}/${EDUAI_NATIVE_PEDAGOGY_ARTIFACT_METADATA_FILE_NAME}`,
    supportFilesRelativeDir:
      overrides.supportFilesRelativeDir ??
      `${EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SLOT_RELATIVE_DIR}/${EDUAI_NATIVE_PEDAGOGY_ARTIFACT_SUPPORT_DIR_NAME}`,
    provenance: overrides.provenance ?? {
      sourcePhase: null,
      datasetOrigin: null,
      generationRunId: null,
      trainingRunId: null,
      handedOffAtIso: null,
    },
    notes:
      overrides.notes ?? [
        "Reserved for a later EduAI-native runtime artifact.",
        "Runtime serving remains inactive until an explicit activation step is requested later.",
        "Synthetic bridge artifacts must be labeled as internal evidence only, not real-user validation.",
      ],
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function parseSlotMetadata(
  payload: unknown,
): EduAiNativePedagogyArtifactSlotMetadata | null {
  const root = asRecord(payload);
  if (!root) return null;

  const slotStatus =
    root.slotStatus === "artifact_present" ? "artifact_present" : "placeholder";
  const runtimeIntegrationStatus =
    root.runtimeIntegrationStatus === "inactive_pending_activation"
      ? "inactive_pending_activation"
      : "deferred";

  return buildEduAiNativePedagogyArtifactSlotMetadata({
    slotStatus,
    runtimeIntegrationStatus,
    artifactRelativePath:
      typeof root.artifactRelativePath === "string"
        ? root.artifactRelativePath
        : undefined,
    metadataRelativePath:
      typeof root.metadataRelativePath === "string"
        ? root.metadataRelativePath
        : undefined,
    supportFilesRelativeDir:
      typeof root.supportFilesRelativeDir === "string"
        ? root.supportFilesRelativeDir
        : undefined,
    provenance: asRecord(root.provenance)
      ? {
          sourcePhase:
            root.provenance &&
            typeof (root.provenance as Record<string, unknown>).sourcePhase ===
              "string" &&
            (
              (root.provenance as Record<string, unknown>).sourcePhase === "synthetic" ||
              (root.provenance as Record<string, unknown>).sourcePhase === "real"
            )
              ? ((root.provenance as Record<string, unknown>).sourcePhase as
                  | "synthetic"
                  | "real")
              : null,
          datasetOrigin:
            typeof (root.provenance as Record<string, unknown>).datasetOrigin ===
            "string"
              ? String(
                  (root.provenance as Record<string, unknown>).datasetOrigin,
                )
              : null,
          generationRunId:
            typeof (root.provenance as Record<string, unknown>).generationRunId ===
            "string"
              ? String(
                  (root.provenance as Record<string, unknown>).generationRunId,
                )
              : null,
          trainingRunId:
            typeof (root.provenance as Record<string, unknown>).trainingRunId ===
            "string"
              ? String(
                  (root.provenance as Record<string, unknown>).trainingRunId,
                )
              : null,
          handedOffAtIso:
            typeof (root.provenance as Record<string, unknown>).handedOffAtIso ===
            "string"
              ? String(
                  (root.provenance as Record<string, unknown>).handedOffAtIso,
                )
              : null,
        }
      : undefined,
    notes: Array.isArray(root.notes)
      ? root.notes.filter((note): note is string => typeof note === "string")
      : undefined,
  });
}

export function loadEduAiNativePedagogyArtifactSlotSnapshot(): EduAiNativePedagogyArtifactSlotSnapshot {
  const slotDir = resolveEduAiNativePedagogyArtifactSlotDir();
  const metadataPath = resolveEduAiNativePedagogyArtifactMetadataPath();
  const artifactPath = resolveEduAiNativePedagogyArtifactPath();
  const artifactExists = existsSync(artifactPath);

  if (!existsSync(metadataPath)) {
    return {
      status: "default_placeholder",
      slotDir,
      metadataPath,
      artifactPath,
      artifactExists,
      warning: null,
      metadata: buildEduAiNativePedagogyArtifactSlotMetadata({
        slotStatus: artifactExists ? "artifact_present" : "placeholder",
      }),
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(metadataPath, "utf8"));
    const metadata = parseSlotMetadata(parsed);
    if (!metadata) {
      return {
        status: "invalid",
        slotDir,
        metadataPath,
        artifactPath,
        artifactExists,
        warning: "artifact_slot_metadata_invalid",
        metadata: buildEduAiNativePedagogyArtifactSlotMetadata({
          slotStatus: artifactExists ? "artifact_present" : "placeholder",
        }),
      };
    }

    return {
      status: "loaded",
      slotDir,
      metadataPath,
      artifactPath,
      artifactExists,
      warning: null,
      metadata,
    };
  } catch (error) {
    return {
      status: "invalid",
      slotDir,
      metadataPath,
      artifactPath,
      artifactExists,
      warning:
        error instanceof Error
          ? `artifact_slot_metadata_read_failed:${error.message}`
          : "artifact_slot_metadata_read_failed",
      metadata: buildEduAiNativePedagogyArtifactSlotMetadata({
        slotStatus: artifactExists ? "artifact_present" : "placeholder",
      }),
    };
  }
}
