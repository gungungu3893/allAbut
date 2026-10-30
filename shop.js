// ===== 매장 화면 (3D 매장 + 데스크 5개 + NPC + 대화창) =====
// - 데스크 5개가 반원 모양으로 서 있고, 가운데에 내 아바타가 있어요.
// - 데스크(또는 NPC)를 클릭하면 아래쪽에 대화창이 열려요.
// - 대화 문구는 dialogs.js 에 있어요.


// ----- 데스크 목록 (순서 = 주문 순서) -----
// npc: buildAvatar 에 넣을 꾸미기 값
var SHOP_DESKS = [
  {
    id: 'reception', number: '01', sign: 'RECEPTION',
    npc: { gender: 'female', skin: 'skin_02', face: 'face_oval', eyes: 'eyes_round', nose: 'nose_small',
           mouth: 'mouth_smile', hair: 'hair_bob', hairColor: 'hc_darkbrown', outfit: 'outfit_suit' }
  },
  {
    id: 'toothmap', number: '02', sign: 'TOOTH MAP',
    npc: { gender: 'male', skin: 'skin_03', face: 'face_square', eyes: 'eyes_dot', nose: 'nose_round',
           mouth: 'mouth_grin', hair: 'hair_short', hairColor: 'hc_black', outfit: 'outfit_scrubs' }
  },
  {
    id: 'designlab', number: '03', sign: 'DESIGN LAB',
    npc: { gender: 'female', skin: 'skin_01', face: 'face_round', eyes: 'eyes_smile', nose: 'nose_small',
           mouth: 'mouth_smile', hair: 'hair_ponytail', hairColor: 'hc_blonde', outfit: 'outfit_labcoat' }
  },
  {
    id: 'scandata', number: '04', sign: 'SCAN DATA',
    npc: { gender: 'male', skin: 'skin_05', face: 'face_round', eyes: 'eyes_sharp', nose: 'nose_small',
           mouth: 'mouth_flat', hair: 'hair_curly', hairColor: 'hc_black', outfit: 'outfit_hoodie' }
  },
  {
    id: 'checkout', number: '05', sign: 'CHECKOUT',
    npc: { gender: 'female', skin: 'skin_04', face: 'face_oval', eyes: 'eyes_round', nose: 'nose_none',
           mouth: 'mouth_smile', hair: 'hair_long', hairColor: 'hc_brown', outfit: 'outfit_polo' }
  }
];


// ----- 주문 진행 상태 (전역) -----
// 데스크에서 주문을 마치면 true 로 바뀌어요 (completeDesk 사용)
var order = {
  progress: { reception: false, toothmap: false, designlab: false, scandata: false, checkout: false }
};


// ----- 3D 매장 상태 -----
var shop = {
  ready: false,
  running: false,
  rafId: null,
  renderer: null,
  scene: null,
  camera: null,
  clock: null,
  raycaster: null,
  profile: null,
  me: null,              // 내 아바타
  meTurn: 0,             // 내 아바타가 바라볼 방향 (각도)
  desks: {},             // { deskId: { group, npc, frame, signPos, phase } }
  clickables: [],        // 클릭 판정용 투명 상자들
  arrow: null,           // 다음 데스크 위 골드 화살표
  hoverDesk: null,
  blinkUntil: 0,         // 리셉션 간판 깜빡임 끝나는 시각
  downX: 0,
  downY: 0,
  width: 0,
  height: 0
};

var PLAYER_POS = { x: 0, z: 1 };   // 내 아바타 위치
var CAMERA_TARGET = { x: 0, y: 1.2, z: -2.0 };


// ----- 대화창 상태 -----
var dialog = {
  open: false,
  deskId: null,
  mode: 'talk',         // talk(인사) / manual(매뉴얼) / message(안내 한 줄) / bye(작별)
  page: 0,
  messageKey: null,
  typing: false,
  timer: null,
  closeTimer: null,
  full: '',
  shown: 0
};


// ================================================================
//  매장 열기 / 닫기
// ================================================================
function openShop(profile) {
  shop.profile = profile || shop.profile;

  updateLangToggle();
  updateShopHint();
  closeDialog();

  if (typeof THREE === 'undefined') return;

  if (!shop.ready) initShopScene();
  rebuildShopPlayer();
  updateShopArrow(true);
  startShopLoop();
}

