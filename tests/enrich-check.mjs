// Confirms videos reach the backend with full YouTube metadata when browsing real YouTube.
import puppeteer from "puppeteer";
const EXT = new URL("../extension", import.meta.url).pathname;
const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], defaultViewport: { width: 1280, height: 900 } });
const sw = await (await browser.waitForTarget((t) => t.type() === "service_worker")).worker();
await sw.evaluate(() => {
  self.sentVideos = [];
  const realFetch = fetch;
  self.fetch = (url, init) => {
    if (String(url).includes("/api/classify")) self.sentVideos.push(...JSON.parse(init.body).videos);
    return realFetch(url, init);
  };
});
const page = await browser.newPage();
await page.bringToFront();
const t0 = Date.now();
await page.goto("https://www.youtube.com/results?search_query=iphone+review", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelectorAll("[data-sloppy-state=done]").length >= 3, { timeout: 30000, polling: 100 }).catch(async () => {
  console.log("TIMEOUT states:", await page.evaluate(() => { const o = {}; document.querySelectorAll("[data-sloppy-state]").forEach((t) => (o[t.dataset.sloppyState] = (o[t.dataset.sloppyState] || 0) + 1)); return o; }));
  console.log("sw lastError:", await sw.evaluate(() => lastError), "sent:", await sw.evaluate(() => self.sentVideos.length));
});
console.log(`first 3 labels on screen ${Date.now() - t0}ms after navigation`);
await new Promise((r) => setTimeout(r, 4000));
const sent = await sw.evaluate(() => self.sentVideos);
const has = (k) => sent.filter((v) => v[k]).length;
console.log(`videos sent: ${sent.length}; with description ${has("description")}, tags ${has("tags")}, youtubeCategory ${has("youtubeCategory")}, published ${has("published")}, length ${has("lengthSeconds")}, views ${has("views")}`);
const v = sent.find((x) => x.description) || sent[0];
console.log("sample:", JSON.stringify({ title: v.title, channel: v.channel, youtubeCategory: v.youtubeCategory, published: v.published, lengthSeconds: v.lengthSeconds, views: v.views, tags: v.tags?.slice(0, 60), description: v.description?.slice(0, 80) }, null, 1));
await browser.close();
process.exit(has("description") >= sent.length * 0.7 ? 0 : 1);
