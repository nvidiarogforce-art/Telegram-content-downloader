"use strict";

const elements = {
  enabled: document.querySelector("#enabled"),
  count: document.querySelector("#mediaCount"),
  message: document.querySelector("#message"),
  scan: document.querySelector("#scan"),
  downloadAll: document.querySelector("#downloadAll"),
  downloadVisible: document.querySelector("#downloadVisible"),
  stop: document.querySelector("#stop")
};

let activeTab;
let pollTimer;

initialize();

async function initialize() {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const settings = await chrome.storage.sync.get(["enabled"]);
  elements.enabled.checked = settings.enabled ?? true;

  const isTelegram = /^https:\/\/web\.telegram\.org\//i.test(activeTab?.url || "");
  setControlsEnabled(isTelegram);
  if (!isTelegram) {
    showMessage("Open web.telegram.org to use the downloader.", true);
    elements.count.textContent = "0";
    return;
  }
  await refreshStatus();
}

async function send(type, extra = {}) {
  if (!activeTab?.id) throw new Error("Telegram tab not found.");
  return chrome.tabs.sendMessage(activeTab.id, { type, ...extra });
}

async function refreshStatus() {
  try {
    const status = await send("TGMS_STATUS");
    renderStatus(status);
  } catch (_error) {
    showMessage("Refresh the Telegram tab once, then reopen this popup.", true);
    elements.count.textContent = "0";
  }
}

function renderStatus(status) {
  elements.count.textContent = String(status?.count || 0);
  elements.enabled.checked = status?.enabled ?? elements.enabled.checked;
  const running = Boolean(status?.batch?.running);
  elements.stop.hidden = !running;
  elements.downloadAll.disabled = running || !status?.count;
  elements.downloadVisible.disabled = running || !status?.visibleCount;

  if (running) {
    const done = status.batch.completed + status.batch.failed;
    const current = status.batch.current || Math.min(done + 1, status.batch.total);
    const failures = status.batch.failed ? ` · ${status.batch.failed} failed` : "";
    showMessage(`Preparing video ${current} of ${status.batch.total} · ${done} finished${failures}`);
    clearTimeout(pollTimer);
    pollTimer = setTimeout(refreshStatus, 450);
  } else if (status?.count) {
    showMessage(`${status.visibleCount} videos currently visible. Scroll upward to load more before a full batch.`);
  } else {
    showMessage("No videos found yet. Open a chat, scroll through its videos, and scan again.");
  }
}

function showMessage(text, isError = false) {
  elements.message.textContent = text;
  elements.message.classList.toggle("error", isError);
}

function setControlsEnabled(enabled) {
  for (const element of [elements.enabled, elements.scan, elements.downloadAll, elements.downloadVisible]) {
    element.disabled = !enabled;
  }
}

elements.scan.addEventListener("click", () => runCommand("TGMS_SCAN"));
elements.downloadAll.addEventListener("click", () => runCommand("TGMS_DOWNLOAD_ALL"));
elements.downloadVisible.addEventListener("click", () => runCommand("TGMS_DOWNLOAD_VISIBLE"));
elements.stop.addEventListener("click", () => runCommand("TGMS_STOP"));

elements.enabled.addEventListener("change", async () => {
  try {
    const enabled = elements.enabled.checked;
    await chrome.storage.sync.set({ enabled });
    renderStatus(await send("TGMS_SET_ENABLED", { enabled }));
  } catch (_error) {
    showMessage("Could not update the Telegram tab. Refresh it and try again.", true);
  }
});

async function runCommand(type) {
  try {
    renderStatus(await send(type));
  } catch (_error) {
    showMessage("Telegram tab stopped responding. Refresh the page and try again.", true);
  }
}
