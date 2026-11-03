import { resolveApiBaseUrl } from "./api-url";

export type Session = { user: { id: string; username: string } };

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const baseUrl = resolveApiBaseUrl(
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000",
    typeof window === "undefined" ? undefined : window.location.origin,
  );
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/api/auth/login"))
      window.dispatchEvent(new Event("issueflow:unauthorized"));
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      typeof error.detail === "string"
        ? error.detail
        : "Could not complete the request. Please try again.",
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
