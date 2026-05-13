import {
  normalizeSixFactorDecision,
  toMlSixFactorConfig,
  type EduAIAppSixFactorDecisionV1,
} from "@/lib/ml-six-factor-policy-contract";

export type SixFactorRenderPolicyV1 = {
  schemaVersion: "six_factor_render_policy_v1_2026_05";
  legacyDelivery: {
    difficulty_target: EduAIAppSixFactorDecisionV1["difficulty"];
    depth: EduAIAppSixFactorDecisionV1["depth"];
    tone: "formal";
    explanation_style: "concise" | "stepwise" | "exploratory";
    response_format: "mcq";
  };
  technicalTestResponseFormat: "mcq";
  sixFactorPromptInstructions: {
    difficulty: string;
    depth: string;
    supportLevel: string;
    presentationFormat: string;
    examplesLevel: string;
    terminologyLevel: string;
  };
  loggingPayload: {
    sixFactorConfig: ReturnType<typeof toMlSixFactorConfig>;
    decisionSource: EduAIAppSixFactorDecisionV1["decisionSource"];
    policyId: string | null;
    modelVersion: string | null;
    backendKind: string | null;
    fallbackUsed: boolean;
  };
};

function difficultyInstruction(
  value: EduAIAppSixFactorDecisionV1["difficulty"],
) {
  if (value === "easy") {
    return "Explain through basic concepts, use concrete wording, and avoid complex multi-step links unless each link is explicitly explained.";
  }
  if (value === "hard") {
    return "Use stronger challenge, require transfer or reasoning across concepts, and still include any prerequisite context needed to solve the task.";
  }
  return "Use moderate challenge: include one reasoning step beyond recall, but keep prerequisite context visible.";
}

function depthInstruction(value: EduAIAppSixFactorDecisionV1["depth"]) {
  if (value === "brief") {
    return "Limit explanation to the essential rule, 2-4 concise sentences or bullets, and omit extended derivations.";
  }
  if (value === "detailed") {
    return "Show intermediate reasoning, explain why each step follows, and include one common mistake or misconception when the output format allows it.";
  }
  return "Use enough detail to support the next task: state the rule, show the main reasoning step, and stop before unnecessary derivations.";
}

function supportInstruction(
  value: EduAIAppSixFactorDecisionV1["supportLevel"],
) {
  if (value === "minimal") {
    return "Give one guiding hint or cue before a full solution; when output text allows it, label the cue as \"Hint:\" inside the allowed response area.";
  }
  if (value === "scaffolded") {
    return "Break the explanation into numbered or clearly separated steps, and include at least one visible guided support element labeled \"Check:\", \"Hint:\", \"Mini-question:\", or \"Next step:\" inside the allowed response area.";
  }
  return "Guide the learner through 2-4 support steps and include at least one visible guided support element labeled \"Check:\", \"Hint:\", \"Mini-question:\", or \"Next step:\" inside the allowed response area.";
}

function presentationInstruction(
  value: EduAIAppSixFactorDecisionV1["presentationFormat"],
) {
  if (value === "paragraph") {
    return "Use compact paragraphs inside explanation or chat text; do not change required JSON keys or MCQ structure.";
  }
  if (value === "structured_list") {
    return "Use a structured list inside explanation or chat text; do not change required JSON keys or MCQ structure.";
  }
  if (value === "qa") {
    return "Use a question-and-answer explanation structure inside explanation or chat text; do not change required JSON keys or MCQ structure.";
  }
  return "Use a step-by-step explanation structure inside explanation or chat text; do not change required JSON keys or MCQ structure.";
}

function examplesInstruction(
  value: EduAIAppSixFactorDecisionV1["examplesLevel"],
) {
  if (value === "none") {
    return "Do not add extra examples; if an explanation is required, keep it rule-focused.";
  }
  if (value === "multiple") {
    return "Use 2-3 clearly marked examples, or one example plus one counterexample, when the output format has room for examples.";
  }
  return "Include exactly one visible example marker with one short example tied directly to the current subject/topic. In chat or free explanation text, label it \"Example:\". In learning_content JSON, follow the learning-content-specific rule and label the single dedicated section heading \"One example:\". Use the marker once and avoid extra example cues such as \"for example\", \"another example\", or additional example headings. If the learner request is underspecified, state the missing detail briefly, then still include one general topic-safe example when chat or explanation text allows it.";
}

function terminologyInstruction(
  value: EduAIAppSixFactorDecisionV1["terminologyLevel"],
) {
  if (value === "simple") {
    return "Use everyday wording; introduce only necessary subject terms and define each term at first use.";
  }
  if (value === "technical") {
    return "Use precise subject terms where useful and give a short definition at first use; avoid unrelated jargon.";
  }
  return "Use standard subject terminology and define terms only when they are needed for the current task.";
}

function explanationStyleForDecision(decision: EduAIAppSixFactorDecisionV1) {
  if (decision.presentationFormat === "qa") return "exploratory";
  if (decision.depth === "brief" && decision.supportLevel === "minimal") {
    return "concise";
  }
  return "stepwise";
}

export function buildSixFactorPromptInstructions(
  decision: EduAIAppSixFactorDecisionV1,
) {
  const normalized = normalizeSixFactorDecision(decision);
  return {
    difficulty: difficultyInstruction(normalized.difficulty),
    depth: depthInstruction(normalized.depth),
    supportLevel: supportInstruction(normalized.supportLevel),
    presentationFormat: presentationInstruction(normalized.presentationFormat),
    examplesLevel: examplesInstruction(normalized.examplesLevel),
    terminologyLevel: terminologyInstruction(normalized.terminologyLevel),
  } satisfies SixFactorRenderPolicyV1["sixFactorPromptInstructions"];
}

export function mapSixFactorDecisionToRenderPolicy(
  decision: EduAIAppSixFactorDecisionV1,
): SixFactorRenderPolicyV1 {
  const normalized = normalizeSixFactorDecision(decision);
  const sixFactorConfig = toMlSixFactorConfig(normalized);

  return {
    schemaVersion: "six_factor_render_policy_v1_2026_05",
    legacyDelivery: {
      difficulty_target: normalized.difficulty,
      depth: normalized.depth,
      tone: "formal",
      explanation_style: explanationStyleForDecision(normalized),
      response_format: "mcq",
    },
    technicalTestResponseFormat: "mcq",
    sixFactorPromptInstructions: buildSixFactorPromptInstructions(normalized),
    loggingPayload: {
      sixFactorConfig,
      decisionSource: normalized.decisionSource,
      policyId: normalized.policyId,
      modelVersion: normalized.modelVersion,
      backendKind: normalized.backendKind,
      fallbackUsed: normalized.fallbackUsed,
    },
  };
}
