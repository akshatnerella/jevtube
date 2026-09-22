// Benchmark: tile text only vs. full YouTube metadata, on real videos from live search pages.
// Measures metadata-fetch and Jev latency, and prints every video where the label changed.
//   cd tests && node bench.mjs        (reads API keys from ../.env)
import puppeteer from "puppeteer";
import fs from "node:fs";

for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const [k, ...v] = line.split("=");
  const val = v.join("=").trim().replace(/^["']|["']$/g, "");
  if (k.trim() === "API_KEY") process.env.TYPESAFE_API_KEY = val;
  if (k.trim() === "VERCEL_API_KEY") process.env.AI_GATEWAY_API_KEY = val;
}
const { buildQuestions, evaluateJev, videoState } = await import("../server/api/classify.js");
const { DEFAULT_CATEGORIES } = await import("../server/lib/categories.js");

const SEARCHES = ["ai generated story compilation", "breaking news today", "mit lecture algorithms",
  "mrbeast", "true crime documentary", "official music video 2026", "iphone review", "reacting to tiktoks"];

// Same extraction as extension/content.js.
function scrape() {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  return [...document.querySelectorAll("ytd-video-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model-v2")].map((tile) => {
    const link = tile.querySelector("a[href*='/watch?v='], a[href*='/shorts/']");
    const m = link?.getAttribute("href")?.match(/[?&]v=([\w-]{11})/) || link?.getAttribute("href")?.match(/\/shorts\/([\w-]{11})/);
    const titleEl = tile.querySelector("#video-title, [class*='LockupMetadataViewModelTitle'], h3");
    const title = clean(titleEl?.getAttribute("title") || titleEl?.textContent);
    if (!m || !title) return null;
    const channel = clean(tile.querySelector("ytd-channel-name #text, a[href^='/@']")?.textContent);
    const lines = [...new Set(tile.innerText.split("\n").map(clean).filter(Boolean))].filter((l) => l !== title && l !== channel).slice(0, 8);
    return { id: m[1], title, channel, meta: lines.join(" | ") };
  }).filter(Boolean);
}

// Same request as extension/background.js enrich().
async function enrich(v) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId: v.id, context: { client: { clientName: "WEB", clientVersion: "2.20260918.01.00", hl: "en" } } }),
  });
  const d = await res.json();
  const vd = d.videoDetails || {}, mf = d.microformat?.playerMicroformatRenderer || {};
  return { ...v, channel: v.channel || vd.author || "", description: (vd.shortDescription || "").slice(0, 1200),
    tags: (vd.keywords || []).slice(0, 20).join(", ").slice(0, 300), youtubeCategory: mf.category || "",
    published: (mf.publishDate || "").slice(0, 10), lengthSeconds: Number(vd.lengthSeconds) || null,
    views: Number(vd.viewCount) || null, live: !!vd.isLiveContent };
}

async function label(videos) {
  const t = performance.now();
  const { answers } = await evaluateJev({
    state: { context: "Videos currently shown on a YouTube page.", videos: videos.map(videoState) },
    questions: buildQuestions(videos.length, DEFAULT_CATEGORIES),
  });
  const ms = performance.now() - t;
  return { ms, labels: videos.map((_, i) => {
    const a = answers[`cat_${i}`];
    return { cat: a.choice, conf: a.probabilities?.[a.choice] ?? a.confidence ?? 1 };
  }) };
}

const browser = await puppeteer.launch({ headless: true });
const all = new Map();
for (const q of SEARCHES) {
  const p = await browser.newPage();
  await p.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, { waitUntil: "networkidle2" });
  for (const v of (await p.evaluate(scrape)).slice(0, 6)) all.set(v.id, v);
  await p.close();
}
await browser.close();
const videos = [...all.values()];
console.log(`${videos.length} real videos from ${SEARCHES.length} searches\n`);

const batches = [];
for (let i = 0; i < videos.length; i += 12) batches.push(videos.slice(i, i + 12));
const stats = { enrichMs: [], tileMs: [], fullMs: [], changed: [], withDesc: 0, lowTile: 0, lowFull: 0 };
for (const batch of batches) {
  const tile = batch.map(({ id, title, channel, meta }) => ({ id, title, channel, meta }));
  let t = performance.now();
  const full = await Promise.all(batch.map(enrich));
  stats.enrichMs.push(performance.now() - t);
  const [a, b] = await Promise.all([label(tile), label(full)]);
  stats.tileMs.push(a.ms);
  stats.fullMs.push(b.ms);
  full.forEach((v, i) => {
    if (v.description) stats.withDesc++;
    if (a.labels[i].conf < 0.55) stats.lowTile++;
    if (b.labels[i].conf < 0.55) stats.lowFull++;
    if (a.labels[i].cat !== b.labels[i].cat)
      stats.changed.push(`  ${(a.labels[i].cat + " " + Math.round(a.labels[i].conf * 100) + "%").padEnd(20)} → ${(b.labels[i].cat + " " + Math.round(b.labels[i].conf * 100) + "%").padEnd(20)} ${v.title.slice(0, 60)}  [yt: ${v.youtubeCategory}]`);
  });
}
const avg = (xs) => Math.round(xs.reduce((s, x) => s + x, 0) / xs.length);
console.log(`metadata fetch per batch of 12 (parallel): avg ${avg(stats.enrichMs)}ms`);
console.log(`Jev, tile text only:  avg ${avg(stats.tileMs)}ms per batch`);
console.log(`Jev, full metadata:   avg ${avg(stats.fullMs)}ms per batch`);
console.log(`full descriptions found: ${stats.withDesc}/${videos.length}`);
console.log(`"unsure" (<55%) labels: tile-only ${stats.lowTile}, full ${stats.lowFull}`);
console.log(`\nlabel changed on ${stats.changed.length}/${videos.length} videos (tile-only → full):`);
console.log(stats.changed.join("\n") || "  none");
