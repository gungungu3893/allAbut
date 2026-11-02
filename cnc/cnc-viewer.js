// ===== 파일 뷰어 (3D · 이미지 · PDF) =====
// - 3D: STL(바이너리·텍스트), OBJ 는 화면에서 돌려 볼 수 있어요. PLY·3MF 는 다운로드만.
// - Three.js 는 무거워서 뷰어를 "처음 열 때만" 불러와요 (three@0.160.0 고정)
// - 내 컴퓨터 파일(File) → 바로 미리보기 / 올라간 파일(path) → 서명 URL(1시간)로 보기
//
// 사용법:
//   cncOpenViewer({ name: 'upper.stl', file: File })                  ← 업로드 전
//   cncOpenViewer({ name: 'upper.stl', getUrl: function () { return promise } })  ← 업로드 후

var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
var _threePromise = null;

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
  animId: null,
  dragging: false,
  prevX: 0,
  prevY: 0,
  token: 0,          // 여러 번 빠르게 열 때, 늦게 도착한 이전 파일이 화면을 덮지 않게
  lastFocus: null
};

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
      '<div class="viewer-foot">' +
        '<span class="viewer-hint"></span>' +
        '<a class="btn btn-outline btn-sm viewer-download" target="_blank" rel="noopener"><span aria-hidden="true">⬇</span> <span data-viewer-dl-label></span></a>' +
      '</div>' +
    '</div>';
  document.body.appendChild(el);

  el.addEventListener('click', function (e) {
    if (e.target === el || e.target.closest('[data-viewer-close]')) cncCloseViewer();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && el.classList.contains('open')) cncCloseViewer();
  });
  _viewer.el = el;
  return el;
}

function _viewerShow(panel, message) {
  var el = _viewer.el;
  var panels = el.querySelectorAll('.viewer-panel');
  for (var i = 0; i < panels.length; i++) {
    panels[i].style.display = panels[i].getAttribute('data-panel') === panel ? '' : 'none';
  }
  if (panel === 'msg') el.querySelector('.viewer-msg').textContent = message || '';
  el.querySelector('.viewer-hint').textContent = panel === '3d' ? t('stl_viewer_hint') : '';
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
  el.querySelector('[data-viewer-close-label]').textContent = t('btn_close');
  el.querySelector('[data-viewer-dl-label]').textContent = t('btn_download');
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

function _viewerCleanup() {
  if (_viewer.animId) cancelAnimationFrame(_viewer.animId);
  _viewer.animId = null;
  if (_viewer.mesh) {
    _viewer.mesh.geometry.dispose();
    _viewer.mesh.material.dispose();
    _viewer.mesh = null;
  }
  if (_viewer.renderer) { _viewer.renderer.dispose(); _viewer.renderer = null; }
  _viewer.scene = null;
  if (_viewer.objectUrl) { URL.revokeObjectURL(_viewer.objectUrl); _viewer.objectUrl = null; }
  if (_viewer.el) {
    _viewer.el.querySelector('.viewer-pdf').src = 'about:blank';
    _viewer.el.querySelector('.viewer-img').removeAttribute('src');
  }
  window.removeEventListener('resize', _resizeScene);
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
  _viewer.camera.position.set(0, 0, 200);
  _viewer.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  var light = new THREE.DirectionalLight(0xffffff, 1.0);
  light.position.set(1, 2, 3);
  _viewer.scene.add(light);
  var back = new THREE.DirectionalLight(0xffffff, 0.4);
  back.position.set(-2, -1, -2);
  _viewer.scene.add(back);

  _viewer.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  _viewer.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  _viewer.renderer.setSize(w, h, false);
  window.addEventListener('resize', _resizeScene);

  // 마우스 · 손가락으로 돌리기, 휠로 확대/축소
  function rotate(dx, dy) {
    if (!_viewer.mesh) return;
    _viewer.mesh.rotation.y += dx * 0.01;
    _viewer.mesh.rotation.x += dy * 0.01;
  }
  canvas.onpointerdown = function (e) {
    _viewer.dragging = true; _viewer.prevX = e.clientX; _viewer.prevY = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  };
  canvas.onpointermove = function (e) {
    if (!_viewer.dragging) return;
    rotate(e.clientX - _viewer.prevX, e.clientY - _viewer.prevY);
    _viewer.prevX = e.clientX; _viewer.prevY = e.clientY;
  };
  canvas.onpointerup = canvas.onpointercancel = function () { _viewer.dragging = false; };
  canvas.onwheel = function (e) {
    e.preventDefault();
    var z = _viewer.camera.position.z * (e.deltaY > 0 ? 1.1 : 0.9);
    _viewer.camera.position.z = Math.max(1, Math.min(5000, z));
  };
}

function _resizeScene() {
  if (!_viewer.renderer) return;
  var canvas = _viewer.el.querySelector('.viewer-canvas');
  var w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  _viewer.renderer.setSize(w, h, false);
  _viewer.camera.aspect = w / h;
  _viewer.camera.updateProjectionMatrix();
}

function _showGeometry(geometry) {
  var THREE = window.THREE;
  geometry.computeBoundingBox();
  var box = geometry.boundingBox;
  geometry.translate(-(box.max.x + box.min.x) / 2, -(box.max.y + box.min.y) / 2, -(box.max.z + box.min.z) / 2);
  var size = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) || 10;
  _viewer.camera.position.z = size * 1.8;
  _viewer.camera.near = size / 100;
  _viewer.camera.far = size * 100;
  _viewer.camera.updateProjectionMatrix();

  var mat = new THREE.MeshPhongMaterial({ color: 0xd4af37, shininess: 60, specular: 0x444444, side: THREE.DoubleSide });
  _viewer.mesh = new THREE.Mesh(geometry, mat);
  _viewer.scene.add(_viewer.mesh);
  _resizeScene();

  (function loop() {
    if (!_viewer.renderer) return;
    _viewer.animId = requestAnimationFrame(loop);
    _viewer.renderer.render(_viewer.scene, _viewer.camera);
  })();
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
    geo.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
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
