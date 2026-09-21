// Service worker: sends visible video tiles to the SloppyYT backend and caches the labels.
// No API keys live in the extension; the backend holds them and rate-limits per install.
importScripts("config.js", "categories.js");

const CLASSIFY_URL = `${self.SLOPPY_BACKEND}/api/classify`;
const CACHE_KEY = "classCache";
const CACHE_MAX = 5000;
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

let cache = null; // videoId -> { category, confidence, probabilities, clickbait, ts }
let lastError = null;
let limitedUntil = 0; // after a 429, stop calling the backend until this time

async function getInstallId() {
  const { installId } = await chrome.storage.local.get("installId");
  if (installId) return installId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ installId: id });
  return id;
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

async function classify(videos) {
  await loadCache();
  const results = {};
  const todo = [];
  for (const v of videos) {
    if (cache[v.id]) results[v.id] = cache[v.id];
    else if (!todo.some((t) => t.id === v.id)) todo.push(v);
  }
  if (!todo.length) return { results };
  if (Date.now() < limitedUntil) return { results, error: lastError };

  try {
    const res = await fetch(CLASSIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installId: await getInstallId(), videos: todo }),
    });
    const data = await res.json().catch(() => ({}));
    for (const [id, r] of Object.entries(data.results || {})) {
      const entry = { ...r, ts: Date.now() };
      cache[id] = entry;
      results[id] = entry;
    }
    saveCacheSoon();
    if (res.status === 429) {
      lastError = data.error || "Daily limit reached.";
      const midnight = new Date();
      midnight.setUTCHours(24, 0, 0, 0);
      limitedUntil = midnight.getTime();
    } else if (!res.ok) {
      lastError = data.error || `Server error (${res.status}). Retrying shortly.`;
    } else {
      lastError = null;
    }
    return { results, error: lastError };
  } catch (e) {
    lastError = "Can't reach the SloppyYT server. Retrying shortly.";
    return { results, error: lastError };
  }
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "classify") {
    classify(msg.videos).then(sendResponse);
    return true;
  }
  if (msg.type === "status") {
    sendResponse({ lastError, limited: Date.now() < limitedUntil });
    return false;
  }
  if (msg.type === "clearCache") {
    cache = {};
    chrome.storage.local.remove(CACHE_KEY).then(() => sendResponse({ ok: true }));
    return true;
  }
});
