// ===== 월드 오브젝트 만들기 (builders) =====
// 지도 데이터의 type 을 보고 3D 오브젝트를 만들어요.
// - 모든 오브젝트는 "앞면이 +z" 방향, 바닥 y=0 기준으로 만들어요. (위치·회전은 zone.js 가 적용)
// - 단위: 1 = 1미터
// - 같은 모양/색은 공유해서 가볍게 (ctx.geo / ctx.mat 캐시)


// ================================================================
//  빌드 컨텍스트: 재료·도형 캐시 + 품질 설정
// ================================================================
function createBuildContext(quality) {
  var ctx = {
    quality: quality,   // { mobile, shadows, pixelRatio }
    geos: {},
    mats: {}
  };

  // 로우폴리 재료 (색 + 옵션이 같으면 하나를 같이 씀)
  ctx.mat = function (color, opts) {
    var key = 'std|' + color + '|' + (opts ? JSON.stringify(opts) : '');
    if (!ctx.mats[key]) {
      var params = { color: color, flatShading: true, roughness: 0.85, metalness: 0 };
      if (opts) for (var k in opts) params[k] = opts[k];
      ctx.mats[key] = new THREE.MeshStandardMaterial(params);
    }
    return ctx.mats[key];
  };

  // 빛을 받지 않는 재료 (스스로 빛나는 간판, 전구 등)
  ctx.basic = function (color, opts) {
    var key = 'basic|' + color + '|' + (opts ? JSON.stringify(opts) : '');
    if (!ctx.mats[key]) {
      var params = { color: color };
      if (opts) for (var k in opts) params[k] = opts[k];
      ctx.mats[key] = new THREE.MeshBasicMaterial(params);
    }
    return ctx.mats[key];
  };

  // 도형 캐시
  ctx.geo = function (key, make) {
    if (!ctx.geos[key]) ctx.geos[key] = make();
    return ctx.geos[key];
  };

  // 상자 도형 (크기가 같으면 공유)
  ctx.box = function (w, h, d) {
    return ctx.geo('box|' + w + '|' + h + '|' + d, function () { return new THREE.BoxGeometry(w, h, d); });
  };
  ctx.cyl = function (rt, rb, h, seg) {
    return ctx.geo('cyl|' + rt + '|' + rb + '|' + h + '|' + seg, function () { return new THREE.CylinderGeometry(rt, rb, h, seg || 8); });
  };
  ctx.plane = function (w, h) {
    return ctx.geo('plane|' + w + '|' + h, function () { return new THREE.PlaneGeometry(w, h); });
  };

  return ctx;
}

// 메시 하나 만들기 (위치까지)
function wMesh(geometry, material, x, y, z) {
  var m = new THREE.Mesh(geometry, material);
  m.position.set(x || 0, y || 0, z || 0);
  return m;
}


// ================================================================
//  글자 / 로고 텍스처
// ================================================================

