import { prisma } from "./prisma";

const DEFAULT_TEMPLATES = [
  {
    key: "test_generation_v1",
    template:
      "You are a test generator. Personalization ready: {{ready}}. Declared preferences: {{declared}}. Effective preferences: {{effective}}. Return strict JSON: {\"title\": string, \"questions\": [{\"prompt\": string, \"options\": string[], \"answerIndex\": number, \"explanation\": string}]}",
  },
  {
    key: "chat_system_v1",
    template:
      "You are an educational assistant. Declared preferences: {{declared}}. Effective preferences: {{effective}}. Personalization ready: {{ready}}.",
  },
  {
    key: "tagger_v1",
    template:
      "You are a tagging assistant. Assign exactly one tag per axis for each question. Axes and allowed tags: {{axes}}. Return strict JSON: {\"tags\": [{\"education_level\": string, \"tone\": string, \"style\": string, \"format\": string, \"depth\": string, \"cognitive_level\": string, \"task_type\": string, \"micro_complexity\": string, \"domain\": string, \"context\": string}]}",
  },
];

export async function ensurePromptTemplates() {
  const created = [];
  for (const template of DEFAULT_TEMPLATES) {
    const entry = await prisma.promptTemplate.upsert({
      where: { key: template.key },
      update: { template: template.template },
      create: template,
    });
    created.push(entry);
  }
  return created;
}

export async function getPromptTemplate(key: string) {
  const templates = await ensurePromptTemplates();
  const match = templates.find((template) => template.key === key);
  if (!match) {
    throw new Error(`Missing prompt template: ${key}`);
  }
  return match;
}

export function renderPrompt(
  template: string,
  vars: Record<string, string | boolean>,
) {
  return Object.keys(vars).reduce((acc, key) => {
    return acc.replaceAll(`{{${key}}}`, String(vars[key]));
  }, template);
}
