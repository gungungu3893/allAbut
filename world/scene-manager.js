// ===== 장면 관리 (바깥 지역 ↔ 건물 내부) =====
// - 지금 장면을 들고 있고, 다른 장면으로 갈 때 검게 페이드아웃 → 새 장면 로드 → 페이드인 (0.6초)
// - 이전 장면의 3D 리소스(도형·재료·텍스처)는 정리(dispose)해서 메모리를 비워요
// - 클릭 이동, 카메라 회전/줌, 미니맵, 안내 문구, 위치 저장도 여기서 처리해요

var WORLD_START_ZONE = 'bangkok-soi';
var LOCATION_KEY = 'allabut_location';

var world = {
  ready: false,
  running: false,
  loading: false,
  rafId: null,
  renderer: null,
  camera: null,
  clock: null,
  raycaster: null,
  quality: null,
  def: null,          // 지금 장면 (buildZone / 내부 build 결과)
  profile: null,
  marker: null,       // 클릭 지점 골드 원
  markerTime: 0,
  hoverItem: null,
  fades: [],          // 반투명 처리 중인 건물들
  bubble: null,       // 3D 위치에 붙는 말풍선 { pos, until }
  lastSave: 0,
  lastMinimap: 0,
  width: 0,
  height: 0,
  pointers: {},
  drag: null,
  mouse: null,        // 마지막 마우스 위치 (카메라가 움직여도 마우스 올림을 다시 확인)
  lastHover: 0
};

var GROUND_PLANE = null; // 바닥 평면 (initWorld 에서 만듦)


// ================================================================
//  월드 열기 / 닫기
// ================================================================
// opts.spawn: true 면 골목 시작 지점에서 (Avatar Studio 에서 처음 입장할 때)
function openWorld(profile, opts) {
  opts = opts || {};
  world.profile = profile || world.profile;
  var nick = document.getElementById('world-nickname');
  if (nick) nick.textContent = world.profile && world.profile.nickname ? world.profile.nickname : '';

  if (typeof THREE === 'undefined') return;
  if (!world.ready) initWorld();

  // 내 아바타 (꾸민 모습 그대로)
  setPlayerAvatar(world.profile && world.profile.avatar ? world.profile.avatar : DEFAULT_AVATAR);

  if (opts.spawn) {
    loadWorldScene(WORLD_START_ZONE, { entry: 'spawn', hint: true, first: !world.def });
  } else if (world.def) {
    // Edit Avatar 갔다가 돌아온 경우: 같은 장면, 같은 위치
    world.def.scene.add(player.avatar);
    placePlayer(player.x, player.z, player.rotY);
    camRig.ready = false;
  } else {
    var saved = loadLocation();
    if (saved && (ZONES[saved.scene] || INTERIORS[saved.scene])) {
      loadWorldScene(saved.scene, { pos: saved, first: true });
    } else {
      loadWorldScene(WORLD_START_ZONE, { entry: 'spawn', hint: true, first: true });
    }
  }
  startWorldLoop();
}

function closeWorld() {
  saveLocation();
  world.running = false;
  if (world.rafId) cancelAnimationFrame(world.rafId);
  world.rafId = null;
  hideWorldDialog();
  hideTooltip();
  world.bubble = null;
  var b = document.getElementById('world-bubble');
  if (b) b.classList.remove('show');
}


// ================================================================
//  처음 한 번: 렌더러 + 입력
// ================================================================
function initWorld() {
  var mobile = window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600;
  var dpr = window.devicePixelRatio || 1;
  world.quality = {
    mobile: mobile,
    shadows: !mobile,
    pixelRatio: mobile ? Math.min(dpr, 1.5) : Math.min(dpr, 2)
  };

  var canvas = document.getElementById('world-canvas');
  world.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !mobile });
  world.renderer.setPixelRatio(world.quality.pixelRatio);
  if (world.quality.shadows) {
    world.renderer.shadowMap.enabled = true;
    world.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  world.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  world.clock = new THREE.Clock();
  world.raycaster = new THREE.Raycaster();
  GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // --- 입력 ---
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('pointerdown', onWorldPointerDown);
  canvas.addEventListener('pointermove', onWorldPointerMove);
  canvas.addEventListener('pointerup', onWorldPointerUp);
  canvas.addEventListener('pointercancel', onWorldPointerUp);
  canvas.addEventListener('pointerleave', function () {
    world.mouse = null;
    setHover(null);
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoomCamera(e.deltaY * 0.001);
  }, { passive: false });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideWorldDialog();
  });
  window.addEventListener('beforeunload', saveLocation);

  world.ready = true;
}


