import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const SHARED_IP_BUCKET = "shared-unknown-ip";
const LIMITS = {
  perMinute: 10,
  perIpPerDay: 200,
  globalPerDay: 2000,
};

let redisClient: Redis | null = null;
let perMinuteLimiter: Ratelimit | null = null;

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
  const redis = getRedisClient();
  if (!redis) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("rate_limit_dev_bypass_missing_upstash_config");
      return null;
    }

    console.error(
      "Missing Upstash Redis credentials. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
    );
    return NextResponse.json(
      { error: "service_unavailable", message: "Rate limit backend is not configured." },
      { status: 503 }
    );
  }

  const clientIp = getClientIp(req);

  try {
    const minuteLimiter = getPerMinuteLimiter(redis);
    const minuteResult = await minuteLimiter.limit(`translate:minute:${clientIp}`);

    if (!minuteResult.success) {
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
      return rateLimitedResponse(
        "Service is at daily capacity. Please try again tomorrow.",
        secondsUntilReset
      );
    }

    return null;
  } catch {
    console.error("rate_limit_check_failed");
    return NextResponse.json(
      { error: "service_unavailable", message: "Rate limiting is temporarily unavailable." },
      { status: 503 }
    );
  }
}
