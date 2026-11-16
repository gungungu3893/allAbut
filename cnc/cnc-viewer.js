// ===== 파일 뷰어 (3D · 이미지 · PDF) =====
// - 3D: STL(바이너리·텍스트), OBJ 는 화면에서 돌려 볼 수 있어요. PLY·3MF 는 다운로드만.
// - Three.js 는 무거워서 뷰어를 "처음 열 때만" 불러와요 (three@0.160.0 고정)
// - 내 컴퓨터 파일(File) → 바로 미리보기 / 올라간 파일(path) → 서명 URL(1시간)로 보기
//
// 사용법 (고객 화면 · 관리자 화면 모두 같은 함수):
//   cncOpenViewer({ name: 'upper.stl', file: File })                  ← 업로드 전
//   cncOpenViewer({ name: 'upper.stl', getUrl: function () { return promise } })  ← 업로드 후
//
// ----- 3D 조작 (오비트 방식) -----
// 모델은 가만히 있고, 카메라가 모델 중심(target)을 둥글게 돌아요 → 방향이 꼬이지 않아요.
//   - 회전: 왼쪽 버튼 드래그 / 한 손가락. 100px 드래그 ≈ 20° (VIEWER_ROTATE_PER_PX)
//           위아래 각도는 ±85° 까지만 (VIEWER_MAX_ELEVATION) → 뒤집히지 않아요
//   - 이동: 오른쪽 버튼 드래그 · 가운데 버튼 · Shift + 드래그 / 두 손가락
//   - 확대·축소: 휠 한 칸 약 5% (마우스가 있는 쪽으로) / 두 손가락 벌리기·오므리기
//           거리는 모델 크기의 0.6배 ~ 6배 (VIEWER_MIN_DIST · VIEWER_MAX_DIST)
//   - 손을 떼면 짧게 부드럽게 멈춰요 (관성, VIEWER_DAMPING 0.08). 움직임 줄이기 설정이면 관성 없음
//   - 더블클릭 · 더블탭 = 처음 보기
//   - 아래 버튼 줄 [정면] [옆] [위] [아래] [처음으로] [＋ 확대] [－ 축소] → 0.4초 동안 부드럽게 (움직임 줄이기면 바로)
//   - 처음 보기 = 정면에서 약 20° 위
//   - 치과 CAD 파일은 보통 Z 축이 위(삽입 방향)라서, 화면에서는 파일의 Z 축을 위로 세워서 보여 줘요
//   - 움직일 때만 그려요 (멈추면 그리기를 쉬어요) → 큰 파일도 끊기지 않고 배터리도 아껴요
//
// 참고: three@0.160.0 의 OrbitControls 는 ES 모듈 파일만 있어서, 지금처럼 three.min.js 를 쓰면
//       Three.js 를 한 번 더(두 벌) 내려받아야 해요. 그래서 같은 동작을 이 파일 안에 직접 만들었어요 (추가 다운로드 없음).

var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
var _threePromise = null;

// 조작 설정 (숫자를 바꾸면 느낌이 바뀌어요)
var VIEWER_ROTATE_PER_PX = (20 / 100) * Math.PI / 180;   // 100px 드래그 = 20°
var VIEWER_MAX_ELEVATION = 85 * Math.PI / 180;           // 위아래 최대 ±85°
var VIEWER_DEFAULT_ELEVATION = 20 * Math.PI / 180;       // 처음 보기: 정면에서 20° 위
var VIEWER_DAMPING = 0.08;                               // 관성 (작을수록 오래 미끄러짐)
var VIEWER_WHEEL_STEP = 1.05;                            // 휠 한 칸 = 5%
var VIEWER_BUTTON_ZOOM = 1.25;                           // ＋ / － 버튼 한 번 = 25%
var VIEWER_MIN_DIST = 0.6;                               // 가장 가까이 = 모델 크기 × 0.6
var VIEWER_MAX_DIST = 6;                                 // 가장 멀리 = 모델 크기 × 6
var VIEWER_START_DIST = 1.8;                             // 처음 거리 = 모델 크기 × 1.8
var VIEWER_ANIM_MS = 400;                                // 보기 버튼 이동 시간

// 보기 버튼 (az = 옆으로 돈 각도, el = 위아래 각도)
var VIEWER_VIEWS = {
  front:  { az: 0,           el: 0 },
  side:   { az: Math.PI / 2, el: 0 },
  top:    { az: 0,           el: VIEWER_MAX_ELEVATION },
  bottom: { az: 0,           el: -VIEWER_MAX_ELEVATION },
  reset:  { az: 0,           el: VIEWER_DEFAULT_ELEVATION }
};

