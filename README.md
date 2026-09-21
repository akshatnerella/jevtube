# SloppyYT

A Chrome/Brave extension that draws colored boxes around every video on YouTube (home feed, watch-page sidebar, search, shorts shelves, channel grids) and labels it as **Slop, Clickbait, News, Educational, Entertainment, Music, Ad or Other**. It uses [Jev](https://docs.typesafe.ai) by TypeSafe to make the calls.

## Setup

```sh
./scripts/sync-key.sh          # writes extension/config.local.js (gitignored) from API_KEY in .env
```

1. Open `brave://extensions` (or `chrome://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder.
3. Open YouTube. Boxes appear within a second or so.

You can also paste a key into the popup instead of running the script. After changing any code, click the reload icon on the extension card, then refresh YouTube.

## How it works

```
content.js (YouTube tab)                 background.js (service worker)            Jev
─────────────────────────                ──────────────────────────────            ───
MutationObserver finds tiles ──batch──▶  cache hit? return it
extract {title, channel, meta}           else ONE request: state.videos[0..n]  ──▶  per video:
paint box + label        ◀──results───   + per-video questions                ◀──   choice(category)
                                                                                    noul(clickbait title)
```

- **One API call per batch.** Up to 12 visible videos go into `state.videos`. Each video gets a `choice` question (its category) and a `noul` question (is the title clickbait?), both pointing at `videos[i]`. Jev answers them all in parallel, in about 300ms.
- **Code handles rules; Jev handles judgment.** Ads come from YouTube's own ad markup in the DOM and never reach the API.
- **Confidence drives the display.** Boxes are dashed when the choice confidence is below 0.55. A `⚡bait` chip appears when a non-clickbait video still has a clickbait-style title. Hovering a label shows the top 3 probabilities.
- **Results are cached** by video id in `chrome.storage.local` for 7 days (up to 5000 videos), so a video is only classified once.
- **The API key never reaches YouTube's page.** Only the service worker reads it.

## Popup

- Turns the extension on or off.
- Shows a live count of each category on the current tab.
- Sets each category to **box**, **dim**, **hide** or **off**. For example, hide slop and dim clickbait.
- Lets you paste a key and clear the cache.

## Changing categories

Edit `extension/categories.js`. Each `description` is sent to Jev as the Choice criterion, so the description *is* the prompt. Clear the cache from the popup after changing one.
