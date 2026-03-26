import jwt from "jsonwebtoken";
import { prisma } from "./prisma";
import { AUTH_COOKIE_NAME } from "./auth-constants";
import { requireEnvWithDevFallback } from "./env";

const JWT_SECRET = requireEnvWithDevFallback("JWT_SECRET", "dev-secret");

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return email.toLowerCase().endsWith("@eduai.com");
}

export function issueToken(payload: { sub: string; email?: string; name?: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

function parseBearerToken(authHeader: string | null) {
  if (!authHeader) return null;
  const [scheme, value] = authHeader.trim().split(/\s+/, 2);
  if (!scheme || !value) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return value;
}

function parseCookieToken(cookieHeader: string | null) {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");
    if (rawName !== AUTH_COOKIE_NAME) continue;
    const rawValue = rawValueParts.join("=");
    if (!rawValue) return null;
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

function parseJwtPayload(token: string) {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  } catch {
    return null;
  }
  return payload;
}

async function resolveUserFromPayload(payload: jwt.JwtPayload) {
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

export async function getUserFromToken(token?: string | null) {
  if (!token) return null;
  const payload = parseJwtPayload(token);
  if (!payload) return null;
  return resolveUserFromPayload(payload);
}

export async function getUserFromRequest(request: Request) {
  const token =
    parseBearerToken(request.headers.get("authorization")) ??
    parseCookieToken(request.headers.get("cookie"));
  return getUserFromToken(token);
}

export async function getAdminFromRequest(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user || !user.isAdmin) {
    return null;
  }
  return user;
}