// Three.js 한 번만 불러오기
function cncLoadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (_threePromise) return _threePromise;
  _threePromise = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = THREE_URL;
    s.async = true;
    s.onload = function () { window.THREE ? resolve(window.THREE) : reject(new Error('THREE missing')); };
    s.onerror = function () { _threePromise = null; reject(new Error('THREE load failed')); };
    document.head.appendChild(s);
  });
  return _threePromise;
}


// ===== 뷰어 상태 =====
var _viewer = {
  el: null,          // 바깥 상자 (모달)
  objectUrl: null,   // File 로 만든 임시 주소 (닫을 때 정리)
  renderer: null,
  scene: null,
  camera: null,
  mesh: null,
  shadow: null,      // 바닥의 옅은 그림자 원
  animId: null,      // 그리는 중이면 requestAnimationFrame 번호, 쉬는 중이면 null
  lastTime: 0,
  listeners: [],     // 3D 화면에 붙인 이벤트 (닫을 때 전부 뗌)
  resizeObs: null,
  orbit: null,       // 카메라 위치 { az, el, dist, target, size, ... } (_orbitCreate)
  token: 0,          // 여러 번 빠르게 열 때, 늦게 도착한 이전 파일이 화면을 덮지 않게
  lastFocus: null
};

// 움직임 줄이기 설정
function _viewerReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// 터치 화면(휴대폰 · 태블릿)인지 → 안내 문구를 다르게
function _viewerIsTouch() {
  return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

// 모달 HTML 한 번 만들기
function _viewerEnsureDom() {
  if (_viewer.el) return _viewer.el;
  var el = document.createElement('div');
  el.className = 'viewer-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML =
    '<div class="viewer-box">' +
      '<div class="viewer-head">' +
        '<div class="viewer-title" id="viewer-title"></div>' +
        '<button type="button" class="btn btn-outline btn-sm" data-viewer-close>' +
          '<span aria-hidden="true">✕</span> <span data-viewer-close-label></span></button>' +
      '</div>' +
      '<div class="viewer-body">' +
        '<div class="viewer-panel" data-panel="3d"><canvas class="viewer-canvas"></canvas></div>' +
        '<div class="viewer-panel" data-panel="image"><img class="viewer-img" alt=""></div>' +
        '<div class="viewer-panel" data-panel="pdf"><iframe class="viewer-pdf" title="PDF"></iframe></div>' +
        '<div class="viewer-panel viewer-msg" data-panel="msg"></div>' +
      '</div>' +
      // 보기 버튼 줄 (3D 일 때만 보여요) — 아이콘만 있는 버튼 없이 전부 글자 라벨
      '<div class="viewer-tools" role="toolbar" hidden>' +
        '<button type="button" class="btn btn-outline viewer-tool" data-view="front"></button>' +
        '<button type="button" class="btn btn-outline viewer-tool" data-view="side"></button>' +
        '<button type="button" class="btn btn-outline viewer-tool" data-view="top"></button>' +
        '<button type="button" class="btn btn-outline viewer-tool" data-view="bottom"></button>' +
        '<button type="button" class="btn btn-outline viewer-tool" data-view="reset"></button>' +
        '<button type="button" class="btn btn-outline viewer-tool" data-zoom="in"></button>' +
        '<button type="button" class="btn btn-outline viewer-tool" data-zoom="out"></button>' +
      '</div>' +
      '<div class="viewer-foot">' +
        '<span class="viewer-hint"></span>' +
        '<a class="btn btn-outline btn-sm viewer-download" target="_blank" rel="noopener"><span aria-hidden="true">⬇</span> <span data-viewer-dl-label></span></a>' +
      '</div>' +
    '</div>';
  document.body.appendChild(el);

  el.addEventListener('click', function (e) {
    if (e.target === el || e.target.closest('[data-viewer-close]')) { cncCloseViewer(); return; }
    var vb = e.target.closest('[data-view]');
    if (vb) { cncViewerSetView(vb.getAttribute('data-view')); return; }
    var zb = e.target.closest('[data-zoom]');
    if (zb) cncViewerZoom(zb.getAttribute('data-zoom') === 'in' ? 1 / VIEWER_BUTTON_ZOOM : VIEWER_BUTTON_ZOOM);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && el.classList.contains('open')) cncCloseViewer();
  });
  _viewer.el = el;
  return el;
}

// 글자 (언어가 바뀌었을 수 있어서 열 때마다 다시 넣어요)
function _viewerLabels() {
  var el = _viewer.el;
  el.querySelector('[data-viewer-close-label]').textContent = t('btn_close');
  el.querySelector('[data-viewer-dl-label]').textContent = t('btn_download');
  var tools = el.querySelector('.viewer-tools');
  tools.setAttribute('aria-label', t('viewer_tools_aria'));
  var map = {
    '[data-view="front"]': 'viewer_view_front',
    '[data-view="side"]': 'viewer_view_side',
    '[data-view="top"]': 'viewer_view_top',
    '[data-view="bottom"]': 'viewer_view_bottom',
    '[data-view="reset"]': 'viewer_view_reset',
    '[data-zoom="in"]': 'viewer_zoom_in',
    '[data-zoom="out"]': 'viewer_zoom_out'
  };
  Object.keys(map).forEach(function (sel) { tools.querySelector(sel).textContent = t(map[sel]); });
}

