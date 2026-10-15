import { z } from "zod";
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers:
      options?.body instanceof FormData
        ? options.headers
        : { "content-type": "application/json", ...options?.headers },
  });
  const raw: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(raw);
    throw new Error(
      error.success
        ? error.data.error
        : "The server could not complete this request.",
    );
  }
  return schema.parse(raw);
}
export function json(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}
