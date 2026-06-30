type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  max: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.max - 1, retryAfterSec: 0 };
  }

  if (bucket.count >= options.max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { allowed: true, remaining: options.max - bucket.count, retryAfterSec: 0 };
}

export function rateLimitHeaders(result: RateLimitResult, options: RateLimitOptions): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(options.max),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    ...(result.allowed ? {} : { "Retry-After": String(result.retryAfterSec) }),
  };
}