function _viewerShow(panel, message) {
  var el = _viewer.el;
  var panels = el.querySelectorAll('.viewer-panel');
  for (var i = 0; i < panels.length; i++) {
    panels[i].style.display = panels[i].getAttribute('data-panel') === panel ? '' : 'none';
  }
  if (panel === 'msg') el.querySelector('.viewer-msg').textContent = message || '';
  el.querySelector('.viewer-tools').hidden = panel !== '3d';
  el.querySelector('.viewer-hint').textContent = panel === '3d' ? t(_viewerIsTouch() ? 'viewer_hint_touch' : 'stl_viewer_hint') : '';
}


// ===== 열기 =====
async function cncOpenViewer(opts) {
  var el = _viewerEnsureDom();
  _viewerCleanup();
  var token = ++_viewer.token;
  var name = opts.name || 'file';
  var kind = fileKind(name);

  _viewer.lastFocus = document.activeElement;
  el.querySelector('#viewer-title').textContent = name;
  _viewerLabels();
  var dl = el.querySelector('.viewer-download');
  dl.removeAttribute('href');
  dl.style.visibility = 'hidden';
  el.classList.add('open');
  el.querySelector('[data-viewer-close]').focus();
  _viewerShow('msg', t('stl_loading'));

  // 1) 주소 만들기
  var url;
  try {
    if (opts.file) {
      _viewer.objectUrl = URL.createObjectURL(opts.file);
      url = _viewer.objectUrl;
    } else if (opts.getUrl) {
      url = await opts.getUrl();
    } else {
      url = opts.url;
    }
  } catch (err) {
    console.error(err);
    if (token === _viewer.token) _viewerShow('msg', t('stl_load_error'));
    return;
  }
  if (token !== _viewer.token) return;

  dl.href = url;
  dl.setAttribute('download', name);
  dl.style.visibility = '';

  // 2) 종류별로 보여 주기
  if (kind === 'image') {
    var img = el.querySelector('.viewer-img');
    img.onerror = function () { if (token === _viewer.token) _viewerShow('msg', t('stl_load_error')); };
    img.src = url;
    img.alt = name;
    _viewerShow('image');
    return;
  }
  if (kind === 'pdf') {
    el.querySelector('.viewer-pdf').src = url;
    _viewerShow('pdf');
    return;
  }
  var ext = fileExt(name);
  if (kind !== '3d' || (ext !== 'stl' && ext !== 'obj')) {
    _viewerShow('msg', t('stl_unsupported'));
    return;
  }

  // 3) 3D (STL / OBJ)
  try {
    var results = await Promise.all([
      cncLoadThree(),
      opts.file ? opts.file.arrayBuffer() : fetch(url).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      })
    ]);
    if (token !== _viewer.token) return;
    var buf = results[1];
    var geometry = ext === 'obj' ? _parseObj(buf) : (_parseBinaryStl(buf) || _parseAsciiStl(buf));
    if (!geometry) { _viewerShow('msg', t('stl_parse_error')); return; }
    _viewerShow('3d');
    _initScene();
    _showGeometry(geometry);
  } catch (err) {
    console.error(err);
    if (token === _viewer.token) _viewerShow('msg', t('stl_load_error'));
  }
}


// ===== 닫기 =====
function cncCloseViewer() {
  if (!_viewer.el) return;
  _viewer.token++;
  _viewer.el.classList.remove('open');
  _viewerCleanup();
  if (_viewer.lastFocus && _viewer.lastFocus.focus) {
    try { _viewer.lastFocus.focus(); } catch (e) { /* 무시 */ }
  }
}

