"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const utils = require("../shared/media-utils.js");

test("sanitizeFilename removes reserved characters and trailing dots", () => {
  assert.equal(utils.sanitizeFilename(' report: 2026 / final?.mp4. '), "report_ 2026 _ final_.mp4");
});

test("ensureVideoExtension uses a video MIME type", () => {
  assert.equal(utils.ensureVideoExtension("lesson", { mimeType: "video/webm" }), "lesson.webm");
});

test("ensureVideoExtension preserves an existing video extension", () => {
  assert.equal(utils.ensureVideoExtension("telegram-video.webm"), "telegram-video.webm");
});

test("ensureVideoExtension replaces a non-video extension", () => {
  assert.equal(utils.ensureVideoExtension("thumbnail.jpg", { mimeType: "video/mp4" }), "thumbnail.mp4");
});

test("extensionFromUrl allows only known video extensions", () => {
  assert.equal(utils.extensionFromUrl("https://cdn.example/movie.mkv?token=1"), "mkv");
  assert.equal(utils.extensionFromUrl("https://cdn.example/cover.jpg?token=1"), "");
});

test("video source protocols are intentionally constrained", () => {
  assert.equal(utils.isVideoSourceUrl("blob:https://web.telegram.org/id"), true);
  assert.equal(utils.isVideoSourceUrl("data:video/mp4;base64,AAAA"), true);
  assert.equal(utils.isVideoSourceUrl("data:image/png;base64,AAAA"), false);
  assert.equal(utils.isVideoSourceUrl("javascript:alert(1)"), false);
});

test("fallback names are deterministic for a supplied date", () => {
  const date = new Date("2026-08-24T12:34:56.000Z");
  assert.equal(utils.makeFallbackName(4, date), "telegram-video-2026-08-24T12-34-56-000Z-005");
});
