import jwt from "jsonwebtoken";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return email.toLowerCase().endsWith("@eduai.com");
}

export function issueToken(payload: { sub: string; email?: string; name?: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export async function getUserFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "");
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  } catch {
    return null;
  }

  const externalId = payload.sub ?? payload.userId;
  if (!externalId) return null;

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
