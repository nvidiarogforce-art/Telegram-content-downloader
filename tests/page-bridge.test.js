"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const bridgeSource = fs.readFileSync(path.resolve(__dirname, "../content/page-bridge.js"), "utf8");

function createHarness(response) {
  const events = new EventTarget();
  const clicks = [];
  const objectUrls = [];
  const fetchCalls = [];
  const body = { append() {} };
  const document = {
    body,
    createElement(tagName) {
      assert.equal(tagName, "a");
      return {
        click() { clicks.push({ href: this.href, download: this.download }); },
        remove() {},
        style: {}
      };
    }
  };
  class TestURL extends URL {}
  TestURL.createObjectURL = (blob) => {
    objectUrls.push(blob);
    return "blob:https://web.telegram.org/verified-video";
  };
  TestURL.revokeObjectURL = () => {};

  const context = {
    Blob,
    CustomEvent,
    EventTarget,
    TextDecoder,
    Uint8Array,
    URL: TestURL,
    document,
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return response;
    },
    location: { href: "https://web.telegram.org/a/", origin: "https://web.telegram.org" },
    setTimeout() {},
    window: {
      addEventListener: events.addEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events)
    }
  };
  vm.runInNewContext(bridgeSource, context);

  async function request(detail) {
    return new Promise((resolve) => {
      events.addEventListener("tgvs:prepare-video-response", (event) => {
        resolve(JSON.parse(event.detail));
      }, { once: true });
      events.dispatchEvent(new CustomEvent("tgvs:prepare-video-request", {
        detail: JSON.stringify(detail)
      }));
    });
  }

  return { clicks, fetchCalls, objectUrls, request };
}

test("page bridge saves a verified MP4 Blob with a video extension", async () => {
  const bytes = new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypisom"), 0, 0, 0, 0]);
  const response = new Response(new Blob([bytes]), {
    status: 200,
    headers: { "content-type": "application/octet-stream" }
  });
  const harness = createHarness(response);
  const result = await harness.request({
    requestId: "request-1",
    url: "https://web.telegram.org/a/progressive/media-hash?account=3",
    filename: "telegram-video.mp4"
  });

  assert.equal(result.ok, true);
  assert.equal(result.filename, "telegram-video.mp4");
  const fetchedUrl = new URL(harness.fetchCalls[0].url);
  assert.equal(fetchedUrl.pathname, "/a/download/media-hash");
  assert.equal(fetchedUrl.searchParams.get("account"), "3");
  assert.equal(fetchedUrl.searchParams.get("filename"), "telegram-video.mp4");
  assert.equal(harness.fetchCalls[0].options.credentials, "include");
  assert.equal(harness.clicks.length, 1);
  assert.equal(harness.clicks[0].download, "telegram-video.mp4");
  assert.equal(harness.objectUrls[0].type, "video/mp4");
});

test("page bridge rejects an HTML response and never clicks download", async () => {
  const response = new Response("<!doctype html><title>Telegram error</title>", {
    status: 200,
    headers: { "content-type": "text/html" }
  });
  const harness = createHarness(response);
  const result = await harness.request({
    requestId: "request-2",
    url: "https://web.telegram.org/stream/failed",
    filename: "document.htm"
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /HTML\/error document/);
  assert.equal(harness.clicks.length, 0);
  assert.equal(harness.objectUrls.length, 0);
});
