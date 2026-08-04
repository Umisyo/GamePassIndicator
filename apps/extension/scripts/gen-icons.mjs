// 外部依存なしでプレースホルダーのアイコンPNG（緑地に白いチェックマーク）を生成する。
// 本番用のデザイン画像ができたら icons/*.png を差し替える。
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../icons");

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** 点(px,py)から線分(a→b)への距離。座標は0..1正規化。 */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const GREEN = [0x10, 0x7c, 0x10];
const WHITE = [0xff, 0xff, 0xff];

function pixel(x, y, n) {
  const u = (x + 0.5) / n;
  const v = (y + 0.5) / n;
  const d = Math.min(
    segDist(u, v, 0.26, 0.52, 0.44, 0.7),
    segDist(u, v, 0.44, 0.7, 0.76, 0.3)
  );
  const th = 0.085;
  // 1pxぶんのアンチエイリアス
  const edge = 1 / n;
  const mix = Math.max(0, Math.min(1, (th - d) / edge + 0.5));
  const r = Math.round(GREEN[0] + (WHITE[0] - GREEN[0]) * mix);
  const g = Math.round(GREEN[1] + (WHITE[1] - GREEN[1]) * mix);
  const b = Math.round(GREEN[2] + (WHITE[2] - GREEN[2]) * mix);
  return [r, g, b, 255];
}

function makePng(n) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(n * (1 + n * 4));
  for (let y = 0; y < n; y++) {
    const row = y * (1 + n * 4);
    raw[row] = 0; // filter: none
    for (let x = 0; x < n; x++) {
      const [r, g, b, a] = pixel(x, y, n);
      const o = row + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(resolve(outDir, `icon-${size}.png`), makePng(size));
  console.log(`wrote icons/icon-${size}.png`);
}
