# Privacy Policy — Bookmark Atlas

**Last updated: 2026-08-10**

Bookmark Atlas is a Chrome extension that replaces the new-tab page with a card/list dashboard for your browser bookmarks.

## Data collection

**This extension does not collect, transmit, sell, or share any data.** It has no server, no analytics, no account system, and makes no network requests of its own.

## What it accesses, and why

| Permission | Why it's needed |
|---|---|
| `bookmarks` | To read your existing Chrome bookmarks (folders, titles, URLs, dates added) and let you organize them — move, delete, create folders, etc. This is the extension's core function. |
| `favicon` | To display each site's icon on bookmark cards, using Chrome's built-in favicon cache. |

All bookmark data is read directly from your local Chrome browser via the `chrome.bookmarks` API and stays there. The extension does not copy, export, or upload this data anywhere unless you personally trigger an export (CSV/JSON/PDF) and save the file yourself — those exports are written to your own device and never sent anywhere by the extension.

## Local settings storage

A few UI preferences (dark mode, card size, list vs. grid view, language) are saved in your browser's local storage so they persist between sessions. This data never leaves your device.

## Third parties

This extension does not integrate with any third-party analytics, advertising, or tracking service. It does not use any external API or remote server.

## Changes to this policy

If this policy changes, the update will be reflected here with a new "Last updated" date and noted in the extension's release notes.

## Contact

Questions about this policy or the extension can be raised via [GitHub Issues](https://github.com/sarahwangy/bookmark-organizer-extension/issues).