// 글자 간판 텍스처
// opts: { w, h, bg, fg, border, font, size, sub, subColor, radius, align }
function makeLabelTexture(text, opts) {
  opts = opts || {};
  var w = opts.w || 512, h = opts.h || 128;
  var c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  var g = c.getContext('2d');
  var r = opts.radius === undefined ? Math.round(h * 0.16) : opts.radius;

  if (opts.bg) {
    g.fillStyle = opts.bg;
    canvasRoundRect(g, 3, 3, w - 6, h - 6, r);
    g.fill();
  }
  if (opts.border) {
    g.strokeStyle = opts.border;
    g.lineWidth = opts.borderWidth || 4;
    canvasRoundRect(g, 4, 4, w - 8, h - 8, r);
    g.stroke();
  }

  g.textBaseline = 'middle';
  var x = w / 2;
  g.textAlign = 'center';

  if (opts.sub) {
    // 왼쪽 작은 번호 + 가운데 큰 글자
    g.fillStyle = opts.subColor || 'rgba(212,175,55,0.75)';
    g.font = '500 ' + Math.round(h * 0.26) + 'px "IBM Plex Mono", monospace';
    g.textAlign = 'left';
    g.fillText(opts.sub, h * 0.3, h / 2 + 2);
    g.textAlign = 'center';
    x = w / 2 + h * 0.25;
  }

  g.fillStyle = opts.fg || '#D4AF37';
  g.font = opts.font || ('600 ' + Math.round((opts.size || 0.42) * h) + 'px "IBM Plex Sans", sans-serif');
  if ('letterSpacing' in g && opts.spacing) g.letterSpacing = opts.spacing;
  g.fillText(text, x, h / 2 + 3);

  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function canvasRoundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// allAbut 로고 그리기 (all·but 가늘게, A 크고 굵게, 5μm 위첨자)
// 캔버스 g 의 (cx, baseline) 을 가운데 밑선으로 해서 그려요. size = all/but 글자 크기(px)
function drawAllAbutLogo(g, cx, baseline, size, opts) {
  opts = opts || {};
  var white = opts.white || '#ffffff';
  var gold = opts.gold || '#D4AF37';
  var thin = '200 ' + size + 'px "IBM Plex Sans", sans-serif';
  var bold = '600 ' + Math.round(size * 1.333) + 'px "IBM Plex Sans", sans-serif';
  var mono = '400 ' + Math.round(size * 0.3056) + 'px "IBM Plex Mono", monospace';

  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.font = thin; var wAll = g.measureText('all').width, wBut = g.measureText('but').width;
  g.font = bold; var wA = g.measureText('A').width;
  g.font = mono; var wUm = g.measureText('5μm').width;
  var total = wAll + wA + wBut + wUm + 2;
  var x = cx - total / 2;

  if (opts.glow) {
    g.shadowColor = 'rgba(212,175,55,0.55)';
    g.shadowBlur = size * 0.25;
  }
  g.font = thin; g.fillStyle = white; g.fillText('all', x, baseline); x += wAll;
  g.font = bold; g.fillStyle = gold; g.fillText('A', x, baseline); x += wA;
  g.font = thin; g.fillStyle = white; g.fillText('but', x, baseline); x += wBut + 2;
  g.font = mono; g.fillStyle = gold; g.fillText('5μm', x, baseline - size * 0.53);
  g.shadowBlur = 0;
}

// 로고 텍스처 (배경색 선택)
function makeLogoTexture(opts) {
  opts = opts || {};
  var w = opts.w || 1024, h = opts.h || 320;
  var c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  var g = c.getContext('2d');
  if (opts.bg) {
    g.fillStyle = opts.bg;
    canvasRoundRect(g, 4, 4, w - 8, h - 8, opts.radius || 24);
    g.fill();
  }
  if (opts.border) {
    g.strokeStyle = opts.border;
    g.lineWidth = 6;
    canvasRoundRect(g, 6, 6, w - 12, h - 12, opts.radius || 24);
    g.stroke();
  }
  drawAllAbutLogo(g, w / 2, h * 0.68, h * 0.42, { glow: opts.glow, white: opts.white });
  if (opts.slogan) {
    g.font = '400 ' + Math.round(h * 0.07) + 'px "IBM Plex Mono", monospace';
    g.fillStyle = 'rgba(212,175,55,0.8)';
    g.textAlign = 'center';
    if ('letterSpacing' in g) g.letterSpacing = Math.round(h * 0.03) + 'px';
    g.fillText(opts.slogan, w / 2, h * 0.86);
  }
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 동그란 빛 번짐 텍스처 (가로등·간판 후광용, 한 번만 만들어서 공유)
var _glowTexture = null;
function getGlowTexture() {
  if (_glowTexture && _glowTexture.image) return _glowTexture;
  var c = document.createElement('canvas');
  c.width = c.height = 128;
  var g = c.getContext('2d');
  var grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _glowTexture = new THREE.CanvasTexture(c);
  _glowTexture.colorSpace = THREE.SRGBColorSpace;
  return _glowTexture;
}

function makeGlowSprite(color, size, opacity) {
  var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTexture(), color: color, transparent: true, opacity: opacity === undefined ? 0.8 : opacity,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

// 반복 무늬 텍스처 (보도블록, 셔터, 타일 등)
function makePatternTexture(key, draw, size) {
  size = size || 256;
  var c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}


// ================================================================
//  오브젝트 만들기 함수들
//  WORLD_BUILDERS[type](데이터, ctx) → THREE.Group
// ================================================================
var WORLD_BUILDERS = {};

// 숍하우스 파스텔 색 (variant 별)
var SHOPHOUSE_COLORS = ['#f3e3c3', '#f2c9c4', '#bfe3d0', '#f6e39a'];
var AWNING_COLORS = ['#c0392b', '#2e86ab', '#2f7d4f', '#d35400'];


// ----- 태국식 숍하우스 (2~3층) -----
WORLD_BUILDERS.shophouse = function (o, ctx) {
  var g = new THREE.Group();
  var v = (o.variant || 0) % 4;
  var W = o.width || 6, D = o.depth || 10;
  var floors = o.floors || (v === 1 ? 2 : 3);
  var FH = 3.3;
  var H = floors * FH + 0.4;
  var wallColor = o.color || SHOPHOUSE_COLORS[v];
  var front = D / 2;

  // 건물 몸체
  var body = wMesh(ctx.box(W, H, D), ctx.mat(wallColor), 0, H / 2, 0);
  g.add(body);

  // 옆 건물과 구분되는 기둥 (앞면 양쪽)
  var pillarMat = ctx.mat(avShade(wallColor, -0.12));
  g.add(wMesh(ctx.box(0.35, H, 0.3), pillarMat, -W / 2 + 0.17, H / 2, front + 0.1));
  g.add(wMesh(ctx.box(0.35, H, 0.3), pillarMat, W / 2 - 0.17, H / 2, front + 0.1));

  // 층 구분 띠
  for (var f = 1; f <= floors; f++) {
    g.add(wMesh(ctx.box(W, 0.18, 0.35), pillarMat, 0, f * FH, front + 0.12));
  }

  // --- 1층: 셔터 또는 가게 ---
  if (v === 0 || v === 2) {
    var shutterTex = ctx.geo('tex|shutter', function () {
      return makePatternTexture('shutter', function (c, s) {
        c.fillStyle = '#9aa1a8'; c.fillRect(0, 0, s, s);
        for (var y = 0; y < s; y += 16) {
          c.fillStyle = '#7d848b'; c.fillRect(0, y, s, 3);
          c.fillStyle = '#b4bac0'; c.fillRect(0, y + 3, s, 2);
        }
      });
    });
    var shutter = wMesh(ctx.plane(W - 0.8, 2.6), ctx.mat('#ffffff', { map: shutterTex }), 0, 1.3, front + 0.02);
    g.add(shutter);
  } else {
    // 열린 가게: 어두운 안쪽 + 유리 + 진열대
    g.add(wMesh(ctx.plane(W - 0.8, 2.6), ctx.mat('#2b2622'), 0, 1.3, front + 0.02));
    g.add(wMesh(ctx.box(W - 1.4, 0.9, 0.5), ctx.mat('#8b5e3c'), 0, 0.45, front + 0.3));
    g.add(wMesh(ctx.plane(W - 0.8, 2.6), ctx.mat('#9fc7d8', { transparent: true, opacity: 0.25, roughness: 0.1 }), 0, 1.3, front + 0.05));
    g.add(wMesh(ctx.plane(W - 1.2, 0.08), ctx.basic('#ffe9b0'), 0, 2.45, front + 0.06)); // 실내 조명 띠
  }

  // 차양 (어닝)
  var awn = wMesh(ctx.box(W - 0.4, 0.08, 1.3), ctx.mat(AWNING_COLORS[(v + (o.awning || 0)) % 4]), 0, 2.85, front + 0.6);
  awn.rotation.x = 0.28;
  g.add(awn);

  // 1층 간판
  if (o.sign) {
    var signTex = makeLabelTexture(o.sign, {
      w: 512, h: 112, bg: o.signBg || '#1d2a3a', fg: o.signFg || '#ffe08a', border: o.signBorder || null, size: 0.5
    });
    var signMat = o.lit
      ? new THREE.MeshBasicMaterial({ map: signTex })
      : new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7 });
    var sign = wMesh(ctx.plane(W - 1.2, 0.62), signMat, 0, 3.35, front + 0.24);
    g.add(sign);
  }

  // --- 2~3층: 창문, 발코니, 에어컨 실외기 ---
  var winMat = ctx.mat('#2e4a5c', { roughness: 0.2, metalness: 0.3 });
  var frameMat = ctx.mat('#f7f3ea');
  var acGeo = ctx.box(0.8, 0.55, 0.35);
  var acMat = ctx.mat('#eceae4');
  var grillGeo = ctx.geo('ac-grill', function () { return new THREE.CircleGeometry(0.2, 10); });
  var grillMat = ctx.mat('#55595e');

  for (f = 1; f < floors; f++) {
    var y = f * FH + 1.6;
    [-1, 1].forEach(function (side) {
      var wx = side * W * 0.22;
      g.add(wMesh(ctx.box(1.5, 1.7, 0.1), frameMat, wx, y, front + 0.04));
      g.add(wMesh(ctx.plane(1.3, 1.5), winMat, wx, y, front + 0.1));
      g.add(wMesh(ctx.box(0.06, 1.5, 0.06), frameMat, wx, y, front + 0.12));
    });

    // 발코니 (variant 0, 2 의 2층)
    if ((v === 0 || v === 2) && f === 1) {
      g.add(wMesh(ctx.box(W - 0.8, 0.15, 1.0), pillarMat, 0, f * FH + 0.15, front + 0.5));
      var railMat = ctx.mat(v === 0 ? '#e9e4d8' : '#3c4a3e');
      g.add(wMesh(ctx.box(W - 0.8, 0.06, 0.06), railMat, 0, f * FH + 1.1, front + 0.98));
      for (var rx = -W / 2 + 0.6; rx <= W / 2 - 0.5; rx += 0.35) {
        g.add(wMesh(ctx.box(0.04, 0.9, 0.04), railMat, rx, f * FH + 0.65, front + 0.98));
      }
    }

    // 에어컨 실외기 (층마다 위치를 조금씩 다르게)
    var acX = (f + v) % 2 === 0 ? W / 2 - 0.7 : -W / 2 + 0.7;
    g.add(wMesh(acGeo, acMat, acX, f * FH + 0.6, front + 0.25));
    var grill = wMesh(grillGeo, grillMat, acX + 0.12, f * FH + 0.6, front + 0.43);
    g.add(grill);
  }

  // 옥상 난간 + 물탱크
  g.add(wMesh(ctx.box(W, 0.5, 0.25), pillarMat, 0, H + 0.25, front - 0.1));
  if (v !== 1) {
    g.add(wMesh(ctx.cyl(0.5, 0.5, 1.0, 8), ctx.mat('#dfe3e6'), W * 0.2, H + 0.5, -D * 0.25));
  }

  g.userData.height = H;
  return g;
};


// ----- allAbut 빌딩 -----
WORLD_BUILDERS.allabut_building = function (o, ctx) {
  var g = new THREE.Group();
  var W = o.width || 18, D = o.depth || 12, H = o.height || 13;
  var front = D / 2;
  var navy = ctx.mat('#0b2350', { roughness: 0.55, metalness: 0.25 });
  var gold = ctx.mat('#D4AF37', { metalness: 0.7, roughness: 0.3, emissive: '#D4AF37', emissiveIntensity: 0.25 });

  // 몸체
  g.add(wMesh(ctx.box(W, H, D), navy, 0, H / 2, 0));

  // 큰 유리 정면
  var glassW = W - 2, glassH = H - 2.5;
  g.add(wMesh(ctx.plane(glassW, glassH), ctx.basic('#ffd9a0', { transparent: true, opacity: 0.12 }), 0, glassH / 2 + 0.3, front - 0.3)); // 안쪽 불빛
  g.add(wMesh(ctx.plane(glassW, glassH), ctx.mat('#2a5585', { roughness: 0.08, metalness: 0.9, transparent: true, opacity: 0.6 }), 0, glassH / 2 + 0.3, front + 0.02));

  // 골드 프레임 (세로 + 가로)
  for (var x = -glassW / 2; x <= glassW / 2 + 0.01; x += glassW / 5) {
    g.add(wMesh(ctx.box(0.14, glassH, 0.14), gold, x, glassH / 2 + 0.3, front + 0.08));
  }
  for (var y = 0.3; y <= glassH + 0.31; y += glassH / 3) {
    g.add(wMesh(ctx.box(glassW, 0.14, 0.14), gold, 0, y, front + 0.08));
  }

  // 문 (가운데 아래)
  g.add(wMesh(ctx.box(3.4, 3.4, 0.25), gold, 0, 1.7, front + 0.15));
  g.add(wMesh(ctx.plane(3.0, 3.1), ctx.mat('#10233f', { roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.85 }), 0, 1.55, front + 0.29));
  g.add(wMesh(ctx.box(0.05, 3.1, 0.05), gold, 0, 1.55, front + 0.31));
  g.add(wMesh(ctx.plane(2.8, 2.9), ctx.basic('#ffe6b8', { transparent: true, opacity: 0.18 }), 0, 1.5, front + 0.27));

  // 문 위 작은 ENTER
  var enterTex = makeLabelTexture('ENTER', { w: 256, h: 64, bg: '#0b2350', fg: '#D4AF37', border: '#D4AF37', size: 0.5, spacing: '6px' });
  g.add(wMesh(ctx.plane(1.4, 0.35), new THREE.MeshBasicMaterial({ map: enterTex }), 0, 3.65, front + 0.3));

  // 지붕 위 큰 골드 간판 "allAbut"
  var logoTex = makeLogoTexture({ w: 1024, h: 320, bg: 'rgba(6,9,15,0.92)', border: '#D4AF37', glow: true });
  var sign = wMesh(ctx.plane(10, 3.1), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true }), 0, H + 2.2, front - 1.2);
  g.add(sign);
  g.add(wMesh(ctx.box(0.25, 1.4, 0.25), navy, -3.5, H + 0.6, front - 1.3));
  g.add(wMesh(ctx.box(0.25, 1.4, 0.25), navy, 3.5, H + 0.6, front - 1.3));
  var halo = makeGlowSprite('#D4AF37', 13, 0.28);
  halo.position.set(0, H + 2.2, front - 1.4);
  g.add(halo);

  // 입구 앞 골드 카펫 + 바닥 조명
  var carpetLen = o.carpet || 2.8; // 인도 폭 안에서 끝나게
  var carpet = wMesh(ctx.plane(3, carpetLen), ctx.mat('#c9a13a', { roughness: 0.9 }), 0, 0.17, front + carpetLen / 2);
  carpet.rotation.x = -Math.PI / 2;
  g.add(carpet);
  var dotGeo = ctx.geo('floor-light', function () { return new THREE.CircleGeometry(0.14, 12); });
  for (var i = 0; i < 3; i++) {
    [-1, 1].forEach(function (side) {
      var dot = wMesh(dotGeo, ctx.basic('#fff1c9'), side * 1.9, 0.18, front + 0.4 + i * 0.95);
      dot.rotation.x = -Math.PI / 2;
      g.add(dot);
    });
  }

  // 마우스 올렸을 때 보이는 골드 테두리
  var outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.3, H + 0.3, D + 0.3)),
    new THREE.LineBasicMaterial({ color: 0xD4AF37 })
  );
  outline.position.y = H / 2;
  outline.visible = false;
  g.add(outline);
  g.userData.hoverOutline = outline;

  // 입구 클릭 영역 (문 + 카펫)
  g.userData.interactive = [{
    kind: 'enter',
    box: { x: 0, y: 2, z: front + 1.2, w: 5, h: 4.5, d: 3.4 },
    approach: { x: 0, z: front + 1.4 },
    face: { x: 0, z: front - 1 },
    tooltip: 'Enter allAbut',
    interior: o.interior
  }];
  g.userData.exitPoint = { x: 0, z: front + 2.6 }; // 체험관에서 나오면 서는 곳
  g.userData.height = H;
  return g;
};


