"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const contentScript = fs.readFileSync(path.join(root, "content/content.js"), "utf8");
const background = fs.readFileSync(path.join(root, "background.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("content scanner targets native videos and Telegram video cards", () => {
  assert.match(contentScript, /const MEDIA_CARD_SELECTOR = "video, \.media-inner"/);
  assert.match(contentScript, /closest\("\.message-content\.video"\)/);
  assert.match(contentScript, /querySelector\("\.message-media-duration"\)/);
  assert.doesNotMatch(contentScript, /querySelectorAll\(["'`]img/);
  assert.doesNotMatch(contentScript, /querySelectorAll\(["'`]audio/);
  assert.doesNotMatch(contentScript, /background-image/);
});

test("every detected video gets a labeled download control", () => {
  assert.match(contentScript, /<span>Download video<\/span>/);
  assert.match(contentScript, /const belowVideo = rect\.bottom \+ 6/);
});

test("unloaded Telegram video cards are clicked once and awaited", () => {
  assert.match(contentScript, /descriptor\.element\.dispatchEvent\(new MouseEvent\("click"/);
  assert.match(contentScript, /SOURCE_WAIT_TIMEOUT_MS = 60_000/);
});

test("background rejects every non-video download request", () => {
  assert.match(background, /message\.mediaType !== "video"/);
});

test("manifest describes a video-only extension", () => {
  assert.match(manifest.name, /Video/);
  assert.match(manifest.description, /videos/i);
  assert.doesNotMatch(manifest.description, /photos|audio|stickers|files/i);
});