// ================================================================
//  장면 불러오기 (페이드아웃 → 정리 → 새로 만들기 → 페이드인)
// ================================================================
// opts: { entry: 들어오는 위치 이름, pos: {x, z} 직접 위치, hint: 안내 표시, first: 처음 열기 }
function loadWorldScene(sceneId, opts) {
  if (world.loading) return;
  opts = opts || {};
  world.loading = true;
  hideWorldDialog();
  stopPlayer();
  setHover(null);

  var fade = document.getElementById('world-fade');
  if (opts.first) {
    fade.style.transition = 'none';
    fade.style.opacity = '1';
  }

  wait(opts.first ? 30 : 0).then(function () {
    fade.style.transition = 'opacity 0.3s ease';
    fade.style.opacity = '1';
    return wait(opts.first ? 0 : 300);
  }).then(function () {
    swapWorldScene(sceneId, opts);
    return wait(60);
  }).then(function () {
    fade.style.opacity = '0';
    return wait(300);
  }).then(function () {
    world.loading = false;
  }).catch(function (err) {
    console.error(err);
    fade.style.opacity = '0';
    world.loading = false;
  });
}

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function swapWorldScene(sceneId, opts) {
  // 이전 장면 정리
  if (world.def) disposeWorldDef(world.def);
  world.def = null;
  world.fades = [];

  // 새 장면 만들기 (지역 or 건물 내부)
  var def;
  if (ZONES[sceneId]) def = buildZone(sceneId, world.quality);
  else if (INTERIORS[sceneId]) def = INTERIORS[sceneId].build(world.quality);
  else throw new Error('Unknown scene: ' + sceneId);
  world.def = def;

  // 내 캐릭터 넣기
  def.scene.add(player.avatar);
  var start = null;
  if (opts.pos) {
    var cell = def.nav.cellOf(opts.pos.x, opts.pos.z);
    var free = def.nav.nearestFree(cell.c, cell.r);
    if (free) start = def.nav.centerOf(free.c, free.r);
    if (start && def.nav.isWalkable(opts.pos.x, opts.pos.z)) start = { x: opts.pos.x, z: opts.pos.z };
    if (start) start.angle = opts.pos.angle || 0;
  }
  if (!start) start = def.entries[opts.entry] || def.entries.spawn || def.entries.entrance;
  placePlayer(start.x, start.z, start.angle || 0);

  // 클릭 지점 마커
  world.marker = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.42, 32),
    new THREE.MeshBasicMaterial({ color: 0xD4AF37, transparent: true, opacity: 0, depthWrite: false })
  );
  world.marker.rotation.x = -Math.PI / 2;
  world.marker.visible = false;
  def.scene.add(world.marker);

  // 카메라 기본값 (바깥은 멀리, 내부는 가까이)
  setupCamera(def.camera);

  // 화면 UI
  document.getElementById('world-location-name').textContent = def.label;
  if (opts.hint) showWorldHint('Click to walk · Find the allAbut shop', 10000);
  saveLocation();
}