// ----- 야자수 -----
WORLD_BUILDERS.tree = function (o, ctx) {
  var g = new THREE.Group();
  var trunkMat = ctx.mat('#8a6d4b');
  var leafMat = ctx.mat(o.leaf || '#3f7d3a', { side: THREE.DoubleSide });
  var h = o.height || 6;

  // 살짝 휜 줄기 (두 토막)
  var t1 = wMesh(ctx.cyl(0.16, 0.22, h * 0.55, 6), trunkMat, 0, h * 0.27, 0);
  g.add(t1);
  var t2 = wMesh(ctx.cyl(0.12, 0.16, h * 0.5, 6), trunkMat, 0.18, h * 0.72, 0);
  t2.rotation.z = -0.12;
  g.add(t2);

  // 잎 (아래로 늘어진 길쭉한 잎 7장)
  var leafGeo = ctx.geo('palm-leaf', function () {
    var geo = new THREE.ConeGeometry(0.45, 2.8, 4, 1);
    geo.translate(0, 1.4, 0);
    geo.scale(1, 1, 0.25);
    return geo;
  });
  var top = new THREE.Group();
  top.position.set(0.3, h, 0);
  for (var i = 0; i < 7; i++) {
    var leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.rotation.y = (i / 7) * Math.PI * 2 + (o.seed || 0);
    leaf.rotation.z = 1.15 + (i % 2) * 0.25;
    var holder = new THREE.Group();
    holder.rotation.y = leaf.rotation.y;
    leaf.rotation.y = 0;
    holder.add(leaf);
    top.add(holder);
  }
  top.add(wMesh(ctx.geo('coconut', function () { return new THREE.IcosahedronGeometry(0.18, 0); }), ctx.mat('#5a4a2a'), 0.1, -0.15, 0.1));
  g.add(top);
  g.userData.sway = top;
  g.userData.height = h;
  g.userData.occluderBox = 4.5; // 잎이 퍼진 폭 (카메라를 가리면 반투명)
  return g;
};


