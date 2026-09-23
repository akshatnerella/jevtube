// Store screenshots (1280x800) of the settings page and the welcome page.
import puppeteer from "puppeteer";
const EXT = new URL("../extension", import.meta.url).pathname;
const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], defaultViewport: { width: 1280, height: 800 } });
const sw = await (await browser.waitForTarget((t) => t.type() === "service_worker")).worker();
const id = new URL(sw.url()).host;
await sw.evaluate(async () => {
  const s = await Jev.load();
  s.categories.push(
    { label: "Drama", description: Jev.SUGGESTIONS.find((x) => x.label === "Drama").description, color: "#ea580c", mode: "dim" },
    { label: "True crime", description: Jev.SUGGESTIONS.find((x) => x.label === "True crime").description, color: "#0891b2", mode: "box" });
  s.categories.find((c) => c.id === "slop").mode = "hide";
  await Jev.save(s);
});
const p = await browser.newPage();
await p.goto(`chrome-extension://${id}/options.html`);
await p.waitForSelector(".cat");
await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await new Promise((r) => setTimeout(r, 400));
await p.type("#testTitle", "The Downfall of a YouTuber (It Gets Worse)");
await p.click("#testForm button");
await p.waitForSelector("#testResult .pill", { timeout: 20000 }).catch(() => {});
await p.evaluate(() => {
  const drama = [...document.querySelectorAll(".cat")].find((li) => li.querySelector(".name").value === "Drama");
  window.scrollTo(0, drama.getBoundingClientRect().top + scrollY - 24);
});
await p.screenshot({ path: "../store/screenshot-3-settings.png" });
const w = await browser.newPage();
await w.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await w.goto(`chrome-extension://${id}/welcome.html`);
await new Promise((r) => setTimeout(r, 400));
await w.screenshot({ path: "../store/screenshot-4-welcome.png" });
await browser.close();
