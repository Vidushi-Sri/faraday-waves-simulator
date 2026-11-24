import type { ApiError, CriticalRequest, CriticalResponse } from "./types";

// Base URL from the environment (handoff 8.3). In dev the default goes through
// the Vite proxy, so no host is hard-coded in application code.
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

/** A failed call, in plain language, with per-field messages when the API gave them. */
export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly fieldErrors: Record<string, string> = {},
    readonly errorId?: string,
  ) { super(message); }
}

/** Client-side ceiling, a little above the server's own SOLVE_TIMEOUT_S (50 s). */
export const CLIENT_TIMEOUT_MS = 90_000;

const UNREACHABLE = "The simulator could not be reached. Check your connection and try again.";
const TOO_SLOW = "The calculation took too long and was stopped. Try a smaller container or a weaker forcing.";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiFailure(UNREACHABLE, "UNREACHABLE");
  }
  if (res.ok) return res.json() as Promise<T>;
  let body: Partial<ApiError> = {};
  try { body = await res.json(); } catch { /* non-JSON error page, e.g. the dev proxy */ }
  // the hosting platform answers a run that hits its time limit with a plain 504 page
  if (!body.code && res.status === 504) throw new ApiFailure(TOO_SLOW, "TIMEOUT");
  if (!body.code && res.status >= 500) throw new ApiFailure(UNREACHABLE, "UNREACHABLE");
  throw new ApiFailure(
    body.message ?? "The calculation could not be completed.",
    body.code ?? `HTTP_${res.status}`,
    body.field_errors ?? {},
    body.error_id,
  );
}

export const api = {
  health: (signal?: AbortSignal) =>
    request<{ status: string; api_version: string; solver: { module: string; repo_commit: string | null } }>("/health", { signal }),
  critical: (req: CriticalRequest, signal?: AbortSignal) =>
    request<CriticalResponse>("/phase1/critical", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req), signal,
    }),
};
