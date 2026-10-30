// ===== allAbut 체험관 내부 =====
// 약 40m(가로, x) × 60m(세로, z). 남쪽(+z)이 입구, 북쪽(-z)이 안쪽.
// 입구 → 01 접수 → 02 치아 선택(서쪽) → 03 디자인 랩(북서) → 04 스캔 데이터(북동) → 05 결제(동쪽)

var INTERIORS = window.INTERIORS || {};
window.INTERIORS = INTERIORS;


// ----- 주문 진행 상태 (전역) -----
// 데스크에서 주문을 마치면 true 로 바뀌어요 (completeDesk 사용)
var order = {
  progress: { reception: false, toothmap: false, designlab: false, scandata: false, checkout: false }
};

// 데스크 배치 (rotY: 데스크 앞면이 바라보는 방향, 도)
var SHOP_DESK_DATA = [
  { id: 'reception', no: '01', title: 'RECEPTION',  npcName: 'Mina', x: 0,     z: 12,  rotY: 0,   w: 5.4, d: 1.1, h: 1.1, style: 'reception',
    npc: { gender: 'female', skin: 'skin_02', face: 'face_oval',   eyes: 'eyes_round', nose: 'nose_small', mouth: 'mouth_smile', hair: 'hair_bob',      hairColor: 'hc_darkbrown', outfit: 'outfit_suit' } },
  { id: 'toothmap',  no: '02', title: 'TOOTH MAP',  npcName: 'Ken',  x: -15.5, z: 0,   rotY: 90,  w: 3.0, d: 1.0, h: 1.05, style: 'plain',
    npc: { gender: 'male',   skin: 'skin_03', face: 'face_square', eyes: 'eyes_dot',   nose: 'nose_round', mouth: 'mouth_grin',  hair: 'hair_short',    hairColor: 'hc_black',     outfit: 'outfit_scrubs' } },
  { id: 'designlab', no: '03', title: 'DESIGN LAB', npcName: 'Sora', x: -13,   z: -25, rotY: 0,   w: 3.4, d: 1.0, h: 1.0, style: 'lshape',
    npc: { gender: 'female', skin: 'skin_01', face: 'face_round',  eyes: 'eyes_smile', nose: 'nose_small', mouth: 'mouth_smile', hair: 'hair_ponytail', hairColor: 'hc_blonde',    outfit: 'outfit_labcoat' } },
  { id: 'scandata',  no: '04', title: 'SCAN DATA',  npcName: 'Leo',  x: 13,    z: -25, rotY: 0,   w: 3.6, d: 1.1, h: 1.0, style: 'monitors',
    npc: { gender: 'male',   skin: 'skin_05', face: 'face_round',  eyes: 'eyes_sharp', nose: 'nose_small', mouth: 'mouth_flat',  hair: 'hair_curly',    hairColor: 'hc_black',     outfit: 'outfit_scrubs' } },
  { id: 'checkout',  no: '05', title: 'CHECKOUT',   npcName: 'Nara', x: 15.5,  z: 0,   rotY: -90, w: 3.2, d: 1.0, h: 1.0, style: 'curved',
    npc: { gender: 'female', skin: 'skin_04', face: 'face_oval',   eyes: 'eyes_round', nose: 'nose_none',  mouth: 'mouth_smile', hair: 'hair_long',     hairColor: 'hc_brown',     outfit: 'outfit_labcoat' } }
];

// 구역(방) - 미니맵과 파티션에 사용
var SHOP_ROOMS = [
  { name: 'LOBBY',      x1: -20, z1: 8,   x2: 20,  z2: 30 },
  { name: 'TOOTH MAP',  x1: -20, z1: -10, x2: -8,  z2: 8 },
  { name: 'DESIGN LAB', x1: -20, z1: -30, x2: -6,  z2: -14 },
  { name: 'SCAN DATA',  x1: 6,   z1: -30, x2: 20,  z2: -14 },
  { name: 'CHECKOUT',   x1: 8,   z1: -10, x2: 20,  z2: 8 }
];

// 유리 파티션 (선분 [x1, z1, x2, z2]) - 사이사이 빈 곳이 통로 (최소 4m)
var SHOP_PARTITIONS = [
  // 02 치아 선택 방
  [-20, 8, -8, 8], [-8, 8, -8, 3], [-8, -3, -8, -10], [-20, -10, -15, -10], [-11, -10, -8, -10],
  // 03 디자인 랩 방
  [-20, -14, -15, -14], [-11, -14, -6, -14], [-6, -14, -6, -17], [-6, -22, -6, -30],
  // 04 스캔 데이터 방
  [6, -14, 11, -14], [15, -14, 20, -14], [6, -14, 6, -17], [6, -22, 6, -30],
  // 05 결제 방
  [8, 8, 20, 8], [8, 8, 8, 3], [8, -3, 8, -10], [8, -10, 11, -10], [15, -10, 20, -10]
];

// 바닥 골드 안내선 경로 (입구 → 01 → 02 → 03 → 04 → 05)
var SHOP_GUIDE_PATH = [
  [0, 28], [0, 14.4], [-5.8, 14.4], [-5.8, 0], [-13.2, 0], [-13.2, -12], [-13, -22.6],
  [-6, -19.5], [6, -19.5], [13, -22.6], [13, -12], [13.2, 0]
];


// 데스크 주문 완료 처리 (다음 단계의 주문 화면에서 사용)
function completeDesk(deskId) {
  if (deskId in order.progress) order.progress[deskId] = true;
}

// 다음에 가야 할 데스크 (모두 끝났으면 null)
function getNextDesk() {
  for (var i = 0; i < SHOP_DESK_DATA.length; i++) {
    if (!order.progress[SHOP_DESK_DATA[i].id]) return SHOP_DESK_DATA[i].id;
  }
  return null;
}


// ================================================================
//  체험관 장면 만들기
// ================================================================
INTERIORS['allabut-shop'] = {
  label: 'allAbut Experience Center',
  exitTo: { zone: 'bangkok-soi', entry: 'from:allabut-shop' },
  build: buildAllabutShop
};

