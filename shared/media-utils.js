(function exposeMediaUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.TelegramMediaUtils = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createMediaUtils() {
  "use strict";

  const MIME_EXTENSIONS = Object.freeze({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "application/pdf": "pdf",
    "application/zip": "zip"
  });

  const TYPE_EXTENSIONS = Object.freeze({
    image: "jpg",
    video: "mp4",
    audio: "ogg",
    document: "bin",
    canvas: "png"
  });

  function sanitizeFilename(value, fallback = "telegram-media") {
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
      return match ? match[1].toLowerCase() : "";
    } catch (_error) {
      return "";
    }
  }

  function ensureExtension(filename, options = {}) {
    const safeName = sanitizeFilename(filename);
    if (/\.[a-z0-9]{1,8}$/i.test(safeName)) return safeName;
    const extension = extensionFromMime(options.mimeType)
      || extensionFromUrl(options.url)
      || TYPE_EXTENSIONS[options.type]
      || "bin";
    return `${safeName}.${extension}`;
  }

  function parseSrcset(srcset) {
    if (!srcset) return [];
    return String(srcset)
      .split(",")
      .map((candidate) => {
        const parts = candidate.trim().split(/\s+/);
        const descriptor = parts[1] || "1x";
        const weight = descriptor.endsWith("w")
          ? Number.parseFloat(descriptor)
          : Number.parseFloat(descriptor) * 10000;
        return { url: parts[0], weight: Number.isFinite(weight) ? weight : 0 };
      })
      .filter((candidate) => candidate.url)
      .sort((a, b) => b.weight - a.weight);
  }

  function bestSrcsetUrl(srcset) {
    return parseSrcset(srcset)[0]?.url || "";
  }

  function isDownloadableUrl(value) {
    return /^(https?:|blob:|data:)/i.test(String(value || ""));
  }

  function typeFromElementTag(tagName) {
    const tag = String(tagName || "").toLowerCase();
    if (tag === "img" || tag === "picture") return "image";
    if (tag === "video") return "video";
    if (tag === "audio") return "audio";
    if (tag === "canvas") return "canvas";
    return "document";
  }

  function makeFallbackName(type, index, now = new Date()) {
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    return `telegram-${type || "media"}-${timestamp}-${String(index + 1).padStart(3, "0")}`;
  }

  return {
    bestSrcsetUrl,
    ensureExtension,
    extensionFromMime,
    extensionFromUrl,
    isDownloadableUrl,
    makeFallbackName,
    parseSrcset,
    sanitizeFilename,
    typeFromElementTag
  };
});
