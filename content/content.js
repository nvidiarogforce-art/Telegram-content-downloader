(function initializeTelegramVideoSaver() {
  "use strict";

  if (window.__telegramVideoSaverLoaded) return;
  window.__telegramVideoSaverLoaded = true;

  const Utils = globalThis.TelegramMediaUtils;
  const MEDIA_CARD_SELECTOR = "video, .media-inner";
  const NON_VIDEO_UI_HINT = /(^|[\s_-])(avatar|emoji|gif|reaction|sticker|wallpaper)(?=$|[\s_-])/i;
  const SOURCE_WAIT_TIMEOUT_MS = 60_000;
  const SOURCE_POLL_INTERVAL_MS = 250;
  const PAGE_DOWNLOAD_TIMEOUT_MS = 600_000;
  const PAGE_REQUEST_EVENT = "tgvs:prepare-video-request";
  const PAGE_RESPONSE_EVENT = "tgvs:prepare-video-response";
  const descriptors = new Map();
  const descriptorIds = new WeakMap();
  const buttons = new Map();
  let nextId = 1;
  let enabled = true;
  let scanTimer;
  let positionFrame;
  let toastTimer;
  let batch = createBatchState();

  boot();

  async function boot() {
    const settings = await chrome.storage.sync.get(["enabled"]);
    enabled = settings.enabled ?? true;
    if (enabled) scan(document);

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"]
    });

    addEventListener("scroll", scheduleButtonPosition, true);
    addEventListener("resize", scheduleButtonPosition);
    document.addEventListener("loadedmetadata", (event) => {
      if (enabled && event.target?.tagName?.toLowerCase() === "video") {
        const card = normalizeVideoCard(event.target);
        if (card) registerVideoCard(card);
      }
      scheduleButtonPosition();
    }, true);
  }

  function createBatchState(overrides = {}) {
    return {
      running: false,
      cancelled: false,
      completed: 0,
      failed: 0,
      total: 0,
      mode: "all",
      ...overrides
    };
  }

  function scheduleScan() {
    if (!enabled) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => scan(document), 180);
  }

  function scan(root) {
    if (!enabled || !root?.querySelectorAll) return getStatus();
    const candidates = [];
    if (root.matches?.(MEDIA_CARD_SELECTOR)) candidates.push(root);
    candidates.push(...root.querySelectorAll(MEDIA_CARD_SELECTOR));

    const cards = new Set(candidates.map(normalizeVideoCard).filter(Boolean));
    for (const card of cards) registerVideoCard(card);
    pruneDescriptors();
    scheduleButtonPosition();
    return getStatus();
  }

  function normalizeVideoCard(element) {
    if (element.tagName?.toLowerCase() === "video") {
      return element.closest(".media-inner") || element;
    }
    if (!element.matches?.(".media-inner")) return null;
    const durationBadge = element.querySelector(".message-media-duration");
    const isWebAVideo = Boolean(element.closest(".message-content.video"));
    const hasNativeVideo = Boolean(element.querySelector("video"));
    const hasVideoDuration = Boolean(durationBadge && durationBadge.textContent.trim().toUpperCase() !== "GIF");
    return isWebAVideo || hasNativeVideo || hasVideoDuration ? element : null;
  }

  function registerVideoCard(card) {
    const descriptor = describeVideoCard(card);
    const existingId = descriptorIds.get(card);
    if (!descriptor) {
      if (existingId) removeDescriptor(existingId);
      return;
    }

    const id = existingId || `tgvs-${nextId++}`;
    descriptorIds.set(card, id);
    descriptor.id = id;
    descriptors.set(id, descriptor);

    if (buttons.has(id)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tgvs-download-button";
    button.dataset.videoId = id;
    button.title = "Download video";
    button.setAttribute("aria-label", "Download video");
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Download video</span>';
    button.addEventListener("click", onSingleDownload);
    document.body.append(button);
    buttons.set(id, button);
  }

  function describeVideoCard(card) {
    if (NON_VIDEO_UI_HINT.test(collectContextText(card))) return null;
    const durationBadge = card.querySelector?.(".message-media-duration");
    if (durationBadge?.textContent.trim().toUpperCase() === "GIF") return null;

    const message = card.closest(".Message, [data-message-id], [data-mid], .message, .bubble");
    const messageId = message?.dataset?.messageId || message?.dataset?.mid || "";
    const nearbyName = message?.querySelector("[class*='file-name'], [class*='document-name']")?.textContent;
    const source = resolveVideoSource(card);
    return {
      element: card,
      type: "video",
      url: source.url,
      mimeType: source.mimeType,
      filename: String(nearbyName || (messageId && `telegram-video-${messageId}`) || "").trim()
    };
  }

  function collectContextText(element) {
    const values = [];
    let current = element;
    for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
      values.push(current.className || "", current.id || "", current.getAttribute?.("aria-label") || "");
    }
    return values.join(" ");
  }

  function resolveVideoSource(card) {
    const video = card.tagName?.toLowerCase() === "video" ? card : card.querySelector("video");
    const sourceNode = video && [...video.querySelectorAll("source")]
      .find((node) => Utils.isVideoSourceUrl(node.src));
    const url = video?.currentSrc || video?.src || sourceNode?.src || "";
    return {
      url: Utils.isVideoSourceUrl(url) ? url : "",
      mimeType: sourceNode?.type || video?.getAttribute("type") || "video/mp4"
    };
  }

  function pruneDescriptors() {
    for (const [id, descriptor] of descriptors) {
      if (!descriptor.element.isConnected) removeDescriptor(id);
    }
  }

  function removeDescriptor(id) {
    buttons.get(id)?.remove();
    buttons.delete(id);
    descriptors.delete(id);
  }

  function clearDetectedVideos() {
    for (const id of [...descriptors.keys()]) removeDescriptor(id);
  }

  function scheduleButtonPosition() {
    cancelAnimationFrame(positionFrame);
    positionFrame = requestAnimationFrame(positionButtons);
  }

  function positionButtons() {
    for (const [id, button] of buttons) {
      const card = descriptors.get(id)?.element;
      if (!enabled || !card?.isConnected) {
        button.hidden = true;
        continue;
      }
      const rect = card.getBoundingClientRect();
      const visible = rect.width >= 80
        && rect.height >= 45
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < innerHeight
        && rect.left < innerWidth;
      button.hidden = !visible;
      if (!visible) continue;

      const buttonWidth = button.offsetWidth || 142;
      const buttonHeight = button.offsetHeight || 34;
      const belowVideo = rect.bottom + 6;
      const top = belowVideo + buttonHeight <= innerHeight
        ? belowVideo
        : Math.max(8, rect.bottom - buttonHeight - 8);
      const centeredLeft = rect.left + ((rect.width - buttonWidth) / 2);
      button.style.top = `${top}px`;
      button.style.left = `${Math.max(8, Math.min(innerWidth - buttonWidth - 8, centeredLeft))}px`;
    }
  }

  async function onSingleDownload(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const descriptor = descriptors.get(button.dataset.videoId);
    if (!descriptor) return;

    button.disabled = true;
    setButtonLabel(button, "Preparing video…");
    scheduleButtonPosition();
    try {
      await downloadVideo(descriptor, 0);
      showToast("Video download started");
    } catch (error) {
      showToast(error.message || "Could not download this video");
    } finally {
      button.disabled = false;
      setButtonLabel(button, "Download video");
      scheduleButtonPosition();
    }
  }

  function setButtonLabel(button, text) {
    const label = button.querySelector("span");
    if (label) label.textContent = text;
  }

  async function downloadVideo(descriptor, index, shouldCancel = () => false) {
    if (descriptor.type !== "video") throw new Error("Only videos can be downloaded.");
    const source = await ensureVideoSource(descriptor, shouldCancel);
    const fallback = Utils.makeFallbackName(index);
    const filename = Utils.ensureVideoExtension(descriptor.filename || fallback, {
      mimeType: source.mimeType,
      url: source.url
    });

    await requestVerifiedPageDownload(source.url, filename);
  }

  async function ensureVideoSource(descriptor, shouldCancel) {
    let source = resolveVideoSource(descriptor.element);
    if (source.url) return source;
    descriptor.element.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window
    }));
    source = await waitForVideoSource(descriptor.element, shouldCancel);
    if (!source.url) {
      throw new Error("Telegram did not load this video. Play it once, then press Download video again.");
    }
    descriptor.url = source.url;
    descriptor.mimeType = source.mimeType;
    return source;
  }

  function waitForVideoSource(card, shouldCancel) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        const source = resolveVideoSource(card);
        if (source.url || Date.now() - startedAt >= SOURCE_WAIT_TIMEOUT_MS || shouldCancel()) {
          clearInterval(timer);
          resolve(source);
        }
      }, SOURCE_POLL_INTERVAL_MS);
    });
  }

  async function requestVerifiedPageDownload(url, filename) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const timeout = setTimeout(() => {
        removeEventListener(PAGE_RESPONSE_EVENT, handleResponse);
        reject(new Error("Preparing this video took too long. Play it once and try again."));
      }, PAGE_DOWNLOAD_TIMEOUT_MS);

      function handleResponse(event) {
        let response;
        try {
          response = JSON.parse(String(event.detail || ""));
        } catch (_error) {
          return;
        }
        if (response.requestId !== requestId) return;
        clearTimeout(timeout);
        removeEventListener(PAGE_RESPONSE_EVENT, handleResponse);
        if (response.ok) resolve(response);
        else reject(new Error(response.error || "Telegram did not return valid video bytes."));
      }

      addEventListener(PAGE_RESPONSE_EVENT, handleResponse);
      dispatchEvent(new CustomEvent(PAGE_REQUEST_EVENT, {
        detail: JSON.stringify({ requestId, url, filename })
      }));
    });
  }

  async function runBatch(mode) {
    if (batch.running) return getStatus();
    scan(document);
    const seen = new Set();
    const items = [...descriptors.values()]
      .filter((item) => item.type === "video" && item.element.isConnected)
      .filter((item) => mode !== "visible" || isVisible(item.element))
      .filter((item) => {
        const key = item.url || item.filename || item.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    batch = createBatchState({ running: true, total: items.length, mode });
    if (!items.length) {
      batch.running = false;
      showToast("No Telegram video cards found. Open a chat and scroll through its videos first.");
      return getStatus();
    }

    showToast(`Starting ${items.length} video download${items.length === 1 ? "" : "s"}…`);
    for (let index = 0; index < items.length; index += 1) {
      if (batch.cancelled) break;
      try {
        await downloadVideo(items[index], index, () => batch.cancelled);
        batch.completed += 1;
      } catch (_error) {
        batch.failed += 1;
      }
      await delay(300);
    }
    batch.running = false;
    showToast(batch.cancelled
      ? `Stopped after ${batch.completed} videos`
      : `Finished: ${batch.completed} video${batch.completed === 1 ? "" : "s"} started${batch.failed ? `, ${batch.failed} failed` : ""}`);
    return getStatus();
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width >= 80
      && rect.height >= 45
      && rect.bottom > 0
      && rect.right > 0
      && rect.top < innerHeight
      && rect.left < innerWidth;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getStatus() {
    pruneDescriptors();
    const videos = [...descriptors.values()];
    return {
      ok: true,
      enabled,
      count: videos.length,
      visibleCount: videos.filter((item) => isVisible(item.element)).length,
      batch: { ...batch }
    };
  }

  function showToast(message) {
    let toast = document.querySelector(".tgvs-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "tgvs-toast";
      toast.dataset.visible = "false";
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.dataset.visible = "true";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.dataset.visible = "false"; }, 4500);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type?.startsWith("TGMS_")) return false;
    switch (message.type) {
      case "TGMS_STATUS":
        sendResponse(getStatus());
        break;
      case "TGMS_SCAN":
        sendResponse(scan(document));
        break;
      case "TGMS_SET_ENABLED":
        enabled = Boolean(message.enabled);
        if (enabled) scan(document);
        else {
          batch.cancelled = true;
          clearDetectedVideos();
        }
        sendResponse(getStatus());
        break;
      case "TGMS_DOWNLOAD_ALL":
        runBatch("all");
        sendResponse(getStatus());
        break;
      case "TGMS_DOWNLOAD_VISIBLE":
        runBatch("visible");
        sendResponse(getStatus());
        break;
      case "TGMS_STOP":
        batch.cancelled = true;
        sendResponse(getStatus());
        break;
      default:
        sendResponse({ ok: false, error: "Unknown command" });
    }
    return false;
  });
})();