function closeShop() {
  shop.running = false;
  if (shop.rafId) cancelAnimationFrame(shop.rafId);
  shop.rafId = null;
  closeDialog();
}


// ================================================================
//  3D 매장 만들기 (처음 한 번만)
// ================================================================
function initShopScene() {
  var canvas = document.getElementById('shop-canvas');

  shop.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  shop.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  shop.scene = new THREE.Scene();
  shop.clock = new THREE.Clock();
  shop.raycaster = new THREE.Raycaster();
  shop.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

  // 조명 (Avatar Studio 와 같은 조명)
  addStudioLights(shop.scene);

  buildShopRoom();
  SHOP_DESKS.forEach(function (desk, i) { buildDesk(desk, i); });

  // 다음 데스크 위 골드 화살표 ▼
  shop.arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.17, 0.36, 4),
    new THREE.MeshStandardMaterial({ color: 0xD4AF37, emissive: 0xD4AF37, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3, flatShading: true })
  );
  shop.arrow.rotation.x = Math.PI; // 아래를 가리키게
  shop.scene.add(shop.arrow);

  // --- 클릭 / 마우스 올리기 ---
  canvas.addEventListener('pointerdown', function (e) {
    shop.downX = e.clientX;
    shop.downY = e.clientY;
  });
  canvas.addEventListener('pointerup', function (e) {
    var moved = Math.abs(e.clientX - shop.downX) + Math.abs(e.clientY - shop.downY);
    if (moved > 8) return; // 드래그는 클릭으로 치지 않음
    var deskId = pickDesk(e);
    if (deskId) openDialog(deskId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    shop.hoverDesk = pickDesk(e);
    canvas.style.cursor = shop.hoverDesk ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', function () { shop.hoverDesk = null; });

  window.addEventListener('resize', resizeShop);

  shop.ready = true;
}

// 바닥, 벽, 장식
function buildShopRoom() {
  // 바닥
  var floor = new THREE.Mesh(
    new THREE.CircleGeometry(10, 64),
    new THREE.MeshStandardMaterial({ color: 0x0b111c, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  shop.scene.add(floor);

  // 바닥의 은은한 원형 격자
  var grid = new THREE.PolarGridHelper(9, 16, 6, 64, 0xD4AF37, 0xD4AF37);
  grid.material.transparent = true;
  grid.material.opacity = 0.07;
  grid.position.y = 0.003;
  shop.scene.add(grid);

  // 데스크들을 잇는 골드 원
  var arc = new THREE.Mesh(
    new THREE.RingGeometry(4.98, 5.02, 96),
    new THREE.MeshBasicMaterial({ color: 0xD4AF37, transparent: true, opacity: 0.25, depthWrite: false })
  );
  arc.rotation.x = -Math.PI / 2;
  arc.position.set(PLAYER_POS.x, 0.005, PLAYER_POS.z);
  shop.scene.add(arc);

  // 내 아바타 받침대
  var pad = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.66, 48),
    new THREE.MeshBasicMaterial({ color: 0xD4AF37, transparent: true, opacity: 0.6, depthWrite: false })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(PLAYER_POS.x, 0.006, PLAYER_POS.z);
  shop.scene.add(pad);

  // 뒤쪽 둥근 벽
  var wall = new THREE.Mesh(
    new THREE.CylinderGeometry(9.5, 9.5, 6, 48, 1, true, Math.PI - 1.5, 3.0),
    new THREE.MeshStandardMaterial({ color: 0x0a1426, roughness: 0.9, side: THREE.DoubleSide })
  );
  wall.position.set(0, 3, PLAYER_POS.z);
  shop.scene.add(wall);

  // 벽의 골드 라인
  var line = new THREE.Mesh(
    new THREE.CylinderGeometry(9.45, 9.45, 0.03, 48, 1, true, Math.PI - 1.5, 3.0),
    new THREE.MeshBasicMaterial({ color: 0xD4AF37, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  line.position.set(0, 4.2, PLAYER_POS.z);
  shop.scene.add(line);
}

// 간판 그림 만들기 (캔버스에 글자를 그려서 텍스처로)
function makeSignTexture(number, label) {
  var c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  var ctx = c.getContext('2d');

  // 네이비 바탕 + 골드 테두리
  ctx.fillStyle = 'rgba(0,29,74,0.92)';
  roundRect(ctx, 4, 4, 504, 120, 18);
  ctx.fill();
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 3;
  roundRect(ctx, 4, 4, 504, 120, 18);
  ctx.stroke();

  // 번호
  ctx.fillStyle = 'rgba(212,175,55,0.7)';
  ctx.font = '500 26px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(number, 28, 64);

  // 데스크 이름
  ctx.fillStyle = '#D4AF37';
  ctx.font = '600 44px "IBM Plex Sans", sans-serif';
  ctx.textAlign = 'center';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  ctx.fillText(label, 276, 66);

  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 데스크 하나 만들기: 카운터 + NPC + 간판
function buildDesk(desk, index) {
  var R = 5;
  var angle = (-60 + index * 30) * Math.PI / 180;
  var x = PLAYER_POS.x + R * Math.sin(angle);
  var z = PLAYER_POS.z - R * Math.cos(angle);

  var group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = Math.atan2(PLAYER_POS.x - x, PLAYER_POS.z - z); // 내 아바타 쪽을 바라봄
  shop.scene.add(group);

  var navy = new THREE.MeshStandardMaterial({ color: 0x0e1a33, roughness: 0.7, flatShading: true });
  var top = new THREE.MeshStandardMaterial({ color: 0x141d30, roughness: 0.5, flatShading: true });
  var gold = new THREE.MeshStandardMaterial({ color: 0xD4AF37, emissive: 0xD4AF37, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.3 });

  // 카운터
  var counter = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 0.7), navy);
  counter.position.y = 0.5;
  group.add(counter);
  var counterTop = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.06, 0.82), top);
  counterTop.position.y = 1.03;
  group.add(counterTop);
  var strip = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 0.02), gold);
  strip.position.set(0, 0.86, 0.36);
  group.add(strip);

  // NPC (카운터 뒤에 서 있음)
  var npc = buildAvatar(desk.npc);
  npc.position.set(0, 0, -0.62);
  group.add(npc);

  // 간판
  var signY = 3.05;
  var sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.45),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(desk.number, desk.sign), transparent: true })
  );
  sign.position.set(0, signY, -0.45);
  group.add(sign);

  // 간판 뒤 빛 (마우스를 올리거나 깜빡일 때 켜짐)
  var frame = new THREE.Mesh(
    new THREE.PlaneGeometry(2.05, 0.68),
    new THREE.MeshBasicMaterial({ color: 0xD4AF37, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  frame.position.set(0, signY, -0.47);
  group.add(frame);

  // 클릭 판정용 투명 상자 (데스크 + NPC + 간판을 모두 덮음)
  var hit = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 3.6, 1.8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.set(0, 1.8, -0.3);
  hit.userData.deskId = desk.id;
  group.add(hit);
  shop.clickables.push(hit);

  // 간판의 월드 좌표 (화살표 위치 계산용)
  group.updateMatrixWorld(true);
  var signPos = new THREE.Vector3();
  sign.getWorldPosition(signPos);

  shop.desks[desk.id] = {
    group: group,
    npc: npc,
    sign: sign,
    frame: frame,
    signPos: signPos,
    phase: index * 1.3,
    portrait: null
  };
}

// 내 아바타 다시 만들기 (아바타를 고친 뒤 매장에 오면 바뀐 모습으로)
function rebuildShopPlayer() {
  if (shop.me) {
    shop.scene.remove(shop.me);
    disposeAvatar(shop.me);
  }
  var config = shop.profile && shop.profile.avatar ? shop.profile.avatar : DEFAULT_AVATAR;
  shop.me = buildAvatar(config);
  shop.me.position.set(PLAYER_POS.x, 0, PLAYER_POS.z);
  shop.meTurn = 0;
  shop.me.rotation.y = 0;
  shop.scene.add(shop.me);
}


// ================================================================
//  화면 크기 맞추기 / 애니메이션 루프
// ================================================================
function resizeShop() {
  if (!shop.ready) return;
  var wrap = document.getElementById('screen-shop');
  var w = wrap.clientWidth;
  var h = wrap.clientHeight;
  if (w === 0 || h === 0) return;
  if (w === shop.width && h === shop.height) return;

  shop.width = w;
  shop.height = h;
  shop.renderer.setSize(w, h, false);
  shop.camera.aspect = w / h;

  // 화면이 좁을수록 멀리서 봐서 데스크 5개가 다 들어오게
  var halfWidth = 6.6;
  var tan = Math.tan(THREE.MathUtils.degToRad(shop.camera.fov / 2));
  var dist = Math.min(30, Math.max(13, halfWidth / (tan * shop.camera.aspect)));
  var dir = new THREE.Vector3(0, 0.62, 1).normalize();   // 비스듬히 위에서 내려다보기
  shop.camera.position.set(
    CAMERA_TARGET.x + dir.x * dist,
    CAMERA_TARGET.y + dir.y * dist,
    CAMERA_TARGET.z + dir.z * dist
  );
  shop.camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);
  shop.camera.updateProjectionMatrix();
}

function startShopLoop() {
  if (shop.running) return;
  shop.running = true;

  function loop() {
    if (!shop.running) return;
    shop.rafId = requestAnimationFrame(loop);
    resizeShop();

    var t = shop.clock.getElapsedTime();
    var now = Date.now();

    // NPC: 숨쉬기 + 말할 때 고개 끄덕임
    SHOP_DESKS.forEach(function (desk) {
      var d = shop.desks[desk.id];
      animateIdle(d.npc, t + d.phase);
      var head = d.npc.getObjectByName('head');
      var talking = dialog.open && dialog.typing && dialog.deskId === desk.id;
      head.rotation.x = talking ? Math.abs(Math.sin(t * 8)) * 0.09 : head.rotation.x * 0.8;

      // 간판 빛: 리셉션 깜빡임 > 마우스 올림 > 꺼짐
      var opacity = 0;
      var scale = 1;
      if (desk.id === 'reception' && now < shop.blinkUntil) {
        var pulse = (Math.sin(t * 12) + 1) / 2;
        opacity = 0.25 + pulse * 0.55;
        scale = 1 + pulse * 0.08;
      } else if (shop.hoverDesk === desk.id || (dialog.open && dialog.deskId === desk.id)) {
        opacity = 0.22;
      }
      d.frame.material.opacity = opacity;
      d.sign.scale.set(scale, scale, 1);
      d.frame.scale.set(scale, scale, 1);
    });

    // 내 아바타: 숨쉬기 + 대화 중인 데스크 쪽으로 천천히 돌기
    if (shop.me) {
      animateIdle(shop.me, t);
      shop.me.rotation.y += (shop.meTurn - shop.me.rotation.y) * 0.1;
    }

    // 화살표: 다음 데스크 위에서 위아래로 둥둥 + 데스크가 바뀌면 부드럽게 이동
    if (shop.arrow.visible && shop.arrow.userData.target) {
      var target = shop.arrow.userData.target;
      shop.arrow.position.x += (target.x - shop.arrow.position.x) * 0.08;
      shop.arrow.position.z += (target.z - shop.arrow.position.z) * 0.08;
      shop.arrow.position.y = target.y + Math.sin(t * 3) * 0.12;
      shop.arrow.rotation.y = t * 1.2;
    }

    shop.renderer.render(shop.scene, shop.camera);
  }
  loop();
}


// ================================================================
//  데스크 클릭 판정
// ================================================================
function pickDesk(e) {
  if (!shop.ready) return null;
  var rect = shop.renderer.domElement.getBoundingClientRect();
  var pointer = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  shop.raycaster.setFromCamera(pointer, shop.camera);
  var hits = shop.raycaster.intersectObjects(shop.clickables, false);
  return hits.length ? hits[0].object.userData.deskId : null;
}


// ================================================================
//  주문 진행 / 안내 화살표
// ================================================================
// 다음에 가야 할 데스크 (모두 끝났으면 null)
function getNextDesk() {
  for (var i = 0; i < SHOP_DESKS.length; i++) {
    if (!order.progress[SHOP_DESKS[i].id]) return SHOP_DESKS[i].id;
  }
  return null;
}

// 화살표를 다음 데스크 위로 (jump: 애니메이션 없이 바로 이동)
function updateShopArrow(jump) {
  if (!shop.ready) return;
  var next = getNextDesk();
  if (!next) {
    shop.arrow.visible = false;
    return;
  }
  var p = shop.desks[next].signPos;
  shop.arrow.visible = true;
  shop.arrow.userData.target = { x: p.x, y: p.y + 0.6, z: p.z };
  if (jump) shop.arrow.position.set(p.x, p.y + 0.6, p.z);
}

// 데스크 주문 완료 처리 (다음 단계의 주문 화면에서 사용)
function completeDesk(deskId) {
  if (!(deskId in order.progress)) return;
  order.progress[deskId] = true;
  updateShopArrow(false);
}

// 리셉션 간판 3초간 깜빡이기
function blinkReceptionSign() {
  shop.blinkUntil = Date.now() + 3000;
}


// ================================================================
//  NPC 얼굴 미리보기 (원형 이미지)
//  Avatar Studio 의 미리보기 렌더러(preview)를 같이 써요
// ================================================================
function getNpcPortrait(deskId) {
  var d = shop.desks[deskId];
  if (d && d.portrait) return d.portrait;
  if (typeof THREE === 'undefined') return '';

  if (!preview) initPreviewRenderer();
  var desk = SHOP_DESKS.filter(function (x) { return x.id === deskId; })[0];
  var avatar = buildAvatar(desk.npc);
  avatar.rotation.y = 0.2;
  preview.scene.add(avatar);
  preview.camera.position.set(0, 1.92, 2.1);
  preview.camera.lookAt(0, 1.86, 0);
  preview.renderer.render(preview.scene, preview.camera);
  var url = preview.renderer.domElement.toDataURL('image/png');
  preview.scene.remove(avatar);
  disposeAvatar(avatar);

  if (d) d.portrait = url;
  return url;
}


// ================================================================
//  대화창
// ================================================================
function openDialog(deskId) {
  if (dialog.closeTimer) clearTimeout(dialog.closeTimer);
  dialog.open = true;
  dialog.deskId = deskId;
  dialog.mode = 'talk';
  dialog.page = 0;
  dialog.messageKey = null;

  document.getElementById('npc-portrait').src = getNpcPortrait(deskId);
  document.getElementById('npc-dialog').classList.add('open');
  updateShopHint();

  // 내 아바타가 그 데스크 쪽을 바라봄
  var d = shop.desks[deskId];
  if (d && shop.me) {
    shop.meTurn = Math.atan2(d.group.position.x - PLAYER_POS.x, d.group.position.z - PLAYER_POS.z);
  }

  renderDialog();
}

function closeDialog() {
  stopTyping();
  if (dialog.closeTimer) clearTimeout(dialog.closeTimer);
  dialog.closeTimer = null;
  dialog.open = false;
  var box = document.getElementById('npc-dialog');
  if (box) box.classList.remove('open');
  shop.meTurn = 0; // 다시 정면
  updateShopHint();
}

// 지금 상태에 맞게 대화창 내용 그리기
function renderDialog() {
  if (!dialog.open) return;
  var d = getDialog(dialog.deskId);
  var nickname = shop.profile && shop.profile.nickname ? shop.profile.nickname : '';

  // 이름 + 데스크 이름
  document.getElementById('npc-name').textContent = d.npc + ' · ' + d.desk;

  var pageEl = document.getElementById('npc-page');
  var choices = document.getElementById('npc-choices');
  choices.innerHTML = '';
  pageEl.textContent = '';

  var text = '';

  if (dialog.mode === 'talk' || dialog.mode === 'message') {
    text = dialog.mode === 'talk'
      ? d.greeting
      : (d[dialog.messageKey] !== undefined ? d[dialog.messageKey] : dialogUI(dialog.messageKey));
    addChoice(choices, dialogUI('howTo'), showManual);
    addChoice(choices, dialogUI('startOrder'), dialogStartOrder);
    addChoice(choices, dialogUI('bye'), dialogBye);

  } else if (dialog.mode === 'manual') {
    var total = d.manual.length;
    var last = dialog.page >= total - 1;
    text = d.manual[dialog.page] + (last ? '\n\n' + d.startHint : '');
    pageEl.textContent = (dialog.page + 1) + ' / ' + total;

    var prev = addChoice(choices, dialogUI('prev'), function () { goManualPage(dialog.page - 1); });
    prev.disabled = dialog.page === 0;
    if (last) {
      addChoice(choices, dialogUI('startOrder'), dialogStartOrder, true);
    } else {
      addChoice(choices, dialogUI('next'), function () { goManualPage(dialog.page + 1); });
    }

  } else if (dialog.mode === 'bye') {
    text = d.bye;
  }

  typeText(fillNickname(text, nickname));
}

// 선택 버튼 만들기
function addChoice(box, label, onClick, primary) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'npc-choice' + (primary ? ' primary' : '');
  btn.textContent = label;
  btn.onclick = function (e) {
    e.stopPropagation();
    onClick();
  };
  box.appendChild(btn);
  return btn;
}

