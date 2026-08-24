"use strict";

importScripts("shared/media-utils.js");

const ALLOWED_SENDER = /^https:\/\/web\.telegram\.org\//i;

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(["enabled"]);
  await chrome.storage.sync.set({
    enabled: current.enabled ?? true
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
  if (message.mediaType !== "video") {
    throw new Error("Only video downloads are supported.");
  }
  const url = String(message.url || "");
  if (!/^https?:/i.test(url)) {
    throw new Error("This media URL must be downloaded inside the Telegram tab.");
  }

  const filename = TelegramMediaUtils.ensureVideoExtension(message.filename, {
    mimeType: message.mimeType,
    url
  });

  return chrome.downloads.download({
    url,
    filename: `Telegram Videos/${filename}`,
    conflictAction: "uniquify",
    saveAs: false
  });
}