// ----- 뚝뚝 -----
WORLD_BUILDERS.tuktuk = function (o, ctx) {
  var g = new THREE.Group();
  var color = o.color || '#1e6fb8';
  var body = ctx.mat(color, { roughness: 0.5, metalness: 0.2 });
  var dark = ctx.mat('#1e1f22');
  var chrome = ctx.mat('#cfd4d8', { metalness: 0.8, roughness: 0.3 });

  // 뒤 승객칸
  g.add(wMesh(ctx.box(1.4, 0.55, 1.5), body, 0, 0.75, -0.45));
  g.add(wMesh(ctx.box(1.2, 0.35, 1.1), ctx.mat('#7a1f2b'), 0, 1.15, -0.5)); // 좌석
  // 지붕
  g.add(wMesh(ctx.box(1.5, 0.12, 2.5), body, 0, 2.0, -0.1));
  g.add(wMesh(ctx.box(0.06, 1.0, 0.06), chrome, -0.68, 1.5, -1.15));
  g.add(wMesh(ctx.box(0.06, 1.0, 0.06), chrome, 0.68, 1.5, -1.15));
  g.add(wMesh(ctx.box(0.06, 1.0, 0.06), chrome, -0.6, 1.5, 0.9));
  g.add(wMesh(ctx.box(0.06, 1.0, 0.06), chrome, 0.6, 1.5, 0.9));
  // 앞부분 (운전석 + 앞바퀴 덮개)
  g.add(wMesh(ctx.box(0.9, 0.5, 1.0), body, 0, 0.7, 0.75));
  g.add(wMesh(ctx.box(0.5, 0.6, 0.35), body, 0, 0.6, 1.35));
  g.add(wMesh(ctx.box(0.9, 0.06, 0.6), ctx.mat('#9fd0e6', { transparent: true, opacity: 0.5 }), 0, 1.5, 1.05)); // 앞유리
  g.add(wMesh(ctx.geo('headlight', function () { return new THREE.CircleGeometry(0.1, 10); }), ctx.basic('#fff6d0'), 0, 0.8, 1.53));

  // 바퀴
  var wheel = ctx.geo('tuktuk-wheel', function () {
    var w = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 10);
    w.rotateZ(Math.PI / 2);
    return w;
  });
  g.add(wMesh(wheel, dark, 0, 0.28, 1.3));
  g.add(wMesh(wheel, dark, -0.72, 0.28, -0.75));
  g.add(wMesh(wheel, dark, 0.72, 0.28, -0.75));
  return g;
};


