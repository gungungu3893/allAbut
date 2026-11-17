// ================================================================
// allAbut — 아이콘 SVG → PNG · ICO, 공유 이미지(og-image.png), 미리보기(docs/favicon-preview.png)
// ================================================================
// make_brand_assets.py 가 불러요 (따로 실행할 때: node tools/brand/render.js tools/brand/.build/jobs.json)
// Playwright(Chromium)로 SVG 를 정확한 픽셀 크기로 그려요. 글자는 이미 선(path)이라 글꼴이 없어도 똑같이 나와요.
// 슬로건 글자(공유 이미지)만 IBM Plex Sans 글꼴 파일을 data: 주소로 넣어 그려요.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const BRAND = cfg.brand;
const ROOT = cfg.root;

// PNG 여러 장 → .ico (PNG 를 그대로 담는 방식 — 요즘 브라우저 · 윈도우 모두 지원)
function makeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);          // 예약
  header.writeUInt16LE(1, 2);          // 1 = 아이콘
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach((p, i) => {
    const o = i * 16;
    dir.writeUInt8(p.size >= 256 ? 0 : p.size, o);       // 너비
    dir.writeUInt8(p.size >= 256 ? 0 : p.size, o + 1);   // 높이
    dir.writeUInt8(0, o + 2);            // 색 수 (0 = 팔레트 없음)
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);         // 색 평면
    dir.writeUInt16LE(32, o + 6);        // 비트 수
    dir.writeUInt32LE(p.buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += p.buf.length;
  });
  return Buffer.concat([header, dir].concat(pngs.map(p => p.buf)));
}

async function renderSvg(page, svgFile, px, transparent) {
  const svg = fs.readFileSync(svgFile, 'utf8');
  const url = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  await page.setViewportSize({ width: px, height: px });
  await page.setContent('<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}img{display:block;width:' + px + 'px;height:' + px + 'px}</style></head>' +
    '<body><img src="' + url + '"></body></html>');
  await page.waitForFunction(() => document.images[0] && document.images[0].complete);
  return page.screenshot({ clip: { x: 0, y: 0, width: px, height: px }, omitBackground: !!transparent });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const out = {};
  for (const j of cfg.jobs) {
    out[j.px] = await renderSvg(page, j.svg, j.px, j.px !== 180);   // 180 = apple-touch-icon: 투명 배경 금지
  }
  // 파일로 저장
  fs.writeFileSync(path.join(BRAND, 'favicon-48.png'), out[48]);
  fs.writeFileSync(path.join(BRAND, 'favicon-96.png'), out[96]);
  fs.writeFileSync(path.join(BRAND, 'favicon-192.png'), out[192]);
  fs.writeFileSync(path.join(BRAND, 'favicon-512.png'), out[512]);
  fs.writeFileSync(path.join(BRAND, 'apple-touch-icon.png'), out[180]);
  const ico = makeIco([{ size: 16, buf: out[16] }, { size: 32, buf: out[32] }, { size: 48, buf: out[48] }]);
  fs.writeFileSync(path.join(BRAND, 'favicon.ico'), ico);
  fs.writeFileSync(path.join(ROOT, 'favicon.ico'), ico);   // 사이트 맨 위 /favicon.ico (검색엔진 · 오래된 브라우저가 찾는 곳)

  // ---------- 공유 이미지 1200 × 630 ----------
  const wordmark = fs.readFileSync(path.join(cfg.tmp, 'wordmark.svg'), 'utf8');
  const plex = fs.readFileSync(path.join(cfg.fonts, 'IBMPlexSans-400.ttf')).toString('base64');
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: 'Plex'; src: url(data:font/ttf;base64,${plex}) format('truetype'); font-weight: 400; }
    html, body { margin: 0; width: 1200px; height: 630px; }
    body { display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: radial-gradient(circle at 50% 38%, rgba(212,175,55,0.10), transparent 55%), linear-gradient(135deg, #06090f 0%, #06090f 35%, #001D4A 100%); }
    .mark svg { display: block; width: 780px; height: auto; }
    .slogan { font-family: 'Plex', sans-serif; font-size: 30px; letter-spacing: 0.29em; text-transform: uppercase; color: #D4AF37; opacity: 0.85; margin-top: 46px; }
    .line { width: 120px; height: 2px; background: rgba(212,175,55,0.5); margin-top: 34px; }
  </style></head><body><div class="mark">${wordmark}</div><div class="slogan">Precision Custom Abutment</div><div class="line"></div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  fs.writeFileSync(path.join(BRAND, 'og-image.png'), await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } }));

  // ---------- 미리보기 (docs/favicon-preview.png — 사이트에 안 올라감) ----------
  const b64 = px => 'data:image/png;base64,' + out[px].toString('base64');
  const sizes = [16, 32, 48, 192];
  const row = (bg, fg, title) => `<div class="row" style="background:${bg};color:${fg}"><p class="t">${title}</p><div class="items">` +
    sizes.map(s => `<figure><img src="${b64(s)}" width="${s}" height="${s}"><figcaption>${s}px</figcaption></figure>`).join('') + '</div></div>';
  const zoom = `<div class="row" style="background:#fff;color:#111"><p class="t">Zoomed ×6 (pixels as they are)</p><div class="items">` +
    [16, 32, 48].map(s => `<figure><img src="${b64(s)}" style="width:${s * 6}px;height:${s * 6}px;image-rendering:pixelated"><figcaption>${s}px × 6</figcaption></figure>`).join('') + '</div></div>';
  const tab = `<div class="row" style="background:#DEE1E6;color:#111"><p class="t">Browser tab (16px) · Google result (32px circle)</p><div class="items">` +
    `<div class="tab"><img src="${b64(32)}" width="16" height="16"> allAbut 5μm — CNC Custom Abutments</div>` +
    `<div class="serp"><span class="circle"><img src="${b64(32)}" width="22" height="22"></span><span><b>allAbut 5μm</b><br><small>https://allabut.com</small></span></div></div></div>`;
  await page.setViewportSize({ width: 900, height: 900 });
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; font-family: Arial, sans-serif; width: 900px; }
    .row { padding: 18px 24px; } .t { margin: 0 0 12px; font-weight: 700; font-size: 15px; }
    .items { display: flex; align-items: flex-end; gap: 36px; flex-wrap: wrap; }
    figure { margin: 0; text-align: center; } figcaption { font-size: 12px; margin-top: 6px; } img { display: block; margin: 0 auto; }
    .tab { background: #fff; border-radius: 8px 8px 0 0; padding: 8px 14px; display: flex; align-items: center; gap: 8px; font-size: 13px; }
    .serp { background: #fff; padding: 10px 14px; border-radius: 8px; display: flex; gap: 10px; align-items: center; font-size: 13px; }
    .circle { width: 28px; height: 28px; border-radius: 50%; background: #F1F3F4; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; }
  </style></head><body>${row('#FFFFFF', '#111', 'On white — actual size')}${row('#202124', '#eee', 'On dark — actual size')}${zoom}${tab}</body></html>`);
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'favicon-preview.png'), await page.screenshot({ fullPage: true }));

  await browser.close();
  console.log('brand assets written:', fs.readdirSync(BRAND).join(', '));
})();
