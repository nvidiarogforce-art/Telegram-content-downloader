"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("manifest uses MV3 and narrowly scoped permissions", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ["downloads", "storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://web.telegram.org/*"]);
});

test("every referenced extension file exists", () => {
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap((script) => [...script.css, ...script.js])
  ];
  for (const file of files) assert.equal(fs.existsSync(path.join(root, file)), true, `${file} is missing`);
});
