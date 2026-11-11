// Usage: node make-ean13.mjs <13 digits> <out.png> [size=2048]
// Dependency-free EAN-13 poster: a square white image with the barcode centred and large.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const [code, out, sizeArg] = process.argv.slice(2);
if (!/^\d{13}$/.test(code ?? '') || !out) { console.error('usage: node make-ean13.mjs <13 digits> <out.png> [size]'); process.exit(2); }
const SIZE = Number(sizeArg ?? 2048);
const d = [...code].map(Number);
const check = (10 - (d.slice(0, 12).reduce((s, v, i) => s + v * (i % 2 ? 3 : 1), 0) % 10)) % 10;
if (check !== d[12]) { console.error(`bad check digit: ${code} wants ${check}`); process.exit(2); }

const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
let bits = '101';
const par = PARITY[d[0]];
for (let i = 0; i < 6; i++) bits += (par[i] === 'L' ? L : G)[d[1 + i]];
bits += '01010';
for (let i = 0; i < 6; i++) bits += R[d[7 + i]];
bits += '101';

const modules = bits.length;            // 95
const quiet = 10;
const px = Math.floor((SIZE * 0.94) / (modules + 2 * quiet));
const barW = modules * px, barH = Math.floor(SIZE * 0.5);
const x0 = Math.floor((SIZE - barW) / 2), y0 = Math.floor((SIZE - barH) / 2);
const raw = Buffer.alloc((SIZE * 3 + 1) * SIZE, 255);
for (let y = 0; y < SIZE; y++) raw[y * (SIZE * 3 + 1)] = 0;
for (let y = y0; y < y0 + barH; y++) {
  for (let m = 0; m < modules; m++) {
    if (bits[m] !== '1') continue;
    for (let k = 0; k < px; k++) {
      const o = y * (SIZE * 3 + 1) + 1 + (x0 + m * px + k) * 3;
      raw[o] = raw[o + 1] = raw[o + 2] = 0;
    }
  }
}
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(t), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`wrote ${out}: ${code}, ${px}px per module, ${SIZE}x${SIZE}`);
