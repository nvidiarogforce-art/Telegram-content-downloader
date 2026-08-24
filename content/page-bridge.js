(function initializeTelegramVideoBridge() {
  "use strict";

  if (window.__telegramVideoBridgeLoaded) return;
  window.__telegramVideoBridgeLoaded = true;

  const REQUEST_EVENT = "tgvs:prepare-video-request";
  const RESPONSE_EVENT = "tgvs:prepare-video-response";
  const VIDEO_MIME_EXTENSIONS = Object.freeze({
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-matroska": "mkv",
    "video/x-m4v": "m4v",
    "video/x-msvideo": "avi",
    "video/mpeg": "mpeg",
    "video/mp2t": "ts"
  });

  window.addEventListener(REQUEST_EVENT, async (event) => {
    let request;
    try {
      request = JSON.parse(String(event.detail || ""));
      validateRequest(request);
      const result = await fetchAndDownloadVideo(request.url, request.filename);
      respond({ requestId: request.requestId, ok: true, ...result });
    } catch (error) {
      respond({
        requestId: request?.requestId || "",
        ok: false,
        error: error instanceof Error ? error.message : "Could not prepare this video."
      });
    }
  });
  function validateRequest(request) {
    if (!request || typeof request.requestId !== "string" || !request.requestId) {
      throw new Error("Invalid video download request.");
    }
    const url = new URL(String(request.url || ""), location.href);
    if (!["https:", "blob:", "data:"].includes(url.protocol)) {
      throw new Error("Unsupported video source protocol.");
    }
    if (url.protocol === "data:" && !url.href.toLowerCase().startsWith("data:video/")) {
      throw new Error("The source is not video data.");
    }
  }

  async function fetchAndDownloadVideo(url, requestedFilename) {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Telegram returned HTTP ${response.status} instead of the video.`);
    }

    const declaredType = String(response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const blob = await response.blob();
    const detectedType = await detectVideoType(blob, declaredType);
    if (!detectedType) {
      throw new Error("Telegram returned an HTML/error document instead of video bytes.");
    }

    const videoBlob = blob.type === detectedType ? blob : new Blob([blob], { type: detectedType });
    const filename = ensureMatchingExtension(requestedFilename, detectedType);
    const objectUrl = URL.createObjectURL(videoBlob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 300_000);

    return { filename, mimeType: detectedType, size: videoBlob.size };
  }

  async function detectVideoType(blob, declaredType) {
    if (!blob.size) return "";
    const bytes = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
    if (looksLikeHtml(bytes)) return "";
    if (declaredType.startsWith("image/") || declaredType.startsWith("audio/")) return "";
    if (["text/html", "application/json", "text/plain"].includes(declaredType)) return "";
    if (declaredType.startsWith("video/")) return declaredType;
    if (hasAsciiAt(bytes, 4, "ftyp") || hasAsciiAt(bytes, 4, "moov") || hasAsciiAt(bytes, 4, "mdat")) {
      return "video/mp4";
    }
    if (matchesBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
    if (hasAsciiAt(bytes, 0, "RIFF") && hasAsciiAt(bytes, 8, "AVI ")) return "video/x-msvideo";
    if (matchesBytes(bytes, [0x00, 0x00, 0x01, 0xba])) return "video/mpeg";
    if (bytes[0] === 0x47 && (bytes.length < 189 || bytes[188] === 0x47)) return "video/mp2t";
    return declaredType === "application/octet-stream" ? "video/mp4" : "";
  }

  function looksLikeHtml(bytes) {
    const prefix = new TextDecoder().decode(bytes).trimStart().toLowerCase();
    return prefix.startsWith("<!doctype html")
      || prefix.startsWith("<html")
      || prefix.startsWith("<head")
      || prefix.startsWith("<body");
  }

  function hasAsciiAt(bytes, offset, value) {
    return [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
  }

  function matchesBytes(bytes, signature) {
    return signature.every((value, index) => bytes[index] === value);
  }

  function ensureMatchingExtension(value, mimeType) {
    const safeName = String(value || "telegram-video.mp4")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160) || "telegram-video.mp4";
    const extension = VIDEO_MIME_EXTENSIONS[mimeType] || "mp4";
    return /\.[a-z0-9]{1,8}$/i.test(safeName)
      ? safeName.replace(/\.[a-z0-9]{1,8}$/i, `.${extension}`)
      : `${safeName}.${extension}`;
  }

  function respond(payload) {
    window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: JSON.stringify(payload) }));
  }
})();
