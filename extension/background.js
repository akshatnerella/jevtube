// Service worker: owns the API key and every call to Jev. Content scripts never see the key.
importScripts("categories.js");
try {
  importScripts("config.local.js"); // generated from .env by scripts/sync-key.sh (optional)
} catch (_) {}

const API_URL = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const CACHE_KEY = "classCache";
const CACHE_MAX = 5000;
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

let cache = null; // videoId -> { category, confidence, probabilities, clickbait, ts }
let lastError = null;

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  return apiKey || self.SLOPPY_CONFIG?.apiKey || null;
}

async function loadCache() {
  if (cache) return cache;
  const stored = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || {};
  const now = Date.now();
  cache = Object.fromEntries(Object.entries(stored).filter(([, v]) => now - v.ts < CACHE_TTL_MS));
  return cache;
}

let saveTimer = null;
function saveCacheSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const entries = Object.entries(cache).sort((a, b) => b[1].ts - a[1].ts).slice(0, CACHE_MAX);
    cache = Object.fromEntries(entries);
    chrome.storage.local.set({ [CACHE_KEY]: cache });
  }, 1000);
}

const choiceCriteria = Object.fromEntries(
  Object.entries(self.SLOPPY_CATEGORIES).map(([k, c]) => [k, c.description])
);

// One request per batch: all videos go into `state`, and each video gets its own questions
// pointing at `videos[i]`. Jev evaluates every question in parallel against the shared state.
function buildRequest(videos) {
  const questions = {};
  videos.forEach((_, i) => {
    questions[`cat_${i}`] = {
      type: "choice",
      instructions: `Which category best describes the YouTube video \`videos[${i}]\`, judging from its title, channel and metadata?`,
      criteria: choiceCriteria,
    };
    questions[`bait_${i}`] = {
      type: "noul",
      instructions: `Is the title of the YouTube video \`videos[${i}]\` clickbait?`,
      criteria: {
        true: "The title exaggerates, withholds key information, or uses shock/curiosity-gap phrasing to bait clicks.",
        false: "The title plainly and honestly describes the video.",
      },
    };
  });
  return {
    model: MODEL,
    state: {
      context: "Videos currently shown on a YouTube page. Each has a title, channel and visible metadata text.",
      videos: videos.map(({ title, channel, meta }) => ({ title, channel, meta })),
    },
    questions,
  };
}

async function callJev(body, apiKey) {
  let delay = 500;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status === 529 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await new Promise((r) => setTimeout(r, retryAfter ? retryAfter * 1000 : delay));
      delay *= 2;
      continue;
    }
    throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  throw new Error("Jev: rate limited / overloaded after retries");
}

async function classify(videos) {
  await loadCache();
  const results = {};
  const todo = [];
  for (const v of videos) {
    if (cache[v.id]) results[v.id] = cache[v.id];
    else if (!todo.some((t) => t.id === v.id)) todo.push(v);
  }
  if (!todo.length) return { results };

  const apiKey = await getApiKey();
  if (!apiKey) {
    lastError = "No API key. Open the extension popup and paste your TypeSafe key.";
    return { results, error: lastError };
  }

  try {
    const data = await callJev(buildRequest(todo), apiKey);
    todo.forEach((v, i) => {
      const cat = data.answers[`cat_${i}`];
      const bait = data.answers[`bait_${i}`];
      if (!cat) return;
      const r = {
        category: cat.choice,
        confidence: cat.confidence,
        probabilities: cat.probabilities,
        clickbait: bait ? bait.noul : null,
        ts: Date.now(),
      };
      cache[v.id] = r;
      results[v.id] = r;
    });
    saveCacheSoon();
    lastError = null;
    return { results, usage: data.usage };
  } catch (e) {
    lastError = String(e.message || e);
    console.warn("[sloppyyt]", lastError);
    return { results, error: lastError };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "classify") {
    classify(msg.videos).then(sendResponse);
    return true;
  }
  if (msg.type === "status") {
    getApiKey().then((key) =>
      sendResponse({
        hasKey: !!key,
        keySource: key ? (self.SLOPPY_CONFIG?.apiKey === key ? "config.local.js" : "popup") : null,
        lastError,
      })
    );
    return true;
  }
  if (msg.type === "clearCache") {
    cache = {};
    chrome.storage.local.remove(CACHE_KEY).then(() => sendResponse({ ok: true }));
    return true;
  }
});
