import { z } from "zod";
import { llmChatJson } from "./llm/provider";
import { getActivePromptTemplate, renderPrompt } from "./prompts";
import { TAG_AXES, TAGS_BY_AXIS, TagAxisKey } from "./tags";

export type TaggingResult = Record<TagAxisKey, string>;

const TaggingSchema = z.object({
  tags: z.array(
    z.object({
      education_level: z.string(),
      tone: z.string(),
      style: z.string(),
      format: z.string(),
      depth: z.string(),
      cognitive_level: z.string(),
      task_type: z.string(),
      micro_complexity: z.string(),
      domain: z.string(),
      context: z.string(),
    }),
  ),
});

const allowedTagsByAxis: Record<TagAxisKey, string[]> = TAG_AXES.reduce(
  (acc, axis) => {
    acc[axis] = TAGS_BY_AXIS[axis].map((tag) => tag.key);
    return acc;
  },
  {} as Record<TagAxisKey, string[]>,
);

function normalizeTagging(raw: Record<string, string>): TaggingResult {
  const result = {} as TaggingResult;
  for (const axis of TAG_AXES) {
    const allowed = allowedTagsByAxis[axis];
    const value = raw[axis];
    if (value && allowed.includes(value)) {
      result[axis] = value;
    } else {
      result[axis] = allowed[0];
    }
  }
  return result;
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

  return response.tags.map((entry) => normalizeTagging(entry));
}