// 뷰어를 닫거나 다른 파일을 열 때: 그리기 · 이벤트 · 메모리 전부 정리
function _viewerCleanup() {
  if (_viewer.animId) cancelAnimationFrame(_viewer.animId);
  _viewer.animId = null;
  // 3D 화면에 붙인 이벤트 떼기
  _viewer.listeners.forEach(function (x) { x.target.removeEventListener(x.type, x.fn, x.opts); });
  _viewer.listeners = [];
  if (_viewer.resizeObs) { _viewer.resizeObs.disconnect(); _viewer.resizeObs = null; }
  window.removeEventListener('resize', _resizeScene);
  if (_viewer.mesh) {
    _viewer.mesh.geometry.dispose();
    _viewer.mesh.material.dispose();
    _viewer.mesh = null;
  }
  if (_viewer.shadow) {
    _viewer.shadow.geometry.dispose();
    if (_viewer.shadow.material.map) _viewer.shadow.material.map.dispose();
    _viewer.shadow.material.dispose();
    _viewer.shadow = null;
  }
  if (_viewer.renderer) { _viewer.renderer.dispose(); _viewer.renderer = null; }
  _viewer.scene = null;
  _viewer.camera = null;
  _viewer.orbit = null;
  if (_viewer.objectUrl) { URL.revokeObjectURL(_viewer.objectUrl); _viewer.objectUrl = null; }
  if (_viewer.el) {
    _viewer.el.querySelector('.viewer-pdf').src = 'about:blank';
    _viewer.el.querySelector('.viewer-img').removeAttribute('src');
    var canvas = _viewer.el.querySelector('.viewer-canvas');
    canvas.classList.remove('dragging');
  }
}

// 이벤트 붙이기 (닫을 때 _viewerCleanup 이 전부 떼요)
function _viewerOn(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  _viewer.listeners.push({ target: target, type: type, fn: fn, opts: opts });
}


// ===== Three.js 장면 (밝은 배경 + 골드 모델) =====
function _initScene() {
  var THREE = window.THREE;
  var canvas = _viewer.el.querySelector('.viewer-canvas');
  var w = canvas.clientWidth || 600;
  var h = canvas.clientHeight || 400;

  _viewer.scene = new THREE.Scene();
  _viewer.scene.background = new THREE.Color(0xf1f3f6);
  _viewer.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000);
  _viewer.scene.add(_viewer.camera);

  // 조명: 환경광 + 위쪽 메인 조명 + 뒤쪽 테두리 조명 (+ 아래쪽 약한 보조)
  // 조명을 카메라에 붙여서, 어느 방향에서 봐도 보는 쪽이 밝아요
  _viewer.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  var aim = new THREE.Object3D();          // 조명이 향하는 곳 = 카메라 앞
  aim.position.set(0, 0, -1);
  _viewer.camera.add(aim);
  function camLight(intensity, x, y, z) {
    var l = new THREE.DirectionalLight(0xffffff, intensity);
    l.position.set(x, y, z);
    l.target = aim;
    _viewer.camera.add(l);
  }
  camLight(1.5, 0.6, 1.6, 0.8);     // 메인: 위 · 조금 오른쪽 앞
  camLight(0.9, -0.4, 1.0, -4.0);  // 테두리: 모델 뒤쪽 위 → 가장자리가 반짝
  camLight(0.35, -0.8, -1.2, 0.4);  // 보조: 아래 왼쪽 (밑면이 너무 어둡지 않게)

  _viewer.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  _viewer.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  _viewer.renderer.setSize(w, h, false);

  // 크기가 바뀌면 다시 맞추기 (버튼 줄이 줄바꿈되어 높이가 바뀌는 경우도)
  if (window.ResizeObserver) {
    _viewer.resizeObs = new ResizeObserver(function () { _resizeScene(); });
    _viewer.resizeObs.observe(canvas);
  } else {
    window.addEventListener('resize', _resizeScene);
  }

  _orbitBind(canvas);
}

function _resizeScene() {
  if (!_viewer.renderer || !_viewer.el) return;
  var canvas = _viewer.el.querySelector('.viewer-canvas');
  var w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  _viewer.renderer.setSize(w, h, false);
  _viewer.camera.aspect = w / h;
  _viewer.camera.updateProjectionMatrix();
  _viewerRequestRender();
}

function _showGeometry(geometry) {
  var THREE = window.THREE;
  // 치과 CAD 파일은 Z 축이 위 → 화면(Y 가 위)에 맞게 세워요
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  var box = geometry.boundingBox;
  geometry.translate(-(box.max.x + box.min.x) / 2, -(box.max.y + box.min.y) / 2, -(box.max.z + box.min.z) / 2);
  var sx = box.max.x - box.min.x, sy = box.max.y - box.min.y, sz = box.max.z - box.min.z;
  var size = Math.max(sx, sy, sz) || 10;
  _viewer.camera.near = size / 100;
  _viewer.camera.far = size * 100;
  _viewer.camera.updateProjectionMatrix();

  var mat = new THREE.MeshPhongMaterial({ color: 0xd4af37, shininess: 45, specular: 0x555555, side: THREE.DoubleSide });
  _viewer.mesh = new THREE.Mesh(geometry, mat);
  _viewer.scene.add(_viewer.mesh);

  // 바닥에 아주 옅은 그림자 원 (모델 바로 아래)
  _viewer.shadow = _makeShadow(Math.max(sx, sz) * 0.75 || size * 0.6, -sy / 2 - size * 0.01);
  if (_viewer.shadow) _viewer.scene.add(_viewer.shadow);

  _viewer.orbit = _orbitCreate(size);
  _resizeScene();
  _viewerRequestRender();
}

