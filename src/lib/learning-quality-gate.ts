import {
  UX_AXES,
  UX_AVG_THRESHOLD,
  UX_MIN_AXIS_THRESHOLD,
} from "@/lib/tags";

export const UX_COMPLIANCE_GATE_SCHEMA_VERSION =
  "ux_compliance_gate_v2_2026_05" as const;

export type CoreDeliveryRequest = {
  tone?: string;
  explanation_style?: string;
  response_format?: string;
  difficulty_target?: string;
  depth?: string;
};

export type ObservedQuestionTags = Record<string, string>;

export type UxCompliance = {
  perAxis: Array<{
    axis: string;
    requested: string;
    matchCount: number;
    total: number;
    matchRate: number;
  }>;
  averageMatchRate: number;
  minAxisMatchRate: number;
};

export type UxComplianceGateDecision = {
  schemaVersion: typeof UX_COMPLIANCE_GATE_SCHEMA_VERSION;
  basis:
    | "manual_delivery_override"
    | "optional_rendering_metadata"
    | "stored_validation_meta";
  evaluated: boolean;
  status: "passed" | "failed" | "unknown";
  learningExclusion: boolean;
  reasonCode: "LOW_UX_COMPLIANCE" | null;
  styleConsistencyScore: number | null;
  minAxisScore: number | null;
  thresholds: {
    averageMatchRate: number;
    minAxisMatchRate: number;
  };
  requestedAxes: string[];
  perAxis: UxCompliance["perAxis"];
  missingFields: string[];
  notes: string[];
};

export type LearningQualityGateLogPayload = {
  phase: "test_generation" | "test_submit";
  testId: string | null;
  episodeId: string | null;
  itemIds: string[];
  styleConsistencyScore: number | null;
  minStyleAxisScore: number | null;
  thresholds: UxComplianceGateDecision["thresholds"];
  gateStatus: UxComplianceGateDecision["status"];
  reasonCode: string | null;
  missingFields: string[];
  decision: "include" | "exclude";
  generationSource?: string | null;
  taggingSource?: string | null;
};