// ----- 노점 수레 (파라솔 + 김) -----
WORLD_BUILDERS.food_cart = function (o, ctx) {
  var g = new THREE.Group();
  var cartColor = o.color || '#c0392b';
  g.add(wMesh(ctx.box(1.6, 0.8, 0.9), ctx.mat(cartColor), 0, 0.75, 0));
  g.add(wMesh(ctx.box(1.7, 0.06, 1.0), ctx.mat('#d7dbdf', { metalness: 0.6, roughness: 0.3 }), 0, 1.18, 0));
  // 유리 진열장
  g.add(wMesh(ctx.box(1.0, 0.5, 0.6), ctx.mat('#cfe8f2', { transparent: true, opacity: 0.35, roughness: 0.1 }), -0.25, 1.45, 0));
  // 솥
  g.add(wMesh(ctx.cyl(0.25, 0.22, 0.3, 10), ctx.mat('#9aa0a6', { metalness: 0.7, roughness: 0.35 }), 0.5, 1.36, 0));
  // 바퀴
  var wheel = ctx.geo('cart-wheel', function () {
    var w = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 10);
    w.rotateZ(Math.PI / 2);
    return w;
  });
  g.add(wMesh(wheel, ctx.mat('#2b2b2b'), -0.85, 0.3, 0));
  g.add(wMesh(wheel, ctx.mat('#2b2b2b'), 0.85, 0.3, 0));

  // 파라솔
  g.add(wMesh(ctx.cyl(0.03, 0.03, 2.2, 5), ctx.mat('#dddddd'), -0.7, 1.9, -0.3));
  var umbrella = wMesh(ctx.geo('parasol', function () { return new THREE.ConeGeometry(1.4, 0.6, 8, 1, true); }),
    ctx.mat(o.parasol || '#f2c14e', { side: THREE.DoubleSide }), -0.7, 3.1, -0.3);
  g.add(umbrella);

  // 김 (작은 입자들이 위로 올라감)
  var count = ctx.quality.mobile ? 6 : 14;
  var positions = new Float32Array(count * 3);
  var steamGeo = new THREE.BufferGeometry();
  steamGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  var steam = new THREE.Points(steamGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.22, transparent: true, opacity: 0.35, depthWrite: false, map: getGlowTexture()
  }));
  steam.position.set(0.5, 1.55, 0);
  var seeds = [];
  for (var i = 0; i < count; i++) seeds.push(Math.random() * 2);
  g.add(steam);

  g.userData.update = function (dt, t) {
    for (var i = 0; i < count; i++) {
      var life = (t * 0.5 + seeds[i]) % 2;   // 0~2초
      positions[i * 3] = Math.sin(seeds[i] * 10 + life * 2) * 0.12 * life;
      positions[i * 3 + 1] = life * 0.6;
      positions[i * 3 + 2] = Math.cos(seeds[i] * 7) * 0.1;
    }
    steamGeo.attributes.position.needsUpdate = true;
  };
  return g;
};