// 가운데가 진하고 바깥으로 갈수록 사라지는 회색 원
function _makeShadow(radius, y) {
  try {
    var THREE = window.THREE;
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0, 29, 74, 0.22)');
    grad.addColorStop(0.6, 'rgba(0, 29, 74, 0.08)');
    grad.addColorStop(1, 'rgba(0, 29, 74, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    var tex = new THREE.CanvasTexture(c);
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.renderOrder = -1;
    return m;
  } catch (e) {
    return null;   // 그림자는 덤 — 안 되면 없이
  }
}


// ===== 오비트 카메라 =====
// az = 옆으로 돈 각도(0 = 정면), el = 위아래 각도(+ = 위에서 내려다봄), dist = 중심까지 거리, target = 바라보는 중심
function _orbitCreate(size) {
  var THREE = window.THREE;
  return {
    size: size,
    az: VIEWER_VIEWS.reset.az,
    el: VIEWER_VIEWS.reset.el,
    dist: size * VIEWER_START_DIST,
    target: new THREE.Vector3(0, 0, 0),
    // 관성으로 아직 적용하지 않고 남은 움직임
    pendAz: 0,
    pendEl: 0,
    pendPan: new THREE.Vector3(0, 0, 0),
    anim: null,           // 보기 버튼 이동 { from, to, start, dur }
    pointers: {},         // 누르고 있는 손가락 · 마우스 { id: { x, y } }
    mode: null,           // 'rotate' | 'pan' | 'pinch'
    pinchDist: 0,
    pinchMid: null,
    lastTap: null,        // 더블탭 확인용 { time, x, y }
    down: null            // 이번 누름이 "톡" 인지 확인 { time, x, y, moved }
  };
}

function _orbitMinDist(o) { return o.size * VIEWER_MIN_DIST; }
function _orbitMaxDist(o) { return o.size * VIEWER_MAX_DIST; }
function _clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// 카메라를 지금 값(az · el · dist · target)에 맞게 놓기
function _orbitApply() {
  var o = _viewer.orbit, cam = _viewer.camera;
  if (!o || !cam) return;
  o.el = _clamp(o.el, -VIEWER_MAX_ELEVATION, VIEWER_MAX_ELEVATION);
  o.dist = _clamp(o.dist, _orbitMinDist(o), _orbitMaxDist(o));
  var ce = Math.cos(o.el);
  cam.position.set(
    o.target.x + o.dist * ce * Math.sin(o.az),
    o.target.y + o.dist * Math.sin(o.el),
    o.target.z + o.dist * ce * Math.cos(o.az)
  );
  cam.up.set(0, 1, 0);
  cam.lookAt(o.target);
  cam.updateMatrixWorld();
  // 아래에서 볼 때는 바닥 그림자를 숨겨요 (모델을 가리지 않게)
  if (_viewer.shadow) _viewer.shadow.visible = o.el > -0.05;
}

// 화면 1px 이 지금 거리에서 몇 mm 인지 (이동 · 확대 계산용)
function _orbitWorldPerPx(o) {
  var canvas = _viewer.el.querySelector('.viewer-canvas');
  var h = canvas.clientHeight || 400;
  return 2 * o.dist * Math.tan((_viewer.camera.fov * Math.PI / 180) / 2) / h;
}

// 회전 넣기 (드래그 픽셀)
function _orbitRotate(dx, dy) {
  var o = _viewer.orbit;
  if (!o) return;
  o.anim = null;
  o.pendAz -= dx * VIEWER_ROTATE_PER_PX;
  o.pendEl += dy * VIEWER_ROTATE_PER_PX;
  _viewerRequestRender();
}

// 이동 넣기 (드래그 픽셀) — 모델이 손가락 · 마우스를 따라와요
function _orbitPan(dx, dy) {
  var o = _viewer.orbit, cam = _viewer.camera;
  if (!o) return;
  o.anim = null;
  var per = _orbitWorldPerPx(o);
  var right = new window.THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
  var up = new window.THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  o.pendPan.addScaledVector(right, -dx * per);
  o.pendPan.addScaledVector(up, dy * per);
  _viewerRequestRender();
}

