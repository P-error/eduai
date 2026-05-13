export const DEMO_ROUTE = "/demo";
export const DEMO_USER_NAME = "Alex Carter";

export type DemoSurface = "profile" | "learn" | "practice" | "analytics" | "topics";

export type DemoSceneId =
  | "profile-start"
  | "topics"
  | "practice-baseline"
  | "learn"
  | "montage"
  | "profile-updated"
  | "practice-adapted"
  | "analytics";

export type DemoScene = {
  id: DemoSceneId;
  surface: DemoSurface;
  label: string;
  title: string;
  caption: string;
  durationMs: number;
};

export type DemoPreferenceRow = {
  label: string;
  value: string;
};

export type DemoObservationRow = {
  label: string;
  value: string;
  tone?: "neutral" | "primary" | "success" | "warning";
};

export type DemoProfileSnapshot = {
  account: DemoPreferenceRow[];
  accessibility: DemoPreferenceRow[];
  declaredPreferences: DemoPreferenceRow[];
  systemObservations: DemoObservationRow[];
};

export type DemoPracticeSnapshot = {
  mode: "Core" | "Custom";
  topic: string;
  activeSettings: DemoPreferenceRow[];
  prompt: string;
  sessionSummary: DemoObservationRow[];
};

export type DemoLearnMessage = {
  speaker: "Alex" | "EduAI";
  role: "learner" | "system";
  variant?: "initial" | "adapted";
  body: string;
};

export type DemoAnalyticsBlock = {
  title: string;
  items: DemoObservationRow[];
};

export type DemoTopicNode = {
  label: string;
  children: DemoTopicNode[];
};

export const DEMO_SCENES: DemoScene[] = [
  {
    id: "profile-start",
    surface: "profile",
    label: "Scene 1",
    title: "Profile",
    caption:
      "The learner starts with self-declared preferences. The system uses them as an initial prior, not as ground truth.",
    durationMs: 4200,
  },
  {
    id: "topics",
    surface: "topics",
    label: "Scene 2",
    title: "Topics",
    caption:
      "Canonical topics drive the main analytics and recommendation loop.",
    durationMs: 3200,
  },
  {
    id: "practice-baseline",
    surface: "practice",
    label: "Scene 3",
    title: "Practice",
    caption:
      "Initial settings are too aggressive for the learner's current mastery level.",
    durationMs: 4300,
  },
  {
    id: "learn",
    surface: "learn",
    label: "Scene 4",
    title: "Learn",
    caption:
      "Guided explanations work better for this learner than the original concise high-difficulty setting.",
    durationMs: 5000,
  },
  {
    id: "montage",
    surface: "learn",
    label: "Scene 5",
    title: "Fast-forward",
    caption:
      "Several additional episodes provide stronger evidence for adaptation without showing a full manual walkthrough.",
    durationMs: 3600,
  },
  {
    id: "profile-updated",
    surface: "profile",
    label: "Scene 6",
    title: "Profile update",
    caption:
      "System observations change as evidence accumulates. Declared settings remain intact.",
    durationMs: 3800,
  },
  {
    id: "practice-adapted",
    surface: "practice",
    label: "Scene 7",
    title: "Practice",
    caption:
      "After adapting difficulty and depth, both immediate and holdout performance improve.",
    durationMs: 4200,
  },
  {
    id: "analytics",
    surface: "analytics",
    label: "Scene 8",
    title: "Analytics",
    caption:
      "Recommendations are based on observed learning performance, not declared preferences alone.",
    durationMs: 0,
  },
];

export const DEFAULT_DEMO_SCENE_ID = DEMO_SCENES[0].id;

export const DEMO_NAV_TARGETS: Record<DemoSurface, DemoSceneId> = {
  profile: "profile-start",
  learn: "learn",
  practice: "practice-baseline",
  analytics: "analytics",
  topics: "topics",
};

export const DEMO_PROFILE_INITIAL: DemoProfileSnapshot = {
  account: [
    { label: "Learner", value: "Alex Carter" },
    { label: "Education level", value: "Upper secondary" },
    { label: "Main goal", value: "Improve algebra problem solving" },
    { label: "Tracked path", value: "Mathematics -> Algebra -> Quadratic Equations" },
  ],
  accessibility: [
    { label: "Reading comfort", value: "Standard contrast" },
    { label: "Interaction style", value: "Reduced distractions" },
    { label: "Input support", value: "Keyboard-friendly controls" },
  ],
  declaredPreferences: [
    { label: "Tone", value: "Formal" },
    { label: "Explanation style", value: "Concise" },
    { label: "Preferred difficulty", value: "High" },
    { label: "Preferred depth", value: "Brief" },
  ],
  systemObservations: [
    { label: "Confidence", value: "Low", tone: "warning" },
    { label: "Effective difficulty", value: "Not established", tone: "neutral" },
    { label: "Effective depth", value: "Not established", tone: "neutral" },
    { label: "Effective tone", value: "Not established", tone: "neutral" },
  ],
};

export const DEMO_PROFILE_UPDATED: DemoProfileSnapshot = {
  ...DEMO_PROFILE_INITIAL,
  systemObservations: [
    { label: "Confidence", value: "Medium", tone: "primary" },
    { label: "Effective difficulty", value: "Medium", tone: "success" },
    { label: "Effective depth", value: "Guided", tone: "success" },
    { label: "Effective tone", value: "Friendly-neutral", tone: "success" },
  ],
};