// ----- BTS 고가 선로 (길이 방향 = 로컬 x) -----
WORLD_BUILDERS.bts_track = function (o, ctx) {
  var g = new THREE.Group();
  var L = o.length || 60, Y = o.height || 8;
  var concrete = ctx.mat('#b9b6ae');
  var concreteDark = ctx.mat('#9c998f');

  // 선로 받침 (빔)
  g.add(wMesh(ctx.box(L, 1.2, 4.6), concrete, 0, Y, 0));
  g.add(wMesh(ctx.box(L, 0.5, 0.25), concreteDark, 0, Y + 0.85, 2.2));
  g.add(wMesh(ctx.box(L, 0.5, 0.25), concreteDark, 0, Y + 0.85, -2.2));
  // 레일
  var rail = ctx.mat('#6d6f73', { metalness: 0.7, roughness: 0.4 });
  [-1.3, -0.5, 0.5, 1.3].forEach(function (z) {
    g.add(wMesh(ctx.box(L, 0.12, 0.1), rail, 0, Y + 0.66, z));
  });

  // 기둥 (T자)
  (o.pillars || [-10, 10]).forEach(function (px) {
    g.add(wMesh(ctx.box(1.2, Y - 0.6, 1.2), concrete, px, (Y - 0.6) / 2, 0));
    g.add(wMesh(ctx.box(1.6, 0.7, 4.8), concreteDark, px, Y - 0.85, 0));
  });

  // 지나가는 BTS 열차 (가끔 지나감)
  var train = new THREE.Group();
  var carBody = ctx.mat('#e8ecef', { roughness: 0.4, metalness: 0.2 });
  var stripe = ctx.mat('#2f9e5b');
  var windowMat = ctx.mat('#25313d', { roughness: 0.2, metalness: 0.5 });
  for (var c = 0; c < 3; c++) {
    var cx = c * 12.4;
    train.add(wMesh(ctx.box(12, 3, 2.9), carBody, cx, Y + 2.2, 0));
    train.add(wMesh(ctx.box(12.02, 0.35, 2.92), stripe, cx, Y + 1.3, 0));
    train.add(wMesh(ctx.box(11, 0.9, 2.94), windowMat, cx, Y + 2.6, 0));
  }
  train.visible = false;
  g.add(train);

  var period = 26, travel = L + 40;
  g.userData.update = function (dt, t) {
    var phase = t % period;
    var dur = travel / 14;
    if (phase < dur) {
      train.visible = true;
      train.position.x = -L / 2 - 38 + phase * 14;
    } else {
      train.visible = false;
    }
  };
  g.userData.height = Y + 1;
  return g;
};


// ----- BTS 역 (북쪽 끝, 들어갈 수 없음) -----
WORLD_BUILDERS.bts_station = function (o, ctx) {
  var g = new THREE.Group();
  var W = o.width || 22, D = o.depth || 9;
  var Y = 6.4;
  var concrete = ctx.mat('#c9c5bb');
  var dark = ctx.mat('#3d4148');
  var green = ctx.mat('#2f9e5b');

  // 역사 (공중)
  g.add(wMesh(ctx.box(W, 0.8, D), concrete, 0, Y, 0));
  g.add(wMesh(ctx.box(W, 3.2, D - 1), ctx.mat('#dfe2e0'), 0, Y + 2, 0));
  g.add(wMesh(ctx.box(W - 1, 1.2, 0.1), ctx.mat('#2c4a5e', { roughness: 0.2, metalness: 0.5 }), 0, Y + 2.2, D / 2 - 0.45)); // 창 띠
  g.add(wMesh(ctx.box(W + 1.2, 0.4, D + 1.4), dark, 0, Y + 3.8, 0)); // 지붕
  g.add(wMesh(ctx.box(W + 1.2, 0.25, 0.1), green, 0, Y + 3.55, D / 2 + 0.7));

  // 간판
  var signTex = makeLabelTexture('BTS · Soi allAbut', { w: 768, h: 128, bg: '#1f6f45', fg: '#ffffff', size: 0.42 });
  g.add(wMesh(ctx.plane(7, 1.15), new THREE.MeshBasicMaterial({ map: signTex }), 0, Y + 2.2, D / 2 + 0.2));

  // 기둥 4개
  [[-W / 2 + 1.5, -D / 2 + 1.2], [W / 2 - 1.5, -D / 2 + 1.2], [-W / 2 + 1.5, D / 2 - 1.2], [W / 2 - 1.5, D / 2 - 1.2]].forEach(function (p) {
    g.add(wMesh(ctx.box(1.1, Y, 1.1), concrete, p[0], Y / 2, p[1]));
  });

  // 계단 (앞쪽 왼편, 땅에서 역까지)
  var stairX = o.stairX === undefined ? -6 : o.stairX;
  var stairLen = 9;
  var stairs = new THREE.Group();
  var steps = 16;
  for (var i = 0; i < steps; i++) {
    var h = (i + 1) * (Y / steps);
    stairs.add(wMesh(ctx.box(2.6, h, stairLen / steps + 0.01), concrete, 0, h / 2, stairLen / 2 - (i + 0.5) * (stairLen / steps)));
  }
  stairs.add(wMesh(ctx.box(0.1, 1, stairLen), green, -1.35, Y / 2 + 0.6, 0));
  stairs.add(wMesh(ctx.box(0.1, 1, stairLen), green, 1.35, Y / 2 + 0.6, 0));
  stairs.position.set(stairX, 0, D / 2 + stairLen / 2 - 0.5);
  g.add(stairs);

  // 계단 입구 표지판
  var boardTex = makeLabelTexture('BTS', { w: 256, h: 128, bg: '#1f6f45', fg: '#ffffff', size: 0.55 });
  g.add(wMesh(ctx.plane(1.2, 0.6), new THREE.MeshBasicMaterial({ map: boardTex }), stairX + 2.2, 2.6, D / 2 + stairLen));
  g.add(wMesh(ctx.box(0.08, 2.3, 0.08), dark, stairX + 2.2, 1.15, D / 2 + stairLen - 0.05));

  g.userData.interactive = [{
    kind: 'portal',
    box: { x: stairX, y: 2.5, z: D / 2 + stairLen / 2, w: 3.2, h: 5, d: stairLen + 1 },
    approach: { x: stairX + 2.6, z: D / 2 + stairLen + 1.2 },
    face: { x: stairX, z: D / 2 + stairLen - 1 },
    tooltip: 'BTS Station',
    bubble: { x: stairX + 2.2, y: 3.4, z: D / 2 + stairLen }
  }];
  g.userData.height = Y + 4;
  return g;
};


