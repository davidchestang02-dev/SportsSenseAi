import type { Env } from "./types";

export function json(data: unknown, status = 200, env?: Env): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(env)
    }
  });
}

export function notFound(message = "Not found", env?: Env): Response {
  return json({ error: message }, 404, env);
}

export function methodNotAllowed(env?: Env): Response {
  return json({ error: "Method not allowed" }, 405, env);
}

export function withError(error: unknown, env?: Env): Response {
  const message = error instanceof Error ? error.message : "Unknown error";
  return json({ error: message }, 500, env);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function americanFromProbability(probability: number): number {
  const p = clamp(probability, 0.01, 0.99);
  if (p >= 0.5) {
    return Math.round((-100 * p) / (1 - p));
  }
  return Math.round((100 * (1 - p)) / p);
}

export function probabilityFromAmerican(american: number): number {
  if (american < 0) {
    return round(-american / (-american + 100), 4);
  }
  return round(100 / (american + 100), 4);
}

export function decimalFromAmerican(american: number): number {
  if (american < 0) {
    return round(1 + 100 / Math.abs(american), 4);
  }
  return round(1 + american / 100, 4);
}

export function parseDate(value: string | null | undefined): string {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

export function corsHeaders(env?: Env): Record<string, string> {
  const allow = env?.SSA_ALLOWED_ORIGINS?.split(",")[0]?.trim() || "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  };
}

export function handleOptions(request: Request, env?: Env): Response | null {
  if (request.method !== "OPTIONS") {
    return null;
  }
  return new Response(null, { headers: corsHeaders(env) });
}

export function pickTop<T>(items: T[], size: number, score: (item: T) => number): T[] {
  return [...items].sort((left, right) => score(right) - score(left)).slice(0, size);
}
