# Chrome Web Store submission kit

Upload `dist/sloppyyt-<version>.zip` (build it with `./scripts/package.sh`) at
https://chrome.google.com/webstore/devconsole, then paste the fields below.

## Store listing

**Name** (comes from the manifest): SloppyYT: Spot Slop & Clickbait on YouTube

**Summary** (132 chars max):
Color-codes every YouTube video as slop, clickbait, news or your own categories, so you know what it is before you click.

**Category:** Productivity. Language: English.

**Description:**

Tired of AI slop and clickbait taking over your YouTube feed? SloppyYT puts a colored box around every video on YouTube and tells you what it really is, before you waste a click.

WHAT IT LABELS
• Slop: AI-generated filler, content farms, reuploads, faceless "facts" channels
• Clickbait: titles built to bait you with exaggeration, shock words and curiosity gaps
• News: current, time-sensitive news coverage
• Educational: lectures, tutorials, explainers, documentaries
• Entertainment: vlogs, gaming, comedy, podcasts, sports
• Music: music videos, songs, live performances, mixes
• Ads: sponsored and promoted placements

WORKS EVERYWHERE ON YOUTUBE
Home feed, the sidebar while you watch, search results, Shorts shelves and channel pages. Labels appear in about a second as you scroll.

MAKE YOUR OWN CATEGORIES
Want to spot drama, true crime, reaction videos or finance hype? Add up to 12 categories of your own, describe them in plain English, and SloppyYT sorts your feed by them. Test any title on the settings page to see how it would be labeled.

YOU'RE IN CONTROL
Set each category to box, dim, hide or off. Hide slop entirely, dim clickbait, keep everything else visible. A dashed box means the model is unsure, and hovering any label shows the full breakdown. Toggle SloppyYT anywhere with Alt+Shift+S.

PRIVATE BY DESIGN
• No account or sign-in
• Reads only the titles and channel names of the videos shown on youtube.com
• Never touches your watch history, comments or any other website

Powered by Jev, a fast decision model from TypeSafe AI.

**Screenshots** (1280×800): `store/screenshot-1-search.png`, `store/screenshot-2-watch.png`, `store/screenshot-3-settings.png`, `store/screenshot-4-welcome.png`
**Small promo tile** (440×280): `store/promo-small-440x280.png`
**Icon:** included in the zip (`icons/icon128.png`)

## Privacy practices tab

**Single purpose:**
Label the videos shown on YouTube pages by content type (slop, clickbait, news, educational, entertainment, music, ad) so users can spot and optionally dim or hide them.

**Permission justifications:**
- `storage`: saves the user's settings and custom categories (synced across their browsers), a random install ID used for fair-use rate limiting, and a local cache of labels so videos aren't re-checked.
- Host permission `https://sloppyyt.vercel.app/*`: the extension's own backend, which classifies video titles. No other hosts are contacted.
- Content script on `youtube.com`: reads the visible titles and channel names of video tiles, looks up each video's public details (description, tags, category) from YouTube, and draws the labels on the page.

**Remote code:** No, I am not using remote code. (All JS is in the package; the backend returns JSON labels only.)

**Data usage disclosures** (tick these):
- "Website content": yes. Public video details from YouTube (title, channel, description, tags, category, stats) are sent to the backend to produce labels, together with the user's category names/descriptions.
- Everything else (personally identifiable info, health, financial, authentication, personal communications, location, web history, user activity): **not collected**.

Certify all three: data is not sold to third parties; not used for purposes unrelated to the single purpose; not used for creditworthiness or lending.

**Privacy policy URL:** https://sloppyyt.vercel.app/privacy.html

**Homepage URL:** https://sloppyyt.vercel.app

## Distribution
Public, all regions. Brave, Edge, Arc, Opera and Vivaldi users install from the same Chrome Web Store listing.
