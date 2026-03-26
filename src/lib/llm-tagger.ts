import { z } from "zod";
import { llmChatJson } from "./llm/provider";
import { getActivePromptTemplate, renderPrompt } from "./prompts";
import { ALL_AXES, TAGS_BY_AXIS, TagAxisKey } from "./tags";

export type TaggingResult = Record<TagAxisKey, string>;
export type TaggingDiagnostics = {
  tags: TaggingResult | null;
  warnings: string[];
};

const TaggingSchema = z.object({
  tags: z.array(
    z.object({
      tone: z.string(),
      explanation_style: z.string(),
      response_format: z.string(),
      difficulty_target: z.string(),
      cognitive_process: z.string(),
      task_family: z.string(),
      context: z.string(),
    }),
  ),
});

const allowedTagsByAxis: Record<TagAxisKey, string[]> = ALL_AXES.reduce(
  (acc, axis) => {
    acc[axis] = TAGS_BY_AXIS[axis].map((tag) => tag.key);
    return acc;
  },
  {} as Record<TagAxisKey, string[]>,
);

function validateTagging(raw: Record<string, string>): TaggingDiagnostics {
  const warnings: string[] = [];
  const tags = {} as TaggingResult;

  for (const axis of ALL_AXES) {
    const allowed = allowedTagsByAxis[axis];
    const value = raw[axis];

    if (typeof value !== "string" || value.trim().length === 0) {
      warnings.push(`missing_${axis}`);
      continue;
    }

    if (!allowed.includes(value)) {
      warnings.push(`invalid_${axis}=${value}`);
      continue;
    }

    tags[axis] = value;
  }

  if (warnings.length > 0) {
    return { tags: null, warnings };
  }

  return { tags, warnings: [] };
}

export async function tagQuestionsWithLLM(
  questions: { prompt: string }[],
  model = "gpt-4o-mini",
) {
  const promptTemplate = await getActivePromptTemplate("tagger_v1");
  const axes = Object.entries(allowedTagsByAxis)
    .map(([axis, tags]) => `${axis}: ${tags.join(", ")}`)
    .join(" | ");

  const systemPrompt = renderPrompt(promptTemplate.template, {
    axes,
  });

  const response = await llmChatJson(
    {
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            questions: questions.map((question) => ({
              prompt: question.prompt,
            })),
          }),
        },
      ],
    },
    TaggingSchema,
  );

  return questions.map((_, index) => {
    const entry = response.tags[index];
    if (!entry) {
      return {
        tags: null,
        warnings: ["missing_question_tags"],
      };
    }
    return validateTagging(entry);
  });
}
