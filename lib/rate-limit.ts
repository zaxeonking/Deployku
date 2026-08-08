// Vercel selalu ngirim header X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset
// di tiap response API-nya. Helper ini buat ambil & rapiin nilainya.
export type RateLimitInfo = {
  limit: number | null;
  remaining: number | null;
  reset: number | null; // unix timestamp (detik) kapan limit reset
} | null;

export function parseRateLimit(headers: Headers): RateLimitInfo {
  const limit = headers.get("x-ratelimit-limit");
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");

  if (limit === null && remaining === null && reset === null) return null;

  return {
    limit: limit !== null ? Number(limit) : null,
    remaining: remaining !== null ? Number(remaining) : null,
    reset: reset !== null ? Number(reset) : null,
  };
}
