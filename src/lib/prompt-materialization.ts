import type {
  LearningContentGenerationPackage,
  TestGenerationPackage,
} from "@/lib/episode-generation";
import type {
  SixFactorPedagogicalPromptProfileV1,
} from "@/lib/ml-six-factor-render-mapping";

export type ExternalPriorTestOutcomeSummary = {
  accuracy: number | null;
  questionCount: number | null;
  totalDurationMs: number | null;
};

export type ExternalLearningContext = {
  subjectTitle: string;
  sectionPath: string | null;
  topic: string;
  conceptKey: string | null;
  skillKey: string | null;
  priorTestOutcome?: ExternalPriorTestOutcomeSummary | null;
};

export type ExternalLegacyPedagogicalTargets = {
  difficulty: string;
  depth: string;
  rendering: {
    tone: string;
    explanationStyle: string;
    responseFormat: string;
  };
};

export type ExternalLearningContentTaskPackage = {
  task: "generate_learning_content_card";
  outputContract: {
    kind: "learning_content_card";
    schemaVersion: string;
    returnJsonOnly: true;
    noMarkdown: true;
    sectionsCount: {
      min: 2;
      max: 4;
    };
  };
  learningContext: ExternalLearningContext;
  pedagogicalProfile: SixFactorPedagogicalPromptProfileV1 | ExternalLegacyPedagogicalTargets;
  constraints: {
    doNotInventMissingContext: true;
    stayInsideTopic: true;
    schemaOverridesStyle: true;
  };
};

export type ExternalTestGenerationTaskPackage = {
  task: "generate_mcq_test";
  outputContract: {
    kind: "mcq_test";
    schema: "TestSchema";
    questionCount: number;
    mode: TestGenerationPackage["mode"];
    returnJsonOnly: true;
    noMarkdown: true;
    preserveMcqStructure: true;
  };
  learningContext: Omit<ExternalLearningContext, "priorTestOutcome">;
  pedagogicalProfile: SixFactorPedagogicalPromptProfileV1 | ExternalLegacyPedagogicalTargets;
  constraints: {
    noExtraKeys: true;
    doNotChangeQuestionCount: true;
    answerIndexMustMatchCorrectOption: true;
    supportAndExampleRulesAffectPromptOrExplanationOnly: true;
  };
};

function sanitizeNullableText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function learningContextFromPackage(
  packageInput: LearningContentGenerationPackage | TestGenerationPackage,
) {
  return {
    subjectTitle: packageInput.scope.subjectTitle,
    sectionPath: sanitizeNullableText(packageInput.scope.sectionPath),
    topic: packageInput.scope.topic,
    conceptKey: sanitizeNullableText(packageInput.scope.conceptKey),
    skillKey: sanitizeNullableText(packageInput.scope.skillKey),
  };
}

function priorOutcomeSummary(
  packageInput: LearningContentGenerationPackage,
): ExternalPriorTestOutcomeSummary | null {
  if (!packageInput.priorTestOutcome) return null;

  return {
    accuracy: packageInput.priorTestOutcome.accuracy,
    questionCount: packageInput.priorTestOutcome.questionCount,
    totalDurationMs: packageInput.priorTestOutcome.totalDurationMs,
  };
}

function legacyPedagogicalTargets(
  packageInput: LearningContentGenerationPackage | TestGenerationPackage,
): ExternalLegacyPedagogicalTargets {
  return {
    difficulty: packageInput.pedagogicalDecision.difficulty,
    depth: packageInput.pedagogicalDecision.depth,
    rendering: {
      tone: packageInput.rendering.tone,
      explanationStyle: packageInput.rendering.explanationStyle,
      responseFormat: packageInput.rendering.responseFormat,
    },
  };
}

export function buildExternalLearningContentTaskPackage(
  packageInput: LearningContentGenerationPackage,
  sixFactorProfile?: SixFactorPedagogicalPromptProfileV1 | null,
): ExternalLearningContentTaskPackage {
  return {
    task: "generate_learning_content_card",
    outputContract: {
      kind: "learning_content_card",
      schemaVersion: packageInput.outputContract.schemaVersion,
      returnJsonOnly: true,
      noMarkdown: true,
      sectionsCount: {
        min: 2,
        max: 4,
      },
    },
    learningContext: {
      ...learningContextFromPackage(packageInput),
      priorTestOutcome: priorOutcomeSummary(packageInput),
    },
    pedagogicalProfile: sixFactorProfile ?? legacyPedagogicalTargets(packageInput),
    constraints: {
      doNotInventMissingContext: true,
      stayInsideTopic: true,
      schemaOverridesStyle: true,
    },
  };
}

export function buildExternalTestGenerationTaskPackage(
  packageInput: TestGenerationPackage,
  sixFactorProfile?: SixFactorPedagogicalPromptProfileV1 | null,
): ExternalTestGenerationTaskPackage {
  return {
    task: "generate_mcq_test",
    outputContract: {
      kind: "mcq_test",
      schema: packageInput.outputContract.schema,
      questionCount: packageInput.questionCount,
      mode: packageInput.mode,
      returnJsonOnly: true,
      noMarkdown: true,
      preserveMcqStructure: true,
    },
    learningContext: learningContextFromPackage(packageInput),
    pedagogicalProfile: sixFactorProfile ?? legacyPedagogicalTargets(packageInput),
    constraints: {
      noExtraKeys: true,
      doNotChangeQuestionCount: true,
      answerIndexMustMatchCorrectOption: true,
      supportAndExampleRulesAffectPromptOrExplanationOnly: true,
    },
  };
}
