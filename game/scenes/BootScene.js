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

// 색을 밝게/어둡게 (amount: -1 ~ 1)
function shadeColor(hex, amount) {
  var c = Phaser.Display.Color.HexStringToColor(hex);
  var t = amount < 0 ? 0 : 255;
  var p = Math.abs(amount);
  var r = Math.round(c.red + (t - c.red) * p);
  var g = Math.round(c.green + (t - c.green) * p);
  var b = Math.round(c.blue + (t - c.blue) * p);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
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
    ctx.fillStyle = 'rgba(212,175,55,0.35)';
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
      // 지붕 테두리 + 집 사이 경계
      ctx.fillStyle = shadeColor(color, -0.18);
      ctx.fillRect(0, 0, w, 4); ctx.fillRect(0, h - 4, w, 4); ctx.fillRect(0, 0, 4, h);
      ctx.fillRect(0, h / 2 - 1, w - 34, 2);
      // 옥상 물탱크 + 에어컨 실외기
      pxCircle(ctx, 30, 30, 10, '#dfe3e6');
      pxCircle(ctx, 30, 30, 6, '#c9ced3');
      ctx.fillStyle = '#eceae4';
      ctx.fillRect(70, 18, 22, 14); ctx.fillRect(110, 90, 22, 14);
      ctx.fillStyle = '#6b6f75';
      pxCircle(ctx, 81, 25, 4, '#6b6f75');
      pxCircle(ctx, 121, 97, 4, '#6b6f75');
      // 창문 점 (위층 창문)
      ctx.fillStyle = '#2e4a5c';
      for (var yy = 16; yy < h - 10; yy += 26) {
        ctx.fillRect(w - 52, yy, 8, 10);
      }
      // 가게 앞면 (오른쪽): 차양 줄무늬 + 셔터
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

  // ----- allAbut 빌딩 (9 x 8 타일, 네이비 + 골드 테두리, 왼쪽이 유리 정면 + 문) -----
  makeCanvasTexture(scene, ASSETS.objects.allabutBuilding, 9 * T, 8 * T, function (ctx, w, h) {
    ctx.fillStyle = '#0b2350';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#12306a';
    for (var gy = 12; gy < h; gy += 24) ctx.fillRect(40, gy, w - 52, 2);
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    // 유리 정면 (왼쪽)
    ctx.fillStyle = '#5d8fc4';
    ctx.fillRect(4, 4, 26, h - 8);
    ctx.fillStyle = '#8fb8e0';
    for (var my = 8; my < h - 8; my += 20) ctx.fillRect(8, my, 4, 12);
    ctx.fillStyle = '#D4AF37';
    for (var fy = 4; fy < h; fy += 32) ctx.fillRect(4, fy, 26, 2);
    ctx.fillRect(28, 4, 2, h - 8);
    // 문 (왼쪽 가운데, 3~4번째 칸)
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
    // 가운데 계단 (7~8번째 칸)
    ctx.fillStyle = '#b5b1a7';
    ctx.fillRect(7 * T, 56, 2 * T, h - 56);
    ctx.fillStyle = '#9d998f';
    for (var sy = 60; sy < h; sy += 8) ctx.fillRect(7 * T, sy, 2 * T, 2);
    ctx.fillStyle = '#2f9e5b';
    ctx.fillRect(7 * T - 4, 56, 4, h - 56);
    ctx.fillRect(9 * T, 56, 4, h - 56);
  });

  // ----- 나무 (초록 원, 아래 1칸 차지 + 잎이 위로 걸침) -----
  makeCanvasTexture(scene, ASSETS.objects.tree, 48, 60, function (ctx) {
    pxCircle(ctx, 24, 54, 9, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = '#7a5a3a';
    ctx.fillRect(21, 32, 6, 22);
    pxCircle(ctx, 24, 22, 20, '#2f6b35');
    pxCircle(ctx, 20, 18, 14, '#3f8a45');
    pxCircle(ctx, 30, 24, 10, '#4e9c52');
    pxCircle(ctx, 18, 14, 5, '#66b56a');
  });

  // ----- 가로등 -----
  makeCanvasTexture(scene, ASSETS.objects.lamp, 32, 64, function (ctx) {
    pxCircle(ctx, 16, 60, 6, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = '#3b3f45';
    ctx.fillRect(14, 10, 4, 52);
    ctx.fillRect(8, 8, 16, 6);
    pxCircle(ctx, 16, 12, 9, 'rgba(255,214,140,0.35)');
    ctx.fillStyle = '#ffe2a8';
    ctx.fillRect(10, 12, 12, 3);
  });

  // ----- 노점 수레 (파라솔 + 수레) -----
  makeCanvasTexture(scene, ASSETS.objects.foodCart, 40, 48, function (ctx) {
    pxCircle(ctx, 20, 44, 10, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(6, 26, 28, 14);
    ctx.fillStyle = '#d7dbdf';
    ctx.fillRect(5, 24, 30, 3);
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(6, 40, 6, 6); ctx.fillRect(28, 40, 6, 6);
    // 파라솔 (노랑/흰 줄무늬)
    ctx.fillStyle = '#dddddd';
    ctx.fillRect(19, 10, 2, 16);
    pxCircle(ctx, 20, 10, 16, '#f2c14e');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, 9, 32, 3);
    ctx.fillRect(18, -6, 4, 32);
  });

  // ----- 뚝뚝 (위에서 본 작은 주황 차, 위쪽을 향함) -----
  makeCanvasTexture(scene, ASSETS.objects.tuktuk, 32, 48, function (ctx) {
    pxCircle(ctx, 16, 42, 12, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(13, 2, 6, 6); ctx.fillRect(3, 32, 5, 9); ctx.fillRect(24, 32, 5, 9);
    ctx.fillStyle = '#e8711c';
    ctx.fillRect(10, 6, 12, 12);
    ctx.fillRect(5, 16, 22, 26);
    ctx.fillStyle = '#c45a10';
    ctx.fillRect(4, 18, 24, 22);
    ctx.fillStyle = '#7a1f2b';
    ctx.fillRect(8, 30, 16, 8);
    ctx.fillStyle = '#9fd0e6';
    ctx.fillRect(10, 14, 12, 3);
    ctx.fillStyle = '#fff6d0';
    ctx.fillRect(14, 4, 4, 2);
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
  makeCanvasTexture(scene, ASSETS.objects.monitors, 6 * T, 40, function (ctx, w, h) {
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
  makeCanvasTexture(scene, ASSETS.objects.plant, 32, 44, function (ctx) {
    pxCircle(ctx, 16, 40, 8, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(9, 26, 14, 14);
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(9, 26, 14, 2);
    pxCircle(ctx, 16, 16, 11, '#3e8a4b');
    pxCircle(ctx, 12, 12, 6, '#55a862');
    pxCircle(ctx, 21, 18, 5, '#2f7140');
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
//  캐릭터 (32x32, 4방향 x 걷기 3프레임)
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
    var tex = makeCanvasTexture(scene, key, 3 * TILE, 4 * TILE, function (ctx) {
      CHAR_DIRS.forEach(function (dir, row) {
        for (var step = 0; step < 3; step++) {
          ctx.save();
          ctx.translate(step * TILE, row * TILE);
          drawCharacterFrame(ctx, dir, step, look);
          ctx.restore();
        }
      });
    });
    // 프레임 번호: 줄(방향) * 3 + 걸음
    for (var i = 0; i < 12; i++) {
      tex.add(i, 0, (i % 3) * TILE, Math.floor(i / 3) * TILE, TILE, TILE);
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

// 캐릭터 한 프레임 그리기
// dir: down/left/right/up, step: 0 = 서 있음, 1 = 왼발, 2 = 오른발
function drawCharacterFrame(ctx, dir, step, look) {
  var swing = step === 1 ? 1 : (step === 2 ? -1 : 0);
  var side = dir === 'left' || dir === 'right';
  var px = function (color, x, y, w, h) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };

  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(16, 29, 8, 2.5, 0, 0, Math.PI * 2); ctx.fill();

  // 다리 + 신발
  if (side) {
    px(look.legs, 14 + swing * 2, 22, 4, 6);
    px(look.legs, 14 - swing * 2, 22, 4, 6);
    px(look.shoes, 14 + swing * 2, 27, 4, 2);
    px(look.shoes, 14 - swing * 2, 27, 4, 2);
  } else {
    px(look.legs, 12, 22 - Math.max(0, swing), 3, 6);
    px(look.legs, 17, 22 - Math.max(0, -swing), 3, 6);
    px(look.shoes, 12, 27 - Math.max(0, swing), 3, 2);
    px(look.shoes, 17, 27 - Math.max(0, -swing), 3, 2);
  }

  // 몸통 (여자는 아래가 살짝 퍼진 치마 라인)
  px(look.body, 10, 14, 12, 9);
  if (look.female) px(look.body, 9, 20, 14, 4);
  px(shadeColor(look.body, -0.15), 10, 22, 12, 1);

  // 팔 (걸을 때 앞뒤로)
  if (side) {
    px(look.body, 14 - swing, 15, 4, 6);
    px(look.skin, 14 - swing, 21, 4, 2);
  } else {
    px(look.body, 8, 15 + swing, 2, 6);
    px(look.body, 22, 15 - swing, 2, 6);
    px(look.skin, 8, 21 + swing, 2, 2);
    px(look.skin, 22, 21 - swing, 2, 2);
  }

  // 옷 디테일 (앞모습: 목 V / 옆모습: 단추줄)
  if (dir === 'down') {
    px(look.trim, 15, 14, 2, 3);
    px(look.trim, 14, 14, 1, 2);
    px(look.trim, 17, 14, 1, 2);
  } else if (side) {
    px(look.trim, dir === 'left' ? 11 : 20, 15, 1, 6);
  }

  // 머리
  var hx = dir === 'left' ? 15 : (dir === 'right' ? 17 : 16);
  pxCircle(ctx, hx, 8, 7, look.skin);

  // 얼굴 (뒷모습은 없음)
  if (dir === 'down') {
    px('#1a1a2e', hx - 4, 8, 2, 2);
    px('#1a1a2e', hx + 2, 8, 2, 2);
    px('#b5525f', hx - 1, 12, 3, 1);
    if (look.female) {
      px('rgba(255,120,140,0.5)', hx - 6, 10, 2, 1);
      px('rgba(255,120,140,0.5)', hx + 4, 10, 2, 1);
    }
  } else if (dir === 'left') {
    px('#1a1a2e', hx - 5, 8, 2, 2);
  } else if (dir === 'right') {
    px('#1a1a2e', hx + 3, 8, 2, 2);
  }

  drawHair(ctx, look, dir, hx);
}

// 머리카락 (스타일별)
function drawHair(ctx, look, dir, hx) {
  var c = look.hairColor;
  var px = function (x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  var back = dir === 'up';
  var style = look.hair;
  if (style === 'hair_bald') return;

  // 기본 모자 모양 (윗머리)
  function cap(depth) {
    for (var y = 1; y <= depth; y++) {
      var half = Math.round(Math.sqrt(49 - (y - 8) * (y - 8)));
      px(hx - half, y, half * 2, 1);
    }
  }

  if (back) {
    // 뒷모습: 머리 전체를 덮음
    cap(12);
    if (style === 'hair_long') px(hx - 7, 10, 14, 10);
    if (style === 'hair_bob') px(hx - 7, 10, 14, 4);
    if (style === 'hair_ponytail') { px(hx - 2, 12, 4, 6); px(hx - 1, 18, 2, 2); }
    if (style === 'hair_curly') { for (var i = -6; i <= 6; i += 3) px(hx + i - 1, 0, 3, 2); }
    return;
  }

  if (style === 'hair_short') {
    cap(4);
  } else if (style === 'hair_sidepart') {
    cap(4);
    px(hx - 6, 4, 7, 2);
  } else if (style === 'hair_curly') {
    cap(5);
    for (var k = -7; k <= 6; k += 3) px(hx + k, 0, 3, 3);
    px(hx - 8, 3, 2, 5); px(hx + 6, 3, 2, 5);
  } else if (style === 'hair_bob') {
    cap(4);
    px(hx - 8, 4, 3, 9); px(hx + 5, 4, 3, 9);
  } else if (style === 'hair_long') {
    cap(4);
    px(hx - 8, 4, 3, 15); px(hx + 5, 4, 3, 15);
  } else if (style === 'hair_ponytail') {
    cap(4);
    if (dir === 'left') px(hx + 6, 4, 3, 9);
    else if (dir === 'right') px(hx - 9, 4, 3, 9);
    else { px(hx - 8, 4, 2, 4); px(hx + 6, 4, 2, 4); }
  }
  // 옆모습이면 뒤통수 쪽 머리
  if (dir === 'left') px(hx + 3, 2, 4, 8);
  if (dir === 'right') px(hx - 7, 2, 4, 8);
}
