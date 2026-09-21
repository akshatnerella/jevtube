// POST /api/classify — the only thing the extension talks to.
// The question set is fixed here, so this endpoint can't be used as a general-purpose Jev proxy.
import { experimental_evaluate as evaluate } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { CATEGORY_CRITERIA, PROMPT_VERSION } from "../lib/categories.js";
import { getResults, setResults, incrementDaily, storeKind } from "../lib/store.js";

const MODEL = gateway.evaluation("typesafe-ai/jev");
const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
const MAX_VIDEOS = 12;
const DAILY_PER_INSTALL = Number(process.env.DAILY_PER_INSTALL || 600);
const DAILY_PER_IP = Number(process.env.DAILY_PER_IP || 2000);

const VIDEO_ID = /^[\w-]{11}$/;
const INSTALL_ID = /^[0-9a-f-]{36}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const cut = (s, n) => (typeof s === "string" ? s.slice(0, n) : "");

function sanitize(body) {
  if (!body || !INSTALL_ID.test(body.installId || "") || !Array.isArray(body.videos)) return null;
  const videos = body.videos
    .filter((v) => v && VIDEO_ID.test(v.id || "") && typeof v.title === "string" && v.title.trim())
    .slice(0, MAX_VIDEOS)
    .map((v) => ({ id: v.id, title: cut(v.title, 200), channel: cut(v.channel, 100), meta: cut(v.meta, 300) }));
  return { installId: body.installId, videos };
}

// All videos share one state; each gets its own questions pointing at `videos[i]`.
function buildQuestions(n) {
  const questions = {};
  for (let i = 0; i < n; i++) {
    questions[`cat_${i}`] = {
      type: "choice",
      instructions: `Which category best describes the YouTube video \`videos[${i}]\`, judging from its title, channel and metadata?`,
      criteria: CATEGORY_CRITERIA,
    };
    questions[`bait_${i}`] = {
      type: "boolean",
      instructions: `Is the title of the YouTube video \`videos[${i}]\` clickbait?`,
      criteria: {
        true: "The title exaggerates, withholds key information, or uses shock/curiosity-gap phrasing to bait clicks.",
        false: "The title plainly and honestly describes the video.",
      },
    };
  }
  return questions;
}

// TypeSafe's native API calls yes/no questions "noul" and returns `noul` instead of `probability`.
async function evaluateDirect({ state, questions }) {
  const native = Object.fromEntries(
    Object.entries(questions).map(([k, q]) => [k, q.type === "boolean" ? { ...q, type: "noul" } : q])
  );
  const res = await fetch(TYPESAFE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state, questions: native }),
  });
  if (!res.ok) throw new Error(`TypeSafe ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { answers } = await res.json();
  for (const a of Object.values(answers)) if (a.type === "noul") Object.assign(a, { type: "boolean", probability: a.noul });
  return { answers };
}

// Jev via the AI Gateway first; when the gateway is saturated (it rate-limits the shared Jev
// route under load), fall back to TypeSafe's API directly.
// After a gateway failure, skip it for a minute instead of paying its retry latency every call.
let gatewayDownUntil = 0;
async function evaluateJev(args) {
  const hasDirect = !!process.env.TYPESAFE_API_KEY;
  if (hasDirect && Date.now() < gatewayDownUntil) return evaluateDirect(args);
  try {
    return await evaluate({ model: MODEL, ...args, maxRetries: hasDirect ? 0 : 2 });
  } catch (e) {
    if (!hasDirect) throw e;
    gatewayDownUntil = Date.now() + 60_000;
    console.warn("gateway failed, using TypeSafe direct:", e.message?.slice(0, 120));
    return evaluateDirect(args);
  }
}

export async function POST(request) {
  let input;
  try {
    input = sanitize(await request.json());
  } catch {
    input = null;
  }
  if (!input) return json({ error: "Bad request" }, 400);
  const { installId, videos } = input;
  if (!videos.length) return json({ results: {} });

  const results = {};
  const cacheKeys = videos.map((v) => `res:${PROMPT_VERSION}:${v.id}`);
  const cached = await getResults(cacheKeys);
  const todo = [];
  videos.forEach((v, i) => (cached[i] ? (results[v.id] = cached[i]) : todo.push(v)));
  if (!todo.length) return json({ results, cached: videos.length });

  // Only uncached videos cost anything, so only they count toward the daily limit.
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const [perInstall, perIp] = await incrementDaily([`i:${installId}`, `ip:${ip}`], todo.length);
  if (perInstall > DAILY_PER_INSTALL || perIp > DAILY_PER_IP) {
    return json({ results, error: "Daily limit reached. Labels resume tomorrow.", limited: true }, 429);
  }

  try {
    const { answers } = await evaluateJev({
      state: {
        context: "Videos currently shown on a YouTube page. Each has a title, channel and visible metadata text.",
        videos: todo.map(({ title, channel, meta }) => ({ title, channel, meta })),
      },
      questions: buildQuestions(todo.length),
    });

    const fresh = [];
    todo.forEach((v, i) => {
      const cat = answers[`cat_${i}`];
      if (!cat) return;
      const probs = cat.probabilities || { [cat.choice]: 1 };
      const r = {
        category: cat.choice,
        confidence: probs[cat.choice] ?? 1,
        probabilities: probs,
        clickbait: answers[`bait_${i}`]?.probability ?? null,
      };
      results[v.id] = r;
      fresh.push([`res:${PROMPT_VERSION}:${v.id}`, r]);
    });
    await setResults(fresh);
    return json({ results, remaining: Math.max(0, DAILY_PER_INSTALL - perInstall) });
  } catch (e) {
    console.error("jev failed", e);
    return json({ results, error: "Classifier temporarily unavailable." }, 502);
  }
}

export function GET() {
  return json({ ok: true, store: storeKind, prompt: PROMPT_VERSION });
}