// 장면의 3D 리소스 정리
function disposeWorldDef(def) {
  if (player.avatar && player.avatar.parent) player.avatar.parent.remove(player.avatar);
  def.scene.traverse(function (o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
  Object.keys(def.ctx.geos).forEach(function (k) {
    var g = def.ctx.geos[k];
    if (g && g.dispose) g.dispose();
  });
  world.renderer.renderLists.dispose();
}


// ================================================================
//  애니메이션 루프
// ================================================================
function startWorldLoop() {
  if (world.running) return;
  world.running = true;
  world.clock.getDelta();

  function loop() {
    if (!world.running) return;
    world.rafId = requestAnimationFrame(loop);
    resizeWorld();
    var dt = Math.min(0.05, world.clock.getDelta());
    var t = world.clock.elapsedTime;
    var def = world.def;
    if (!def) return;

    def.update(dt, t);
    updatePlayer(dt, t);
    updateCamera(world.camera, dt);
    updateShadowFollow(def);
    updateOcclusion(def, dt);
    updateMarker(dt);
    updateBubble();

    // 카메라가 움직이면 마우스 아래 물체도 바뀌므로 가끔 다시 확인
    if (world.mouse && !world.drag && t - world.lastHover > 0.15) {
      updateHover(world.mouse.x, world.mouse.y);
      world.lastHover = t;
    }

    if (t - world.lastMinimap > 0.08) {
      drawMinimap(def, t);
      world.lastMinimap = t;
    }
    if (t - world.lastSave > 1) {
      saveLocation();
      world.lastSave = t;
    }

    world.renderer.render(def.scene, world.camera);
  }
  loop();
}

function resizeWorld() {
  var canvas = world.renderer.domElement;
  var w = canvas.clientWidth, h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  if (w === world.width && h === world.height) return;
  world.width = w;
  world.height = h;
  world.renderer.setSize(w, h, false);
  world.camera.aspect = w / h;
  world.camera.updateProjectionMatrix();
}

// 그림자 영역이 캐릭터를 따라다니게 (바깥 해)
function updateShadowFollow(def) {
  var sun = def.sun;
  if (!sun) return;
  var dir = sun.userData.dir;
  sun.target.position.set(player.x, 0, player.z);
  sun.position.set(player.x + dir.x * 80, dir.y * 80, player.z + dir.z * 80);
}


// ================================================================
//  카메라를 가리는 건물·벽은 반투명 (0.2)
// ================================================================
var _occRay = null, _occHead = null, _occDir = null;

function updateOcclusion(def, dt) {
  if (!_occRay) {
    _occRay = new THREE.Raycaster();
    _occHead = new THREE.Vector3();
    _occDir = new THREE.Vector3();
  }
  // 카메라 → 캐릭터 머리, 카메라 → 캐릭터 발 두 줄로 확인
  var hitGroups = [];
  [1.3, 0.2].forEach(function (y) {
    _occHead.set(player.x, y, player.z);
    _occDir.subVectors(_occHead, world.camera.position);
    var dist = _occDir.length();
    _occDir.normalize();
    _occRay.set(world.camera.position, _occDir);
    _occRay.far = dist - 0.3;
    _occRay.intersectObjects(def.occluders, false).forEach(function (h) {
      var g = h.object.userData.fadeGroup;
      if (g && hitGroups.indexOf(g) === -1) hitGroups.push(g);
    });
  });

  // 새로 가린 것 등록
  hitGroups.forEach(function (g) {
    if (!world.fades.some(function (f) { return f.group === g; })) world.fades.push({ group: g, value: 1 });
  });

  // 반투명 정도를 부드럽게
  world.fades = world.fades.filter(function (f) {
    var target = hitGroups.indexOf(f.group) !== -1 ? 0.2 : 1;
    f.value += (target - f.value) * Math.min(1, dt * 8);
    if (target === 1 && f.value > 0.98) {
      applyFade(f.group, 1);
      return false;
    }
    applyFade(f.group, f.value);
    return true;
  });
}

function applyFade(group, alpha) {
  group.traverse(function (m) {
    if (!m.isMesh || !m.material || m.material.visible === false) return;
    if (alpha < 0.999) {
      if (!m.userData.fadeOrig) {
        m.userData.fadeOrig = m.material;
        m.userData.fadeBase = m.material.opacity;
        var clone = m.material.clone();
        clone.transparent = true;
        clone.depthWrite = false;
        m.material = clone;
      }
      m.material.opacity = m.userData.fadeBase * alpha;
    } else if (m.userData.fadeOrig) {
      m.material.dispose();
      m.material = m.userData.fadeOrig;
      delete m.userData.fadeOrig;
      delete m.userData.fadeBase;
    }
  });
}


// ================================================================
//  입력: 클릭 이동 / 오른쪽 드래그 회전 / 휠·핀치 줌
// ================================================================
function onWorldPointerDown(e) {
  var canvas = world.renderer.domElement;
  canvas.setPointerCapture(e.pointerId);
  world.pointers[e.pointerId] = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, type: e.pointerType };
  var ids = Object.keys(world.pointers);

  if (e.pointerType === 'mouse' && e.button === 2) {
    world.drag = { mode: 'rotate' };
  } else if (ids.length === 2) {
    // 두 손가락: 회전 + 핀치 줌
    var a = world.pointers[ids[0]], b = world.pointers[ids[1]];
    world.drag = { mode: 'two', midX: (a.x + b.x) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y), cancelTap: true };
  }
}

function onWorldPointerMove(e) {
  var p = world.pointers[e.pointerId];
  if (e.pointerType === 'mouse') world.mouse = { x: e.clientX, y: e.clientY };
  if (!p) {
    // 버튼을 누르지 않은 마우스 → 마우스 올림 확인
    if (e.pointerType === 'mouse') updateHover(e.clientX, e.clientY);
    return;
  }
  var dx = e.clientX - p.x;
  p.x = e.clientX;
  p.y = e.clientY;

  if (world.drag && world.drag.mode === 'rotate') {
    rotateCamera(-dx);
  } else if (world.drag && world.drag.mode === 'two') {
    var ids = Object.keys(world.pointers);
    if (ids.length < 2) return;
    var a = world.pointers[ids[0]], b = world.pointers[ids[1]];
    var mid = (a.x + b.x) / 2;
    var dist = Math.hypot(a.x - b.x, a.y - b.y);
    rotateCamera(-(mid - world.drag.midX));
    if (world.drag.dist > 0) zoomCamera((world.drag.dist - dist) / world.drag.dist);
    world.drag.midX = mid;
    world.drag.dist = dist;
  } else if (e.pointerType === 'mouse') {
    updateHover(e.clientX, e.clientY);
  }
}

