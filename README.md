# SloppyYT

A Chrome/Brave extension that draws colored boxes around every video on YouTube (home feed, watch-page sidebar, search, Shorts shelves, channel grids) and labels it as **Slop, Clickbait, News, Educational, Entertainment, Music, Ad**, or any categories the user defines on the settings page. The labels come from [Jev](https://docs.typesafe.ai), served through the Vercel AI Gateway.

## Layout

```
extension/   MV3 extension (what ships to the Chrome Web Store). No secrets in here.
server/      Vercel project: POST /api/classify + privacy page. Holds the API keys.
store/       Store listing text, screenshots, promo tile.
tests/       End-to-end test (Puppeteer): settings page -> custom category -> live YouTube.
scripts/     package.sh builds dist/sloppyyt-<version>.zip for upload.
```

```
content.js (YouTube tab) ──▶ background.js ──▶ https://sloppyyt.vercel.app/api/classify ──▶ AI Gateway (typesafe-ai/jev)
  tiles near the viewport,     local cache,        validates input + categories,        └─ on 429/503: TypeSafe API direct
  paints boxes + labels        install ID          shared cache, daily limits
```

- **One Jev call per batch.** Up to 12 videos go into `state.videos`. Each video gets a `choice` question (category) and a `boolean` question (is the title clickbait?).
- **Custom categories.** Users edit up to 12 categories on the settings page (`options.html`). Each description is exactly what Jev reads for that option. Settings live in `chrome.storage.sync`. The server takes the category set from the request and validates it (ids, lengths, at most 13, with a fixed `other` the client can't rewrite). The question wording stays fixed on the server, so the endpoint can't be used as a general-purpose Jev proxy. Cache keys include a hash of the category set.
- **Limits:** 600 new videos per install per day and 2000 per IP (set with the `DAILY_PER_INSTALL` and `DAILY_PER_IP` env vars). Cached videos are free and don't count.
- **Cache:** results are cached by video ID. Without Redis, the cache and limit counters live in each serverless instance's memory. To make them global, add Upstash Redis from the Vercel Marketplace; the code picks up `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
- **Ads** are detected from YouTube's own ad markup in the DOM and never reach the API.

## Develop

```sh
git push                                               # Vercel deploys server/ (needs AI_GATEWAY_API_KEY + TYPESAFE_API_KEY)
./scripts/package.sh                                   # -> dist/sloppyyt-<version>.zip
```

**Test locally in Brave/Chrome:** open `brave://extensions`, turn on Developer mode, click **Load unpacked** and pick `extension/`. After code changes, click the reload icon on the card.

**Default categories** live in `extension/settings.js` (`DEFAULT_CATEGORIES`), with a copy for old clients in `server/lib/categories.js`. Bump `PROMPT_VERSION` in the server when you change the question wording, so old cached answers aren't reused.

**Tests:**
```sh
cd server && npm test                      # unit tests, no network
cd tests && npm install && npm run e2e     # real browser + live YouTube + production backend
```

## Publish

See `store/LISTING.md` for every field the Chrome Web Store dashboard asks for.
