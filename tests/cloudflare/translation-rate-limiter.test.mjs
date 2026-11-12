import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

function limiterFor(name) {
  return env.TRANSLATION_RATE_LIMITER.getByName(name);
}

describe("VIORA translation Durable Object rate limiter", () => {
  it("allows exactly the configured quota under concurrent requests", async () => {
    const limiter = limiterFor("concurrency-" + crypto.randomUUID());
    const outcomes = await Promise.all(
      Array.from({ length: 420 }, () => limiter.check(300, 60_000))
    );
    expect(outcomes.filter(result => result.allowed)).toHaveLength(300);
    expect(outcomes.filter(result => !result.allowed)).toHaveLength(120);
    expect(Math.min(...outcomes.map(result => result.remaining))).toBe(0);
    expect(outcomes.every(result => Number.isFinite(result.resetAt))).toBe(true);
  });

  it("persists the window counter between RPC calls", async () => {
    const limiter = limiterFor("persistence-" + crypto.randomUUID());
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.check(3, 60_000));
    expect(results.map(result => result.allowed)).toEqual([true, true, true, false]);
    expect(results[3].remaining).toBe(0);
  });

  it("keeps independently named client buckets isolated", async () => {
    const suffix = crypto.randomUUID();
    const clientA = limiterFor("client-a-" + suffix);
    const clientB = limiterFor("client-b-" + suffix);
    await Promise.all([clientA.check(2,60_000),clientA.check(2,60_000),clientB.check(2,60_000)]);
    const [aThird,bSecond] = await Promise.all([clientA.check(2,60_000),clientB.check(2,60_000)]);
    expect(aThird.allowed).toBe(false);
    expect(bSecond.allowed).toBe(true);
  });
});
