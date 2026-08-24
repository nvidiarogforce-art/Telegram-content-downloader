"use strict";

importScripts("shared/media-utils.js");

const ALLOWED_SENDER = /^https:\/\/web\.telegram\.org\//i;

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(["enabled", "downloadFolder"]);
  await chrome.storage.sync.set({
    enabled: current.enabled ?? true,
    downloadFolder: current.downloadFolder ?? "Telegram Media"
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "DOWNLOAD_URL") return false;

  if (!ALLOWED_SENDER.test(sender.url || "")) {
    sendResponse({ ok: false, error: "Downloads are accepted only from Telegram Web." });
    return false;
  }

  startDownload(message)
    .then((downloadId) => sendResponse({ ok: true, downloadId }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function startDownload(message) {
  const url = String(message.url || "");
  if (!/^https?:/i.test(url)) {
    throw new Error("This media URL must be downloaded inside the Telegram tab.");
  }

  const settings = await chrome.storage.sync.get(["downloadFolder"]);
  const folder = TelegramMediaUtils.sanitizeFilename(settings.downloadFolder || "Telegram Media", "Telegram Media");
  const filename = TelegramMediaUtils.ensureExtension(message.filename, {
    mimeType: message.mimeType,
    type: message.mediaType,
    url
  });

  return chrome.downloads.download({
    url,
    filename: `${folder}/${filename}`,
    conflictAction: "uniquify",
    saveAs: false
  });
}