// "How do I order here?" → 매뉴얼 모드 (순서와 상관없이 어느 데스크에서나)
function showManual() {
  dialog.mode = 'manual';
  dialog.page = 0;
  renderDialog();
}

function goManualPage(page) {
  var d = getDialog(dialog.deskId);
  dialog.page = Math.max(0, Math.min(d.manual.length - 1, page));
  renderDialog();
}

// "Start Order"
function dialogStartOrder() {
  if (dialog.deskId !== 'reception' && !order.progress.reception) {
    // 접수를 먼저 해야 함 → 안내 + 리셉션 간판 깜빡임
    dialog.mode = 'message';
    dialog.messageKey = 'needReception';
    blinkReceptionSign();
  } else {
    // 다음 단계에서 데스크별 주문 화면 연결 예정
    dialog.mode = 'message';
    dialog.messageKey = 'comingSoon';
  }
  renderDialog();
}

// "Bye" → 인사하고 1초 뒤 닫힘 (타이핑이 끝난 뒤부터 1초)
function dialogBye() {
  dialog.mode = 'bye';
  renderDialog();
}


// ----- 타이핑 효과 (초당 약 40자) -----
function typeText(text) {
  stopTyping();
  var el = document.getElementById('npc-text');
  dialog.full = text;
  dialog.shown = 0;
  dialog.typing = true;
  el.textContent = '';

  dialog.timer = setInterval(function () {
    dialog.shown++;
    el.textContent = dialog.full.slice(0, dialog.shown);
    if (dialog.shown >= dialog.full.length) finishTyping();
  }, 25);
}