// 확대·축소 (factor < 1 = 가까이). clientX/Y 를 주면 그 지점 쪽으로 (그 지점이 화면에서 그대로 있게)
function _orbitZoomAt(factor, clientX, clientY) {
  var o = _viewer.orbit, cam = _viewer.camera;
  if (!o) return;
  o.anim = null;
  var oldDist = o.dist;
  var newDist = _clamp(oldDist * factor, _orbitMinDist(o), _orbitMaxDist(o));
  if (newDist === oldDist) return;
  if (clientX != null) {
    var canvas = _viewer.el.querySelector('.viewer-canvas');
    var r = canvas.getBoundingClientRect();
    if (r.width && r.height) {
      var nx = ((clientX - r.left) / r.width) * 2 - 1;    // -1 ~ 1
      var ny = -(((clientY - r.top) / r.height) * 2 - 1);
      var halfH = oldDist * Math.tan((cam.fov * Math.PI / 180) / 2);
      var halfW = halfH * cam.aspect;
      var right = new window.THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      var up = new window.THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      var k = 1 - newDist / oldDist;
      o.target.addScaledVector(right, nx * halfW * k);
      o.target.addScaledVector(up, ny * halfH * k);
    }
  }
  o.dist = newDist;
  _orbitApply();
  _viewerRequestRender();
}

// 보기 버튼 → 0.4초 동안 부드럽게 (움직임 줄이기면 바로)
function _orbitAnimateTo(to) {
  var o = _viewer.orbit;
  if (!o) return;
  o.pendAz = 0; o.pendEl = 0; o.pendPan.set(0, 0, 0);
  // 옆 각도는 가까운 쪽으로 돌아요 (예: 350° → 0° 는 10° 만)
  var daz = to.az - o.az;
  daz = Math.atan2(Math.sin(daz), Math.cos(daz));
  var goal = {
    az: o.az + daz,
    el: _clamp(to.el, -VIEWER_MAX_ELEVATION, VIEWER_MAX_ELEVATION),
    dist: _clamp(to.dist, _orbitMinDist(o), _orbitMaxDist(o)),
    target: to.target.clone()
  };
  if (_viewerReducedMotion()) {
    o.az = goal.az; o.el = goal.el; o.dist = goal.dist; o.target.copy(goal.target);
    o.anim = null;
    _orbitApply();
    _viewerRequestRender();
    return;
  }
  o.anim = {
    from: { az: o.az, el: o.el, dist: o.dist, target: o.target.clone() },
    to: goal,
    start: performance.now(),
    dur: VIEWER_ANIM_MS
  };
  _viewerRequestRender();
}

// 보기 버튼: 'front' | 'side' | 'top' | 'bottom' | 'reset' (정면 · 옆 · 위 · 아래 · 처음으로)
function cncViewerSetView(name) {
  var o = _viewer.orbit, v = VIEWER_VIEWS[name];
  if (!o || !v) return;
  _orbitAnimateTo({
    az: v.az,
    el: v.el,
    // 처음으로 = 처음 거리 · 가운데로. 다른 보기 = 방향만 바꾸고 중심은 가운데로, 거리는 그대로
    dist: name === 'reset' ? o.size * VIEWER_START_DIST : o.dist,
    target: new window.THREE.Vector3(0, 0, 0)
  });
}

// ＋ / － 버튼 (factor < 1 = 확대)
function cncViewerZoom(factor) {
  var o = _viewer.orbit;
  if (!o) return;
  _orbitAnimateTo({ az: o.az, el: o.el, dist: o.dist * factor, target: o.target });
}

function _ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

// 한 프레임 진행. 아직 움직일 것이 남았으면 true
function _orbitStep(now, dt) {
  var o = _viewer.orbit;
  if (!o) return false;
  var busy = false;
  if (o.anim) {
    var a = o.anim;
    var p = _clamp((now - a.start) / a.dur, 0, 1);
    var e = _ease(p);
    o.az = a.from.az + (a.to.az - a.from.az) * e;
    o.el = a.from.el + (a.to.el - a.from.el) * e;
    o.dist = a.from.dist + (a.to.dist - a.from.dist) * e;
    o.target.copy(a.from.target).lerp(a.to.target, e);
    if (p >= 1) o.anim = null; else busy = true;
  }
  // 관성: 남은 움직임의 일부만 이번 프레임에 → 손을 떼면 짧게 미끄러지다 멈춰요
  var f = _viewerReducedMotion() ? 1 : 1 - Math.pow(1 - VIEWER_DAMPING, Math.max(dt, 1) / (1000 / 60));
  if (o.pendAz || o.pendEl || o.pendPan.lengthSq()) {
    var tiny = 1e-5;
    var panTiny = o.size * 1e-5;
    if (f >= 1 || (Math.abs(o.pendAz) < tiny && Math.abs(o.pendEl) < tiny && o.pendPan.length() < panTiny)) {
      f = 1;   // 거의 다 왔으면 남은 것을 한 번에 → 멈춤
    }
    o.az += o.pendAz * f;
    o.el += o.pendEl * f;
    o.target.addScaledVector(o.pendPan, f);
    o.pendAz *= (1 - f);
    o.pendEl *= (1 - f);
    o.pendPan.multiplyScalar(1 - f);
    if (f >= 1) { o.pendAz = 0; o.pendEl = 0; o.pendPan.set(0, 0, 0); }
    else busy = true;
    // 위아래 끝에 닿으면 그 방향 남은 움직임은 버려요 (끝에서 계속 밀리는 느낌 없게)
    if ((o.el >= VIEWER_MAX_ELEVATION && o.pendEl > 0) || (o.el <= -VIEWER_MAX_ELEVATION && o.pendEl < 0)) o.pendEl = 0;
  }
  _orbitApply();
  return busy;
}

