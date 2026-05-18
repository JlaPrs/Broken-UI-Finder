// Icon-Generator für Broken UI Finder
// Benötigt keine npm-Pakete — nur Node.js built-ins
const fs   = require("fs");
const path = require("path");
const zlib = require("zlib");

// ─── PNG Writer (RGBA mit Transparenz) ───────────────────────────────────────
function writePNG(pixels, w, h, filePath) {
  function chunk(type, data) {
    const buf = Buffer.alloc(12 + data.length);
    buf.writeUInt32BE(data.length, 0);
    buf.write(type, 4, "ascii");
    data.copy(buf, 8);
    let crc = 0xffffffff;
    for (let i = 4; i < 8 + data.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    buf.writeInt32BE((crc ^ 0xffffffff) | 0, 8 + data.length);
    return buf;
  }
  const sig  = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixels[y][x];
      const off = y * (1 + w * 4) + 1 + x * 4;
      raw[off] = r; raw[off+1] = g; raw[off+2] = b; raw[off+3] = a;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 6 });
  const out = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
  fs.writeFileSync(filePath, out);
  console.log(`✓ ${path.basename(filePath)} (${w}×${h})`);
}

// ─── Farben (RGBA) ────────────────────────────────────────────────────────────
const BG      = [31,  41,  55,  255]; // #1f2937
const HEADER  = [45,  58,  75,  255]; // etwas heller als BG für Titelleiste
const WHITE   = [255, 255, 255, 255];
const ORANGE  = [249, 115, 22,  255]; // #f97316

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0]-a[0]) * t),
    Math.round(a[1] + (b[1]-a[1]) * t),
    Math.round(a[2] + (b[2]-a[2]) * t),
    Math.round(a[3] + (b[3]-a[3]) * t),
  ];
}

// ─── SDF Helpers ─────────────────────────────────────────────────────────────
function sdCircle(px, py, cx, cy, r) {
  return Math.sqrt((px-cx)**2 + (py-cy)**2) - r;
}

// Signed distance to an axis-aligned rounded rectangle
function sdRRect(px, py, x1, y1, x2, y2, r) {
  const cx = (x1+x2)/2, cy = (y1+y2)/2;
  const qx = Math.abs(px-cx) - ((x2-x1)/2 - r);
  const qy = Math.abs(py-cy) - ((y2-y1)/2 - r);
  return Math.sqrt(Math.max(qx,0)**2 + Math.max(qy,0)**2)
       + Math.min(Math.max(qx,qy), 0) - r;
}

function sat(d) { return Math.max(0, Math.min(1, 0.5 - d)); }

