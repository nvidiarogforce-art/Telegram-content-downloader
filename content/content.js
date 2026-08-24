(function initializeTelegramMediaSaver() {
  "use strict";

  if (window.__telegramMediaSaverLoaded) return;
  window.__telegramMediaSaverLoaded = true;

  const Utils = globalThis.TelegramMediaUtils;
  const MEDIA_SELECTOR = "img, video, audio, canvas, a[href], [style*='background-image']";
  const MESSAGE_CONTEXT = [
    ".message",
    ".bubble",
    "[data-mid]",
    "[class*='message']",
    "[class*='media']",
    "[class*='attachment']",
    "[class*='document']",
    "[class*='story']",
    "[class*='album']"
  ].join(",");
  const FILE_HINT = /\.(avif|bmp|gif|heic|jpe?g|m4a|mkv|mov|mp3|mp4|ogg|opus|pdf|png|rar|tgz|wav|webm|webp|zip)(?:$|[?#])/i;
  const UI_HINT = /(avatar|emoji|reaction|profile-photo|peer-title|icon|badge)/i;
  const MEDIA_HINT = /(media|photo|video|audio|voice|sticker|gif|document|file|story|album|attachment)/i;
  const descriptors = new Map();
  const descriptorIds = new WeakMap();
  let nextId = 1;
  let enabled = true;
  let observer;
  let scanTimer;
  let toastTimer;
  let batch = {
    running: false,
    cancelled: false,
    completed: 0,
    failed: 0,
    total: 0,
    mode: "all"
  };

  boot();

  async function boot() {
    const settings = await chrome.storage.sync.get(["enabled"]);
    enabled = settings.enabled ?? true;
    document.documentElement.classList.toggle("tgms-enabled", enabled);
    scan(document);
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "href", "style"] });
  }

  function scheduleScan(mutations) {
    if (!enabled) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      const roots = mutations
        .flatMap((mutation) => [...mutation.addedNodes])
        .filter((node) => node.nodeType === Node.ELEMENT_NODE);
      if (!roots.length) scan(document);
      else roots.forEach((root) => scan(root));
    }, 180);
  }

  function scan(root) {
    if (!enabled || !root?.querySelectorAll) return getStatus();
    const elements = [];
    if (root.matches?.(MEDIA_SELECTOR)) elements.push(root);
    elements.push(...root.querySelectorAll(MEDIA_SELECTOR));
    for (const element of elements) registerElement(element);
    pruneDescriptors();
    return getStatus();
  }

  function registerElement(element) {
    const descriptor = describeElement(element);
    if (!descriptor) return;

    let id = descriptorIds.get(element);
    if (!id) {
      id = `tgms-${nextId++}`;
      descriptorIds.set(element, id);
    }
    descriptor.id = id;
    descriptors.set(id, descriptor);

    const host = findButtonHost(element);
    if (!host || host.querySelector(`:scope > .tgms-download-button[data-media-id="${id}"]`)) return;
    host.classList.add("tgms-media-host");
    const siblingCount = host.querySelectorAll(":scope > .tgms-download-button").length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tgms-download-button";
    button.dataset.mediaId = id;
    button.style.setProperty("--tgms-offset", `${8 + siblingCount * 40}px`);
    button.title = `Download ${descriptor.type}`;
    button.setAttribute("aria-label", `Download ${descriptor.type}`);
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    button.addEventListener("click", onSingleDownload);
    host.append(button);
  }

  function describeElement(element) {
    const tag = element.tagName?.toLowerCase();
    if (!tag) return null;
    const classText = `${element.className || ""} ${element.parentElement?.className || ""}`;
    const inMessage = Boolean(element.closest(MESSAGE_CONTEXT));

    if (tag === "img") {
      const sourceUrl = Utils.bestSrcsetUrl(element.srcset) || element.currentSrc || element.src;
      if (!Utils.isDownloadableUrl(sourceUrl)) return null;
      const substantial = (element.naturalWidth || element.width) >= 64 || (element.naturalHeight || element.height) >= 64;
      if (!substantial || (!inMessage && UI_HINT.test(classText) && !MEDIA_HINT.test(classText))) return null;
      if (!inMessage && !MEDIA_HINT.test(classText) && !FILE_HINT.test(sourceUrl)) return null;
      return makeDescriptor(element, "image", sourceUrl, element.alt);
    }

    if (tag === "video" || tag === "audio") {
      const source = [...element.querySelectorAll("source")]
        .map((node) => node.src)
        .find(Utils.isDownloadableUrl);
      const sourceUrl = element.currentSrc || element.src || source;
      if (!Utils.isDownloadableUrl(sourceUrl)) return null;
      return makeDescriptor(element, tag, sourceUrl, element.getAttribute("aria-label"));
    }

    if (tag === "canvas") {
      const substantial = element.width >= 64 || element.height >= 64;
      if (!substantial || (!inMessage && !MEDIA_HINT.test(classText))) return null;
      return makeDescriptor(element, "canvas", "", "canvas");
    }

    if (tag === "a") {
      const sourceUrl = element.href;
      const looksLikeFile = element.hasAttribute("download") || FILE_HINT.test(sourceUrl) || MEDIA_HINT.test(classText);
      if (!looksLikeFile || !Utils.isDownloadableUrl(sourceUrl) || /^javascript:/i.test(sourceUrl)) return null;
      if (!inMessage && !element.hasAttribute("download") && !FILE_HINT.test(sourceUrl)) return null;
      return makeDescriptor(element, "document", sourceUrl, element.download || element.textContent);
    }

    const backgroundUrl = getBackgroundUrl(element);
    if (backgroundUrl && inMessage && MEDIA_HINT.test(classText)) {
      return makeDescriptor(element, "image", backgroundUrl, element.getAttribute("aria-label"));
    }
    return null;
  }

  function makeDescriptor(element, type, url, preferredName) {
    const nearbyName = element.closest(MESSAGE_CONTEXT)?.querySelector(
      "[class*='file-name'], [class*='document-name'], [class*='title']"
    )?.textContent;
    const rawName = preferredName || nearbyName || element.getAttribute("title") || "";
    return {
      element,
      type,
      url,
      mimeType: element.currentSrc ? "" : (element.type || ""),
      filename: rawName.trim()
    };
  }

  function getBackgroundUrl(element) {
    const match = getComputedStyle(element).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);
    return match && Utils.isDownloadableUrl(match[1]) ? match[1] : "";
  }

  function findButtonHost(element) {
    const preferred = element.closest("[class*='media'], [class*='document'], [class*='attachment'], .bubble");
    const host = preferred || element.parentElement;
    if (!host || ["AUDIO", "SOURCE", "PICTURE"].includes(host.tagName)) return host?.parentElement || null;
    return host;
  }

  function pruneDescriptors() {
    for (const [id, descriptor] of descriptors) {
      if (!descriptor.element.isConnected) descriptors.delete(id);
    }
  }

  async function onSingleDownload(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const descriptor = descriptors.get(button.dataset.mediaId);
    if (!descriptor) return;
    button.disabled = true;
    try {
      await downloadDescriptor(descriptor, 0);
      showToast("Download started");
    } catch (error) {
      showToast(error.message || "Could not download this item");
    } finally {
      button.disabled = false;
    }
  }

  async function downloadDescriptor(descriptor, index) {
    const fallback = Utils.makeFallbackName(descriptor.type, index);
    const filename = Utils.ensureExtension(descriptor.filename || fallback, {
      type: descriptor.type,
      mimeType: descriptor.mimeType,
      url: descriptor.url
    });

    if (descriptor.type === "canvas") {
      const blob = await canvasToBlob(descriptor.element);
      return downloadBlob(blob, filename);
    }

    if (/^(blob:|data:)/i.test(descriptor.url)) {
      return downloadLocalUrl(descriptor.url, filename);
    }

    const response = await chrome.runtime.sendMessage({
      type: "DOWNLOAD_URL",
      url: descriptor.url,
      filename,
      mediaType: descriptor.type,
      mimeType: descriptor.mimeType
    });
    if (!response?.ok) throw new Error(response?.error || "Chrome could not start the download.");
    return response.downloadId;
  }

  function downloadLocalUrl(url, filename) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.documentElement.append(anchor);
    anchor.click();
    anchor.remove();
  }

  function downloadBlob(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    downloadLocalUrl(objectUrl, filename);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas media is unavailable.")), "image/png");
      } catch (_error) {
        reject(new Error("Telegram has protected this canvas from direct export."));
      }
    });
  }

  async function runBatch(mode) {
    if (batch.running) return getStatus();
    pruneDescriptors();
    const seen = new Set();
    const items = [...descriptors.values()]
      .filter((item) => item.element.isConnected)
      .filter((item) => mode !== "visible" || isVisible(item.element))
      .filter((item) => {
        const key = item.url || item.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    batch = { running: true, cancelled: false, completed: 0, failed: 0, total: items.length, mode };
    showToast(items.length ? `Starting ${items.length} downloads…` : "No loaded media found. Scroll through the chat, then scan again.");
    for (let index = 0; index < items.length; index += 1) {
      if (batch.cancelled) break;
      try {
        await downloadDescriptor(items[index], index);
        batch.completed += 1;
      } catch (_error) {
        batch.failed += 1;
      }
      await delay(250);
    }
    batch.running = false;
    showToast(batch.cancelled
      ? `Stopped after ${batch.completed} downloads`
      : `Finished: ${batch.completed} started${batch.failed ? `, ${batch.failed} failed` : ""}`);
    return getStatus();
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getStatus() {
    pruneDescriptors();
    return {
      ok: true,
      enabled,
      count: descriptors.size,
      visibleCount: [...descriptors.values()].filter((item) => isVisible(item.element)).length,
      batch: { ...batch }
    };
  }

  function showToast(message) {
    let toast = document.querySelector(".tgms-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "tgms-toast";
      toast.dataset.visible = "false";
      document.documentElement.append(toast);
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
        document.documentElement.classList.toggle("tgms-enabled", enabled);
        if (enabled) scan(document);
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
