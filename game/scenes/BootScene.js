// ===== BootScene: 임시 그래픽을 코드로 그려서 텍스처로 만들기 =====
// 나중에 실제 픽셀아트 에셋으로 바꿀 때는 이 파일 대신 이미지를 불러오면 돼요.
// (텍스처 이름은 game/config/assets.js 에 모여 있어요)

class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    makeTileset(this);
    makeObjectTextures(this);
    makePetTextures(this);
    makeUiTextures(this);

    // 글꼴(IBM Plex)이 준비된 뒤에 시작해야 글자가 제대로 나와요
    var self = this;
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () {
      self.scene.launch('UI');
      var pending = GameState.pending || { key: 'Zone', data: { id: GAME_START_ZONE, entry: 'spawn' } };
      GameState.pending = null;
      self.scene.start(pending.key, pending.data);
    });
  }
}


// ================================================================
//  그리기 도우미
// ================================================================

// 캔버스에 그림을 그려서 텍스처로 등록
function makeCanvasTexture(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  var tex = scene.textures.createCanvas(key, w, h);
  var ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  draw(ctx, w, h);
  tex.refresh();
  return tex;
}

// 픽셀 원 (가장자리가 흐려지지 않게 한 줄씩 채우기)
function pxCircle(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  for (var y = -r; y <= r; y++) {
    var half = Math.round(Math.sqrt(r * r - y * y));
    ctx.fillRect(cx - half, cy + y, half * 2, 1);
  }
}

// 늘 같은 결과가 나오는 무작위 수 (무늬용)
function seededRandom(seed) {
  var s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// 색을 밝게/어둡게 (amount: -1 ~ 1). Phaser 없이도 동작 (Avatar Studio 미리보기에서도 사용)
function shadeColor(hex, amount) {
  var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  var c = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  var t = amount < 0 ? 0 : 255;
  var p = Math.abs(amount);
  return 'rgb(' + c.map(function (v) { return Math.round(v + (t - v) * p); }).join(',') + ')';
}


// ================================================================
//  바닥 타일셋 (32x32 타일을 가로로 이어 붙임, 순서 = TILE_TYPES)
// ================================================================
function makeTileset(scene) {
  makeCanvasTexture(scene, ASSETS.tileset, TILE_TYPES.length * TILE, TILE, function (ctx) {
    TILE_TYPES.forEach(function (type, i) {
      ctx.save();
      ctx.translate(i * TILE, 0);
      drawTile(ctx, type, i);
      ctx.restore();
    });
  });
}

function drawTile(ctx, type, seed) {
  var T = TILE;
  var rand = seededRandom(seed * 97 + 13);
  function speckle(base, dots, count) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, T, T);
    for (var i = 0; i < count; i++) {
      ctx.fillStyle = dots[i % dots.length];
      ctx.fillRect(Math.floor(rand() * T), Math.floor(rand() * T), 2, 2);
    }
  }

  if (type === 'empty') return;
  if (type === 'grass') {
    speckle('#5f8f4a', ['#557f42', '#6c9c55', '#4f773d'], 26);
  } else if (type === 'asphalt') {
    speckle('#3b3d42', ['#35373b', '#43454a'], 18);
  } else if (type === 'roadLine') {
    speckle('#3b3d42', ['#35373b', '#43454a'], 18);
    ctx.fillStyle = '#e8b923';
    ctx.fillRect(12, 0, 3, T);
    ctx.fillRect(17, 0, 3, T);
  } else if (type === 'crosswalk') {
    speckle('#3b3d42', ['#35373b', '#43454a'], 12);
    ctx.fillStyle = '#efefe9';
    ctx.fillRect(3, 0, 8, T);
    ctx.fillRect(19, 0, 8, T);
  } else if (type === 'sidewalk') {
    ctx.fillStyle = '#c9c5bd';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#b3aea5';
    ctx.fillRect(0, 0, T, 1); ctx.fillRect(0, 16, T, 1);
    ctx.fillRect(0, 0, 1, T); ctx.fillRect(16, 0, 1, T);
  } else if (type === 'plaza') {
    ctx.fillStyle = '#d6cdbc';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#c4baa7';
    for (var k = -T; k < T; k += 8) {
      ctx.fillRect(k + 16, 16, 8, 1);
      ctx.fillRect(16, k + 16, 1, 8);
    }
    ctx.fillRect(0, 0, T, 1); ctx.fillRect(0, 0, 1, T);
  } else if (type === 'floor') {
    ctx.fillStyle = '#ddd7ce';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#e8e3db';
    ctx.fillRect(1, 1, 15, 15); ctx.fillRect(17, 17, 14, 14);
    ctx.fillStyle = '#c9c2b7';
    ctx.fillRect(0, 0, T, 1); ctx.fillRect(0, 0, 1, T);
  } else if (type === 'guide') {
    ctx.fillStyle = '#ddd7ce';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#c9c2b7';
    ctx.fillRect(0, 0, T, 1); ctx.fillRect(0, 0, 1, T);
    pxCircle(ctx, 16, 16, 8, 'rgba(212,175,55,0.25)');
    ctx.fillStyle = '#D4AF37';
    ctx.beginPath(); ctx.moveTo(16, 10); ctx.lineTo(22, 16); ctx.lineTo(16, 22); ctx.lineTo(10, 16); ctx.closePath(); ctx.fill();
  } else if (type === 'wall') {
    ctx.fillStyle = '#f4f2ee';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#e2ded6';
    ctx.fillRect(0, 0, T, 2);
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(0, 20, T, 2);
    ctx.fillStyle = '#0b2350';
    ctx.fillRect(0, 24, T, 8);
  } else if (type === 'partition') {
    ctx.fillStyle = '#ddd7ce';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = 'rgba(160,205,225,0.75)';
    ctx.fillRect(4, 4, 24, 24);
    ctx.fillStyle = '#0b2350';
    ctx.fillRect(4, 24, 24, 4);
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(4, 4, 24, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(8, 8, 3, 10);
  } else if (type === 'carpet') {
    ctx.fillStyle = '#c9a13a';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#b08a2c';
    ctx.fillRect(0, 0, 2, T); ctx.fillRect(T - 2, 0, 2, T);
  } else if (type === 'dark') {
    ctx.fillStyle = '#06090f';
    ctx.fillRect(0, 0, T, T);
  }
}


