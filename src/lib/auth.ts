import jwt from "jsonwebtoken";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

export async function getOrCreateUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return prisma.user.findFirst().then(async (user) => {
      if (user) return user;
      return prisma.user.create({
        data: {
          email: "demo@local",
          name: "Local Demo",
        },
      });
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  const externalId = payload.sub ?? payload.userId ?? "unknown";

  const existing = await prisma.user.findUnique({
    where: { externalId: String(externalId) },
  });

  if (existing) return existing;

  return prisma.user.create({
    data: {
      externalId: String(externalId),
      email: payload.email as string | undefined,
      name: (payload.name as string | undefined) ?? "User",
    },
  });
}
