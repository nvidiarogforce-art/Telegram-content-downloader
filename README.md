# Telegram Video Saver

A privacy-first Chrome extension for downloading videos that are already loaded and accessible in [Telegram Web](https://web.telegram.org/). It supports both Telegram Web K and A without using Telegram API credentials.

## Features

- Per-video download buttons
- Batch download for all currently loaded videos
- Visible-only batch mode
- Strict video-only detection—photos, avatars, stickers, GIF elements, audio, and documents are ignored
- Detects Telegram Web A video cards before their native `<video>` element is mounted
- Adds a labeled **Download video** control beneath every detected video card
- Automatic unique video filenames
- Validates video bytes before saving, so Telegram error pages cannot become `.htm` downloads
- Local-only operation: no analytics, accounts, ads, or remote extension servers
- Manifest V3 with only `storage` and `web.telegram.org` access

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this repository folder.
5. Open [Telegram Web](https://web.telegram.org/) or refresh it normally with `Ctrl+R`.

Do **not** use `Ctrl+Shift+R` or hold Shift while reloading Telegram Web A. A hard reload temporarily bypasses Telegram's Service Worker, which can disable streaming videos until the next normal reload.

Click the extension icon after opening a chat. Telegram loads message history lazily, so scroll through the part of the conversation you want first. The extension can batch-download only the videos currently loaded in the page.

## How it works

The content script observes native `<video>` elements and Telegram Web A's official `.message-content.video .media-inner` video-card structure. If a card has not mounted its player yet, the extension starts Telegram's normal load action and waits for the video source.

Telegram Web A exposes inline playback through a Service Worker `progressive` route that requires byte-range requests. A normal fetch of that playback URL fails, while Chrome's Downloads API can produce a `document….htm` file. This extension converts it to Telegram's official full-file `download` route inside the controlled page, checks the response type and video signature, creates a local video Blob, and only then starts the save. The button shows **Preparing video…** while those bytes are being collected; large videos can take longer.

**Download visible videos** processes cards currently on screen. **Download all loaded videos** also scrolls unloaded detected cards into view so Telegram mounts their video sources, then returns to the initially visible card when the batch finishes. Telegram can virtualize older messages, so the completed/failed totals in the popup are the authoritative batch result.

It does **not** break Telegram encryption, discover deleted messages, guess passwords, or access content that your logged-in account cannot already view.

## Development

Requirements: Node.js 18+ and `zip` for packaging.

```bash
npm test
npm run icons
npm run package
```

The packaged extension is written to `dist/telegram-video-saver-v1.5.0.zip`.

## Compatibility notes

Telegram Web changes its internal DOM over time. Detection uses native video elements rather than Telegram's minified class names. If Telegram changes its player, open an issue with the Web K/A URL—never include private chat content.

## Responsible use

Only download videos you are authorized to access, and respect copyright, privacy, and local law. This project is independent and is not affiliated with Telegram.

## License

MIT