function thresholds() {
  return {
    averageMatchRate: UX_AVG_THRESHOLD,
    minAxisMatchRate: UX_MIN_AXIS_THRESHOLD,
  };
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unknownDecision(params: {
  basis: UxComplianceGateDecision["basis"];
  requestedAxes: string[];
  perAxis?: UxCompliance["perAxis"];
  styleConsistencyScore?: number | null;
  minAxisScore?: number | null;
  missingFields: string[];
  notes?: string[];
}): UxComplianceGateDecision {
  return {
    schemaVersion: UX_COMPLIANCE_GATE_SCHEMA_VERSION,
    basis: params.basis,
    evaluated: false,
    status: "unknown",
    learningExclusion: false,
    reasonCode: null,
    styleConsistencyScore: params.styleConsistencyScore ?? null,
    minAxisScore: params.minAxisScore ?? null,
    thresholds: thresholds(),
    requestedAxes: params.requestedAxes,
    perAxis: params.perAxis ?? [],
    missingFields: unique(params.missingFields),
    notes: params.notes ?? [],
  };
}

export function pickRequestedUxAxes(
  requestedDelivery: CoreDeliveryRequest | Record<string, unknown> | null | undefined,
): Record<string, string> {
  const picked: Record<string, string> = {};
  const source = (requestedDelivery ?? {}) as Record<string, unknown>;

  for (const axis of UX_AXES) {
    const value = source[axis];
    if (typeof value === "string" && value.trim().length > 0) {
      picked[axis] = value;
    }
  }

  return picked;
}

export function computeUxCompliance(
  requestedDelivery: CoreDeliveryRequest | Record<string, unknown> | null | undefined,
  observedTagsPerQuestion: ObservedQuestionTags[],
): { ux: UxCompliance } {
  const requestedUx = pickRequestedUxAxes(requestedDelivery);
  const requestedAxes = Object.keys(requestedUx);

  if (requestedAxes.length === 0) {
    return {
      ux: {
        perAxis: [],
        averageMatchRate: 1,
        minAxisMatchRate: 1,
      },
    };
  }

  const total = observedTagsPerQuestion.length;
  const perAxis = requestedAxes.map((axis) => {
    const requested = requestedUx[axis];
    const matchCount = observedTagsPerQuestion.reduce((count, observed) => {
      return count + (observed?.[axis] === requested ? 1 : 0);
    }, 0);
    const matchRate = total > 0 ? matchCount / total : 0;

    return {
      axis,
      requested,
      matchCount,
      total,
      matchRate,
    };
  });

  const averageMatchRate =
    perAxis.length > 0
      ? perAxis.reduce((sum, axis) => sum + axis.matchRate, 0) / perAxis.length
      : 1;
  const minAxisMatchRate =
    perAxis.length > 0
      ? Math.min(...perAxis.map((axis) => axis.matchRate))
      : 1;

  return {
    ux: {
      perAxis,
      averageMatchRate,
      minAxisMatchRate,
    },
  };
}

export function evaluateUxComplianceGate(params: {
  requestedDelivery: CoreDeliveryRequest | Record<string, unknown> | null | undefined;
  observedTagsPerQuestion: ObservedQuestionTags[];
  hasManualDeliveryOverride: boolean;
  taggingSource: string | null;
}): UxComplianceGateDecision {
  const requestedUx = pickRequestedUxAxes(params.requestedDelivery);
  const requestedAxes = Object.keys(requestedUx);
  const compliance = computeUxCompliance(
    params.requestedDelivery,
    params.observedTagsPerQuestion,
  );

  if (!params.hasManualDeliveryOverride) {
    return unknownDecision({
      basis: "optional_rendering_metadata",
      requestedAxes,
      perAxis: compliance.ux.perAxis,
      styleConsistencyScore:
        requestedAxes.length > 0 ? compliance.ux.averageMatchRate : null,
      minAxisScore: requestedAxes.length > 0 ? compliance.ux.minAxisMatchRate : null,
      missingFields:
        requestedAxes.length === 0
          ? UX_AXES.map((axis) => `requestedDelivery.${axis}`)
          : [],
      notes: [
        "rendering_style_is_optional_for_learning_eligibility_without_manual_delivery_override",
      ],
    });
  }

  if (requestedAxes.length === 0) {
    return unknownDecision({
      basis: "manual_delivery_override",
      requestedAxes,
      missingFields: UX_AXES.map((axis) => `requestedDelivery.${axis}`),
      notes: ["manual_delivery_override_without_explicit_ux_axes"],
    });
  }

  if (params.taggingSource !== "llm") {
    return unknownDecision({
      basis: "manual_delivery_override",
      requestedAxes,
      perAxis: compliance.ux.perAxis,
      styleConsistencyScore: compliance.ux.averageMatchRate,
      minAxisScore: compliance.ux.minAxisMatchRate,
      missingFields: ["observedTagsPerQuestion.llmTags"],
      notes: ["style_compliance_requires_llm_tagging_evidence"],
    });
  }

  if (params.observedTagsPerQuestion.length === 0) {
    return unknownDecision({
      basis: "manual_delivery_override",
      requestedAxes,
      missingFields: ["observedTagsPerQuestion"],
      notes: ["no_observed_question_style_tags"],
    });
  }

  const missingObservedAxes = requestedAxes.flatMap((axis) =>
    params.observedTagsPerQuestion.some(
      (observed) =>
        typeof observed?.[axis] !== "string" ||
        observed[axis].trim().length === 0,
    )
      ? [`observedTagsPerQuestion.${axis}`]
      : [],
  );
  if (missingObservedAxes.length > 0) {
    return unknownDecision({
      basis: "manual_delivery_override",
      requestedAxes,
      perAxis: compliance.ux.perAxis,
      styleConsistencyScore: compliance.ux.averageMatchRate,
      minAxisScore: compliance.ux.minAxisMatchRate,
      missingFields: missingObservedAxes,
      notes: ["style_compliance_not_failed_when_required_style_fields_are_missing"],
    });
  }

  const failed =
    compliance.ux.averageMatchRate < UX_AVG_THRESHOLD ||
    compliance.ux.minAxisMatchRate < UX_MIN_AXIS_THRESHOLD;

  return {
    schemaVersion: UX_COMPLIANCE_GATE_SCHEMA_VERSION,
    basis: "manual_delivery_override",
    evaluated: true,
    status: failed ? "failed" : "passed",
    learningExclusion: failed,
    reasonCode: failed ? "LOW_UX_COMPLIANCE" : null,
    styleConsistencyScore: compliance.ux.averageMatchRate,
    minAxisScore: compliance.ux.minAxisMatchRate,
    thresholds: thresholds(),
    requestedAxes,
    perAxis: compliance.ux.perAxis,
    missingFields: [],
    notes: [],
  };
}

function parseStoredPerAxis(value: unknown): UxCompliance["perAxis"] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) return [];
    const axis = typeof record.axis === "string" ? record.axis : null;
    const requested =
      typeof record.requested === "string" ? record.requested : null;
    const matchCount = numberOrNull(record.matchCount);
    const total = numberOrNull(record.total);
    const matchRate = numberOrNull(record.matchRate);
    if (
      !axis ||
      !requested ||
      matchCount == null ||
      total == null ||
      matchRate == null
    ) {
      return [];
    }
    return [
      {
        axis,
        requested,
        matchCount,
        total,
        matchRate,
      },
    ];
  });
}

