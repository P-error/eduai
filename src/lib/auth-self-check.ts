import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as meRoute } from "@/app/api/users/me/route";

type SessionState = {
  cookieHeader: string | null;
  ip: string;
};

type DispatchInit = Omit<RequestInit, "body"> & {
  body?: unknown;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeRequestBody(body: unknown): BodyInit | undefined {
  if (body == null) {
    return undefined;
  }

  if (
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  ) {
    return body as BodyInit;
  }

  return JSON.stringify(body);
}

function buildRequest(path: string, session: SessionState, init?: DispatchInit) {
  const url = new URL(path, "http://localhost");
  const headers = new Headers(init?.headers);
  headers.set("x-forwarded-for", session.ip);

  if (session.cookieHeader) {
    headers.set("cookie", session.cookieHeader);
  }

  const body = normalizeRequestBody(init?.body);
  if (body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Request(url.toString(), {
    ...init,
    headers,
    body,
  });
}

function readSetCookie(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie().join(", ");
  }
  return response.headers.get("set-cookie");
}

function updateSessionFromResponse(session: SessionState, response: Response) {
  const setCookie = readSetCookie(response);
  if (!setCookie) {
    return;
  }

  const match = setCookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]*)`));
  if (!match) {
    return;
  }

  const value = decodeURIComponent(match[1] ?? "");
  session.cookieHeader =
    value.length > 0 ? `${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}` : null;
}

async function dispatchRoute(
  session: SessionState,
  path: string,
  init?: DispatchInit,
) {
  const request = buildRequest(path, session, init);
  const url = new URL(request.url);
  const method = (init?.method ?? "GET").toUpperCase();

  let response: Response;

  if (method === "POST" && url.pathname === "/api/auth/register") {
    response = await registerRoute(request);
  } else if (method === "POST" && url.pathname === "/api/auth/login") {
    response = await loginRoute(request);
  } else if (method === "POST" && url.pathname === "/api/auth/logout") {
    response = await logoutRoute();
  } else if (method === "GET" && url.pathname === "/api/users/me") {
    response = await meRoute(request);
  } else {
    throw new Error(`Unhandled auth self-check route: ${method} ${url.pathname}`);
  }

  updateSessionFromResponse(session, response);
  return response;
}

async function responseJson<T>(response: Response) {
  return (await response.json()) as T;
}

async function cleanupUserByEmail(email: string) {
  await prisma.user.deleteMany({
    where: { email },
  });
}

export async function runAuthSelfCheck() {
  const stamp = Date.now();
  const email = `auth-self-check-${stamp}@eduai.local`;
  const password = `AuthSelfCheck!${stamp}`;
  const session: SessionState = {
    cookieHeader: null,
    ip: `198.51.100.${(stamp % 200) + 1}`,
  };

  await cleanupUserByEmail(email);

  try {
    const invalidRegisterResponse = await dispatchRoute(session, "/api/auth/register", {
      method: "POST",
      body: {
        email: "bad",
        password: "short",
      },
    });
    assert(invalidRegisterResponse.status === 400, "invalid register must return 400");

    const registerResponse = await dispatchRoute(session, "/api/auth/register", {
      method: "POST",
      body: {
        email,
        password,
        name: "Auth Self Check",
        researchConsent: true,
      },
    });
    assert(registerResponse.ok, "register route must succeed");
    const registerPayload = await responseJson<{ user: { email: string | null } }>(
      registerResponse,
    );
    assert(registerPayload.user.email === email, "registered email must match input");
    assert(Boolean(session.cookieHeader), "register must issue session cookie");

    const meAfterRegister = await dispatchRoute(session, "/api/users/me");
    assert(meAfterRegister.ok, "registered user must be authorized");
    const meAfterRegisterPayload = await responseJson<{ email: string | null }>(
      meAfterRegister,
    );
    assert(meAfterRegisterPayload.email === email, "me after register must match email");

    const duplicateRegisterResponse = await dispatchRoute(session, "/api/auth/register", {
      method: "POST",
      body: {
        email,
        password,
        name: "Auth Self Check Duplicate",
      },
    });
    assert(duplicateRegisterResponse.status === 409, "duplicate email must return 409");

    const logoutResponse = await dispatchRoute(session, "/api/auth/logout", {
      method: "POST",
    });
    assert(logoutResponse.ok, "logout route must succeed");
    assert(session.cookieHeader == null, "logout must clear session cookie");

    const meAfterLogout = await dispatchRoute(session, "/api/users/me");
    assert(meAfterLogout.status === 401, "logged out user must lose access");

    const invalidLoginResponse = await dispatchRoute(session, "/api/auth/login", {
      method: "POST",
      body: {
        identifier: "bad",
        password: "short",
      },
    });
    assert(invalidLoginResponse.status === 400, "invalid login must return 400");

    const wrongPasswordResponse = await dispatchRoute(session, "/api/auth/login", {
      method: "POST",
      body: {
        identifier: email,
        password: `${password}-wrong`,
      },
    });
    assert(wrongPasswordResponse.status === 401, "wrong password must return 401");

    const loginResponse = await dispatchRoute(session, "/api/auth/login", {
      method: "POST",
      body: {
        identifier: email,
        password,
      },
    });
    assert(loginResponse.ok, "login route must succeed");
    assert(Boolean(session.cookieHeader), "login must restore session cookie");

    const meAfterLogin = await dispatchRoute(session, "/api/users/me");
    assert(meAfterLogin.ok, "logged in user must regain access");
    const meAfterLoginPayload = await responseJson<{ email: string | null }>(meAfterLogin);
    assert(meAfterLoginPayload.email === email, "me after login must match email");

    return {
      ok: true,
      email,
      checks: [
        "invalid register -> 400",
        "register -> 200 + cookie",
        "duplicate email -> 409",
        "logout -> cookie cleared",
        "me after logout -> 401",
        "invalid login -> 400",
        "wrong password -> 401",
        "login -> 200 + cookie",
        "me after login -> 200",
      ],
    };
  } finally {
    await cleanupUserByEmail(email);
  }
}
