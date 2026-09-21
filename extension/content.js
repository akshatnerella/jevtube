// Content script: finds video tiles on YouTube, asks the service worker to classify them,
// and paints a colored box + label on each tile.
(() => {
  const CATS = self.SLOPPY_CATEGORIES;
  const BATCH_SIZE = 12;
  const MAX_IN_FLIGHT = 3;

  // Tile containers across the home grid, watch-page sidebar, search results and shelves.
  const TILE_SELECTOR = [
    "ytd-rich-item-renderer",
    "ytd-compact-video-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "yt-lockup-view-model",
    "ytm-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model-v2",
    "ytd-ad-slot-renderer",
    "#player-ads",
  ].join(",");
  const AD_SELECTOR =
    "ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, ytd-promoted-video-renderer, [class*='ad-badge'], badge-shape[aria-label='Sponsored']";

  let settings = structuredClone(self.SLOPPY_DEFAULT_SETTINGS);
  const results = new Map(); // videoId -> result
  const queue = new Map(); // videoId -> video payload
  let inFlight = 0;
  let retryDelay = 0; // ms; grows while the backend is failing
  let retryAt = 0;
  let status = { error: null, classified: 0 };

  // ---------- extraction ----------

  function videoIdFrom(href) {
    if (!href) return null;
    const m = href.match(/[?&]v=([\w-]{11})/) || href.match(/\/shorts\/([\w-]{11})/);
    return m ? m[1] : null;
  }

  function clean(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function extract(tile) {
    const link = tile.querySelector("a[href*='/watch?v='], a[href*='/shorts/']");
    const id = videoIdFrom(link?.getAttribute("href"));
    if (!id) return null;

    const titleEl = tile.querySelector(
      "#video-title, [class*='lockup-metadata-view-model'][class*='__title'], h3 a, h3, [class*='shortsLockupViewModelHostMetadataTitle']"
    );
    const title = clean(titleEl?.getAttribute("title") || titleEl?.textContent || link.getAttribute("title"));
    if (!title) return null; // not rendered yet

    const channelEl = tile.querySelector("ytd-channel-name #text, ytd-channel-name a, a[href^='/@']");
    const lines = [...new Set((tile.innerText || "").split("\n").map(clean).filter(Boolean))]
      .filter((l) => l !== title)
      .slice(0, 8);
    const channel = clean(channelEl?.textContent) || lines[0] || "";
    return { id, title, channel, meta: lines.filter((l) => l !== channel).join(" | ") };
  }

  // ---------- painting ----------

  function paint(tile, r) {
    const cat = CATS[r.category] || CATS.other;
    const mode = settings.enabled ? settings.modes[r.category] || "box" : "off";
    tile.dataset.sloppyState = "done";
    tile.dataset.sloppyCat = r.category;
    tile.dataset.sloppyMode = mode;
    tile.dataset.sloppyLow = r.confidence < settings.lowConfidence ? "1" : "0";
    tile.style.setProperty("--sloppy-color", cat.color);
    const bait = r.category !== "clickbait" && r.clickbait != null && r.clickbait >= 0.75 ? " ⚡bait" : "";
    const pct = r.source === "dom" ? "" : ` ${Math.round(r.confidence * 100)}%`;
    tile.dataset.sloppyLabel = `${cat.label}${pct}${bait}`;
    if (r.probabilities) {
      const top = Object.entries(r.probabilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, p]) => `${CATS[k]?.label || k}: ${Math.round(p * 100)}%`)
        .join("  ·  ");
      tile.dataset.sloppyTip = top + (r.clickbait != null ? `  ·  clickbait title: ${Math.round(r.clickbait * 100)}%` : "");
    }
  }

  function clearTile(tile) {
    for (const k of ["sloppyState", "sloppyCat", "sloppyMode", "sloppyLow", "sloppyLabel", "sloppyTip", "sloppyVid"])
      delete tile.dataset[k];
  }

  function repaintAll() {
    document.querySelectorAll("[data-sloppy-vid]").forEach((tile) => {
      const r = results.get(tile.dataset.sloppyVid);
      if (r) paint(tile, r);
      else tile.dataset.sloppyMode = settings.enabled ? "box" : "off";
    });
  }

  // ---------- scanning ----------

  function scan() {
    if (!location.hostname.endsWith("youtube.com")) return;
    for (const tile of document.querySelectorAll(TILE_SELECTOR)) {
      // A lockup nested inside a rich-item is the same video; paint the outer tile only.
      if (tile.parentElement?.closest(TILE_SELECTOR)) continue;

      if (tile.id === "player-ads" || tile.matches(AD_SELECTOR) || tile.querySelector(AD_SELECTOR)) {
        // Ad wrappers are often display:contents or zero-height; box the first element with a size.
        let target = tile;
        while (target && !target.getBoundingClientRect().height) target = target.firstElementChild;
        if (target && target.dataset.sloppyVid !== "ad") {
          target.dataset.sloppyVid = "ad";
          paint(target, { category: "ad", confidence: 1, source: "dom" });
        }
        continue;
      }

      const link = tile.querySelector("a[href*='/watch?v='], a[href*='/shorts/']");
      const id = videoIdFrom(link?.getAttribute("href"));
      if (!id) continue;
      if (tile.dataset.sloppyVid === id) continue; // already handled; YouTube didn't recycle it

      // New tile, or YouTube recycled this element for a different video.
      clearTile(tile);
      const video = extract(tile);
      if (!video) continue;
      tile.dataset.sloppyVid = id;
      const known = results.get(id);
      if (known) {
        paint(tile, known);
      } else {
        tile.dataset.sloppyState = "pending";
        tile.dataset.sloppyMode = settings.enabled ? "box" : "off";
        queue.set(id, video);
      }
    }
    pump();
  }

  function pump() {
    if (Date.now() < retryAt) return;
    while (queue.size && inFlight < MAX_IN_FLIGHT) {
      const batch = [...queue.values()].slice(0, BATCH_SIZE);
      batch.forEach((v) => queue.delete(v.id));
      inFlight++;
      chrome.runtime
        .sendMessage({ type: "classify", videos: batch })
        .then((resp) => {
          status.error = resp?.error || null;
          for (const [id, r] of Object.entries(resp?.results || {})) {
            results.set(id, r);
            status.classified++;
            document.querySelectorAll(`[data-sloppy-vid="${id}"]`).forEach((t) => paint(t, r));
          }
          // Failed videos stay pending and go back in the queue; retry with backoff so a
          // backend outage doesn't make every tile flash on and off.
          const failed = batch.filter((v) => !results.has(v.id));
          if (failed.length) {
            failed.forEach((v) => queue.set(v.id, v));
            retryDelay = Math.min(retryDelay ? retryDelay * 2 : 2000, 60000);
            retryAt = Date.now() + retryDelay;
          } else {
            retryDelay = 0;
          }
        })
        .catch((e) => {
          status.error = String(e);
          batch.forEach((v) => queue.set(v.id, v));
          retryDelay = Math.min(retryDelay ? retryDelay * 2 : 2000, 60000);
          retryAt = Date.now() + retryDelay;
        })
        .finally(() => {
          inFlight--;
          pump();
        });
    }
  }

  let scanTimer = null;
  function scheduleScan(delay = 250) {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, delay);
  }

  // ---------- wiring ----------

  chrome.storage.local.get("settings").then(({ settings: s }) => {
    if (s) settings = { ...settings, ...s, modes: { ...settings.modes, ...s.modes } };
    new MutationObserver(() => scheduleScan()).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    window.addEventListener("yt-navigate-finish", () => scheduleScan(50));
    setInterval(() => scheduleScan(0), 3000); // safety net, and retries after errors
    scan();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) {
      const s = changes.settings.newValue || {};
      settings = { ...self.SLOPPY_DEFAULT_SETTINGS, ...s, modes: { ...self.SLOPPY_DEFAULT_SETTINGS.modes, ...s.modes } };
      repaintAll();
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "pageStats") {
      const counts = {};
      document.querySelectorAll("[data-sloppy-state='done']").forEach((t) => {
        counts[t.dataset.sloppyCat] = (counts[t.dataset.sloppyCat] || 0) + 1;
      });
      sendResponse({ counts, pending: document.querySelectorAll("[data-sloppy-state='pending']").length, error: status.error });
    }
  });
})();
