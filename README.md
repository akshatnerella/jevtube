# SloppyYT

A Chrome/Brave extension that draws colored boxes around every video on YouTube (home feed, watch-page sidebar, search, Shorts shelves, channel grids) and labels it as **Slop, Clickbait, News, Educational, Entertainment, Music, Ad or Other**. The labels come from [Jev](https://docs.typesafe.ai), served through the Vercel AI Gateway.

## Layout

```
extension/   MV3 extension (what ships to the Chrome Web Store). No secrets in here.
server/      Vercel project: POST /api/classify + privacy page. Holds the AI Gateway key.
store/       Store listing text, screenshots, promo tile.
scripts/     package.sh builds dist/sloppyyt-<version>.zip for upload.
```

```
content.js (YouTube tab) ──▶ background.js ──▶ https://sloppyyt.vercel.app/api/classify ──▶ AI Gateway ──▶ typesafe-ai/jev
  finds tiles, paints          local cache,        validates input, shared cache,
  boxes + labels               install ID          per-install + per-IP daily limits
```

- **One Jev call per batch.** Up to 12 videos go into `state.videos`. Each video gets a `choice` question (category) and a `boolean` question (is the title clickbait?). The questions are fixed on the server, so the endpoint can't be misused as a general-purpose Jev proxy.
- **Limits:** 600 new videos per install per day and 2000 per IP (set with the `DAILY_PER_INSTALL` and `DAILY_PER_IP` env vars). Cached videos are free and don't count.
- **Cache:** results are cached by video ID. Without Redis, the cache and limit counters live in each serverless instance's memory. To make them global, add Upstash Redis from the Vercel Marketplace; the code picks up `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
- **Ads** are detected from YouTube's own ad markup in the DOM and never reach the API.

## Develop

```sh
cd server && npm install && npx vercel deploy --prod   # needs AI_GATEWAY_API_KEY set in the Vercel project
./scripts/package.sh                                   # -> dist/sloppyyt-1.0.0.zip
```

**Test locally in Brave/Chrome:** open `brave://extensions`, turn on Developer mode, click **Load unpacked** and pick `extension/`. After code changes, click the reload icon on the card.

**Change categories:** the wording Jev reads is in `server/lib/categories.js`; labels and colors are in `extension/categories.js`. Keys must match. Bump `PROMPT_VERSION` when you change the criteria so old cached answers aren't reused.

## Publish

See `store/LISTING.md` for every field the Chrome Web Store dashboard asks for.
