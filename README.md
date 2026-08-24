# Telegram Media Saver

A privacy-first Chrome extension for downloading media that is already loaded and accessible in [Telegram Web](https://web.telegram.org/). It supports both Telegram Web K and A without using Telegram API credentials.

## Features

- Per-item download buttons on supported media
- Batch download for all currently loaded media
- Visible-only batch mode
- Photos, videos, GIFs, stickers, audio, voice notes, documents, and story media
- Automatic unique filenames and a configurable download folder
- Local-only operation: no analytics, accounts, ads, or remote extension servers
- Manifest V3 with only `downloads`, `storage`, and `web.telegram.org` access

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this repository folder.
5. Open or refresh [Telegram Web](https://web.telegram.org/).

Click the extension icon after opening a chat. Telegram loads message history lazily, so scroll through the part of the conversation you want first. The extension can batch-download only the media currently loaded in the page.

## How it works

The content script observes Telegram Web's rendered page and detects downloadable media elements. Normal HTTPS files are passed to Chrome's Downloads API, which includes the browser's existing cookies. Page-local `blob:` media and canvas content are exported from the Telegram tab itself.

It does **not** break Telegram encryption, discover deleted messages, guess passwords, or access content that your logged-in account cannot already view.

## Development

Requirements: Node.js 18+ and `zip` for packaging.

```bash
npm test
npm run icons
npm run package
```

The packaged extension is written to `dist/`.

## Compatibility notes

Telegram Web changes its internal DOM over time. Detection deliberately uses several semantic fallbacks rather than depending on a single minified class name. If Telegram changes its markup, open an issue with the Web K/A URL and the media type that stopped working—never include private chat content.

## Responsible use

Only download media you are authorized to access, and respect copyright, privacy, and local law. This project is independent and is not affiliated with Telegram.

## License

MIT