// 그리기 요청: 쉬고 있으면 다시 시작, 움직임이 끝나면 다시 쉬어요
function _viewerRequestRender() {
  if (_viewer.animId || !_viewer.renderer) return;
  _viewer.lastTime = performance.now();
  _viewer.animId = requestAnimationFrame(_viewerFrame);
}

function _viewerFrame(now) {
  _viewer.animId = null;
  if (!_viewer.renderer || !_viewer.scene || !_viewer.camera) return;
  var dt = now - (_viewer.lastTime || now);
  _viewer.lastTime = now;
  var busy = _orbitStep(now, dt);
  _viewer.renderer.render(_viewer.scene, _viewer.camera);
  if (busy) _viewer.animId = requestAnimationFrame(_viewerFrame);
}


// ===== 마우스 · 손가락 =====
function _orbitBind(canvas) {
  function pts() {
    var o = _viewer.orbit;
    return o ? Object.keys(o.pointers).map(function (k) { return o.pointers[k]; }) : [];
  }
  // 두 손가락 시작 기준 (손가락 수가 바뀔 때마다 다시 잡아서 튀지 않게)
  function startPinch() {
    var o = _viewer.orbit, p = pts();
    if (p.length < 2) return;
    o.mode = 'pinch';
    o.pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
    o.pinchMid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
  }

  _viewerOn(canvas, 'pointerdown', function (e) {
    var o = _viewer.orbit;
    if (!o) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    o.anim = null;
    o.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var n = pts().length;
    if (n >= 2) {
      startPinch();
      o.down = null;
    } else {
      var pan = e.pointerType === 'mouse' ? (e.button === 2 || e.button === 1 || e.shiftKey) : e.shiftKey;
      o.mode = pan ? 'pan' : 'rotate';
      o.down = { time: performance.now(), x: e.clientX, y: e.clientY, moved: false };
    }
    canvas.classList.add('dragging');
  });

  _viewerOn(canvas, 'pointermove', function (e) {
    var o = _viewer.orbit;
    if (!o || !o.pointers[e.pointerId]) return;
    var prev = o.pointers[e.pointerId];
    var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    prev.x = e.clientX; prev.y = e.clientY;
    if (o.down && Math.hypot(e.clientX - o.down.x, e.clientY - o.down.y) > 8) o.down.moved = true;
    if (o.mode === 'pinch') {
      var p = pts();
      if (p.length < 2) return;
      var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
      var mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      // 벌리면 가까이 (손가락 사이 가운데 쪽으로), 두 손가락을 같이 움직이면 이동
      _orbitZoomAt(o.pinchDist / d, mid.x, mid.y);
      _orbitPan(mid.x - o.pinchMid.x, mid.y - o.pinchMid.y);
      o.pinchDist = d;
      o.pinchMid = mid;
    } else if (o.mode === 'pan') {
      _orbitPan(dx, dy);
    } else if (o.mode === 'rotate') {
      _orbitRotate(dx, dy);
    }
  });

  function up(e) {
    var o = _viewer.orbit;
    if (!o || !o.pointers[e.pointerId]) return;
    delete o.pointers[e.pointerId];
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    var n = pts().length;
    if (n >= 2) { startPinch(); return; }
    if (n === 1) {
      // 두 손가락 → 한 손가락: 남은 손가락으로 회전을 이어가요
      o.mode = 'rotate';
      return;
    }
    o.mode = null;
    canvas.classList.remove('dragging');
    // 더블클릭 · 더블탭 = 처음 보기
    if (e.type === 'pointerup' && o.down && !o.down.moved && performance.now() - o.down.time < 300) {
      var now = performance.now();
      if (o.lastTap && now - o.lastTap.time < 400 && Math.hypot(e.clientX - o.lastTap.x, e.clientY - o.lastTap.y) < 30) {
        o.lastTap = null;
        cncViewerSetView('reset');
      } else {
        o.lastTap = { time: now, x: e.clientX, y: e.clientY };
      }
    } else {
      o.lastTap = null;
    }
    o.down = null;
  }
  _viewerOn(canvas, 'pointerup', up);
  _viewerOn(canvas, 'pointercancel', up);

  // 휠: 한 칸 약 5%, 마우스가 있는 쪽으로 (passive:false → 페이지가 스크롤되지 않게)
  _viewerOn(canvas, 'wheel', function (e) {
    if (!_viewer.orbit) return;
    e.preventDefault();
    var dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 33;        // 줄 단위 (Firefox)
    else if (e.deltaMode === 2) dy *= 100;  // 페이지 단위
    var steps = _clamp(dy / 100, -5, 5);    // 보통 마우스 한 칸 = 100
    if (!steps) return;
    _orbitZoomAt(Math.pow(VIEWER_WHEEL_STEP, steps), e.clientX, e.clientY);
  }, { passive: false });

  // 오른쪽 버튼 드래그 = 이동 → 메뉴가 뜨지 않게
  _viewerOn(canvas, 'contextmenu', function (e) { e.preventDefault(); });
  // 브라우저가 터치를 스크롤 · 확대로 쓰지 않게 (CSS touch-action:none 과 함께, 오래된 iOS 대비)
  _viewerOn(canvas, 'touchstart', function (e) { e.preventDefault(); }, { passive: false });
  _viewerOn(canvas, 'touchmove', function (e) { e.preventDefault(); }, { passive: false });
  _viewerOn(canvas, 'gesturestart', function (e) { e.preventDefault(); });
}


