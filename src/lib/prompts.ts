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
      "You are a tagging assistant. Assign exactly one tag per axis for each question. Axes and allowed tags: {{axes}}. Return strict JSON: {\"tags\": [{\"tone\": string, \"explanation_style\": string, \"response_format\": string, \"difficulty_target\": string, \"cognitive_process\": string, \"task_family\": string, \"context\": string}]}",
  },
];

export async function ensurePromptTemplates() {
  for (const template of DEFAULT_TEMPLATES) {
    const active = await prisma.promptTemplate.findFirst({
      where: { key: template.key, isActive: true },
      orderBy: { version: "desc" },
    });
    if (active) continue;

    const existing = await prisma.promptTemplate.findFirst({
      where: { key: template.key, version: 1 },
    });

    if (existing) {
      await prisma.promptTemplate.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
      continue;
    }

    await prisma.promptTemplate.create({
      data: {
        key: template.key,
        version: 1,
        template: template.template,
        isActive: true,
      },
    });
  }

  return prisma.promptTemplate.findMany({
    where: { key: { in: DEFAULT_TEMPLATES.map((template) => template.key) } },
    orderBy: [{ key: "asc" }, { version: "desc" }],
  });
}

export async function getActivePromptTemplate(key: string) {
  const templates = await ensurePromptTemplates();
  const match = templates.find(
    (template) => template.key === key && template.isActive,
  );
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
