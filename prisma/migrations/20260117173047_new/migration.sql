/*
  Warnings:

  - A unique constraint covering the columns `[userId,parentId,name]` on the table `Collection` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,collectionId,name]` on the table `Subject` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Collection_userId_parentId_name_key" ON "Collection"("userId", "parentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_userId_collectionId_name_key" ON "Subject"("userId", "collectionId", "name");