// ===== STL 해석 (Dentalk 함수를 정리해서 가져옴) =====
// 바이너리 STL: 80바이트 머리말 + 삼각형 수 + 삼각형마다 50바이트
function _parseBinaryStl(buf) {
  try {
    var THREE = window.THREE;
    if (buf.byteLength < 84) return null;
    var dv = new DataView(buf);
    var numTri = dv.getUint32(80, true);
    if (numTri === 0 || numTri > 5000000) return null;
    if (84 + numTri * 50 > buf.byteLength) return null;   // 크기가 안 맞으면 텍스트 STL
    var verts = new Float32Array(numTri * 9);
    var norms = new Float32Array(numTri * 9);
    var offset = 84;
    for (var i = 0; i < numTri; i++) {
      var nx = dv.getFloat32(offset, true), ny = dv.getFloat32(offset + 4, true), nz = dv.getFloat32(offset + 8, true);
      offset += 12;
      for (var v = 0; v < 3; v++) {
        var k = i * 9 + v * 3;
        verts[k] = dv.getFloat32(offset, true);
        verts[k + 1] = dv.getFloat32(offset + 4, true);
        verts[k + 2] = dv.getFloat32(offset + 8, true);
        norms[k] = nx; norms[k + 1] = ny; norms[k + 2] = nz;
        offset += 12;
      }
      offset += 2;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    // 파일 속 법선이 0 인 STL 도 있어서 → 그런 파일은 직접 계산
    var zeroNormals = true;
    for (var j = 0; j < Math.min(norms.length, 900); j++) { if (norms[j] !== 0) { zeroNormals = false; break; } }
    if (zeroNormals) geo.computeVertexNormals();
    else geo.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
    return geo;
  } catch (e) {
    return null;
  }
}

// 텍스트 STL: "vertex x y z" 줄을 모아요
function _parseAsciiStl(buf) {
  try {
    var THREE = window.THREE;
    var text = new TextDecoder().decode(buf);
    var verts = [];
    var re = /vertex\s+([\d.\-eE+]+)\s+([\d.\-eE+]+)\s+([\d.\-eE+]+)/g;
    var m;
    while ((m = re.exec(text)) !== null) verts.push(+m[1], +m[2], +m[3]);
    if (verts.length < 9) return null;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    geo.computeVertexNormals();
    return geo;
  } catch (e) {
    return null;
  }
}

// OBJ: "v x y z" (꼭짓점), "f a b c ..." (면) 만 읽어요
function _parseObj(buf) {
  try {
    var THREE = window.THREE;
    var text = new TextDecoder().decode(buf);
    var points = [];
    var out = [];
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var parts = lines[i].trim().split(/\s+/);
      if (parts[0] === 'v' && parts.length >= 4) {
        points.push([+parts[1], +parts[2], +parts[3]]);
      } else if (parts[0] === 'f' && parts.length >= 4) {
        var idx = parts.slice(1).map(function (p) {
          var n = parseInt(p.split('/')[0], 10);
          return n < 0 ? points.length + n : n - 1;
        });
        for (var j = 1; j < idx.length - 1; j++) {
          [idx[0], idx[j], idx[j + 1]].forEach(function (n) {
            var p = points[n];
            if (p) out.push(p[0], p[1], p[2]);
          });
        }
      }
    }
    if (out.length < 9) return null;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
    geo.computeVertexNormals();
    return geo;
  } catch (e) {
    return null;
  }
}