function parseStoredGate(value: unknown): UxComplianceGateDecision | null {
  const gate = asRecord(value);
  if (!gate) return null;
  const thresholdsRecord = asRecord(gate.thresholds);
  const styleConsistencyScore = numberOrNull(gate.styleConsistencyScore);
  const minAxisScore = numberOrNull(gate.minAxisScore);
  const requestedAxes = Array.isArray(gate.requestedAxes)
    ? gate.requestedAxes.filter((axis): axis is string => typeof axis === "string")
    : [];
  const perAxis = parseStoredPerAxis(gate.perAxis);
  const missingFields = Array.isArray(gate.missingFields)
    ? gate.missingFields.filter((field): field is string => typeof field === "string")
    : [];
  const notes = Array.isArray(gate.notes)
    ? gate.notes.filter((note): note is string => typeof note === "string")
    : [];
  const status =
    gate.status === "passed" || gate.status === "failed" || gate.status === "unknown"
      ? gate.status
      : "unknown";
  const basis =
    gate.basis === "manual_delivery_override" ||
    gate.basis === "optional_rendering_metadata" ||
    gate.basis === "stored_validation_meta"
      ? gate.basis
      : "stored_validation_meta";
  const averageThreshold =
    numberOrNull(thresholdsRecord?.averageMatchRate) ?? UX_AVG_THRESHOLD;
  const minThreshold =
    numberOrNull(thresholdsRecord?.minAxisMatchRate) ?? UX_MIN_AXIS_THRESHOLD;
  const learningExclusion =
    gate.learningExclusion === true &&
    gate.reasonCode === "LOW_UX_COMPLIANCE" &&
    status === "failed" &&
    styleConsistencyScore != null &&
    minAxisScore != null;

  return {
    schemaVersion: UX_COMPLIANCE_GATE_SCHEMA_VERSION,
    basis,
    evaluated: gate.evaluated === true,
    status,
    learningExclusion,
    reasonCode: learningExclusion ? "LOW_UX_COMPLIANCE" : null,
    styleConsistencyScore,
    minAxisScore,
    thresholds: {
      averageMatchRate: averageThreshold,
      minAxisMatchRate: minThreshold,
    },
    requestedAxes,
    perAxis,
    missingFields,
    notes,
  };
}

export function resolveStoredUxComplianceGate(
  validationMeta: Record<string, unknown>,
): UxComplianceGateDecision {
  const storedGate = parseStoredGate(validationMeta.deliveryComplianceGate);
  if (storedGate) {
    return storedGate;
  }

  const requestedDelivery = asRecord(validationMeta.requestedDelivery);
  const requestedUx = pickRequestedUxAxes(requestedDelivery);
  const requestedAxes = Object.keys(requestedUx);
  const deliveryCompliance = asRecord(validationMeta.deliveryCompliance);
  const ux = asRecord(deliveryCompliance?.ux);
  const perAxis = parseStoredPerAxis(ux?.perAxis);
  const styleConsistencyScore = numberOrNull(ux?.averageMatchRate);
  const minAxisScore = numberOrNull(ux?.minAxisMatchRate);
  const flagRequestsLowUx =
    validationMeta.deliveryComplianceFailed === true ||
    validationMeta.learningExcludedReason === "LOW_UX_COMPLIANCE";

  if (requestedAxes.length === 0) {
    return unknownDecision({
      basis: "stored_validation_meta",
      requestedAxes,
      perAxis,
      styleConsistencyScore,
      minAxisScore,
      missingFields: UX_AXES.map((axis) => `requestedDelivery.${axis}`),
      notes: flagRequestsLowUx
        ? ["legacy_low_ux_flag_without_explicit_requested_ux_axes"]
        : ["no_explicit_requested_ux_axes"],
    });
  }

  if (styleConsistencyScore == null || minAxisScore == null || perAxis.length === 0) {
    return unknownDecision({
      basis: "stored_validation_meta",
      requestedAxes,
      perAxis,
      styleConsistencyScore,
      minAxisScore,
      missingFields: [
        ...(styleConsistencyScore == null
          ? ["deliveryCompliance.ux.averageMatchRate"]
          : []),
        ...(minAxisScore == null
          ? ["deliveryCompliance.ux.minAxisMatchRate"]
          : []),
        ...(perAxis.length === 0 ? ["deliveryCompliance.ux.perAxis"] : []),
      ],
      notes: ["legacy_style_compliance_metadata_incomplete"],
    });
  }

  const numericFailure =
    styleConsistencyScore < UX_AVG_THRESHOLD ||
    minAxisScore < UX_MIN_AXIS_THRESHOLD;
  const failed = flagRequestsLowUx && numericFailure;

  return {
    schemaVersion: UX_COMPLIANCE_GATE_SCHEMA_VERSION,
    basis: "stored_validation_meta",
    evaluated: true,
    status: failed ? "failed" : "passed",
    learningExclusion: failed,
    reasonCode: failed ? "LOW_UX_COMPLIANCE" : null,
    styleConsistencyScore,
    minAxisScore,
    thresholds: thresholds(),
    requestedAxes,
    perAxis,
    missingFields: [],
    notes: flagRequestsLowUx && !numericFailure
      ? ["legacy_low_ux_flag_without_numeric_threshold_failure"]
      : [],
  };
}

export function logLearningQualityGateDecision(
  payload: LearningQualityGateLogPayload,
) {
  const safePayload = {
    event: "learning_quality_gate_decision",
    ...payload,
  };

  console.info("[eduai.learning_quality_gate]", JSON.stringify(safePayload));
}
