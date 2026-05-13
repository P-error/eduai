import jwt from "jsonwebtoken";
import { prisma } from "./prisma";
import { AUTH_COOKIE_NAME } from "./auth-constants";
import { requireEnvWithDevFallback } from "./env";

const JWT_SECRET = requireEnvWithDevFallback("JWT_SECRET", "dev-secret");

type AuthTokenPayload = {
  sub: string;
  ver: 1;
  type: "user_session";
};

export function issueToken(payload: { userId: string }) {
  return jwt.sign(
    {
      sub: payload.userId,
      ver: 1,
      type: "user_session",
    } satisfies AuthTokenPayload,
    JWT_SECRET,
    { expiresIn: "30d" },
  );
}

export function buildAuthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export function clearAuthCookie(response: {
  cookies: {
    set: (
      name: string,
      value: string,
      options: ReturnType<typeof buildAuthCookieOptions> & { maxAge: number },
    ) => void;
  };
}) {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    ...buildAuthCookieOptions(),
    maxAge: 0,
  });
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
  let payload: jwt.JwtPayload | string;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
  if (!payload || typeof payload === "string") {
    return null;
  }
  return payload;
}

async function resolveUserFromPayload(payload: jwt.JwtPayload) {
  const subject = typeof payload.sub === "string" ? payload.sub : null;
  if (!subject) return null;

  if (payload.ver === 1 && payload.type === "user_session") {
    return prisma.user.findUnique({
      where: { id: subject },
    });
  }
  return null;
}

export async function getUserFromToken(token?: string | null) {
  if (!token) return null;
  const payload = parseJwtPayload(token);
  if (!payload) return null;
  return resolveUserFromPayload(payload);
}

export async function getUserFromRequest(request: Request) {
  const token = parseCookieToken(request.headers.get("cookie"));
  return getUserFromToken(token);
}

export async function getAdminFromRequest(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user || !user.isAdmin) {
    return null;
  }
  return user;
}
