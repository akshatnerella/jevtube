# SloppyYT

A Chrome/Brave extension that draws colored boxes around every video on YouTube (home feed, watch-page sidebar, search, Shorts shelves, channel grids) and labels it as **Slop, Clickbait, News, Educational, Entertainment, Music, Ad**, or any categories the user defines on the settings page. Labels come from [Jev](https://docs.typesafe.ai).

This repo is the **client only**. Classification runs on the shared [jev-backend](https://github.com/akshatnerella/jev-backend) at `POST https://jev-backend.vercel.app/api/sloppyyt/classify`, which holds the API keys, caching and rate limits for every Jev app.

## Layout

```
extension/   MV3 extension: what ships to the Chrome Web Store. No secrets in here.
store/       Store listing text, screenshots, promo tile.
tests/       End-to-end tests (Puppeteer) against live YouTube and the production backend.
scripts/     package.sh builds dist/sloppyyt-<version>.zip for upload.
```

```
content.js (YouTube tab)                        background.js                 jev-backend
  finds tiles near the viewport,        ──▶     local cache,          ──▶    /api/sloppyyt/classify
  fetches each video's public record             install ID                   (validation, shared cache,
  (description, tags, category, stats)                                         limits, Jev)
  and paints boxes + labels
```

- **Full context per video.** The content script fetches each uncached video's public record from YouTube's player endpoint (`/youtubei/v1/player`, about 150ms). It has to run from the page, because YouTube returns 403 to the background worker. The record adds the description, tags, YouTube category, publish date, length and exact views to the tile text.
- **Custom categories.** Users edit up to 12 categories on the settings page. Each description is exactly what Jev reads. Settings live in `chrome.storage.sync`; the backend validates the set and keys its cache by it.
- **Ads** are detected from YouTube's own ad markup in the DOM and never reach the API.

## Develop

```sh
./scripts/package.sh                            # -> dist/sloppyyt-<version>.zip
cd tests && npm install && npm run e2e          # settings page -> custom category -> live YouTube
cd tests && node enrich-check.mjs               # videos reach the backend with full metadata
```

**Test locally in Brave/Chrome:** open `brave://extensions`, turn on Developer mode, click **Load unpacked** and pick `extension/`. After code changes, click the reload icon on the card.

**Default categories** live in `extension/settings.js`. The backend's copy (`apps/sloppyyt.js` in jev-backend) is only used by clients that send no categories.

## Publish

See `store/LISTING.md` for every field the Chrome Web Store dashboard asks for.