// ================================================================
//  오브젝트 텍스처
// ================================================================
var SHOPHOUSE_COLORS = ['#f3e3c3', '#f2c9c4', '#bfe3d0', '#f6e39a'];
var AWNING_COLORS = ['#c0392b', '#2e86ab', '#2f7d4f', '#d35400'];

function makeObjectTextures(scene) {
  var T = TILE;

  // ----- 숍하우스 4색 (6 x 4 타일, 위에서 본 지붕 + 오른쪽이 가게 앞면) -----
  ASSETS.objects.shophouse.forEach(function (key, v) {
    makeCanvasTexture(scene, key, 6 * T, 4 * T, function (ctx, w, h) {
      var color = SHOPHOUSE_COLORS[v];
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = shadeColor(color, -0.18);
      ctx.fillRect(0, 0, w, 4); ctx.fillRect(0, h - 4, w, 4); ctx.fillRect(0, 0, 4, h);
      ctx.fillRect(0, h / 2 - 1, w - 34, 2);
      pxCircle(ctx, 30, 30, 10, '#dfe3e6');
      pxCircle(ctx, 30, 30, 6, '#c9ced3');
      ctx.fillStyle = '#eceae4';
      ctx.fillRect(70, 18, 22, 14); ctx.fillRect(110, 90, 22, 14);
      pxCircle(ctx, 81, 25, 4, '#6b6f75');
      pxCircle(ctx, 121, 97, 4, '#6b6f75');
      ctx.fillStyle = '#2e4a5c';
      for (var yy = 16; yy < h - 10; yy += 26) ctx.fillRect(w - 52, yy, 8, 10);
      ctx.fillStyle = AWNING_COLORS[v];
      ctx.fillRect(w - 30, 0, 12, h);
      ctx.fillStyle = '#ffffff';
      for (var sy = 0; sy < h; sy += 12) ctx.fillRect(w - 30, sy, 12, 5);
      ctx.fillStyle = '#9aa1a8';
      ctx.fillRect(w - 18, 8, 18, h - 16);
      ctx.fillStyle = '#7d848b';
      for (var ly = 10; ly < h - 8; ly += 4) ctx.fillRect(w - 18, ly, 18, 1);
    });
  });

  // ----- allAbut 빌딩 (7 x 7 타일, 네이비 + 골드 테두리, 왼쪽이 유리 정면 + 문) -----
  makeCanvasTexture(scene, ASSETS.objects.allabutBuilding, 7 * T, 7 * T, function (ctx, w, h) {
    ctx.fillStyle = '#0b2350';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#12306a';
    for (var gy = 12; gy < h; gy += 24) ctx.fillRect(40, gy, w - 52, 2);
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = '#5d8fc4';
    ctx.fillRect(4, 4, 26, h - 8);
    ctx.fillStyle = '#8fb8e0';
    for (var my = 8; my < h - 8; my += 20) ctx.fillRect(8, my, 4, 12);
    ctx.fillStyle = '#D4AF37';
    for (var fy = 4; fy < h; fy += 32) ctx.fillRect(4, fy, 26, 2);
    ctx.fillRect(28, 4, 2, h - 8);
    // 문 (왼쪽, 4~5번째 칸)
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(0, 3 * T - 4, 14, 2 * T + 8);
    ctx.fillStyle = '#ffe6b8';
    ctx.fillRect(2, 3 * T, 10, 2 * T);
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(2, 4 * T - 1, 10, 2);
  });

  // ----- BTS 역 (16 x 4 타일) -----
  makeCanvasTexture(scene, ASSETS.objects.btsStation, 16 * T, 4 * T, function (ctx, w, h) {
    ctx.fillStyle = '#c9c5bb';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3d4148';
    ctx.fillRect(0, 0, w, 10);
    ctx.fillStyle = '#2f9e5b';
    ctx.fillRect(0, 10, w, 6);
    ctx.fillStyle = '#2c4a5e';
    ctx.fillRect(10, 24, w - 20, 22);
    ctx.fillStyle = '#4c6f86';
    for (var x = 14; x < w - 20; x += 40) ctx.fillRect(x, 26, 30, 18);
    ctx.fillStyle = '#b5b1a7';
    ctx.fillRect(7 * T, 56, 2 * T, h - 56);
    ctx.fillStyle = '#9d998f';
    for (var sy = 60; sy < h; sy += 8) ctx.fillRect(7 * T, sy, 2 * T, 2);
    ctx.fillStyle = '#2f9e5b';
    ctx.fillRect(7 * T - 4, 56, 4, h - 56);
    ctx.fillRect(9 * T, 56, 4, h - 56);
  });

  // ----- 나무 (아래 1칸 차지 + 큰 잎이 위로 걸침, 캐릭터보다 키가 큼) -----
  makeCanvasTexture(scene, ASSETS.objects.tree, 64, 88, function (ctx) {
    pxCircle(ctx, 32, 82, 12, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = '#6b4d30';
    ctx.fillRect(27, 46, 10, 36);
    ctx.fillStyle = '#7f5c3a';
    ctx.fillRect(27, 46, 4, 36);
    pxCircle(ctx, 32, 30, 28, '#2a5e30');
    pxCircle(ctx, 27, 25, 21, '#3f8a45');
    pxCircle(ctx, 41, 33, 15, '#4e9c52');
    pxCircle(ctx, 22, 18, 8, '#66b56a');
    pxCircle(ctx, 40, 22, 5, '#5aa95f');
  });

  // ----- 가로등 -----
  makeCanvasTexture(scene, ASSETS.objects.lamp, 32, 88, function (ctx) {
    pxCircle(ctx, 16, 84, 7, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = '#3b3f45';
    ctx.fillRect(14, 12, 4, 74);
    ctx.fillRect(6, 8, 20, 7);
    pxCircle(ctx, 16, 14, 11, 'rgba(255,214,140,0.35)');
    ctx.fillStyle = '#ffe2a8';
    ctx.fillRect(8, 14, 16, 3);
  });

  // ----- 노점 수레 (파라솔 + 수레) -----
  makeCanvasTexture(scene, ASSETS.objects.foodCart, 48, 64, function (ctx) {
    pxCircle(ctx, 24, 59, 13, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(6, 34, 36, 18);
    ctx.fillStyle = '#d7dbdf';
    ctx.fillRect(4, 31, 40, 4);
    ctx.fillStyle = '#cfe8f2';
    ctx.fillRect(10, 22, 18, 10);
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(6, 52, 8, 8); ctx.fillRect(34, 52, 8, 8);
    ctx.fillStyle = '#dddddd';
    ctx.fillRect(23, 12, 2, 20);
    pxCircle(ctx, 24, 12, 20, '#f2c14e');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, 10, 40, 4);
    ctx.fillRect(22, -8, 4, 40);
  });

  // ----- 뚝뚝 (위에서 본 주황 차, 위쪽을 향함) -----
  makeCanvasTexture(scene, ASSETS.objects.tuktuk, 44, 64, function (ctx) {
    pxCircle(ctx, 22, 56, 17, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(18, 2, 8, 8); ctx.fillRect(3, 42, 7, 12); ctx.fillRect(34, 42, 7, 12);
    ctx.fillStyle = '#e8711c';
    ctx.fillRect(13, 8, 18, 16);
    ctx.fillRect(7, 22, 30, 34);
    ctx.fillStyle = '#c45a10';
    ctx.fillRect(6, 24, 32, 30);
    ctx.fillStyle = '#7a1f2b';
    ctx.fillRect(11, 40, 22, 10);
    ctx.fillStyle = '#9fd0e6';
    ctx.fillRect(13, 19, 18, 4);
    ctx.fillStyle = '#fff6d0';
    ctx.fillRect(19, 5, 6, 3);
  });

  // ----- CNC 기계 (4 x 3 타일) -----
  makeCanvasTexture(scene, ASSETS.objects.cnc, 4 * T, 3 * T + 16, function (ctx, w, h) {
    ctx.fillStyle = 'rgba(160,205,225,0.45)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.fillStyle = '#eef0f2';
    ctx.fillRect(16, 20, w - 32, h - 36);
    ctx.fillStyle = '#30353d';
    ctx.fillRect(28, 12, w - 56, 22);
    ctx.fillStyle = '#57d0ff';
    ctx.fillRect(16, h - 22, w - 32, 4);
    pxCircle(ctx, w / 2, 58, 14, '#b8bec6');
    pxCircle(ctx, w / 2, 58, 7, '#a9adb3');
    ctx.fillStyle = '#30353d';
    ctx.fillRect(w / 2 - 3, 30, 6, 22);
  });

  // ----- 02: FDI 치아 배치도 보드 -----
  makeCanvasTexture(scene, ASSETS.objects.fdiBoard, 4 * T, 40, function (ctx, w, h) {
    ctx.fillStyle = '#0b2350';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    for (var i = 0; i < 16; i++) {
      var a = Math.PI * (0.1 + 0.8 * i / 15);
      var x = w / 2 - Math.cos(a) * 52;
      pxCircle(ctx, Math.round(x), Math.round(18 - Math.sin(a) * 10), 2, '#f4f1ea');
      pxCircle(ctx, Math.round(x), Math.round(24 + Math.sin(a) * 10), 2, '#f4f1ea');
    }
  });

  // ----- 03: 쉐이드 가이드 진열장 -----
  makeCanvasTexture(scene, ASSETS.objects.cabinet, 2 * T, 2 * T, function (ctx, w, h) {
    ctx.fillStyle = '#f4f2ee';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(160,205,225,0.6)';
    ctx.fillRect(4, 4, w - 8, h - 16);
    var shades = ['#f4ecd8', '#efe2c4', '#e9d9b6', '#e2cfa6', '#d7c095', '#cbb487'];
    for (var i = 0; i < 12; i++) {
      ctx.fillStyle = shades[i % shades.length];
      ctx.fillRect(8 + (i % 6) * 8, 10 + Math.floor(i / 6) * 18, 5, 12);
    }
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(0, h - 12, w, 2);
  });

  // ----- 04: 모니터 벽 -----
  makeCanvasTexture(scene, ASSETS.objects.monitors, 6 * T, 40, function (ctx) {
    for (var i = 0; i < 3; i++) {
      var x = 4 + i * 62;
      ctx.fillStyle = '#1b1e24';
      ctx.fillRect(x, 2, 58, 34);
      ctx.fillStyle = '#071526';
      ctx.fillRect(x + 3, 5, 52, 28);
      ctx.strokeStyle = 'rgba(87,208,255,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var k = 0; k < 6; k++) {
        ctx.moveTo(x + 8 + k * 7, 28);
        ctx.lineTo(x + 12 + k * 6, 10 + (k % 2) * 6);
      }
      ctx.stroke();
    }
  });

  // ----- 로비 소파 / 라운지 의자 / 화분 -----
  makeCanvasTexture(scene, ASSETS.objects.sofa, 3 * T, 40, function (ctx, w) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(4, 32, w - 8, 6);
    ctx.fillStyle = '#1c2f52';
    ctx.fillRect(2, 4, w - 4, 30);
    ctx.fillStyle = '#26406e';
    ctx.fillRect(8, 12, w - 16, 18);
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(2, 32, w - 4, 2);
  });
  makeCanvasTexture(scene, ASSETS.objects.chair, 32, 36, function (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(4, 30, 24, 5);
    ctx.fillStyle = '#132a57';
    ctx.fillRect(3, 4, 26, 26);
    ctx.fillStyle = '#1d3a72';
    ctx.fillRect(8, 10, 16, 16);
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(3, 28, 26, 2);
  });
  makeCanvasTexture(scene, ASSETS.objects.plant, 32, 56, function (ctx) {
    pxCircle(ctx, 16, 52, 9, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(8, 34, 16, 18);
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(8, 34, 16, 2);
    pxCircle(ctx, 16, 20, 14, '#3e8a4b');
    pxCircle(ctx, 11, 15, 7, '#55a862');
    pxCircle(ctx, 22, 23, 6, '#2f7140');
  });

  // ----- EXIT 문 (2 x 1 타일) -----
  makeCanvasTexture(scene, ASSETS.objects.exitDoor, 2 * T, T, function (ctx, w, h) {
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1a3557';
    ctx.fillRect(4, 4, w - 8, h - 4);
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(w / 2 - 1, 4, 2, h - 4);
  });
}

// 데스크 텍스처 (폭이 데스크마다 달라서 필요할 때 만들어요)
function ensureDeskTexture(scene, w) {
  var key = ASSETS.objects.desk + w;
  if (scene.textures.exists(key)) return key;
  makeCanvasTexture(scene, key, w * TILE, 40, function (ctx, width) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(2, 34, width - 4, 6);
    ctx.fillStyle = '#0e2552';
    ctx.fillRect(0, 12, width, 24);
    ctx.fillStyle = '#fbfbf9';
    ctx.fillRect(0, 2, width, 12);
    ctx.fillStyle = '#e4e4e0';
    ctx.fillRect(0, 12, width, 2);
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(0, 24, width, 2);
  });
  return key;
}


// ================================================================
//  UI 텍스처 (클릭 마커, 다음 데스크 화살표)
// ================================================================
function makeUiTextures(scene) {
  makeCanvasTexture(scene, ASSETS.ui.marker, 32, 32, function (ctx) {
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(16, 16, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(212,175,55,0.35)';
    ctx.beginPath(); ctx.arc(16, 16, 5, 0, Math.PI * 2); ctx.fill();
  });
  makeCanvasTexture(scene, ASSETS.ui.arrow, 24, 20, function (ctx) {
    ctx.fillStyle = '#8a6d1d';
    ctx.beginPath(); ctx.moveTo(2, 2); ctx.lineTo(22, 2); ctx.lineTo(12, 19); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#D4AF37';
    ctx.beginPath(); ctx.moveTo(4, 3); ctx.lineTo(20, 3); ctx.lineTo(12, 16); ctx.closePath(); ctx.fill();
  });
  makeCanvasTexture(scene, ASSETS.ui.shadow, 24, 10, function (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(12, 5, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
  });
}


// ================================================================
//  캐릭터 (한 프레임 32 x 64 = 타일 2칸 높이, 4방향 x 걷기 3프레임)
//  아바타 설정(피부색, 머리 모양/색, 옷)을 받아서 칠해요
// ================================================================
var CHAR_DIRS = ['down', 'left', 'right', 'up'];

// 아바타 설정 → 그릴 때 쓰는 색 정보
function characterLook(config) {
  var c = normalizeAvatarConfig(config || DEFAULT_AVATAR);
  var outfit = OUTFIT_COLORS[c.outfit] || OUTFIT_COLORS.outfit_labcoat;
  return {
    skin: getCatalogItem('skin', c.skin).color,
    hairColor: getCatalogItem('hairColor', c.hairColor).color,
    hair: c.hair,
    female: c.gender === 'female',
    outfit: c.outfit,
    body: outfit.body,
    trim: outfit.trim,
    legs: outfit.legs,
    shoes: outfit.shoes
  };
}

// 텍스처 + 걷기 애니메이션을 만들고 텍스처 이름을 돌려줘요 (이미 있으면 그대로)
function ensureCharacterTexture(scene, config) {
  var look = characterLook(config);
  var key = ASSETS.characterPrefix + hashString(JSON.stringify(look));
  if (!scene.textures.exists(key)) {
    var tex = makeCanvasTexture(scene, key, 3 * CHAR_W, 4 * CHAR_H, function (ctx) {
      CHAR_DIRS.forEach(function (dir, row) {
        for (var step = 0; step < 3; step++) {
          ctx.save();
          ctx.translate(step * CHAR_W, row * CHAR_H);
          drawCharacterFrame(ctx, dir, step, look);
          ctx.restore();
        }
      });
    });
    // 프레임 번호: 줄(방향) * 3 + 걸음
    for (var i = 0; i < 12; i++) {
      tex.add(i, 0, (i % 3) * CHAR_W, Math.floor(i / 3) * CHAR_H, CHAR_W, CHAR_H);
    }
  }
  CHAR_DIRS.forEach(function (dir, row) {
    var animKey = key + '_walk_' + dir;
    if (scene.anims.exists(animKey)) return;
    scene.anims.create({
      key: animKey,
      frames: [row * 3 + 1, row * 3, row * 3 + 2, row * 3].map(function (f) { return { key: key, frame: f }; }),
      frameRate: 8,
      repeat: -1
    });
  });
  return key;
}

function hashString(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// 캐릭터 한 프레임 그리기 (32 x 64, 발바닥 y = 60)
// dir: down/left/right/up, step: 0 = 서 있음, 1 = 왼발, 2 = 오른발
function drawCharacterFrame(ctx, dir, step, look) {
  var swing = step === 1 ? 1 : (step === 2 ? -1 : 0);
  var side = dir === 'left' || dir === 'right';
  var px = function (color, x, y, w, h) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  var outline = '#1c1d26';
  var bodyDark = shadeColor(look.body, -0.18);
  var skinDark = shadeColor(look.skin, -0.18);

  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath(); ctx.ellipse(16, 60, 10, 3, 0, 0, Math.PI * 2); ctx.fill();

  // ----- 다리 + 신발 -----
  if (side) {
    var front = 13 + swing * 3, back = 13 - swing * 3;
    px(shadeColor(look.legs, -0.15), back, 48, 6, 10);
    px(shadeColor(look.shoes, -0.1), back, 56, 7, 3);
    px(look.legs, front, 48, 6, 10);
    px(look.shoes, front + (dir === 'left' ? -1 : 0), 56, 7, 3);
  } else {
    var liftL = swing > 0 ? 2 : 0, liftR = swing < 0 ? 2 : 0;
    px(look.legs, 11, 48 - liftL, 4, 10);
    px(look.legs, 17, 48 - liftR, 4, 10);
    px(look.shoes, 10, 56 - liftL, 6, 3);
    px(look.shoes, 16, 56 - liftR, 6, 3);
  }

  // ----- 몸통 (테두리 + 옷 색 + 그림자) -----
  px(outline, 8, 33, 16, 17);
  px(look.body, 9, 34, 14, 15);
  px(bodyDark, 21, 34, 2, 15);
  if (look.female) {           // 치마 라인
    px(outline, 7, 43, 18, 8);
    px(look.body, 8, 43, 16, 7);
    px(bodyDark, 22, 43, 2, 7);
  }
  px(bodyDark, 9, 47, 14, 2);

  // ----- 팔 -----
  if (side) {
    var ax = 13 - swing * 2;
    px(outline, ax - 1, 34, 6, 12);
    px(look.body, ax, 35, 4, 10);
    px(look.skin, ax, 44, 4, 3);
  } else {
    px(outline, 5, 34 + swing, 5, 12);
    px(outline, 22, 34 - swing, 5, 12);
    px(look.body, 6, 35 + swing, 3, 9);
    px(look.body, 23, 35 - swing, 3, 9);
    px(look.skin, 6, 44 + swing, 3, 3);
    px(look.skin, 23, 44 - swing, 3, 3);
  }

  // ----- 옷 디테일 -----
  if (dir === 'down') {
    // 목 V
    var v = look.outfit === 'outfit_scrubs' ? look.skin : look.trim;
    px(v, 14, 34, 4, 2); px(v, 15, 36, 2, 2);
    if (look.outfit === 'outfit_labcoat' || look.outfit === 'outfit_polo') {
      px('#8d96a3', 16, 40, 1, 1); px('#8d96a3', 16, 44, 1, 1);
    } else if (look.outfit === 'outfit_suit') {
      px('#D4AF37', 15, 37, 2, 7);
    } else if (look.outfit === 'outfit_hoodie') {
      px('#f2f4f7', 13, 36, 1, 5); px('#f2f4f7', 18, 36, 1, 5);
      px(bodyDark, 11, 43, 10, 3);  // 캥거루 주머니
    }
  } else if (side) {
    px(look.trim, dir === 'left' ? 10 : 21, 35, 1, 8);
  }

  // ----- 목 -----
  px(skinDark, 14, 31, 4, 3);

  // ----- 머리 (테두리 + 피부) -----
  var hx = dir === 'left' ? 15 : (dir === 'right' ? 17 : 16);
  var hy = 19;
  pxCircle(ctx, hx, hy, 13, outline);
  pxCircle(ctx, hx, hy, 12, look.skin);
  px(skinDark, hx - 9, hy + 8, 18, 2);   // 턱 아래 그늘

  // ----- 얼굴 -----
  var eye = '#1f1f2e';
  if (dir === 'down') {
    px(eye, hx - 6, hy - 1, 3, 4);
    px(eye, hx + 3, hy - 1, 3, 4);
    px('#ffffff', hx - 6, hy - 1, 1, 1);
    px('#ffffff', hx + 3, hy - 1, 1, 1);
    px(shadeColor(look.hairColor, 0.1), hx - 6, hy - 4, 3, 1);   // 눈썹
    px(shadeColor(look.hairColor, 0.1), hx + 3, hy - 4, 3, 1);
    px(skinDark, hx, hy + 3, 1, 1);                               // 코
    px('#b5525f', hx - 2, hy + 6, 4, 1);                          // 입
    px('#b5525f', hx - 3, hy + 5, 1, 1); px('#b5525f', hx + 2, hy + 5, 1, 1);
    if (look.female) {
      px('rgba(255,120,140,0.55)', hx - 10, hy + 3, 3, 2);        // 볼터치
      px('rgba(255,120,140,0.55)', hx + 7, hy + 3, 3, 2);
      px(eye, hx - 7, hy - 2, 1, 1); px(eye, hx + 6, hy - 2, 1, 1); // 속눈썹
    }
  } else if (side) {
    var s = dir === 'left' ? -1 : 1;
    var ex = hx + s * 6 - (s < 0 ? 2 : 0);
    px(eye, ex, hy - 1, 3, 4);
    px('#ffffff', ex + (s < 0 ? 0 : 2), hy - 1, 1, 1);
    px(shadeColor(look.hairColor, 0.1), ex, hy - 4, 3, 1);
    px('#b5525f', hx + s * 7 - (s < 0 ? 2 : 0), hy + 6, 3, 1);
    if (look.female) px('rgba(255,120,140,0.55)', hx + s * 3 - 1, hy + 3, 3, 2);
    px(skinDark, hx - s * 2, hy, 2, 4);                            // 귀
  }

  drawHair(ctx, look, dir, hx, hy);
}

// 머리카락 (스타일별). 머리 원: 중심 (hx, hy), 반지름 13
function drawHair(ctx, look, dir, hx, hy) {
  var c = look.hairColor;
  var dark = shadeColor(c, -0.25);
  var px = function (x, y, w, h, color) { ctx.fillStyle = color || c; ctx.fillRect(x, y, w, h); };
  var style = look.hair;
  var R = 13;

  if (style === 'hair_bald') {
    px(hx - 6, hy - 9, 4, 2, 'rgba(255,255,255,0.35)');   // 반짝
    return;
  }

  // 원 모양을 따라 윗머리 채우기 (y 줄 0 ~ toY)
  function cap(toY, fromX, toX) {
    for (var y = hy - R; y <= toY; y++) {
      var half = Math.round(Math.sqrt(Math.max(0, R * R - (y - hy) * (y - hy))));
      var x0 = hx - half, x1 = hx + half;
      if (fromX !== undefined) x0 = Math.max(x0, fromX);
      if (toX !== undefined) x1 = Math.min(x1, toX);
      if (x1 > x0) px(x0, y, x1 - x0, 1);
    }
  }

  if (dir === 'up') {
    // 뒷모습: 머리 전체를 덮음
    cap(hy + 9);
    px(hx - 10, hy + 6, 20, 2, dark);
    if (style === 'hair_long') { px(hx - 12, hy + 6, 24, 22); px(hx - 12, hy + 26, 24, 2, dark); }
    if (style === 'hair_bob') px(hx - 13, hy + 4, 26, 8);
    if (style === 'hair_ponytail') { px(hx - 3, hy + 8, 6, 14); px(hx - 2, hy + 22, 4, 3); px(hx - 3, hy + 7, 6, 2, '#D4AF37'); }
    if (style === 'hair_curly') { for (var i = -12; i <= 12; i += 5) { ctx.fillStyle = c; pxCircle(ctx, hx + i, hy - 12, 3, c); } }
    return;
  }

  // 옆모습: 뒤통수 쪽 머리
  if (dir === 'left') cap(hy + 8, hx + 1);
  if (dir === 'right') cap(hy + 8, undefined, hx - 1);

  if (style === 'hair_short') {
    cap(hy - 7);
    if (dir === 'down') { px(hx - 12, hy - 7, 2, 6); px(hx + 10, hy - 7, 2, 6); }
  } else if (style === 'hair_sidepart') {
    cap(hy - 7);
    if (dir === 'down') { px(hx - 11, hy - 7, 12, 3); px(hx - 12, hy - 7, 2, 7); px(hx + 10, hy - 7, 2, 6); }
    else px(hx - 9, hy - 7, 18, 2);
    px(hx + 2, hy - 12, 1, 5, dark);  // 가르마
  } else if (style === 'hair_curly') {
    cap(hy - 6);
    for (var k = -12; k <= 12; k += 5) pxCircle(ctx, hx + k, hy - 11, 3, c);
    pxCircle(ctx, hx - 12, hy - 4, 3, c);
    pxCircle(ctx, hx + 12, hy - 4, 3, c);
  } else if (style === 'hair_bob') {
    cap(hy - 6);
    if (dir === 'down') { px(hx - 14, hy - 7, 4, 17); px(hx + 10, hy - 7, 4, 17); px(hx - 9, hy - 6, 18, 2); }
    else px(hx - 13, hy - 7, 26, 3);
  } else if (style === 'hair_long') {
    cap(hy - 6);
    if (dir === 'down') { px(hx - 14, hy - 7, 4, 30); px(hx + 10, hy - 7, 4, 30); }
    else px(dir === 'left' ? hx + 4 : hx - 12, hy - 4, 8, 28);
  } else if (style === 'hair_ponytail') {
    cap(hy - 6);
    if (dir === 'down') { px(hx - 13, hy - 6, 3, 6); px(hx + 10, hy - 6, 3, 6); }
    else {
      var tx = dir === 'left' ? hx + 11 : hx - 15;
      px(tx, hy - 6, 4, 18);
      px(tx, hy - 7, 4, 2, '#D4AF37');
    }
  }
}


// ================================================================
//  어깨 펫 (한 프레임 16 x 16, 2열(기본·동작) x 4줄(아래·왼·오른·위))
// ================================================================
var PET_COLORS = {
  pet_cat:         { body: '#e8913a', dark: '#b8661f', light: '#f6c58a' },
  pet_parrot:      { body: '#3fb34f', dark: '#257a33', light: '#e84a3c' },
  pet_hamster:     { body: '#e2b07a', dark: '#b07f4f', light: '#fbefe0' },
  pet_puppy:       { body: '#d9b382', dark: '#8a5a33', light: '#f3e2c7' },
  pet_tooth_buddy: { body: '#fbfbf7', dark: '#c9ccd2', light: '#ffffff' }
};

function makePetTextures(scene) {
  Object.keys(ASSETS.pets).forEach(function (petId) {
    var key = ASSETS.pets[petId];
    var tex = makeCanvasTexture(scene, key, 2 * PET_SIZE, 4 * PET_SIZE, function (ctx) {
      CHAR_DIRS.forEach(function (dir, row) {
        for (var action = 0; action < 2; action++) {
          ctx.save();
          ctx.translate(action * PET_SIZE, row * PET_SIZE);
          drawPetFrame(ctx, petId, dir, action === 1);
          ctx.restore();
        }
      });
    });
    for (var i = 0; i < 8; i++) {
      tex.add(i, 0, (i % 2) * PET_SIZE, Math.floor(i / 2) * PET_SIZE, PET_SIZE, PET_SIZE);
    }
  });
}

// 펫 한 프레임 그리기 (16 x 16). action = 가끔 하는 작은 동작
// 왼쪽 모습은 오른쪽 모습을 거울처럼 뒤집어서 그려요
function drawPetFrame(ctx, petId, dir, action) {
  var col = PET_COLORS[petId];
  if (!col) return;
  if (dir === 'left') {
    ctx.save();
    ctx.translate(16, 0);
    ctx.scale(-1, 1);
    drawPetFrame(ctx, petId, 'right', action);
    ctx.restore();
    return;
  }
  var px = function (color, x, y, w, h) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  var eye = '#1f1f2e', ol = '#2a2324';
  var front = dir === 'down', back = dir === 'up';

  if (petId === 'pet_cat') {
    // 꼬리 (동작: 위로 휙)
    if (action) px(col.dark, back ? 7 : 1, 2, 2, 8); else px(col.dark, back ? 6 : 1, 9, 5, 2);
    pxCircle(ctx, 8, 11, 4, col.body);                 // 몸
    pxCircle(ctx, back ? 8 : 9, 6, 4, col.body);        // 머리
    px(col.body, back ? 4 : 5, 1, 2, 3); px(col.body, back ? 10 : 11, 1, 2, 3);   // 귀
    px(col.dark, back ? 5 : 6, 6, 6, 1);                 // 줄무늬
    if (front) { px(eye, 6, 6, 1, 2); px(eye, 10, 6, 1, 2); px('#e57a8a', 8, 8, 1, 1); }
    else if (!back) { px(eye, 11, 6, 1, 2); px('#e57a8a', 13, 8, 1, 1); }
  } else if (petId === 'pet_parrot') {
    // 날개 (동작: 퍼덕)
    if (action) { px(col.dark, 1, 6, 4, 3); px(col.dark, 11, 6, 4, 3); }
    pxCircle(ctx, 8, 10, 4, col.body);
    px(col.dark, 6, 13, 4, 3);                           // 꼬리깃
    pxCircle(ctx, 8, 5, 3, col.light);                   // 빨간 머리
    if (front) { px(eye, 6, 4, 1, 1); px(eye, 10, 4, 1, 1); px('#f2c14e', 7, 6, 2, 2); }
    else if (!back) { px(eye, 9, 4, 1, 1); px('#f2c14e', 11, 5, 2, 2); }
    px(col.dark, back ? 5 : 4, 9, 2, 4);                 // 날개
  } else if (petId === 'pet_hamster') {
    pxCircle(ctx, 8, 9, 6, col.body);
    pxCircle(ctx, 8, 11, 4, col.light);                  // 배
    px(col.dark, 3, 3, 3, 3); px(col.dark, 10, 3, 3, 3); // 귀
    if (front) {
      px(eye, 5, 7, 1, 2); px(eye, 10, 7, 1, 2); px('#e57a8a', 7, 10, 2, 1);
      if (action) { pxCircle(ctx, 3, 11, 3, col.light); pxCircle(ctx, 13, 11, 3, col.light); }   // 볼 빵빵
    } else if (!back) {
      px(eye, 11, 7, 1, 2);
      if (action) pxCircle(ctx, 12, 11, 3, col.light);
    }
  } else if (petId === 'pet_puppy') {
    pxCircle(ctx, 8, 11, 4, col.body);
    pxCircle(ctx, back ? 8 : 9, 6, 4, col.body);
    // 귀 (동작: 쫑긋)
    if (action) { px(col.dark, 4, 0, 2, 4); px(col.dark, 11, 0, 2, 4); }
    else { px(col.dark, 3, 4, 3, 5); px(col.dark, 11, 4, 3, 5); }
    px(col.dark, back ? 7 : 1, back ? 12 : 9, 3, 2);     // 꼬리
    if (front) { px(eye, 6, 6, 1, 2); px(eye, 10, 6, 1, 2); px(eye, 8, 8, 1, 1); px('#e57a8a', 8, 9, 1, 1); }
    else if (!back) { px(eye, 11, 6, 1, 2); px(eye, 13, 8, 1, 1); }
  } else if (petId === 'pet_tooth_buddy') {
    // 하얀 치아: 둥근 머리(크라운) + 뿌리 두 개
    pxCircle(ctx, 8, 7, 6, ol);
    pxCircle(ctx, 8, 7, 5, col.body);
    px(ol, 3, 9, 4, 6); px(ol, 9, 9, 4, 6);
    px(col.body, 4, 9, 2, 5); px(col.body, 10, 9, 2, 5);
    px(col.body, 4, 8, 8, 3);
    px(col.dark, 6, 11, 4, 1);
    if (front) {
      px(eye, 5, 6, 2, 2); px(eye, 9, 6, 2, 2);
      px('#ffffff', 5, 6, 1, 1); px('#ffffff', 9, 6, 1, 1);
      px('rgba(255,120,140,0.6)', 4, 9, 1, 1); px('rgba(255,120,140,0.6)', 11, 9, 1, 1);
    } else if (!back) {
      px(eye, 10, 6, 2, 2); px('#ffffff', 10, 6, 1, 1);
    }
    // 반짝임 (동작)
    if (action) { px('#D4AF37', 13, 1, 1, 3); px('#D4AF37', 12, 2, 3, 1); px('#fff4c2', 13, 2, 1, 1); }
  }
}
