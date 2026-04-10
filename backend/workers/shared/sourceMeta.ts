import { json } from "./utils";
import type { Env } from "./types";

type SourceMeta = {
  route: string;
  source: string;
  tables?: string[];
  notes?: string;
  breakdown?: Record<string, unknown>;
};

export function shouldIncludeSourceMeta(request: Request): boolean {
  const url = new URL(request.url);
  return url.searchParams.get("ssa_debug_source") === "1";
}

export function jsonWithSourceMeta(request: Request, data: unknown, meta: SourceMeta, status = 200, env?: Env): Response {
  if (!shouldIncludeSourceMeta(request)) {
    return json(data, status, env);
  }

  if (Array.isArray(data)) {
    return json(
      {
        items: data,
        _ssa_meta: meta
      },
      status,
      env
    );
  }

  if (data && typeof data === "object") {
    return json(
      {
        ...(data as Record<string, unknown>),
        _ssa_meta: meta
      },
      status,
      env
    );
  }

  return json(
    {
      data,
      _ssa_meta: meta
    },
    status,
    env
  );
}
