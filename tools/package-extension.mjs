import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const output = path.join(dist, "telegram-video-saver-v1.3.0.zip");
fs.mkdirSync(dist, { recursive: true });
if (fs.existsSync(output)) fs.unlinkSync(output);

const files = ["manifest.json", "background.js", "content", "icons", "popup", "shared", "PRIVACY.md", "LICENSE"];
execFileSync("zip", ["-r", "-q", output, ...files], { cwd: root, stdio: "inherit" });
console.log(output);