function onWorldPointerUp(e) {
  var p = world.pointers[e.pointerId];
  delete world.pointers[e.pointerId];
  if (!p) return;

  var wasTwo = world.drag && world.drag.mode === 'two';
  var wasRotate = world.drag && world.drag.mode === 'rotate';
  if (Object.keys(world.pointers).length === 0) world.drag = null;

  if (e.type === 'pointercancel' || wasTwo || wasRotate) return;
  if (p.button !== 0 && p.type === 'mouse') return;
  var moved = Math.abs(e.clientX - p.sx) + Math.abs(e.clientY - p.sy);
  if (moved > 10) return;

  handleWorldClick(e.clientX, e.clientY);
}

function screenRay(clientX, clientY) {
  var rect = world.renderer.domElement.getBoundingClientRect();
  var ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  world.raycaster.setFromCamera(ndc, world.camera);
  return world.raycaster;
}

function pickInteractive(clientX, clientY) {
  if (!world.def) return null;
  var proxies = world.def.interactives.map(function (it) { return it.proxy; });
  var hits = screenRay(clientX, clientY).intersectObjects(proxies, false);
  return hits.length ? hits[0].object.userData.interactive : null;
}

function updateHover(x, y) {
  if (world.loading) {
    setHover(null);
    return;
  }
  var item = pickInteractive(x, y);
  setHover(item);
  if (item && item.tooltip) showTooltip(item.tooltip, x, y);
  else hideTooltip();
}

function setHover(item) {
  if (world.hoverItem === item) return;
  if (world.hoverItem) world.hoverItem.setHover(false);
  world.hoverItem = item;
  if (item) item.setHover(true);
  if (world.renderer) world.renderer.domElement.style.cursor = item ? 'pointer' : 'default';
  if (!item) hideTooltip();
}

// 클릭(탭) 처리
function handleWorldClick(x, y) {
  var def = world.def;
  if (!def || world.loading) return;

  var item = pickInteractive(x, y);
  if (item) {
    interactWith(item);
    return;
  }

  // 바닥 클릭 → 걸어가기
  var point = new THREE.Vector3();
  if (!screenRay(x, y).ray.intersectPlane(GROUND_PLANE, point)) return;
  hideWorldDialog();
  var ok = walkPlayerTo(def.nav, point.x, point.z, null, null);
  if (ok) {
    var goal = player.path.length ? player.path[player.path.length - 1] : { x: point.x, z: point.z };
    showMarker(goal.x, goal.z);
  }
}

// 데스크·건물 입구·출구·역 클릭
function interactWith(item) {
  var def = world.def;
  hideWorldDialog();
  showMarker(item.approach.x, item.approach.z);

  if (item.kind === 'portal' && item.bubble) {
    showBubble('Other districts coming soon', item.bubble);
  }

  walkPlayerTo(def.nav, item.approach.x, item.approach.z, function () {
    player.faceTarget = { x: item.face.x, z: item.face.z };
    if (item.kind === 'enter') {
      loadWorldScene(item.interior, { entry: 'entrance' });
    } else if (item.kind === 'exit') {
      loadWorldScene(def.exitTo.zone, { entry: def.exitTo.entry });
    } else if (item.kind === 'desk') {
      showWorldDialog(item.npcName, "Hello! I'm " + item.npcName + ' at ' + item.title + '. (dialog coming soon)');
    }
  }, { x: item.face.x, z: item.face.z });
}


// ================================================================
//  클릭 마커 / 말풍선 / 툴팁 / 안내 / 대화창
// ================================================================
function showMarker(x, z) {
  if (!world.marker) return;
  world.marker.position.set(x, 0.03, z);
  world.marker.visible = true;
  world.markerTime = 0;
}

function updateMarker(dt) {
  var m = world.marker;
  if (!m || !m.visible) return;
  world.markerTime += dt;
  var k = world.markerTime / 0.9;
  if (k >= 1) { m.visible = false; return; }
  m.scale.setScalar(0.6 + k * 0.9);
  m.material.opacity = 0.95 * (1 - k);
}

