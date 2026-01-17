import { prisma } from "./prisma";

const DEFAULT_TEMPLATES = [
  {
    key: "test_generation_v1",
    template:
      "You are a test generator. Return strict JSON: {\"title\": string, \"questions\": [{\"prompt\": string, \"options\": string[], \"answerIndex\": number, \"explanation\": string}]}",
  },
  {
    key: "chat_system_v1",
    template:
      "You are an educational assistant. Declared preferences: {{declared}}. Effective preferences: {{effective}}. Personalization ready: {{ready}}.",
  },
];

export async function ensurePromptTemplates() {
  const templates = await prisma.promptTemplate.findMany();
  if (templates.length > 0) return templates;

  const created = [];
  for (const template of DEFAULT_TEMPLATES) {
    const entry = await prisma.promptTemplate.create({ data: template });
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
