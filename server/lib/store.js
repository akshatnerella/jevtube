// Shared result cache + daily rate-limit counters.
// Uses Upstash Redis (REST) when configured, otherwise per-instance memory. Memory still
// works, but limits and cache are then per serverless instance rather than global.

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const RESULT_TTL_S = 14 * 24 * 3600;

async function redis(commands) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return (await res.json()).map((r) => r.result);
}

const mem = new Map(); // key -> { value, expires }
function memGet(key) {
  const e = mem.get(key);
  if (!e) return null;
  if (e.expires < Date.now()) {
    mem.delete(key);
    return null;
  }
  return e.value;
}
function memSet(key, value, ttlS) {
  if (mem.size > 50000) mem.delete(mem.keys().next().value);
  mem.set(key, { value, expires: Date.now() + ttlS * 1000 });
}

export const storeKind = REDIS_URL && REDIS_TOKEN ? "redis" : "memory";

export async function getResults(keys) {
  if (!keys.length) return [];
  if (storeKind === "redis") {
    try {
      const [values] = await redis([["MGET", ...keys]]);
      return values.map((v) => (v ? JSON.parse(v) : null));
    } catch (e) {
      console.warn("cache read failed", e.message);
    }
  }
  return keys.map(memGet);
}

export async function setResults(entries) {
  for (const [k, v] of entries) memSet(k, v, RESULT_TTL_S);
  if (storeKind === "redis" && entries.length) {
    await redis(entries.map(([k, v]) => ["SET", k, JSON.stringify(v), "EX", RESULT_TTL_S])).catch((e) =>
      console.warn("cache write failed", e.message)
    );
  }
}

// Adds `amount` to each counter for today and returns the new totals.
export async function incrementDaily(names, amount) {
  const day = new Date().toISOString().slice(0, 10);
  const keys = names.map((n) => `rl:${day}:${n}`);
  if (storeKind === "redis") {
    try {
      const out = await redis(keys.flatMap((k) => [["INCRBY", k, amount], ["EXPIRE", k, 90000]]));
      return keys.map((_, i) => out[i * 2]);
    } catch (e) {
      console.warn("rate-limit store failed", e.message);
    }
  }
  return keys.map((k) => {
    const v = (memGet(k) || 0) + amount;
    memSet(k, v, 90000);
    return v;
  });
}
