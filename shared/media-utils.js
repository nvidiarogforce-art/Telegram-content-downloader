(function exposeMediaUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.TelegramMediaUtils = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createMediaUtils() {
  "use strict";

  const VIDEO_EXTENSIONS = new Set(["m4v", "mkv", "mov", "mp4", "webm"]);
  const MIME_EXTENSIONS = Object.freeze({
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-matroska": "mkv",
    "video/x-m4v": "m4v"
  });

  function sanitizeFilename(value, fallback = "telegram-video") {
    const cleaned = String(value || "")
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
      .replace(/\s+/g, " ")
      .replace(/^\.+|[. ]+$/g, "")
      .trim()
      .slice(0, 160);
    return cleaned || fallback;
  }

  function extensionFromMime(mimeType) {
    if (!mimeType) return "";
    return MIME_EXTENSIONS[String(mimeType).toLowerCase().split(";")[0].trim()] || "";
  }

  function extensionFromUrl(url) {
    if (!url || /^(blob:|data:)/i.test(url)) return "";
    try {
      const pathname = new URL(url, "https://web.telegram.org").pathname;
      const match = pathname.match(/\.([a-z0-9]{1,8})$/i);
      const extension = match?.[1]?.toLowerCase() || "";
      return VIDEO_EXTENSIONS.has(extension) ? extension : "";
    } catch (_error) {
      return "";
    }
  }

  function ensureVideoExtension(filename, options = {}) {
    const safeName = sanitizeFilename(filename);
    const existing = safeName.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() || "";
    if (VIDEO_EXTENSIONS.has(existing)) return safeName;
    const baseName = existing ? safeName.slice(0, -(existing.length + 1)) : safeName;
    const extension = extensionFromMime(options.mimeType)
      || extensionFromUrl(options.url)
      || "mp4";
    return `${baseName || "telegram-video"}.${extension}`;
  }

  function isVideoSourceUrl(value) {
    const url = String(value || "");
    return /^(https?:|blob:)/i.test(url) || /^data:video\//i.test(url);
  }

  function makeFallbackName(index, now = new Date()) {
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    return `telegram-video-${timestamp}-${String(index + 1).padStart(3, "0")}`;
  }

  return {
    ensureVideoExtension,
    extensionFromMime,
    extensionFromUrl,
    isVideoSourceUrl,
    makeFallbackName,
    sanitizeFilename
  };
});
