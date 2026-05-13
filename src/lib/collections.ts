import { prisma } from "@/lib/prisma";
import {
  DEFAULT_COLLECTION_NAME,
  isDefaultCollectionName,
} from "@/lib/collection-constants";

export async function ensureDefaultCollection(userId: string) {
  const rootCollections = await prisma.collection.findMany({
    where: {
      userId,
      parentId: null,
    },
    orderBy: { createdAt: "asc" },
  });

  const existing = rootCollections.find((collection) =>
    isDefaultCollectionName(collection.name),
  );

  if (existing) {
    return prisma.collection.update({
      where: { id: existing.id },
      data: { name: DEFAULT_COLLECTION_NAME },
    });
  }

  return prisma.collection.create({
    data: {
      userId,
      name: DEFAULT_COLLECTION_NAME,
      parentId: null,
      sortOrder: 0,
    },
  });
}
