"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const contentScript = fs.readFileSync(path.join(root, "content/content.js"), "utf8");
const pageBridge = fs.readFileSync(path.join(root, "content/page-bridge.js"), "utf8");
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

test("downloads are fetched and validated inside the Telegram page", () => {
  assert.match(contentScript, /tgvs:prepare-video-request/);
  assert.doesNotMatch(contentScript, /chrome\.downloads|DOWNLOAD_URL/);
  assert.match(pageBridge, /fetch\(fetchUrl, \{ credentials: "include" \}\)/);
  assert.match(pageBridge, /response\.blob\(\)/);
  assert.match(pageBridge, /looksLikeHtml\(bytes\)/);
  assert.match(pageBridge, /URL\.createObjectURL\(videoBlob\)/);
  assert.match(pageBridge, /anchor\.download = filename/);
  assert.match(pageBridge, /replace\("\/progressive\/", "\/download\/"\)/);
});

test("full batches bring unloaded cards into view and expose progress", () => {
  assert.match(contentScript, /mode === "all"/);
  assert.match(contentScript, /scrollIntoView\(\{ behavior: "auto", block: "center"/);
  assert.match(contentScript, /batch\.current = index \+ 1/);
  assert.match(contentScript, /if \(batch\.cancelled\) break/);
});

test("HTML and non-video responses cannot be saved as videos", () => {
  assert.match(pageBridge, /Telegram returned an HTML\/error document instead of video bytes/);
  assert.match(pageBridge, /declaredType\.startsWith\("image\/"\)/);
  assert.match(pageBridge, /declaredType\.startsWith\("audio\/"\)/);
  assert.match(pageBridge, /\["text\/html", "application\/json", "text\/plain"\]/);
});

test("manifest describes a video-only extension", () => {
  assert.match(manifest.name, /Video/);
  assert.match(manifest.description, /videos/i);
  assert.doesNotMatch(manifest.description, /photos|audio|stickers|files/i);
});
