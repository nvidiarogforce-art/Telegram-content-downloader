"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const contentScript = fs.readFileSync(path.join(root, "content/content.js"), "utf8");
const background = fs.readFileSync(path.join(root, "background.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("content scanner queries only video elements", () => {
  assert.match(contentScript, /const VIDEO_SELECTOR = "video"/);
  assert.doesNotMatch(contentScript, /querySelectorAll\(["'`]img/);
  assert.doesNotMatch(contentScript, /querySelectorAll\(["'`]audio/);
  assert.doesNotMatch(contentScript, /background-image/);
});

test("background rejects every non-video download request", () => {
  assert.match(background, /message\.mediaType !== "video"/);
});

test("manifest describes a video-only extension", () => {
  assert.match(manifest.name, /Video/);
  assert.match(manifest.description, /videos/i);
  assert.doesNotMatch(manifest.description, /photos|audio|stickers|files/i);
});