function showBubble(text, pos) {
  var el = document.getElementById('world-bubble');
  el.textContent = text;
  world.bubble = { pos: pos.clone(), until: performance.now() + 3000 };
  el.classList.add('show');
}

function updateBubble() {
  var el = document.getElementById('world-bubble');
  if (!world.bubble) return;
  if (performance.now() > world.bubble.until) {
    world.bubble = null;
    el.classList.remove('show');
    return;
  }
  var v = world.bubble.pos.clone().project(world.camera);
  el.style.left = ((v.x + 1) / 2 * world.width) + 'px';
  el.style.top = ((1 - v.y) / 2 * world.height) + 'px';
}

function showTooltip(text, x, y) {
  var el = document.getElementById('world-tooltip');
  var rect = world.renderer.domElement.getBoundingClientRect();
  el.textContent = text;
  el.style.left = (x - rect.left + 14) + 'px';
  el.style.top = (y - rect.top + 14) + 'px';
  el.classList.add('show');
}

function hideTooltip() {
  var el = document.getElementById('world-tooltip');
  if (el) el.classList.remove('show');
}

var worldHintTimer = null;
function showWorldHint(text, ms) {
  var el = document.getElementById('world-hint');
  el.textContent = text;
  el.classList.add('show');
  if (worldHintTimer) clearTimeout(worldHintTimer);
  worldHintTimer = setTimeout(function () { el.classList.remove('show'); }, ms);
}

function showWorldDialog(name, text) {
  document.getElementById('world-dialog-name').textContent = name;
  document.getElementById('world-dialog-text').textContent = text;
  document.getElementById('world-dialog').classList.add('open');
}

function hideWorldDialog() {
  var el = document.getElementById('world-dialog');
  if (el) el.classList.remove('open');
}


// ================================================================
//  미니맵 (오른쪽 아래 원형, 북쪽이 위)
// ================================================================
function drawMinimap(def, t) {
  var canvas = document.getElementById('world-minimap');
  if (!canvas) return;
  var size = canvas.clientWidth;
  if (!size) return;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== size * dpr) {
    canvas.width = size * dpr;
    canvas.height = size * dpr;
  }
  var g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);

  var c = size / 2;
  g.save();
  g.beginPath();
  g.arc(c, c, c - 2, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = 'rgba(6,9,15,0.82)';
  g.fillRect(0, 0, size, size);

  var scale = def.minimap.scale * (size / 150);
  function toPx(x, z) {
    return { x: c + (x - player.x) * scale, y: c + (z - player.z) * scale };
  }
  def.minimap.draw(g, toPx, t);

  // 특별한 곳 (allAbut 빌딩 = 골드 별)
  (def.minimap.marks || []).forEach(function (m) {
    var p = toPx(m.x, m.z);
    if (m.kind === 'star') drawStar(g, p.x, p.y, 7, '#D4AF37');
  });

  // 내 위치 (골드 점 + 바라보는 방향)
  g.translate(c, c);
  g.rotate(-player.rotY + Math.PI);
  g.fillStyle = 'rgba(212,175,55,0.35)';
  g.beginPath(); g.moveTo(0, -11); g.lineTo(-6, 0); g.lineTo(6, 0); g.closePath(); g.fill();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(c, c, 4.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#D4AF37';
  g.beginPath(); g.arc(c, c, 3.2, 0, Math.PI * 2); g.fill();
  g.restore();

  // 테두리 + 북쪽 표시
  g.strokeStyle = 'rgba(212,175,55,0.8)';
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#D4AF37';
  g.font = '600 9px "IBM Plex Mono", monospace';
  g.textAlign = 'center';
  g.fillText('N', c, 12);
}

function drawStar(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  for (var i = 0; i < 10; i++) {
    var rr = i % 2 ? r * 0.45 : r;
    var a = -Math.PI / 2 + i * Math.PI / 5;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}


// ================================================================
//  위치 저장 (새로고침해도 마지막 위치에서 시작)
// ================================================================
function saveLocation() {
  if (!world.def) return;
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify({
      scene: world.def.id,
      x: Math.round(player.x * 100) / 100,
      z: Math.round(player.z * 100) / 100,
      angle: Math.round(player.rotY * 100) / 100
    }));
  } catch (e) { /* 저장 불가 */ }
}

function loadLocation() {
  try {
    var v = JSON.parse(localStorage.getItem(LOCATION_KEY) || 'null');
    if (v && typeof v.x === 'number' && typeof v.z === 'number' && v.scene) return v;
  } catch (e) { /* 무시 */ }
  return null;
}