// ─── Icon zeichnen ────────────────────────────────────────────────────────────
function drawIcon(size) {
  const s = size;
  const TRANSPARENT = [0,0,0,0];
  const pixels = Array.from({length: s}, () => Array(s).fill(null));

  // ── Hintergrund: abgerundete Ecken
  const cornerR = s * 0.22;

  // ── Browser-Fenster
  const bx1 = s * 0.055,  bx2 = s * 0.695;
  const by1 = s * 0.100,  by2 = s * 0.890;
  const bR  = s * 0.062;   // Eckenradius des Fensters
  const bLW = s * 0.062;   // Rahmendicke
  // Trennlinie Titelleiste / Inhalt
  const hY  = by1 + (by2 - by1) * 0.205;

  // ── Dots in Titelleiste (3 Kreise)
  const dtY  = (by1 + hY) / 2;
  const dtR  = s * 0.040;
  const dtX0 = bx1 + s * 0.068;
  const dtSp = dtR * 2.6;

  // ── Linkes Inhaltsrechteck (gefüllt, weiß)
  const cbx1 = bx1 + bLW + s * 0.018;
  const cbx2 = cbx1 + (bx2 - bx1 - bLW * 2) * 0.370;
  const cby1 = hY  + s * 0.030;
  const cby2 = by2 - bLW - s * 0.018;

  // ── 3 Text-Balken rechts (gefüllt, weiß)
  const lx1  = cbx2 + s * 0.028;
  const lx2  = bx2  - bLW - s * 0.016;
  const lH   = (cby2 - cby1) * 0.205;
  const lGap = (cby2 - cby1 - 3 * lH) / 2;

  // ── Oranges Ausrufezeichen (rechts neben/überlappend mit Browser)
  //    Strich: abgerundetes Rechteck; Punkt: Kreis
  const exCX = s * 0.825;
  const exHW = s * 0.092;  // halbe Breite
  const exY1 = s * 0.255;  // Strich oben
  const exY2 = s * 0.660;  // Strich unten
  const exDY = s * 0.790;  // Punkt-Mitte
  const exDR = exHW * 0.97;

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {

      // ── Hintergrund mit AA-Ecken ──────────────────────────────────────────
      const dTL = sdCircle(x, y, cornerR,   cornerR,   cornerR);
      const dTR = sdCircle(x, y, s-cornerR, cornerR,   cornerR);
      const dBL = sdCircle(x, y, cornerR,   s-cornerR, cornerR);
      const dBR = sdCircle(x, y, s-cornerR, s-cornerR, cornerR);
      const inInner  = (x >= cornerR && x <= s-cornerR) || (y >= cornerR && y <= s-cornerR);
      const inCorner = dTL<=0 || dTR<=0 || dBL<=0 || dBR<=0;

      let bgAlpha = 255;
      if (!(inInner || inCorner)) {
        const minD = Math.min(
          x < cornerR   && y < cornerR   ? dTL : Infinity,
          x > s-cornerR && y < cornerR   ? dTR : Infinity,
          x < cornerR   && y > s-cornerR ? dBL : Infinity,
          x > s-cornerR && y > s-cornerR ? dBR : Infinity
        );
        if (minD > 1) { pixels[y][x] = TRANSPARENT; continue; }
        bgAlpha = Math.round(sat(minD - 0.5) * 255);
      }

      let col = [...BG]; col[3] = bgAlpha;

      // ── Leicht aufgehellter Hintergrund in der Titelleiste ────────────────
      //    (macht den Header visuell ablesbar wie im Referenzbild)
      const inHeader = (x > bx1 + bLW && x < bx2 - bLW && y > by1 + bLW && y < hY);
      if (inHeader) col = [...HEADER]; col[3] = bgAlpha;

      // ── Browser-Rahmen (Ring) ─────────────────────────────────────────────
      const dB = sdRRect(x, y, bx1, by1, bx2, by2, bR);
      const rd = Math.abs(dB) - bLW / 2;
      if (rd < 1) col = lerp(col, WHITE, sat(rd));

      // ── Trennlinie Titelleiste / Inhalt ───────────────────────────────────
      if (dB < 0) {
        const dDiv = Math.abs(y - hY) - bLW * 0.30;
        if (dDiv < 1) col = lerp(col, WHITE, sat(dDiv));
      }

      // ── Dots ──────────────────────────────────────────────────────────────
      for (let i = 0; i < 3; i++) {
        const d = sdCircle(x, y, dtX0 + i * dtSp, dtY, dtR);
        if (d < 1) col = lerp(col, WHITE, sat(d));
      }

      // ── Linkes Inhaltsrechteck ────────────────────────────────────────────
      const dCB = sdRRect(x, y, cbx1, cby1, cbx2, cby2, s * 0.016);
      if (dCB < 1) col = lerp(col, WHITE, sat(dCB));

      // ── Text-Balken (3×) ──────────────────────────────────────────────────
      for (let i = 0; i < 3; i++) {
        const ly1 = cby1 + i * (lH + lGap);
        const dLn = sdRRect(x, y, lx1, ly1, lx2, ly1 + lH, s * 0.012);
        if (dLn < 1) col = lerp(col, WHITE, sat(dLn));
      }

      // ── Oranges ! — Strich ────────────────────────────────────────────────
      const dSt = sdRRect(x, y, exCX - exHW, exY1, exCX + exHW, exY2, exHW);
      if (dSt < 1) col = lerp(col, ORANGE, sat(dSt));

      // ── Oranges ! — Punkt ─────────────────────────────────────────────────
      const dDt = sdCircle(x, y, exCX, exDY, exDR);
      if (dDt < 1) col = lerp(col, ORANGE, sat(dDt));

      pixels[y][x] = col;
    }
  }
  return pixels;
}

// ─── Generieren ───────────────────────────────────────────────────────────────
const outDir = path.join(__dirname, "icons");
[128, 48, 16].forEach(size => {
  const pixels = drawIcon(size);
  writePNG(pixels, size, size, path.join(outDir, `icon${size}.png`));
});
console.log("\nIcons in /icons/ aktualisiert.");
