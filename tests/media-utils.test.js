"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const utils = require("../shared/media-utils.js");

test("sanitizeFilename removes reserved characters and trailing dots", () => {
  assert.equal(utils.sanitizeFilename(' report: 2026 / final?.mp4. '), "report_ 2026 _ final_.mp4");
});

test("ensureExtension uses MIME type before generic media type", () => {
  assert.equal(utils.ensureExtension("voice-note", { type: "audio", mimeType: "audio/mpeg" }), "voice-note.mp3");
});

test("ensureExtension preserves an existing extension", () => {
  assert.equal(utils.ensureExtension("telegram-video.webm", { type: "video" }), "telegram-video.webm");
});

test("extensionFromUrl ignores query strings", () => {
  assert.equal(utils.extensionFromUrl("https://cdn.example/file/photo.webp?token=1"), "webp");
});

test("bestSrcsetUrl selects the largest candidate", () => {
  assert.equal(utils.bestSrcsetUrl("small.jpg 320w, large.jpg 1280w, medium.jpg 640w"), "large.jpg");
});

test("downloadable protocols are intentionally constrained", () => {
  assert.equal(utils.isDownloadableUrl("blob:https://web.telegram.org/id"), true);
  assert.equal(utils.isDownloadableUrl("javascript:alert(1)"), false);
});

test("fallback names are deterministic for a supplied date", () => {
  const date = new Date("2026-08-24T12:34:56.000Z");
  assert.equal(utils.makeFallbackName("video", 4, date), "telegram-video-2026-08-24T12-34-56-000Z-005");
});
