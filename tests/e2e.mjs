// End-to-end: load the unpacked extension, customize categories on the settings page,
// and check the labels on live YouTube. Hits the production backend.
//   cd tests && npm install && npm run e2e            (EXT=/path/to/unpacked to test a build)
import puppeteer from "puppeteer";
import { fileURLToPath } from "node:url";
import path from "node:path";

const EXT = process.env.EXT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../extension");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "✔" : "✖"} ${msg}`);
  if (!ok) failures++;
};

const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], defaultViewport: { width: 1280, height: 900 } });
try {
  const sw = await (await browser.waitForTarget((t) => t.type() === "service_worker", { timeout: 10000 })).worker();
  const extId = new URL(sw.url()).host;
  await sleep(800);
  check((await browser.pages()).some((p) => p.url().endsWith("/welcome.html")), "welcome page opens on install");

  // --- settings page ---
  const opts = await browser.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`);
  await opts.waitForSelector(".cat");
  check((await opts.$$(".cat")).length === 7, "7 default categories on the settings page");

  const chip = await opts.waitForSelector("xpath/.//button[contains(., 'True crime')]");
  await chip.click();
  await sleep(1200);
  const saved = await sw.evaluate(() => chrome.storage.sync.get("settings").then((r) => r.settings));
  check(saved.categories.some((c) => c.id === "true_crime" && c.description.length > 20), "quick-add 'True crime' saved to sync storage");

  // Set Slop to Hide via its segmented control.
  await opts.evaluate(() => {
    const slop = [...document.querySelectorAll(".cat")].find((li) => li.querySelector(".name").value === "Slop");
    [...slop.querySelectorAll(".modes button")].find((b) => b.textContent === "Hide").click();
  });
  await sleep(600);
  const s2 = await sw.evaluate(() => chrome.storage.sync.get("settings").then((r) => r.settings));
  check(s2.categories.find((c) => c.id === "slop").mode === "hide", "Slop set to hide");

  // Invalid edit is not saved.
  await opts.evaluate(() => {
    const n = document.querySelector(".cat .name");
    n.value = "";
    n.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(1000);
  const s3 = await sw.evaluate(() => chrome.storage.sync.get("settings").then((r) => r.settings));
  check(s3.categories[0].label === "Slop" && (await opts.$(".cat.invalid")) !== null, "empty name is flagged and not saved");
  await opts.evaluate(() => {
    const n = document.querySelector(".cat .name");
    n.value = "Slop";
    n.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(1000);

  // Test-a-title preview.
  await opts.type("#testTitle", "The Unsolved Disappearance of Maura Murray");
  await opts.click("#testForm button");
  await opts.waitForFunction(() => document.querySelector("#testResult .pill"), { timeout: 15000, polling: 200 }).catch(() => {});
  const verdict = await opts.$eval("#testResult", (e) => e.textContent).catch(() => "");
  check(/True crime/.test(verdict), `test-a-title labels a true-crime title as True crime (${verdict.slice(0, 40)})`);
  await opts.screenshot({ path: "options.png", fullPage: true });

  // --- YouTube ---
  const yt = await browser.newPage();
  await yt.goto("https://www.youtube.com/results?search_query=unsolved+disappearance+true+crime+documentary", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(9000);
  const tiles = await yt.evaluate(() => [...document.querySelectorAll("[data-jt-vid]")].map((t) => ({
    state: t.dataset.jtState, cat: t.dataset.jtCat, mode: t.dataset.jtMode, display: getComputedStyle(t).display })));
  const done = tiles.filter((t) => t.state === "done");
  console.log("  tiles:", tiles.length, "labeled:", done.length, JSON.stringify(done.reduce((o, t) => ((o[t.cat] = (o[t.cat] || 0) + 1), o), {})));
  check(done.length >= 5, "YouTube tiles get labeled");
  check(done.some((t) => t.cat === "true_crime"), "custom category appears on real YouTube results");
  check(done.filter((t) => t.cat === "slop").every((t) => t.display === "none"), "hidden category is hidden");
  check(!tiles.some((t) => t.state === "pending"), "nothing left pending");
  await yt.screenshot({ path: "youtube.png" });

  // Live update: switching True crime to Dim restyles the open tab without reloading.
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.sync.get("settings");
    settings.categories.find((c) => c.id === "true_crime").mode = "dim";
    await chrome.storage.sync.set({ settings });
  });
  await sleep(500);
  const dimmed = await yt.evaluate(() => [...document.querySelectorAll("[data-jt-cat='true_crime']")].every((t) => t.dataset.jtMode === "dim"));
  check(dimmed, "mode change applies live to the open YouTube tab");

  // --- popup ---
  const popup = await browser.newPage();
  await popup.setViewport({ width: 340, height: 520 });
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await sleep(800);
  const names = await popup.$$eval(".name", (els) => els.map((e) => e.textContent));
  check(names.includes("True crime") && names.at(-1) === "Other", "popup lists custom categories");
  await popup.screenshot({ path: "popup.png" });
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
