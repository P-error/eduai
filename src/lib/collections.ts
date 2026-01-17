import { prisma } from "@/lib/prisma";
import { DEFAULT_COLLECTION_NAME } from "@/lib/collection-constants";

export async function ensureDefaultCollection(userId: string) {
  const legacy = await prisma.collection.findFirst({
    where: {
      userId,
      parentId: null,
      name: "Unassigned",
    },
  });

  if (legacy) {
    return prisma.collection.update({
      where: { id: legacy.id },
      data: { name: DEFAULT_COLLECTION_NAME },
    });
  }

  const existing = await prisma.collection.findFirst({
    where: {
      userId,
      parentId: null,
      name: DEFAULT_COLLECTION_NAME,
    },
  });

  if (existing) return existing;

  return prisma.collection.create({
    data: {
      userId,
      name: DEFAULT_COLLECTION_NAME,
      parentId: null,
      sortOrder: 0,
    },
  });
}