// ----- 전봇대 (전깃줄은 zone.js 가 이어 줌) -----
WORLD_BUILDERS.power_pole = function (o, ctx) {
  var g = new THREE.Group();
  var concrete = ctx.mat('#a7a39b');
  g.add(wMesh(ctx.cyl(0.11, 0.16, 9, 6), concrete, 0, 4.5, 0));
  g.add(wMesh(ctx.box(1.6, 0.12, 0.12), ctx.mat('#5d5a55'), 0, 8.2, 0));
  g.add(wMesh(ctx.box(1.2, 0.12, 0.12), ctx.mat('#5d5a55'), 0, 7.4, 0));
  if (o.variant === 1) {
    g.add(wMesh(ctx.cyl(0.3, 0.3, 0.9, 8), ctx.mat('#7d8288'), 0.35, 6.6, 0)); // 변압기
  }
  // 전깃줄 고정점 (로컬 좌표)
  g.userData.wireAnchors = [
    { x: -0.7, y: 8.25, z: 0 }, { x: 0, y: 8.25, z: 0 }, { x: 0.7, y: 8.25, z: 0 },
    { x: -0.5, y: 7.45, z: 0 }, { x: 0.5, y: 7.45, z: 0 }
  ];
  return g;
};


// ----- 사원(왓) 지붕 (먼 배경 장식) -----
WORLD_BUILDERS.temple_roof = function (o, ctx) {
  var g = new THREE.Group();
  var white = ctx.mat('#f1ece2');
  var orange = ctx.mat('#d9661f', { roughness: 0.6 });
  var red = ctx.mat('#a8321e', { roughness: 0.6 });
  var gold = ctx.mat('#e0b23b', { metalness: 0.6, roughness: 0.35, emissive: '#7a5a10', emissiveIntensity: 0.3 });

  // 뾰족한 삼각 지붕 도형 (길이 1, 폭 1, 높이 1 기준)
  var roofGeo = ctx.geo('temple-roof', function () {
    var s = new THREE.Shape();
    s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
    var geo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    geo.translate(0, 0, -0.5);
    return geo;
  });

  // 기단 + 벽
  g.add(wMesh(ctx.box(14, 1.2, 26), white, 0, 0.6, 0));
  g.add(wMesh(ctx.box(11, 6, 22), white, 0, 4.2, 0));

  // 겹지붕 3단 (아래가 크고 위로 갈수록 작고 가파르게)
  var tiers = [
    { w: 16, h: 5, d: 26, y: 7.2, mat: orange },
    { w: 12.5, h: 5, d: 20, y: 9.6, mat: red },
    { w: 9, h: 5.5, d: 14, y: 12.2, mat: orange }
  ];
  tiers.forEach(function (t) {
    var roof = new THREE.Mesh(roofGeo, t.mat);
    roof.scale.set(t.w, t.h, t.d);
    roof.position.y = t.y;
    g.add(roof);
    // 금색 처마 장식 + 끝의 뿔 장식(초파)
    g.add(wMesh(ctx.box(0.3, 0.3, t.d), gold, -t.w / 2 + 0.2, t.y + 0.1, 0));
    g.add(wMesh(ctx.box(0.3, 0.3, t.d), gold, t.w / 2 - 0.2, t.y + 0.1, 0));
    [-1, 1].forEach(function (s) {
      var horn = wMesh(ctx.geo('chofa', function () { return new THREE.ConeGeometry(0.35, 2.4, 5); }), gold, 0, t.y + t.h + 0.6, s * t.d / 2);
      horn.rotation.x = s * 0.5;
      g.add(horn);
    });
  });

  // 금빛 첨탑
  g.add(wMesh(ctx.geo('spire', function () { return new THREE.ConeGeometry(1.4, 9, 8); }), gold, 0, 21, 0));
  g.add(wMesh(ctx.geo('spire-base', function () { return new THREE.SphereGeometry(1.6, 8, 6); }), gold, 0, 16.6, 0));
  return g;
};


