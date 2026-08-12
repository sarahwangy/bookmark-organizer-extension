# Bookmark Atlas

**English | [中文](README.zh-CN.md)**

*Explore your bookmarks.*

A Chrome new-tab extension that replaces the default new-tab page with a magazine-style card view of your bookmarks — YouTube thumbnail previews, multi-select + drag-and-drop into folders, and direct read/write access to your real Chrome bookmarks.

![Demo](assets/bookmark-organizer.gif)

## Features

- Replaces the new-tab page with a card-based bookmark browser
- YouTube video thumbnails auto-preview
- Multi-select bookmarks and drag them into folders
- Search, filter by type (YouTube / other), and sort by date or title
- Card size options and dark mode
- Built-in English/中文 language toggle (top bar) — the extension UI itself is bilingual, not just this README
- Works directly on your real Chrome bookmarks — no external server, no account, no data leaves your browser

## Screenshots

**Grid overview** — all bookmarks as cards, sorted/filtered from the top bar
![Grid overview](screenshots/small/05-grid-overview-new.png)

**YouTube thumbnails** — video bookmarks show their real thumbnail
![YouTube thumbnails](screenshots/small/06-youtube-thumbnails-new.png)

**List view + Group by site** — flip grouping on or off, grouped by domain when it's on
![List view with group by site](screenshots/small/all-bookmark-list-groupby.png)

**Smart grouping** — one-click suggestions to group bookmarks scattered across folders by domain
![Smart grouping suggestion](screenshots/small/smart-group-suggestion.png)

**Duplicate detection** — finds redundant bookmarks (URL-normalized) so you can clean them up in one pass
![Duplicate detection](screenshots/small/07-duplicates.png)

**Analytics — overview** — total counts plus a content-topic breakdown
![Analytics overview](screenshots/small/08-analytics-overview.png)

**Analytics — top domains** — which sites you bookmark from the most, as a clickable pie chart
![Analytics top domains](screenshots/small/09-analytics-domains.png)

**Analytics — yearly/monthly trend** — when you actually added your bookmarks, over time
![Analytics yearly trend](screenshots/small/dashboard-based-on-year.png)

**Appearance settings** — dark mode and adjustable card size
![Appearance settings](screenshots/small/apprearance-option.png)

## Installation

This extension is not published on the Chrome Web Store — install it manually in developer mode:

1. Download or clone this repository
2. Open `chrome://extensions` in Chrome
3. Turn on **Developer mode** (top right)
4. Click **Load unpacked** and select this project's folder
5. Open a new tab — you should see Bookmark Atlas

> Note: `newtab.html` must be loaded as an installed extension, not opened directly as a file — it needs the `chrome.bookmarks` API.

## Permissions

The extension only requests:
- `bookmarks` — to read and organize your Chrome bookmarks
- `favicon` — to show site icons on cards

No network requests are made and no data is collected or sent anywhere.

## License

MIT — see [LICENSE](LICENSE).