export const DEMO_TOPIC_PATH: DemoTopicNode[] = [
  {
    label: "Mathematics",
    children: [
      {
        label: "Algebra",
        children: [{ label: "Quadratic Equations", children: [] }],
      },
    ],
  },
];

export const DEMO_PRACTICE_BASELINE: DemoPracticeSnapshot = {
  mode: "Core",
  topic: "Quadratic Equations",
  activeSettings: [
    { label: "Difficulty", value: "High" },
    { label: "Depth support", value: "Brief" },
    { label: "Tone", value: "Formal" },
  ],
  prompt:
    "Solve x^2 - 5x + 6 = 0 and justify whether factoring or the discriminant is the better method.",
  sessionSummary: [
    { label: "Questions", value: "6" },
    { label: "Correct", value: "2/6", tone: "warning" },
    { label: "Accuracy", value: "33%", tone: "warning" },
    { label: "Holdout", value: "1/3", tone: "warning" },
    { label: "Signs of struggle", value: "High", tone: "warning" },
  ],
};

export const DEMO_PRACTICE_ADAPTED: DemoPracticeSnapshot = {
  mode: "Core",
  topic: "Quadratic Equations",
  activeSettings: [
    { label: "Difficulty", value: "Medium" },
    { label: "Depth support", value: "Guided" },
    { label: "Tone", value: "Friendly-neutral" },
  ],
  prompt:
    "Choose the best method for x^2 - 5x + 6 = 0, then explain why that method is efficient before solving.",
  sessionSummary: [
    { label: "Questions", value: "6" },
    { label: "Correct", value: "5/6", tone: "success" },
    { label: "Accuracy", value: "83%", tone: "success" },
    { label: "Holdout", value: "3/3", tone: "success" },
    { label: "Response time", value: "Lower", tone: "success" },
    { label: "Struggle", value: "Reduced", tone: "success" },
  ],
};

export const DEMO_LEARN_DIALOGUE: DemoLearnMessage[] = [
  {
    speaker: "Alex",
    role: "learner",
    body: "I don't understand when to use the discriminant and when factoring is enough.",
  },
  {
    speaker: "EduAI",
    role: "system",
    variant: "initial",
    body:
      "Factoring is efficient when integer factors are evident. Use the discriminant when that structure is not immediately visible.",
  },
  {
    speaker: "Alex",
    role: "learner",
    body: "Can you explain this step by step with an example?",
  },
  {
    speaker: "EduAI",
    role: "system",
    variant: "adapted",
    body:
      "Let's compare both methods on x^2 - 5x + 6 = 0. First check whether two numbers multiply to 6 and add to -5. They do: -2 and -3, so factoring works quickly. If that check fails, compute the discriminant b^2 - 4ac to decide whether factoring is likely to help.",
  },
];

export const DEMO_MONTAGE = {
  title: "4 additional learning episodes completed",
  counters: [
    { label: "Episodes completed", from: 1, to: 5 },
    { label: "Core practice sets", from: 1, to: 5 },
    { label: "Holdout checks", from: 1, to: 5 },
  ],
  chips: [
    "Guided explanations retained",
    "Difficulty lowered to medium",
    "Response time improved",
    "Holdout accuracy improving",
  ],
};

export const DEMO_ANALYTICS_BLOCKS: DemoAnalyticsBlock[] = [
  {
    title: "Progress",
    items: [
      {
        label: "Path",
        value: "Mathematics -> Algebra -> Quadratic Equations",
      },
      {
        label: "Trend",
        value: "33% -> 58% -> 83%",
        tone: "success",
      },
    ],
  },
  {
    title: "Strong and weak components",
    items: [
      { label: "Stronger", value: "Factoring", tone: "success" },
      {
        label: "Still weaker",
        value: "Method selection and discriminant interpretation",
        tone: "warning",
      },
    ],
  },
  {
    title: "Current system observations",
    items: [
      { label: "Effective difficulty", value: "Medium", tone: "success" },
      { label: "Effective depth", value: "Guided", tone: "success" },
      { label: "Tone estimate", value: "Friendly-neutral", tone: "success" },
      { label: "Confidence", value: "Medium", tone: "primary" },
    ],
  },
  {
    title: "Recommendations",
    items: [
      { label: "Keep", value: "Guided explanations", tone: "success" },
      {
        label: "Core sessions",
        value: "Stay at medium difficulty",
        tone: "success",
      },
      {
        label: "Increase only after",
        value: "Stable holdout improvement",
        tone: "primary",
      },
      { label: "Next focus", value: "Method selection", tone: "primary" },
    ],
  },
];

export function isDemoPath(pathname: string | null | undefined) {
  return pathname === DEMO_ROUTE;
}

export function isDemoSceneId(value: string | null): value is DemoSceneId {
  return DEMO_SCENES.some((scene) => scene.id === value);
}

export function getDemoSceneById(sceneId: DemoSceneId) {
  return DEMO_SCENES.find((scene) => scene.id === sceneId) ?? DEMO_SCENES[0];
}

export function demoSceneHref(sceneId: DemoSceneId) {
  return `${DEMO_ROUTE}?scene=${sceneId}`;
}
