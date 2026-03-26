import { PrismaClient } from "@prisma/client";
import { assertEnvInProduction } from "./env";

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

assertEnvInProduction("DATABASE_URL");

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
