import type { ActorContext } from "@/types";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1"
).replace(/\/+$/, "");

export const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1$/, "");

export class ApiError extends Error {
  status: number;
  code: string;
  detail: string;

  constructor(status: number, detail: string, code = "api_error") {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export function buildQueryString(params?: QueryParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : "";
}

function actorHeaders(actor: ActorContext): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Role": actor.role,
  };
  if (actor.user_id) {
    headers["X-User-Id"] = actor.user_id;
  }
  return headers;
}

function parseErrorPayload(payload: unknown, fallbackStatus: number): { detail: string; code: string } {
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const code = typeof obj.code === "string" ? obj.code : `http_${fallbackStatus}`;
    if (typeof obj.detail === "string") {
      return { detail: obj.detail, code };
    }
    if (Array.isArray(obj.detail)) {
      const messages = obj.detail
        .map((item) => {
          if (item && typeof item === "object") {
            const rec = item as Record<string, unknown>;
            const loc = Array.isArray(rec.loc) ? rec.loc.slice(1).join(".") : "";
            const msg = typeof rec.msg === "string" ? rec.msg : JSON.stringify(rec);
            return loc ? `${loc}: ${msg}` : msg;
          }
          return String(item);
        })
        .join("; ");
      return { detail: messages || "Validation failed.", code: "validation_error" };
    }
  }
  return {
    detail: `Request failed with HTTP ${fallbackStatus}.`,
    code: `http_${fallbackStatus}`,
  };
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  actor: ActorContext;
  params?: QueryParams;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const { method = "GET", actor, params, body, formData, signal } = options;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}${buildQueryString(params)}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...actorHeaders(actor),
  };

  let fetchBody: BodyInit | undefined;
  if (formData) {
    fetchBody = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchBody = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: fetchBody,
      signal,
      cache: "no-store",
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? `Cannot reach FastAPI backend at ${API_BASE_URL} (${err.message}).`
        : `Cannot reach FastAPI backend at ${API_BASE_URL}.`;
    throw new ApiError(0, message, "network_error");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  let parsed: unknown = null;
  if (contentType.includes("application/json")) {
    parsed = await response.json().catch(() => null);
  } else {
    const text = await response.text().catch(() => "");
    parsed = text ? { detail: text } : null;
  }

  if (!response.ok) {
    const { detail, code } = parseErrorPayload(parsed, response.status);
    throw new ApiError(response.status, detail, code);
  }

  return parsed as T;
}

export interface HealthStatus {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export async function checkHealth(): Promise<HealthStatus> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_ORIGIN}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) {
      return { ok: false, latencyMs, message: `HTTP ${res.status}` };
    }
    return { ok: true, latencyMs, message: "Connected" };
  } catch {
    return { ok: false, latencyMs: 0, message: "Offline" };
  }
}
