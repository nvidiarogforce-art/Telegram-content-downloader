(function initializeTelegramVideoSaver() {
  "use strict";

  if (window.__telegramVideoSaverLoaded) return;
  window.__telegramVideoSaverLoaded = true;

  const Utils = globalThis.TelegramMediaUtils;
  const VIDEO_SELECTOR = "video";
  const NON_VIDEO_UI_HINT = /(avatar|emoji|gif|reaction|sticker|wallpaper)/i;
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
    document.documentElement.classList.toggle("tgvs-enabled", enabled);
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
      if (enabled && event.target?.tagName?.toLowerCase() === "video") registerVideo(event.target);
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
    const videos = [];
    if (root.matches?.(VIDEO_SELECTOR)) videos.push(root);
    videos.push(...root.querySelectorAll(VIDEO_SELECTOR));
    for (const video of videos) registerVideo(video);
    pruneDescriptors();
    scheduleButtonPosition();
    return getStatus();
  }

  function registerVideo(video) {
    const descriptor = describeVideo(video);
    const existingId = descriptorIds.get(video);
    if (!descriptor) {
      if (existingId) removeDescriptor(existingId);
      return;
    }

    const id = existingId || `tgvs-${nextId++}`;
    descriptorIds.set(video, id);
    descriptor.id = id;
    descriptors.set(id, descriptor);

    if (buttons.has(id)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tgvs-download-button";
    button.dataset.videoId = id;
    button.title = "Download video";
    button.setAttribute("aria-label", "Download video");
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    button.addEventListener("click", onSingleDownload);
    document.body.append(button);
    buttons.set(id, button);
  }

  function describeVideo(video) {
    if (video.tagName?.toLowerCase() !== "video") return null;
    if (NON_VIDEO_UI_HINT.test(collectContextText(video))) return null;

    const sourceNode = [...video.querySelectorAll("source")]
      .find((node) => Utils.isVideoSourceUrl(node.src));
    const sourceUrl = video.currentSrc || video.src || sourceNode?.src || "";
    if (!Utils.isVideoSourceUrl(sourceUrl)) return null;

    const rect = video.getBoundingClientRect();
    const width = rect.width || video.videoWidth || video.width;
    const height = rect.height || video.videoHeight || video.height;
    if (width < 80 || height < 45) return null;

    const nearbyName = video.closest("[data-mid], .message, .bubble, [class*='message']")?.querySelector(
      "[class*='file-name'], [class*='document-name']"
    )?.textContent;
    return {
      element: video,
      type: "video",
      url: sourceUrl,
      mimeType: sourceNode?.type || video.getAttribute("type") || "video/mp4",
      filename: String(nearbyName || "").trim()
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
      const video = descriptors.get(id)?.element;
      if (!enabled || !video?.isConnected) {
        button.hidden = true;
        continue;
      }
      const rect = video.getBoundingClientRect();
      const visible = rect.width >= 80
        && rect.height >= 45
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < innerHeight
        && rect.left < innerWidth;
      button.hidden = !visible;
      if (!visible) continue;
      button.style.top = `${Math.max(8, rect.top + 8)}px`;
      button.style.left = `${Math.max(8, Math.min(innerWidth - 42, rect.right - 42))}px`;
    }
  }

  async function onSingleDownload(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const descriptor = descriptors.get(button.dataset.videoId);
    if (!descriptor) return;
    button.disabled = true;
    try {
      await downloadVideo(descriptor, 0);
      showToast("Video download started");
    } catch (error) {
      showToast(error.message || "Could not download this video");
    } finally {
      button.disabled = false;
    }
  }

  async function downloadVideo(descriptor, index) {
    if (descriptor.type !== "video" || !Utils.isVideoSourceUrl(descriptor.url)) {
      throw new Error("Only videos can be downloaded.");
    }
    const fallback = Utils.makeFallbackName(index);
    const filename = Utils.ensureVideoExtension(descriptor.filename || fallback, {
      mimeType: descriptor.mimeType,
      url: descriptor.url
    });

    if (/^(blob:|data:)/i.test(descriptor.url)) {
      triggerLocalDownload(descriptor.url, filename);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "DOWNLOAD_URL",
      url: descriptor.url,
      filename,
      mediaType: "video",
      mimeType: descriptor.mimeType
    });
    if (!response?.ok) throw new Error(response?.error || "Chrome could not start the video download.");
  }

  function triggerLocalDownload(url, filename) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  async function runBatch(mode) {
    if (batch.running) return getStatus();
    scan(document);
    const seen = new Set();
    const items = [...descriptors.values()]
      .filter((item) => item.type === "video" && item.element.isConnected)
      .filter((item) => mode !== "visible" || isVisible(item.element))
      .filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      });

    batch = createBatchState({ running: true, total: items.length, mode });
    if (!items.length) {
      batch.running = false;
      showToast("No loaded videos found. Open a chat and scroll through its videos first.");
      return getStatus();
    }

    showToast(`Starting ${items.length} video download${items.length === 1 ? "" : "s"}…`);
    for (let index = 0; index < items.length; index += 1) {
      if (batch.cancelled) break;
      try {
        await downloadVideo(items[index], index);
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
    const videos = [...descriptors.values()].filter((item) => item.type === "video");
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
    toastTimer = setTimeout(() => { toast.dataset.visible = "false"; }, 3000);
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
        document.documentElement.classList.toggle("tgvs-enabled", enabled);
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
