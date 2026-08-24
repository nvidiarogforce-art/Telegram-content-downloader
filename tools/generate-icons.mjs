import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "icons");
fs.mkdirSync(output, { recursive: true });

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return result;
}

function makeIcon(size) {
  const rows = [];
  const center = (size - 1) / 2;
  const radius = size * 0.46;
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      const offset = 1 + x * 4;
      const distance = Math.hypot(x - center, y - center);
      const alpha = Math.max(0, Math.min(255, (radius + 1 - distance) * 255));
      const blue = 198 + Math.round((y / size) * 31);
      const inArrow = (
        Math.abs(x - center) < size * 0.055 && y > size * 0.23 && y < size * 0.61
      ) || (
        y > size * 0.47 && y < size * 0.66 && Math.abs(x - center) < (y - size * 0.43) * 0.72
      ) || (
        y > size * 0.72 && y < size * 0.79 && x > size * 0.27 && x < size * 0.73
      );
      row[offset] = inArrow ? 255 : 35;
      row[offset + 1] = inArrow ? 255 : 158;
      row[offset + 2] = inArrow ? 255 : blue;
      row[offset + 3] = alpha;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(output, `icon${size}.png`), makeIcon(size));
}