function buildAllabutShop(quality) {
  var ctx = createBuildContext(quality);
  var scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9e6e1');
  scene.fog = new THREE.Fog('#e9e6e1', quality.mobile ? 30 : 40, quality.mobile ? 70 : 95);

  var bounds = { minX: -20, maxX: 20, minZ: -30, maxZ: 30 };
  var nav = new NavGrid(bounds);
  var occluders = [];
  var interactives = [];
  var updaters = [];

  // 충돌 + (선택) 가림 판정
  function solid(group, minX, minZ, maxX, maxZ, height, occlude) {
    nav.blockRect(minX, minZ, maxX, maxZ);
    if (occlude) occluders.push(makeOccluderProxy(scene, group, { minX: minX, minZ: minZ, maxX: maxX, maxZ: maxZ }, height));
  }
  function shadowAll(obj, cast) {
    obj.traverse(function (m) {
      if (!m.isMesh) return;
      m.receiveShadow = quality.shadows;
      m.castShadow = quality.shadows && cast !== false;
    });
  }

  // ----- 조명: 밝고 깨끗하게 -----
  scene.add(new THREE.HemisphereLight('#ffffff', '#d9d3c9', 1.5));
  scene.add(new THREE.AmbientLight('#ffffff', 0.45));
  var key = new THREE.DirectionalLight('#fff6ea', 1.3);
  key.position.set(8, 24, 14);
  if (quality.shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -26;
    key.shadow.camera.right = 26;
    key.shadow.camera.top = 36;
    key.shadow.camera.bottom = -36;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 70;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
  }
  scene.add(key);

  // 스포트라이트 (PC 만)
  function spot(x, z, tx, tz, color, intensity) {
    if (quality.mobile) return;
    var s = new THREE.SpotLight(color || '#fff2d6', intensity || 90, 16, 0.5, 0.6, 1.5);
    s.position.set(x, 6, z);
    s.target.position.set(tx, 0, tz);
    scene.add(s);
    scene.add(s.target);
  }

  // ----- 바닥: 밝은 웜그레이 광택 타일 -----
  var tileTex = makePatternTexture('tile', function (c, s) {
    c.fillStyle = '#dcd6cd'; c.fillRect(0, 0, s, s);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, 0, s / 2, s / 2); c.fillRect(s / 2, s / 2, s / 2, s / 2);
    c.strokeStyle = '#c4bdb2'; c.lineWidth = 2;
    c.strokeRect(0, 0, s, s); c.strokeRect(0, 0, s / 2, s / 2); c.strokeRect(s / 2, s / 2, s / 2, s / 2);
  });
  tileTex.repeat.set(20, 30);
  var floor = wMesh(new THREE.PlaneGeometry(40, 60), new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.28, metalness: 0.05 }), 0, 0, 0);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ----- 바깥 벽 (흰색 + 네이비 걸레받이 + 골드 조명 띠) -----
  var wallH = 4.2;
  var white = ctx.mat('#f7f6f3', { roughness: 0.7 });
  var navy = ctx.mat('#0b2350', { roughness: 0.6 });
  var goldLed = ctx.basic('#f1cf6a');

  function wall(x1, z1, x2, z2) {
    var g = new THREE.Group();
    var len = Math.hypot(x2 - x1, z2 - z1);
    var angle = Math.atan2(-(z2 - z1), x2 - x1);
    g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    g.rotation.y = angle;
    g.add(wMesh(ctx.box(len, wallH, 0.3), white, 0, wallH / 2, 0));
    g.add(wMesh(ctx.box(len, 0.25, 0.34), navy, 0, 0.125, 0));
    g.add(wMesh(ctx.box(len, 0.06, 0.36), goldLed, 0, 3.0, 0));
    scene.add(g);
    shadowAll(g, false);
    var hx = Math.abs(x2 - x1) / 2 + 0.15, hz = Math.abs(z2 - z1) / 2 + 0.15;
    solid(g, (x1 + x2) / 2 - hx, (z1 + z2) / 2 - hz, (x1 + x2) / 2 + hx, (z1 + z2) / 2 + hz, wallH, true);
    return g;
  }
  wall(-20, -30, 20, -30);           // 북쪽
  wall(-20, -30, -20, 30);           // 서쪽
  wall(20, -30, 20, 30);             // 동쪽
  wall(-20, 30, -2.2, 30);           // 남쪽 (가운데 EXIT 문)
  wall(2.2, 30, 20, 30);

  // EXIT 문
  var exitGroup = new THREE.Group();
  exitGroup.position.set(0, 0, 30);
  exitGroup.add(wMesh(ctx.box(4.6, 3.6, 0.35), ctx.mat('#D4AF37', { metalness: 0.7, roughness: 0.3 }), 0, 1.8, 0));
  var exitGlass = wMesh(ctx.plane(4.0, 3.3), ctx.mat('#1a3557', { roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.9 }), 0, 1.65, -0.19);
  exitGlass.rotation.y = Math.PI; // 안쪽(북쪽)을 보게
  exitGroup.add(exitGlass);
  exitGroup.add(wMesh(ctx.box(4.4, wallH - 3.6, 0.3), white, 0, 3.6 + (wallH - 3.6) / 2, 0));
  var exitTex = makeLabelTexture('EXIT', { w: 256, h: 80, bg: '#0b2350', fg: '#D4AF37', border: '#D4AF37', size: 0.5, spacing: '6px' });
  var exitSign = wMesh(ctx.plane(1.4, 0.44), new THREE.MeshBasicMaterial({ map: exitTex }), 0, 3.85, -0.2);
  exitSign.rotation.y = Math.PI;
  exitGroup.add(exitSign);
  var exitOutline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4.8, 3.8, 0.6)), new THREE.LineBasicMaterial({ color: 0xD4AF37 }));
  exitOutline.position.y = 1.9;
  exitOutline.visible = false;
  exitGroup.add(exitOutline);
  scene.add(exitGroup);
  solid(exitGroup, -2.4, 29.6, 2.4, 30.4, wallH, true);
  var exitProxy = wMesh(new THREE.BoxGeometry(4.6, 3.8, 1.6), new THREE.MeshBasicMaterial({ visible: false }), 0, 1.9, 29.4);
  scene.add(exitProxy);
  var exitItem = {
    kind: 'exit', proxy: exitProxy,
    approach: new THREE.Vector3(0, 0, 28.3), face: new THREE.Vector3(0, 0, 31),
    tooltip: 'Exit to Soi allAbut',
    setHover: function (on) { exitOutline.visible = on; }
  };
  exitProxy.userData.interactive = exitItem;
  interactives.push(exitItem);

  // ----- 천장 조명 라인 (천장은 없고 빛 줄만 공중에) -----
  // 카메라가 천장보다 높아서, 카메라 가까이 있는 줄은 시야를 가리지 않게 흐리게 해요
  var ceilingLines = [];
  function ceilingLine(x, z, w, d, axis) {
    var mat = new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true, opacity: 0.8, depthWrite: false });
    var m = wMesh(ctx.box(w, 0.05, d), mat, x, 5.8, z);
    scene.add(m);
    ceilingLines.push({ mesh: m, axis: axis, pos: axis === 'x' ? x : z });
  }
  [-12, 0, 12].forEach(function (x) { ceilingLine(x, 0, 0.12, 56, 'x'); });
  [-22, -6, 10, 24].forEach(function (z) { ceilingLine(0, z, 38, 0.12, 'z'); });
  updaters.push(function () {
    if (typeof world === 'undefined' || !world.camera) return;
    var cam = world.camera.position;
    ceilingLines.forEach(function (l) {
      var d = Math.abs((l.axis === 'x' ? cam.x : cam.z) - l.pos);
      l.mesh.material.opacity = Math.max(0, Math.min(0.8, (d - 3) / 8));
      l.mesh.visible = l.mesh.material.opacity > 0.02;
    });
  });

  // ----- 유리 파티션 + 낮은 벽 -----
  var glass = ctx.mat('#cfe6f2', { transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  var goldCap = ctx.mat('#D4AF37', { metalness: 0.7, roughness: 0.3 });
  SHOP_PARTITIONS.forEach(function (p) {
    var g = new THREE.Group();
    var len = Math.hypot(p[2] - p[0], p[3] - p[1]);
    g.position.set((p[0] + p[2]) / 2, 0, (p[1] + p[3]) / 2);
    g.rotation.y = Math.atan2(-(p[3] - p[1]), p[2] - p[0]);
    g.add(wMesh(ctx.box(len, 1.0, 0.25), white, 0, 0.5, 0));
    g.add(wMesh(ctx.box(len, 0.2, 0.27), navy, 0, 0.1, 0));
    g.add(wMesh(ctx.box(len, 1.6, 0.06), glass, 0, 1.8, 0));
    g.add(wMesh(ctx.box(len, 0.06, 0.1), goldCap, 0, 2.62, 0));
    g.add(wMesh(ctx.box(len, 0.04, 0.27), goldCap, 0, 1.02, 0));
    scene.add(g);
    shadowAll(g, false);
    var hx = Math.abs(p[2] - p[0]) / 2 + 0.15, hz = Math.abs(p[3] - p[1]) / 2 + 0.15;
    solid(g, g.position.x - hx, g.position.z - hz, g.position.x + hx, g.position.z + hz, 2.7, true);
  });

  // ----- 로비: 큰 로고 벽 + 바닥 골드 로고 + 소파 + 화분 -----
  var logoWall = new THREE.Group();
  logoWall.position.set(-19.8, 0, 20);
  logoWall.rotation.y = Math.PI / 2;
  logoWall.add(wMesh(ctx.box(10, 4.0, 0.12), navy, 0, 2.2, 0));
  logoWall.add(wMesh(ctx.plane(9, 2.8), new THREE.MeshBasicMaterial({ map: makeLogoTexture({ w: 1024, h: 320, glow: true, slogan: 'PRECISION CUSTOM ABUTMENT' }), transparent: true }), 0, 2.2, 0.07));
  logoWall.add(wMesh(ctx.box(10.2, 0.06, 0.16), goldLed, 0, 0.18, 0.02));
  logoWall.add(wMesh(ctx.box(10.2, 0.06, 0.16), goldLed, 0, 4.22, 0.02));
  scene.add(logoWall);
  spot(-15, 20, -19.8, 20, '#fff0d0', 70);

  var floorLogoCanvasTex = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 1024;
    var g = c.getContext('2d');
    g.strokeStyle = 'rgba(212,175,55,0.9)';
    g.lineWidth = 10;
    g.beginPath(); g.arc(512, 512, 490, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3;
    g.beginPath(); g.arc(512, 512, 455, 0, Math.PI * 2); g.stroke();
    drawAllAbutLogo(g, 512, 580, 170, { white: '#8a7a55' });
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  })();
  var floorLogo = wMesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: floorLogoCanvasTex, transparent: true, depthWrite: false }), 0, 0.012, 22.5);
  floorLogo.rotation.x = -Math.PI / 2;
  scene.add(floorLogo);

  function sofa(x, z, rotY) {
    var g = new THREE.Group();
    var fabric = ctx.mat('#1c2f52', { roughness: 0.95 });
    g.add(wMesh(ctx.box(3.2, 0.45, 1.0), fabric, 0, 0.35, 0));
    g.add(wMesh(ctx.box(3.2, 0.8, 0.25), fabric, 0, 0.8, -0.42));
    g.add(wMesh(ctx.box(0.25, 0.65, 1.0), fabric, -1.6, 0.5, 0));
    g.add(wMesh(ctx.box(0.25, 0.65, 1.0), fabric, 1.6, 0.5, 0));
    g.add(wMesh(ctx.box(3.4, 0.05, 1.05), goldCap, 0, 0.1, 0));
    g.position.set(x, 0, z);
    g.rotation.y = rotY * Math.PI / 180;
    scene.add(g);
    shadowAll(g);
    var w = Math.abs(Math.cos(g.rotation.y)) * 3.4 + Math.abs(Math.sin(g.rotation.y)) * 1.1;
    var d = Math.abs(Math.sin(g.rotation.y)) * 3.4 + Math.abs(Math.cos(g.rotation.y)) * 1.1;
    solid(g, x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  }
  sofa(-12, 25, 180);
  sofa(12, 25, 180);

  function plant(x, z, s) {
    var g = new THREE.Group();
    g.add(wMesh(ctx.cyl(0.38, 0.3, 0.7, 10), ctx.mat('#f4f1ea'), 0, 0.35, 0));
    g.add(wMesh(ctx.cyl(0.4, 0.4, 0.06, 10), goldCap, 0, 0.71, 0));
    var leaf = ctx.mat('#3e8a4b');
    var leafGeo = ctx.geo('plant-leaf', function () { return new THREE.IcosahedronGeometry(0.5, 0); });
    g.add(wMesh(leafGeo, leaf, 0, 1.35, 0));
    g.add(wMesh(leafGeo, leaf, 0.3, 1.0, 0.1));
    g.add(wMesh(leafGeo, leaf, -0.25, 1.1, -0.2));
    g.position.set(x, 0, z);
    g.scale.setScalar(s || 1);
    scene.add(g);
    shadowAll(g);
    solid(g, x - 0.45, z - 0.45, x + 0.45, z + 0.45);
  }
  plant(-18.8, 28.8); plant(18.8, 28.8); plant(-5, 12.5, 0.9); plant(5, 12.5, 0.9);
  plant(18.8, 9.2); plant(-18.8, -12, 0.9); plant(18.8, -12, 0.9); plant(-7, 9.4, 0.8); plant(9.4, 9.4, 0.8);

  // ----- 데스크 + NPC + 간판 -----
  var desks = {};
  SHOP_DESK_DATA.forEach(function (dd) {
    desks[dd.id] = buildShopDesk(dd);
  });

  function buildShopDesk(dd) {
    var g = new THREE.Group();
    var rot = dd.rotY * Math.PI / 180;
    g.position.set(dd.x, 0, dd.z);
    g.rotation.y = rot;
    scene.add(g);

    var top = ctx.mat('#fbfbf9', { roughness: 0.35 });
    var bodyMat = ctx.mat('#0e2552', { roughness: 0.6 });
    var line = ctx.mat('#D4AF37', { metalness: 0.7, roughness: 0.3, emissive: '#D4AF37', emissiveIntensity: 0.3 });
    var W = dd.w, D = dd.d, H = dd.h;

    // 몸체 + 상판 + 골드 라인
    if (dd.style === 'curved') {
      var curved = wMesh(new THREE.CylinderGeometry(W / 2, W / 2, H, 24, 1, false, -Math.PI / 2, Math.PI), bodyMat, 0, H / 2, -D / 2 + 0.1);
      g.add(curved);
      var curvedTop = wMesh(new THREE.CylinderGeometry(W / 2 + 0.08, W / 2 + 0.08, 0.06, 24, 1, false, -Math.PI / 2, Math.PI), top, 0, H + 0.03, -D / 2 + 0.1);
      g.add(curvedTop);
      var ring = wMesh(new THREE.TorusGeometry(W / 2 + 0.01, 0.025, 4, 24, Math.PI), line, 0, H * 0.75, -D / 2 + 0.1);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    } else {
      g.add(wMesh(ctx.box(W, H, D), bodyMat, 0, H / 2, 0));
      g.add(wMesh(ctx.box(W + 0.16, 0.07, D + 0.16), top, 0, H + 0.035, 0));
      g.add(wMesh(ctx.box(W, 0.05, 0.02), line, 0, H * 0.75, D / 2 + 0.01));
      g.add(wMesh(ctx.box(W, 0.05, 0.02), line, 0, 0.08, D / 2 + 0.01));
    }
    if (dd.style === 'reception') {
      // 양쪽으로 비스듬히 뻗은 날개
      [-1, 1].forEach(function (s) {
        var wing = new THREE.Group();
        wing.position.set(s * (W / 2 + 0.9), 0, -0.4);
        wing.rotation.y = -s * 0.5;
        wing.add(wMesh(ctx.box(1.9, H, D), bodyMat, 0, H / 2, 0));
        wing.add(wMesh(ctx.box(2.0, 0.07, D + 0.16), top, 0, H + 0.035, 0));
        wing.add(wMesh(ctx.box(1.9, 0.05, 0.02), line, 0, H * 0.75, D / 2 + 0.01));
        g.add(wing);
      });
    }
    if (dd.style === 'lshape') {
      g.add(wMesh(ctx.box(1.0, H, 1.8), bodyMat, W / 2 - 0.5, H / 2, -1.3));
      g.add(wMesh(ctx.box(1.1, 0.07, 1.9), top, W / 2 - 0.5, H + 0.035, -1.3));
    }
    if (dd.style === 'monitors') {
      var screenTex = makeScanTexture();
      for (var i = -1; i <= 1; i++) {
        var mon = new THREE.Group();
        mon.position.set(i * 1.05, H + 0.07, -0.1);
        mon.rotation.y = -i * 0.25;
        mon.add(wMesh(ctx.box(0.06, 0.35, 0.06), ctx.mat('#2a2d33'), 0, 0.17, -0.05));
        mon.add(wMesh(ctx.box(0.95, 0.58, 0.05), ctx.mat('#1b1e24'), 0, 0.62, 0));
        var scr = wMesh(ctx.plane(0.88, 0.5), new THREE.MeshBasicMaterial({ map: screenTex }), 0, 0.62, 0.028);
        mon.add(scr);
        g.add(mon);
      }
    }

    // NPC (데스크 뒤)
    var npc = buildAvatar(dd.npc);
    var npcLocal = new THREE.Vector3(0, 0, -(D / 2 + 0.75));
    var npcWorld = g.localToWorld(npcLocal.clone());
    npc.position.copy(npcWorld);
    npc.rotation.y = rot;
    npc.userData.baseRot = rot;
    npc.userData.waveUntil = 0;
    npc.userData.near = false;
    scene.add(npc);
    shadowAll(npc);

    // 이름표 (항상 카메라를 봄)
    var tagTex = makeLabelTexture(capitalize(dd.title) + ' · ' + dd.npcName, { w: 512, h: 96, bg: 'rgba(11,35,80,0.85)', fg: '#ffffff', size: 0.4, radius: 40 });
    var tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, depthWrite: false }));
    tag.scale.set(1.7, 0.32, 1);
    tag.position.set(0, 2.85, 0);
    npc.add(tag);

    // 간판 (데스크 위 공중)
    var signTex = makeLabelTexture(dd.title, { w: 768, h: 160, bg: 'rgba(11,35,80,0.96)', fg: '#D4AF37', border: '#D4AF37', sub: dd.no, size: 0.4, spacing: '6px' });
    var signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true });
    signMat.color.setScalar(0.88);
    var sign = wMesh(ctx.plane(3.2, 0.67), signMat, 0, 3.75, -(D / 2 + 0.6));
    g.add(sign);
    var glow = wMesh(ctx.plane(3.5, 0.95), new THREE.MeshBasicMaterial({ color: 0xD4AF37, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 3.75, -(D / 2 + 0.62));
    g.add(glow);
    g.add(wMesh(ctx.box(0.03, 1.8, 0.03), goldCap, -1.3, 4.65, -(D / 2 + 0.6)));
    g.add(wMesh(ctx.box(0.03, 1.8, 0.03), goldCap, 1.3, 4.65, -(D / 2 + 0.6)));

    // 데스크 앞 바닥 원형 골드 마크 + 번호
    var markLocal = new THREE.Vector3(0, 0, D / 2 + 1.8);
    var markWorld = g.localToWorld(markLocal.clone());
    var mark = new THREE.Group();
    mark.position.set(markWorld.x, 0.015, markWorld.z);
    var markRing = wMesh(ctx.geo('mark-ring', function () { return new THREE.RingGeometry(0.62, 0.75, 40); }), ctx.basic('#D4AF37', { transparent: true, opacity: 0.9 }));
    markRing.rotation.x = -Math.PI / 2;
    mark.add(markRing);
    var numTex = makeLabelTexture(dd.no, { w: 128, h: 128, fg: '#b8922a', size: 0.5, radius: 0 });
    var num = wMesh(ctx.plane(0.7, 0.7), new THREE.MeshBasicMaterial({ map: numTex, transparent: true, depthWrite: false }));
    num.rotation.x = -Math.PI / 2;
    num.rotation.z = rot;
    num.position.y = 0.002;
    mark.add(num);
    scene.add(mark);

    shadowAll(g);

    // 충돌: 데스크 + NPC 자리
    var npcBox = { minX: npcWorld.x - 0.6, minZ: npcWorld.z - 0.6, maxX: npcWorld.x + 0.6, maxZ: npcWorld.z + 0.6 };
    // 간판은 공중이라 바닥 충돌에서 뺌: 데스크 몸체만
    var bodyBox = new THREE.Box3();
    g.children.forEach(function (child) {
      if (child.position.y < 2) bodyBox.expandByObject(child);
    });
    nav.blockRect(bodyBox.min.x, bodyBox.min.z, bodyBox.max.x, bodyBox.max.z);
    nav.blockRect(npcBox.minX, npcBox.minZ, npcBox.maxX, npcBox.maxZ);

    // 클릭 영역 (데스크 + NPC)
    var proxy = wMesh(new THREE.BoxGeometry(W + 0.6, 3.2, D + 2.2), new THREE.MeshBasicMaterial({ visible: false }), 0, 1.6, -0.6);
    g.add(proxy);
    proxy.updateMatrixWorld(true);
    var item = {
      kind: 'desk',
      deskId: dd.id,
      proxy: proxy,
      approach: new THREE.Vector3(markWorld.x, 0, markWorld.z),
      face: npcWorld.clone(),
      tooltip: dd.no + ' · ' + capitalize(dd.title),
      npcName: dd.npcName,
      title: dd.title,
      hover: false,
      setHover: function (on) { item.hover = on; }
    };
    proxy.userData.interactive = item;
    interactives.push(item);

    return { group: g, npc: npc, sign: sign, glow: glow, item: item, mark: markWorld, signWorld: g.localToWorld(new THREE.Vector3(0, 3.75, -(D / 2 + 0.6))), data: dd };
  }

  // ----- 02 치아 선택: 데스크 뒤 벽의 대형 FDI 치아 배치도 -----
  var fdi = wMesh(ctx.plane(7.5, 3.75), new THREE.MeshBasicMaterial({ map: makeFdiTexture() }), -19.8, 2.4, 0);
  fdi.rotation.y = Math.PI / 2;
  scene.add(fdi);
  scene.add(wMesh(ctx.box(0.1, 3.95, 7.7), goldCap, -19.86, 2.4, 0));
  spot(-14, 0, -16, 0);

  // ----- 03 디자인 랩: 쉐이드 가이드 진열장 + 블록 전시 -----
  (function () {
    var cab = new THREE.Group();
    cab.position.set(-19.2, 0, -21);
    cab.rotation.y = Math.PI / 2;
    cab.add(wMesh(ctx.box(3, 0.9, 0.7), white, 0, 0.45, 0));
    cab.add(wMesh(ctx.box(3, 1.4, 0.6), glass, 0, 1.6, 0));
    cab.add(wMesh(ctx.box(3.05, 0.05, 0.72), goldCap, 0, 2.32, 0));
    var shades = ['#f4ecd8', '#efe2c4', '#e9d9b6', '#e2cfa6', '#f2e8d2', '#ead9b8', '#e0cca3', '#d7c095', '#efe5cf', '#e6d6b3', '#dccaa0', '#d2bd91', '#ece0c6', '#e1d0ab', '#d6c299', '#cbb487'];
    shades.forEach(function (c, i) {
      var row = Math.floor(i / 8), col = i % 8;
      cab.add(wMesh(ctx.box(0.12, 0.26, 0.03), ctx.mat(c, { roughness: 0.4 }), -1.2 + col * 0.34, 1.35 + row * 0.5, 0));
    });
    scene.add(cab);
    shadowAll(cab, false);
    solid(cab, -19.7, -22.6, -18.7, -19.4);

    var shelf = new THREE.Group();
    shelf.position.set(-9, 0, -28.8);
    shelf.add(wMesh(ctx.box(3.2, 2.2, 0.5), white, 0, 1.1, 0));
    var ti = ctx.mat('#a9adb3', { metalness: 0.85, roughness: 0.3 });
    var zr = ctx.mat('#f6f4ee', { roughness: 0.4 });
    var disc = ctx.cyl(0.22, 0.22, 0.14, 16);
    for (var row = 0; row < 3; row++) {
      shelf.add(wMesh(ctx.box(3.1, 0.04, 0.5), goldCap, 0, 0.7 + row * 0.6, 0.26));
      for (var col = 0; col < 5; col++) {
        var d = wMesh(disc, (col + row) % 2 ? ti : zr, -1.2 + col * 0.6, 0.85 + row * 0.6, 0.3);
        d.rotation.x = Math.PI / 2;
        shelf.add(d);
      }
    }
    scene.add(shelf);
    shadowAll(shelf);
    solid(shelf, -10.7, -29.6, -7.3, -28.4);
    spot(-13, -22, -13, -25);
  })();

  // ----- 04 스캔 데이터: 벽 모니터 + 구강 스캐너 거치대 -----
  (function () {
    var scanTex = makeScanTexture();
    for (var r = 0; r < 2; r++) {
      for (var c = 0; c < 3; c++) {
        var x = 10 + c * 2.1, y = 2.0 + r * 1.25;
        scene.add(wMesh(ctx.box(2.0, 1.15, 0.08), ctx.mat('#1b1e24'), x, y, -29.8));
        scene.add(wMesh(ctx.plane(1.88, 1.03), new THREE.MeshBasicMaterial({ map: scanTex }), x, y, -29.75));
      }
    }
    var stand = new THREE.Group();
    stand.position.set(17.6, 0, -21.5);
    stand.add(wMesh(ctx.cyl(0.35, 0.45, 0.1, 16), goldCap, 0, 0.05, 0));
    stand.add(wMesh(ctx.cyl(0.06, 0.06, 1.0, 8), white, 0, 0.55, 0));
    stand.add(wMesh(ctx.box(0.4, 0.08, 0.3), white, 0, 1.08, 0));
    var wand = wMesh(ctx.cyl(0.04, 0.05, 0.36, 8), ctx.mat('#e8ebef', { roughness: 0.3 }), 0, 1.25, 0);
    wand.rotation.z = 0.5;
    stand.add(wand);
    stand.add(wMesh(ctx.box(0.06, 0.04, 0.06), ctx.basic('#57d0ff'), 0.1, 1.38, 0));
    scene.add(stand);
    shadowAll(stand);
    solid(stand, 17.1, -22, 18.1, -21);
    spot(13, -22, 13, -25);
  })();

  // ----- 05 결제: 라운지 (고급 의자 + 골드 조명) -----
  (function () {
    var velvet = ctx.mat('#132a57', { roughness: 0.95 });
    function chair(x, z, rotY) {
      var g = new THREE.Group();
      g.add(wMesh(ctx.box(1.0, 0.4, 0.95), velvet, 0, 0.45, 0));
      g.add(wMesh(ctx.box(1.0, 0.75, 0.2), velvet, 0, 0.95, -0.38));
      g.add(wMesh(ctx.box(0.16, 0.5, 0.95), velvet, -0.5, 0.65, 0));
      g.add(wMesh(ctx.box(0.16, 0.5, 0.95), velvet, 0.5, 0.65, 0));
      [-0.4, 0.4].forEach(function (lx) {
        [-0.35, 0.35].forEach(function (lz) {
          g.add(wMesh(ctx.cyl(0.03, 0.02, 0.26, 6), goldCap, lx, 0.13, lz));
        });
      });
      g.position.set(x, 0, z);
      g.rotation.y = rotY * Math.PI / 180;
      scene.add(g);
      shadowAll(g);
      solid(g, x - 0.65, z - 0.65, x + 0.65, z + 0.65);
    }
    chair(11.5, 5.4, 90);
    chair(14.5, 5.4, -90);
    var table = new THREE.Group();
    table.position.set(13, 0, 5.4);
    table.add(wMesh(ctx.cyl(0.5, 0.5, 0.05, 20), goldCap, 0, 0.62, 0));
    table.add(wMesh(ctx.cyl(0.05, 0.08, 0.6, 8), goldCap, 0, 0.3, 0));
    scene.add(table);
    solid(table, 12.5, 4.9, 13.5, 5.9);

    var lamp = new THREE.Group();
    lamp.position.set(18.8, 0, 5.8);
    lamp.add(wMesh(ctx.cyl(0.04, 0.04, 1.8, 6), goldCap, 0, 0.9, 0));
    lamp.add(wMesh(ctx.geo('lamp-shade', function () { return new THREE.ConeGeometry(0.35, 0.4, 12, 1, true); }), ctx.basic('#ffe2a0', { side: THREE.DoubleSide }), 0, 1.9, 0));
    var lampGlow = makeGlowSprite('#ffcf70', 2.2, 0.6);
    lampGlow.position.y = 1.85;
    lamp.add(lampGlow);
    scene.add(lamp);
    solid(lamp, 18.5, 5.5, 19.1, 6.1);
    if (!quality.mobile) {
      var warm = new THREE.PointLight('#ffcf70', 12, 10, 1.5);
      warm.position.set(14, 3, 1);
      scene.add(warm);
    }
    spot(14, 0, 16, 0, '#ffe2a8', 110);
  })();

  // ----- 중앙 홀: 유리 부스 안 5축 CNC 밀링 머신 -----
  var cnc = buildCncBooth();
  function buildCncBooth() {
    var g = new THREE.Group();
    g.position.set(0, 0, -2);
    var S = 7, BH = 3.2;
    // 바닥 단 + 유리 벽 + 골드 모서리
    g.add(wMesh(ctx.box(S, 0.12, S), ctx.mat('#2a3140', { roughness: 0.5 }), 0, 0.06, 0));
    [[0, S / 2, 0], [0, -S / 2, 0], [S / 2, 0, Math.PI / 2], [-S / 2, 0, Math.PI / 2]].forEach(function (w) {
      var panel = wMesh(ctx.box(S, BH, 0.06), glass, w[0], BH / 2 + 0.12, w[1]);
      panel.rotation.y = w[2];
      g.add(panel);
    });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      g.add(wMesh(ctx.box(0.1, BH + 0.1, 0.1), goldCap, c[0] * S / 2, BH / 2 + 0.12, c[1] * S / 2));
    });
    g.add(wMesh(ctx.box(S, 0.08, 0.1), goldCap, 0, BH + 0.16, S / 2));
    g.add(wMesh(ctx.box(S, 0.08, 0.1), goldCap, 0, BH + 0.16, -S / 2));
    g.add(wMesh(ctx.box(0.1, 0.08, S), goldCap, S / 2, BH + 0.16, 0));
    g.add(wMesh(ctx.box(0.1, 0.08, S), goldCap, -S / 2, BH + 0.16, 0));

    // 머신 본체
    var machineWhite = ctx.mat('#eef0f2', { roughness: 0.4 });
    var machineDark = ctx.mat('#30353d', { roughness: 0.5, metalness: 0.3 });
    var steel = ctx.mat('#b8bec6', { metalness: 0.85, roughness: 0.25 });
    g.add(wMesh(ctx.box(2.8, 1.0, 2.2), machineWhite, 0, 0.62, 0));
    g.add(wMesh(ctx.box(0.6, 2.2, 0.6), machineWhite, 0, 2.0, -0.9));
    g.add(wMesh(ctx.box(2.4, 0.4, 0.5), machineDark, 0, 2.7, -0.75));
    g.add(wMesh(ctx.box(2.82, 0.06, 2.22), ctx.basic('#57d0ff'), 0, 1.13, 0)); // 상태 표시등 띠

    // 스핀들 헤드 (빙글빙글)
    var head = new THREE.Group();
    head.position.set(0, 2.25, -0.25);
    head.add(wMesh(ctx.box(0.5, 0.6, 0.5), machineDark, 0, 0.1, 0));
    var spindle = new THREE.Group();
    spindle.position.y = -0.3;
    spindle.add(wMesh(ctx.cyl(0.12, 0.12, 0.3, 10), steel, 0, -0.1, 0));
    spindle.add(wMesh(ctx.cyl(0.02, 0.02, 0.25, 6), ctx.mat('#ffd76a', { metalness: 0.9, roughness: 0.2 }), 0, -0.36, 0));
    spindle.add(wMesh(ctx.box(0.03, 0.2, 0.26), steel, 0, -0.1, 0)); // 회전이 보이게 날개
    head.add(spindle);
    g.add(head);

    // 틸팅 테이블 (5축: 기울기 + 회전)
    var cradle = new THREE.Group();
    cradle.position.set(0, 1.45, 0.1);
    cradle.add(wMesh(ctx.box(1.6, 0.12, 0.7), machineDark, 0, 0, 0));
    cradle.add(wMesh(ctx.box(0.12, 0.4, 0.7), machineDark, -0.8, 0.15, 0));
    cradle.add(wMesh(ctx.box(0.12, 0.4, 0.7), machineDark, 0.8, 0.15, 0));
    var platter = new THREE.Group();
    platter.position.y = 0.12;
    platter.add(wMesh(ctx.cyl(0.32, 0.32, 0.06, 16), steel, 0, 0, 0));
    platter.add(wMesh(ctx.cyl(0.18, 0.18, 0.16, 12), ctx.mat('#a9adb3', { metalness: 0.85, roughness: 0.3 }), 0, 0.1, 0)); // 가공 중인 티타늄 블록
    cradle.add(platter);
    g.add(cradle);

    // 작은 금속 입자
    var count = quality.mobile ? 16 : 70;
    var pos = new Float32Array(count * 3);
    var vel = [];
    var life = [];
    var pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xfff1c4, size: 0.05, transparent: true, opacity: 0.9, depthWrite: false }));
    for (var i = 0; i < count; i++) { vel.push(new THREE.Vector3()); life.push(Math.random()); }
    g.add(particles);

    // 부스 위 간판 "PRECISION 5μm"
    var signTex = makeLabelTexture('PRECISION 5μm', { w: 1024, h: 160, bg: 'rgba(11,35,80,0.96)', fg: '#D4AF37', border: '#D4AF37', size: 0.42, spacing: '10px' });
    [0, Math.PI].forEach(function (r) {
      var s = wMesh(ctx.plane(5, 0.78), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }), 0, 4.4, 0);
      s.rotation.y = r;
      g.add(s);
    });
    g.add(wMesh(ctx.box(0.03, 1.4, 0.03), goldCap, -2, 5.1, 0));
    g.add(wMesh(ctx.box(0.03, 1.4, 0.03), goldCap, 2, 5.1, 0));

    scene.add(g);
    shadowAll(g, false);
    solid(g, -S / 2 - 0.1, -2 - S / 2 - 0.1, S / 2 + 0.1, -2 + S / 2 + 0.1, BH + 1.5, true);
    spot(0, 2, 0, -2, '#ffffff', 120);

    var tipLocal = new THREE.Vector3();
    return {
      update: function (dt, t) {
        spindle.rotation.y += dt * 40;
        cradle.rotation.x = Math.sin(t * 0.4) * 0.45;
        platter.rotation.y += dt * 0.6;
        head.position.x = Math.sin(t * 0.7) * 0.25;
        // 입자: 공구 끝에서 튀어나와 떨어짐
        tipLocal.set(head.position.x, 1.6, -0.25);
        for (var i = 0; i < count; i++) {
          life[i] += dt * 1.4;
          if (life[i] >= 1) {
            life[i] = 0;
            pos[i * 3] = tipLocal.x; pos[i * 3 + 1] = tipLocal.y; pos[i * 3 + 2] = tipLocal.z;
            vel[i].set((Math.random() - 0.5) * 1.6, Math.random() * 1.2, (Math.random() - 0.5) * 1.6);
          } else {
            vel[i].y -= 4 * dt;
            pos[i * 3] += vel[i].x * dt;
            pos[i * 3 + 1] = Math.max(1.15, pos[i * 3 + 1] + vel[i].y * dt);
            pos[i * 3 + 2] += vel[i].z * dt;
          }
        }
        pGeo.attributes.position.needsUpdate = true;
      }
    };
  }
  updaters.push(cnc.update);

  // ----- 원형 전시대: 커스텀 어버트먼트 모형 (골드 + 티타늄) -----
  (function () {
    var g = new THREE.Group();
    g.position.set(-2.5, 0, 7.5);
    g.add(wMesh(ctx.cyl(0.9, 1.0, 1.0, 24), white, 0, 0.5, 0));
    g.add(wMesh(ctx.cyl(0.92, 0.92, 0.05, 24), goldCap, 0, 1.0, 0));
    g.add(wMesh(ctx.cyl(1.02, 1.02, 0.05, 24), goldCap, 0, 0.05, 0));
    var profile = [[0, 0], [0.16, 0], [0.16, 0.2], [0.24, 0.22], [0.34, 0.34], [0.34, 0.38], [0.27, 0.42], [0.21, 0.9], [0.13, 1.02], [0, 1.04]]
      .map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    var abGeo = new THREE.LatheGeometry(profile, 20);
    var goldAb = wMesh(abGeo, ctx.mat('#e2b84a', { metalness: 0.9, roughness: 0.2, flatShading: false }), -0.32, 1.05, 0);
    goldAb.scale.setScalar(0.55);
    var tiAb = wMesh(abGeo, ctx.mat('#b9bec5', { metalness: 0.9, roughness: 0.25, flatShading: false }), 0.32, 1.05, 0);
    tiAb.scale.setScalar(0.48);
    var turn = new THREE.Group();
    turn.add(goldAb, tiAb);
    g.add(turn);
    scene.add(g);
    shadowAll(g);
    solid(g, -3.5, 6.5, -1.5, 8.5);
    spot(-2.5, 7.5, -2.5, 7.5, '#fff4dc', 140);
    updaters.push(function (dt) { turn.rotation.y += dt * 0.5; });
  })();

  // ----- 바닥 골드 안내선 (진행 방향으로 빛이 흐름) -----
  (function () {
    var flowTex = makePatternTexture('flow', function (c, s) {
      var grad = c.createLinearGradient(0, 0, s, 0);
      grad.addColorStop(0, 'rgba(255,220,120,0)');
      grad.addColorStop(0.75, 'rgba(255,220,120,0.08)');
      grad.addColorStop(0.95, 'rgba(255,255,255,0.95)');
      grad.addColorStop(1, 'rgba(255,220,120,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, s, s);
    }, 128);
    var baseMat = ctx.basic('#D4AF37', { transparent: true, opacity: 0.55, depthWrite: false });
    var flows = [];
    for (var i = 0; i < SHOP_GUIDE_PATH.length - 1; i++) {
      var a = SHOP_GUIDE_PATH[i], b = SHOP_GUIDE_PATH[i + 1];
      var dx = b[0] - a[0], dz = b[1] - a[1];
      var len = Math.hypot(dx, dz);
      var angle = Math.atan2(-dz, dx);
      var baseGeo = new THREE.PlaneGeometry(len + 0.16, 0.16);
      baseGeo.rotateX(-Math.PI / 2);
      var base = new THREE.Mesh(baseGeo, baseMat);
      base.position.set((a[0] + b[0]) / 2, 0.014, (a[1] + b[1]) / 2);
      base.rotation.y = angle;
      scene.add(base);

      var tex = flowTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(len / 3, 1);
      var flowGeo = new THREE.PlaneGeometry(len, 0.2);
      flowGeo.rotateX(-Math.PI / 2);
      var flow = new THREE.Mesh(flowGeo, new THREE.MeshBasicMaterial({ map: tex, color: '#f7c948', transparent: true, depthWrite: false }));
      flow.position.copy(base.position);
      flow.position.y = 0.016;
      flow.rotation.y = angle;
      scene.add(flow);
      flows.push({ tex: tex, len: len, start: i });
    }
    updaters.push(function (dt, t) {
      flows.forEach(function (f) { f.tex.offset.x = -t * 0.45; });
    });
  })();

  // ----- 다음 데스크 위 골드 ▼ 화살표 -----
  var arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.45, 4),
    new THREE.MeshStandardMaterial({ color: 0xD4AF37, emissive: 0xD4AF37, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3, flatShading: true })
  );
  arrow.rotation.x = Math.PI;
  scene.add(arrow);

  // ----- 매 프레임 -----
  var update = function (dt, t) {
    for (var i = 0; i < updaters.length; i++) updaters[i](dt, t);

    var next = getNextDesk();
    SHOP_DESK_DATA.forEach(function (dd) {
      var d = desks[dd.id];
      // 간판: 마우스 올리면 더 밝게, 다음 데스크는 은은하게 숨쉬듯
      var glowOpacity = d.item.hover ? 0.4 : (next === dd.id ? 0.12 + (Math.sin(t * 2.5) + 1) * 0.08 : 0);
      d.glow.material.opacity = glowOpacity;
      d.sign.material.color.setScalar(d.item.hover ? 1 : 0.88);

      // NPC: 플레이어가 3m 안에 오면 바라보고 손 흔들기
      var npc = d.npc;
      var dx = player.x - npc.position.x, dz = player.z - npc.position.z;
      var near = dx * dx + dz * dz < 9;
      if (near && !npc.userData.near) npc.userData.waveUntil = t + 2.4;
      npc.userData.near = near;
      var want = near ? Math.atan2(dx, dz) : npc.userData.baseRot;
      npc.rotation.y = lerpAngle(npc.rotation.y, want, Math.min(1, dt * 4));
      animateIdle(npc, t + dd.x * 0.3);
      if (t < npc.userData.waveUntil) animateWave(npc, t);
    });

    // 화살표
    if (next) {
      var p = desks[next].signWorld;
      arrow.visible = true;
      arrow.position.set(p.x, p.y + 0.85 + Math.sin(t * 3) * 0.12, p.z);
      arrow.rotation.y = t * 1.2;
    } else {
      arrow.visible = false;
    }
  };

  // ----- 미니맵 -----
  var minimap = {
    scale: 2.4,
    draw: function (g, toPx, t) {
      var a = toPx(-20, -30), b = toPx(20, 30);
      g.fillStyle = 'rgba(233,230,225,0.25)';
      g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      SHOP_ROOMS.forEach(function (r) {
        var p1 = toPx(r.x1, r.z1), p2 = toPx(r.x2, r.z2);
        g.fillStyle = 'rgba(11,35,80,0.35)';
        g.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.font = '7px "IBM Plex Mono", monospace';
        g.textAlign = 'center';
        g.fillText(r.name, (p1.x + p2.x) / 2, p1.y + 9);
      });
      // CNC 부스
      var c1 = toPx(-3.5, -5.5), c2 = toPx(3.5, 1.5);
      g.strokeStyle = 'rgba(87,208,255,0.7)';
      g.strokeRect(c1.x, c1.y, c2.x - c1.x, c2.y - c1.y);
      // 데스크 번호 (다음 데스크는 반짝임)
      var next = getNextDesk();
      SHOP_DESK_DATA.forEach(function (dd) {
        var m = desks[dd.id].mark, p = toPx(m.x, m.z);
        var isNext = dd.id === next;
        var pulse = isNext ? (Math.sin(t * 5) + 1) / 2 : 0;
        if (isNext) {
          g.fillStyle = 'rgba(212,175,55,' + (0.25 + pulse * 0.45) + ')';
          g.beginPath(); g.arc(p.x, p.y, 9 + pulse * 3, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = order.progress[dd.id] ? 'rgba(212,175,55,0.5)' : '#D4AF37';
        g.beginPath(); g.arc(p.x, p.y, 6, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#0b2350';
        g.font = '600 7px "IBM Plex Mono", monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(dd.no, p.x, p.y + 0.5);
        g.textBaseline = 'alphabetic';
      });
    },
    marks: []
  };

  return {
    id: 'allabut-shop',
    kind: 'interior',
    label: INTERIORS['allabut-shop'].label,
    scene: scene,
    ctx: ctx,
    nav: nav,
    interactives: interactives,
    occluders: occluders,
    minimap: minimap,
    entries: { entrance: { x: 0, z: 27.2, angle: Math.PI } },
    exitTo: INTERIORS['allabut-shop'].exitTo,
    sun: null,
    camera: {
      dist: 11, pitch: 0.78, minDist: 5, maxDist: 17, lead: 3,
      // 카메라는 벽(4.2m)보다 높은 곳에 있으므로 벽 바로 바깥 위쪽까지만 허용
      bounds: { minX: -26, maxX: 26, minZ: -36, maxZ: 37 }
    },
    update: update
  };
}


// ----- 첫 글자만 대문자 (RECEPTION → Reception) -----
function capitalize(text) {
  return text.toLowerCase().replace(/(^|\s)\S/g, function (s) { return s.toUpperCase(); });
}

// ----- FDI 치아 배치도 텍스처 -----
function makeFdiTexture() {
  var c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  var g = c.getContext('2d');
  var bg = g.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#0b2350');
  bg.addColorStop(1, '#06142e');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = '#D4AF37';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 1008, 496);

  g.fillStyle = '#D4AF37';
  g.font = '600 30px "IBM Plex Sans", sans-serif';
  g.textAlign = 'center';
  if ('letterSpacing' in g) g.letterSpacing = '6px';
  g.fillText('FDI TOOTH CHART', 512, 54);
  if ('letterSpacing' in g) g.letterSpacing = '0px';

  // 위턱: 18→11 | 21→28, 아래턱: 48→41 | 31→38 (반원 모양)
  var upper = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  var lower = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  function arch(list, cy, dir) {
    list.forEach(function (n, i) {
      var a = Math.PI * (0.08 + 0.84 * (i / (list.length - 1)));
      var x = 512 - Math.cos(a) * 400;
      var y = cy - dir * Math.sin(a) * 120;
      var unit = n % 10;
      var w = unit >= 6 ? 30 : (unit >= 4 ? 24 : 19);
      g.fillStyle = '#f4f1ea';
      g.beginPath();
      g.ellipse(x, y, w, 24, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0b2350';
      g.font = '600 17px "IBM Plex Mono", monospace';
      g.textBaseline = 'middle';
      g.fillText(String(n), x, y + 1);
    });
  }
  arch(upper, 250, 1);
  arch(lower, 300, -1);
  g.strokeStyle = 'rgba(212,175,55,0.5)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(512, 90); g.lineTo(512, 470); g.stroke();
  g.beginPath(); g.moveTo(80, 275); g.lineTo(944, 275); g.stroke();

  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ----- 스캔 모니터 화면 텍스처 (파란 와이어프레임 느낌) -----
function makeScanTexture() {
  var c = document.createElement('canvas');
  c.width = 384;
  c.height = 216;
  var g = c.getContext('2d');
  g.fillStyle = '#071526';
  g.fillRect(0, 0, 384, 216);
  g.strokeStyle = 'rgba(87,208,255,0.55)';
  g.lineWidth = 1;
  var pts = [];
  for (var i = 0; i < 70; i++) {
    var a = Math.PI * (0.1 + 0.8 * Math.random());
    var r = 70 + Math.random() * 40;
    pts.push([192 - Math.cos(a) * r * 1.4, 170 - Math.sin(a) * r]);
  }
  for (i = 0; i < pts.length; i++) {
    for (var j = i + 1; j < pts.length; j++) {
      var dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
      if (dx * dx + dy * dy < 900) {
        g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[j][0], pts[j][1]); g.stroke();
      }
    }
  }
  g.fillStyle = '#57d0ff';
  g.font = '500 14px "IBM Plex Mono", monospace';
  g.fillText('SCAN · STL', 14, 24);
  g.fillStyle = '#D4AF37';
  g.fillText('5μm', 330, 24);
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
