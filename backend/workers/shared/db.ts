import type { Env } from "./types";

export async function queryAll<T>(env: Env, sql: string, bindings: unknown[] = []): Promise<T[] | null> {
  if (!env.DB) {
    return null;
  }

  try {
    const result = await env.DB.prepare(sql).bind(...bindings).all();
    return (result.results || []) as T[];
  } catch {
    return null;
  }
}

export async function queryFirst<T>(env: Env, sql: string, bindings: unknown[] = []): Promise<T | null> {
  const rows = await queryAll<T>(env, sql, bindings);
  return rows && rows.length > 0 ? rows[0] : null;
}

export async function execute(env: Env, sql: string, bindings: unknown[] = []): Promise<boolean> {
  if (!env.DB) {
    return false;
  }

  try {
    await env.DB.prepare(sql).bind(...bindings).run();
    return true;
  } catch {
    return false;
  }
}
