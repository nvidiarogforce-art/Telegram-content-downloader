# Telegram Video Saver

A privacy-first Chrome extension for downloading videos that are already loaded and accessible in [Telegram Web](https://web.telegram.org/). It supports both Telegram Web K and A without using Telegram API credentials.

## Features

- Per-video download buttons
- Batch download for all currently loaded videos
- Visible-only batch mode
- Strict video-only detection—photos, avatars, stickers, GIF elements, audio, and documents are ignored
- Automatic unique video filenames
- Local-only operation: no analytics, accounts, ads, or remote extension servers
- Manifest V3 with only `downloads`, `storage`, and `web.telegram.org` access

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this repository folder.
5. Open or refresh [Telegram Web](https://web.telegram.org/).

Click the extension icon after opening a chat. Telegram loads message history lazily, so scroll through the part of the conversation you want first. The extension can batch-download only the videos currently loaded in the page.

## How it works

The content script observes only rendered `<video>` elements. Normal HTTPS video files are passed to Chrome's Downloads API, which includes the browser's existing cookies. Page-local `blob:` videos are downloaded from the Telegram tab itself.

It does **not** break Telegram encryption, discover deleted messages, guess passwords, or access content that your logged-in account cannot already view.

## Development

Requirements: Node.js 18+ and `zip` for packaging.

```bash
npm test
npm run icons
npm run package
```

The packaged extension is written to `dist/telegram-video-saver-v1.1.0.zip`.

## Compatibility notes

Telegram Web changes its internal DOM over time. Detection uses native video elements rather than Telegram's minified class names. If Telegram changes its player, open an issue with the Web K/A URL—never include private chat content.

## Responsible use

Only download videos you are authorized to access, and respect copyright, privacy, and local law. This project is independent and is not affiliated with Telegram.

## License

MIT
