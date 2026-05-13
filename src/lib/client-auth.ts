type CurrentUserPayload = {
  id: string;
  email?: string | null;
  name?: string | null;
  isAdmin?: boolean;
};

export async function authFetch(input: RequestInfo, init?: RequestInit) {
  return fetch(input, {
    ...init,
    credentials: "same-origin",
  });
}

export async function fetchCurrentUser() {
  const response = await authFetch("/api/users/me");
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as CurrentUserPayload;
}

export async function logoutUser() {
  await authFetch("/api/auth/logout", {
    method: "POST",
  });
}