function stopTyping() {
  if (dialog.timer) clearInterval(dialog.timer);
  dialog.timer = null;
  dialog.typing = false;
}

// 타이핑 끝 (또는 클릭해서 바로 전체 표시)
function finishTyping() {
  stopTyping();
  document.getElementById('npc-text').textContent = dialog.full;
  if (dialog.mode === 'bye') {
    dialog.closeTimer = setTimeout(closeDialog, 1000);
  }
}

// 타이핑 중에 대화창을 클릭하면 즉시 전체 표시
function handleDialogClick() {
  if (dialog.typing) finishTyping();
}


// ================================================================
//  언어 전환 (EN / KO)
// ================================================================
function setShopLang(code) {
  setLang(code);
  document.documentElement.lang = code;
  updateLangToggle();
  updateShopHint();
  if (dialog.open) renderDialog(); // 열린 대화창 문구도 즉시 바뀜
}

function updateLangToggle() {
  var buttons = document.querySelectorAll('.lang-toggle button');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-lang') === currentLang);
  }
}

// 화면 아래 "Click a desk to talk" 안내 (대화창이 열리면 숨김)
function updateShopHint() {
  var hint = document.getElementById('shop-hint');
  if (!hint) return;
  hint.textContent = dialogUI('clickDesk');
  hint.classList.toggle('hidden', dialog.open);
}


// ESC 키로 대화창 닫기
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && dialog.open) closeDialog();
});
