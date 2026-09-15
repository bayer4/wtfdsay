import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const SHARED_IP_BUCKET = "shared-unknown-ip";
const LIMITS = {
  perMinute: 10,
  perIpPerDay: 200,
  globalPerDay: 2000,
};
const MAX_FALLBACK_IPS = 10_000;

type FallbackCounter = {
  count: number;
  resetAt: number;
};

let redisClient: Redis | null = null;
let perMinuteLimiter: Ratelimit | null = null;
const fallbackMinuteCounters = new Map<string, FallbackCounter>();
const fallbackDailyCounters = new Map<string, FallbackCounter>();
let fallbackGlobalDailyCounter: FallbackCounter | null = null;

function getRedisClient(): Redis | null {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function getPerMinuteLimiter(redis: Redis): Ratelimit {
  if (perMinuteLimiter) {
    return perMinuteLimiter;
  }

  perMinuteLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(LIMITS.perMinute, "1 m"),
  });

  return perMinuteLimiter;
}

function getUtcDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function getSecondsUntilUtcMidnight(now = new Date()): number {
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );

  const seconds = Math.ceil((nextMidnight - now.getTime()) / 1000);
  return Math.max(seconds, 1);
}

function rateLimitedResponse(message: string, retryAfterSeconds?: number) {
  return NextResponse.json(
    { error: "rate_limited", message },
    {
      status: 429,
      headers: retryAfterSeconds
        ? { "Retry-After": String(retryAfterSeconds) }
        : undefined,
    }
  );
}

function incrementFallbackCounter(
  counters: Map<string, FallbackCounter>,
  key: string,
  resetAt: number,
  now: number
): FallbackCounter {
  const current = counters.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt };
    counters.set(key, next);
    return next;
  }

  current.count += 1;
  return current;
}

function getFallbackClientKey(clientIp: string, now: number): string {
  if (
    fallbackMinuteCounters.has(clientIp) ||
    fallbackDailyCounters.has(clientIp)
  ) {
    return clientIp;
  }

  if (
    fallbackMinuteCounters.size < MAX_FALLBACK_IPS &&
    fallbackDailyCounters.size < MAX_FALLBACK_IPS
  ) {
    return clientIp;
  }

  for (const [key, counter] of fallbackMinuteCounters) {
    if (counter.resetAt <= now) fallbackMinuteCounters.delete(key);
  }
  for (const [key, counter] of fallbackDailyCounters) {
    if (counter.resetAt <= now) fallbackDailyCounters.delete(key);
  }

  if (
    fallbackMinuteCounters.size < MAX_FALLBACK_IPS &&
    fallbackDailyCounters.size < MAX_FALLBACK_IPS
  ) {
    return clientIp;
  }

  return SHARED_IP_BUCKET;
}

function enforceFallbackRateLimits(clientIp: string): NextResponse | null {
  const now = Date.now();
  const fallbackClientKey = getFallbackClientKey(clientIp, now);
  const minuteResetAt = now + 60_000;
  const secondsUntilMidnight = getSecondsUntilUtcMidnight(new Date(now));
  const dailyResetAt = now + secondsUntilMidnight * 1000;

  const minuteCounter = incrementFallbackCounter(
    fallbackMinuteCounters,
    fallbackClientKey,
    minuteResetAt,
    now
  );
  if (minuteCounter.count > LIMITS.perMinute) {
    return rateLimitedResponse(
      "Too many requests right now. Please try again in about a minute.",
      Math.max(1, Math.ceil((minuteCounter.resetAt - now) / 1000))
    );
  }

  const dailyCounter = incrementFallbackCounter(
    fallbackDailyCounters,
    fallbackClientKey,
    dailyResetAt,
    now
  );
  if (dailyCounter.count > LIMITS.perIpPerDay) {
    return rateLimitedResponse(
      "Daily request limit reached for this IP. Please try again tomorrow.",
      secondsUntilMidnight
    );
  }

  if (!fallbackGlobalDailyCounter || fallbackGlobalDailyCounter.resetAt <= now) {
    fallbackGlobalDailyCounter = { count: 1, resetAt: dailyResetAt };
  } else {
    fallbackGlobalDailyCounter.count += 1;
  }

  if (fallbackGlobalDailyCounter.count > LIMITS.globalPerDay) {
    return rateLimitedResponse(
      "Service is at daily capacity. Please try again tomorrow.",
      secondsUntilMidnight
    );
  }

  return null;
}

export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return SHARED_IP_BUCKET;
}

export async function enforceTranslateRateLimits(req: Request): Promise<NextResponse | null> {
  const upstashConfigured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
  console.info("rate_limit_check_start", { upstashConfigured });

  const redis = getRedisClient();
  if (!redis) {
    console.warn("rate_limit_fallback_missing_credentials", {
      hasUrl: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      hasToken: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
    });
    return enforceFallbackRateLimits(getClientIp(req));
  }

  const clientIp = getClientIp(req);

  try {
    const minuteLimiter = getPerMinuteLimiter(redis);
    const minuteResult = await minuteLimiter.limit(`translate:minute:${clientIp}`);

    if (!minuteResult.success) {
      console.warn("rate_limit_block_minute", { clientIp, remaining: minuteResult.remaining });
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((minuteResult.reset - Date.now()) / 1000)
      );
      return rateLimitedResponse(
        "Too many requests right now. Please try again in about a minute.",
        retryAfterSeconds
      );
    }

    const dateKey = getUtcDateKey();
    const secondsUntilReset = getSecondsUntilUtcMidnight();

    const perIpDailyKey = `translate:daily:ip:${clientIp}:${dateKey}`;
    const perIpDailyCount = await redis.incr(perIpDailyKey);
    if (perIpDailyCount === 1) {
      await redis.expire(perIpDailyKey, secondsUntilReset);
    }

    if (perIpDailyCount > LIMITS.perIpPerDay) {
      console.warn("rate_limit_block_ip_daily", { clientIp, count: perIpDailyCount, limit: LIMITS.perIpPerDay });
      return rateLimitedResponse(
        "Daily request limit reached for this IP. Please try again tomorrow.",
        secondsUntilReset
      );
    }

    const globalDailyKey = `translate:daily:global:${dateKey}`;
    const globalDailyCount = await redis.incr(globalDailyKey);
    if (globalDailyCount === 1) {
      await redis.expire(globalDailyKey, secondsUntilReset);
    }

    if (globalDailyCount > LIMITS.globalPerDay) {
      console.warn("rate_limit_block_global_daily", { count: globalDailyCount, limit: LIMITS.globalPerDay });
      return rateLimitedResponse(
        "Service is at daily capacity. Please try again tomorrow.",
        secondsUntilReset
      );
    }

    console.info("rate_limit_check_pass", { clientIp });
    return null;
  } catch (err) {
    console.error("rate_limit_fallback_after_redis_error", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return enforceFallbackRateLimits(clientIp);
  }
}