// ----- 가로등 -----
WORLD_BUILDERS.street_lamp = function (o, ctx) {
  var g = new THREE.Group();
  var pole = ctx.mat('#3b3f45', { metalness: 0.5, roughness: 0.5 });
  g.add(wMesh(ctx.cyl(0.07, 0.1, 6, 6), pole, 0, 3, 0));
  var arm = wMesh(ctx.box(0.08, 0.08, 1.4), pole, 0, 5.9, 0.6);
  g.add(arm);
  g.add(wMesh(ctx.box(0.45, 0.16, 0.7), pole, 0, 5.85, 1.25));
  var bulb = wMesh(ctx.box(0.36, 0.05, 0.56), ctx.basic(o.lit === false ? '#777777' : '#ffe2a8'), 0, 5.76, 1.25);
  g.add(bulb);
  if (o.lit !== false) {
    var glow = makeGlowSprite('#ffcf7a', 2.4, 0.55);
    glow.position.set(0, 5.6, 1.25);
    g.add(glow);
  }
  g.userData.lightPoint = { x: 0, y: 5.5, z: 1.25 };
  return g;
};


// ----- 도로 (아스팔트 + 노란 중앙선 + 흰 바깥선) -----
WORLD_BUILDERS.road = function (o, ctx) {
  var g = new THREE.Group();
  var W = o.width || 8, L = o.length || 130;
  var asphalt = wMesh(ctx.plane(W, L), ctx.mat('#3b3d42', { roughness: 1 }), 0, 0.01, 0);
  asphalt.rotation.x = -Math.PI / 2;
  g.add(asphalt);

  var yellow = ctx.basic('#e8b923');
  var white = ctx.mat('#e9e9e4', { roughness: 0.9 });
  [-0.12, 0.12].forEach(function (x) {
    var line = wMesh(ctx.plane(0.1, L), yellow, x, 0.02, 0);
    line.rotation.x = -Math.PI / 2;
    g.add(line);
  });
  [-W / 2 + 0.25, W / 2 - 0.25].forEach(function (x) {
    var line = wMesh(ctx.plane(0.12, L), white, x, 0.02, 0);
    line.rotation.x = -Math.PI / 2;
    g.add(line);
  });
  return g;
};


// ----- 횡단보도 -----
WORLD_BUILDERS.crosswalk = function (o, ctx) {
  var g = new THREE.Group();
  var W = o.width || 8;
  var white = ctx.mat('#f1f1ec', { roughness: 0.9 });
  for (var x = -W / 2 + 0.5; x < W / 2 - 0.2; x += 0.9) {
    var s = wMesh(ctx.plane(0.5, 3), white, x, 0.025, 0);
    s.rotation.x = -Math.PI / 2;
    g.add(s);
  }
  return g;
};


// ----- 인도 (보도블록 + 빨강/흰 연석) -----
WORLD_BUILDERS.sidewalk = function (o, ctx) {
  var g = new THREE.Group();
  var W = o.width || 3, L = o.length || 130;
  var paverTex = ctx.geo('tex|paver', function () {
    return makePatternTexture('paver', function (c, s) {
      c.fillStyle = '#c9bfae'; c.fillRect(0, 0, s, s);
      c.strokeStyle = '#a99e8c'; c.lineWidth = 3;
      for (var i = 0; i <= s; i += s / 4) {
        c.beginPath(); c.moveTo(i, 0); c.lineTo(i, s); c.stroke();
        c.beginPath(); c.moveTo(0, i); c.lineTo(s, i); c.stroke();
      }
    });
  });
  var tex = paverTex.clone();
  tex.needsUpdate = true;
  tex.repeat.set(W / 1.2, L / 1.2);
  var walk = wMesh(new THREE.BoxGeometry(W, 0.15, L), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), 0, 0.075, 0);
  g.add(walk);

  // 연석 (빨강/흰 줄무늬) - 도로 쪽 (o.curbSide: -1 왼쪽, 1 오른쪽)
  var curbTex = ctx.geo('tex|curb', function () {
    return makePatternTexture('curb', function (c, s) {
      c.fillStyle = '#f2f2ee'; c.fillRect(0, 0, s, s);
      c.fillStyle = '#c0392b'; c.fillRect(0, 0, s, s / 2);
    });
  });
  var ct = curbTex.clone();
  ct.needsUpdate = true;
  ct.repeat.set(1, L / 1.0);
  var curb = wMesh(new THREE.BoxGeometry(0.22, 0.2, L), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.9 }), (o.curbSide || 1) * (W / 2 - 0.11), 0.1, 0);
  g.add(curb);
  return g;
};


// ----- 배경 건물 덩어리 (멀리 있는 채움용) -----
WORLD_BUILDERS.block = function (o, ctx) {
  var g = new THREE.Group();
  var W = o.width || 8, D = o.depth || 10, H = o.height || 12;
  var tex = ctx.geo('tex|block-windows', function () {
    return makePatternTexture('windows', function (c, s) {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, s, s);
      c.fillStyle = 'rgba(40,50,70,0.55)';
      for (var y = 16; y < s; y += 64) for (var x = 16; x < s; x += 64) c.fillRect(x, y, 34, 30);
    });
  });
  var t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(W / 4, H / 4);
  g.add(wMesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshStandardMaterial({ map: t, color: o.color || '#cdbfae', roughness: 0.9, flatShading: true }), 0, H / 2, 0));
  g.userData.height = H;
  return g;
};
