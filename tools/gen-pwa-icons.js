/* =========================================================
 * 生成 PWA 图标（public/icons/）
 *
 * 来源：android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png（192×192）
 * 产出：
 *   - icon-192.png         192×192（原样复制，PWA manifest）
 *   - icon-512.png         512×512（双线性放大，PWA manifest）
 *   - apple-touch-icon.png 180×180（双线性缩小，iOS 添加到主屏幕）
 *
 * 用法：node tools/gen-pwa-icons.js
 * 换了 App 启动图标后重跑一次即可同步。
 * ========================================================= */
"use strict";
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const SRC = path.join(root, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher.png');
const OUT = path.join(root, 'public', 'icons');

/* ---------- 最小 PNG 编解码（无依赖） ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function decodePNG(buf) {
  let off = 8, width, height, bitDepth, colorType;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) throw new Error('不支持的 PNG：bitdepth=' + bitDepth + ' colorType=' + colorType);
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const row = raw.slice(pos, pos + stride); pos += stride;
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = row[x];
      if (filter === 1) v = (v + a) & 0xFF;
      else if (filter === 2) v = (v + b) & 0xFF;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xFF;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c))) & 0xFF;
      }
      cur[x] = v;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { width, height, channels, data: out };
}
function scaleBilinear(src, tw, th) {
  const { width: sw, height: sh, channels, data } = src;
  const out = Buffer.alloc(tw * th * channels);
  const xr = sw / tw, yr = sh / th;
  for (let y = 0; y < th; y++) {
    const fy = (y + 0.5) * yr - 0.5;
    const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(sh - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < tw; x++) {
      const fx = (x + 0.5) * xr - 0.5;
      const x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(sw - 1, x0 + 1), wx = fx - x0;
      for (let c = 0; c < channels; c++) {
        const p00 = data[(y0 * sw + x0) * channels + c], p01 = data[(y0 * sw + x1) * channels + c];
        const p10 = data[(y1 * sw + x0) * channels + c], p11 = data[(y1 * sw + x1) * channels + c];
        const top = p00 + (p01 - p00) * wx, bot = p10 + (p11 - p10) * wx;
        out[(y * tw + x) * channels + c] = Math.round(top + (bot - top) * wy);
      }
    }
  }
  return { width: tw, height: th, channels, data: out };
}
function encodePNG(img) {
  const { width, height, channels, data } = img;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : 2;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 生成 ---------- */
fs.mkdirSync(OUT, { recursive: true });
const srcBuf = fs.readFileSync(SRC);
const img = decodePNG(srcBuf);
fs.writeFileSync(path.join(OUT, 'icon-192.png'), srcBuf); // 原样（本就是 192×192）
fs.writeFileSync(path.join(OUT, 'icon-512.png'), encodePNG(scaleBilinear(img, 512, 512)));
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), encodePNG(scaleBilinear(img, 180, 180)));
console.log('[gen-pwa-icons] 已生成 public/icons/{icon-192,icon-512,apple-touch-icon}.png');
