import { prisma } from "./prisma";
import { TAGS_BY_AXIS, TAG_LEGEND_VERSION } from "./tags";

export async function ensureTagLegend() {
  await prisma.tagLegendVersion.upsert({
    where: { version: TAG_LEGEND_VERSION },
    update: {},
    create: { version: TAG_LEGEND_VERSION },
  });

  for (const [axisKey, tags] of Object.entries(TAGS_BY_AXIS)) {
    const axis = await prisma.tagAxis.upsert({
      where: { key: axisKey },
      update: {},
      create: {
        key: axisKey,
        name: axisKey.replace(/_/g, " "),
      },
    });

    for (const tag of tags) {
      await prisma.tag.upsert({
        where: {
          axisId_key: {
            axisId: axis.id,
            key: tag.key,
          },
        },
        update: { label: tag.label },
        create: {
          axisId: axis.id,
          key: tag.key,
          label: tag.label,
        },
      });
    }
  }
}
