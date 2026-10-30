// ===== Avatar Studio (아바타 꾸미기 화면) =====

var studio = {
  ready: false,       // 3D 장면을 이미 만들었는지
  running: false,     // 애니메이션 루프가 돌고 있는지
  rafId: null,
  renderer: null,
  scene: null,
  camera: null,
  clock: null,
  holder: null,       // 캐릭터를 담는 그룹 (이걸 돌려서 회전)
  avatar: null,       // 지금 보이는 캐릭터
  config: null,       // 지금 선택된 꾸미기 값
  category: 'gender', // 지금 열린 탭
  rotY: 0,            // 캐릭터 회전 각도 (0 = 정면)
  dragging: false,
  lastX: 0,
  width: 0,
  height: 0
};


// ===== 탭 아이콘 (SVG 선 아이콘, 골드 선) =====
var STUDIO_TAB_ICONS = {
  // 성별 ⚥
  gender: '<circle cx="11" cy="11" r="4.5"/><path d="M14.3 7.7L19 3M15.5 3H19v3.5M11 15.5V21M8.5 18.5h5"/>',
  // 피부 (물방울)
  skin: '<path d="M12 3c3.6 4.6 6 7.9 6 11a6 6 0 0 1-12 0c0-3.1 2.4-6.4 6-11z"/>',
  // 얼굴 윤곽
  face: '<path d="M12 3c-4.4 0-7 3.3-7 8 0 5.2 3.4 10 7 10s7-4.8 7-10c0-4.7-2.6-8-7-8z"/><path d="M9.5 15.5c1.4 1 3.6 1 5 0"/>',
  // 눈
  eyes: '<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
  // 코
  nose: '<path d="M12.5 4v9.5"/><path d="M12.5 13.5c1.6.5 3.2 1.3 3.2 2.8 0 1.5-1.5 2.2-3 2.2-1 0-1.6-.5-2.4-.5-.7 0-1.3.4-2 .4-1 0-1.8-.7-1.8-1.6 0-.8.6-1.4 1.4-1.7"/>',
  // 입
  mouth: '<path d="M3.5 11c2.6 1 5.3 1.5 8.5 1.5s5.9-.5 8.5-1.5"/><path d="M3.5 11c1.6 4 4.6 6.2 8.5 6.2s6.9-2.2 8.5-6.2"/>',
  // 머리 (헤어)
  hair: '<path d="M4 15c0-6.5 3.6-11 8-11s8 4.5 8 11"/><path d="M4 15v4M20 15v4"/><path d="M6.5 11c2.2-.3 4.2-1.4 5.5-3.3 1.3 1.9 3.3 3 5.5 3.3"/>',
  // 머리색 (팔레트)
  hairColor: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1.1.2-2.2 1.4-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11.5" r="1.1"/><circle cx="9.8" cy="7.3" r="1.1"/><circle cx="14.8" cy="7.3" r="1.1"/>',
  // 옷 (티셔츠)
  outfit: '<path d="M8.5 3.5L3 6.5l2 4.2 2.2-1V20.5h9.6V9.7l2.2 1 2-4.2-5.5-3c-.6 1.5-2 2.4-3.5 2.4s-2.9-.9-3.5-2.4z"/>'
};

function studioIconSvg(key) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (STUDIO_TAB_ICONS[key] || '') + '</svg>';
}


// ===== 화면 열기 =====
// profile: profiles 테이블의 행 (nickname, avatar)
function openAvatarStudio(profile) {
  document.getElementById('studio-nickname').textContent = profile && profile.nickname ? profile.nickname : '';
  document.getElementById('studio-error').textContent = '';
  document.getElementById('studio-error').className = 'auth-msg';

  // 저장된 아바타가 있으면 그걸로, 없으면 기본 아바타로 시작
  studio.config = normalizeAvatarConfig(profile && profile.avatar ? profile.avatar : DEFAULT_AVATAR);
  studio.category = AVATAR_CATEGORIES[0].key;
  studio.rotY = 0; // 정면부터 시작

  renderStudioTabs();

  if (typeof THREE === 'undefined') {
    showStudioError('3D engine failed to load. Please check your connection and refresh.');
    renderStudioItems();
    return;
  }

  if (!studio.ready) initStudioScene();

  renderStudioItems();
  rebuildStudioAvatar();
  startStudioLoop();
}

// ===== 화면 닫기 (애니메이션 루프 정지) =====
function closeAvatarStudio() {
  studio.running = false;
  studio.dragging = false;
  if (studio.rafId) cancelAnimationFrame(studio.rafId);
  studio.rafId = null;
  previewJob++; // 만들던 미리보기 작업도 중단
}


// ===== 조명 넣기 (큰 화면과 미리보기에서 똑같이 사용) =====
function addStudioLights(scene) {
  // 부드러운 전체 조명
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5368, 1.5));
  // 앞쪽 위에서 비추는 조명
  var key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1.5, 4, 5);
  scene.add(key);
  // 뒤쪽 골드 림라이트 (윤곽이 금색으로 빛나게)
  var rim = new THREE.DirectionalLight(0xD4AF37, 3.2);
  rim.position.set(-2, 3, -4);
  scene.add(rim);
  var rim2 = new THREE.DirectionalLight(0xD4AF37, 2.0);
  rim2.position.set(2.5, 1.5, -3);
  scene.add(rim2);
}


// ===== 3D 장면 만들기 (처음 한 번만) =====
function initStudioScene() {
  var canvas = document.getElementById('studio-canvas');

  studio.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  studio.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  studio.scene = new THREE.Scene();
  studio.clock = new THREE.Clock();

  studio.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  studio.camera.position.set(0, 1.45, 6.2);
  studio.camera.lookAt(0, 1.12, 0);

  addStudioLights(studio.scene);

  // --- 은은한 골드 원형 받침대 ---
  var pedestal = new THREE.Group();
  pedestal.rotation.x = -Math.PI / 2;
  pedestal.position.y = 0.002;

  var disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 48),
    new THREE.MeshBasicMaterial({ color: 0xD4AF37, transparent: true, opacity: 0.05, depthWrite: false })
  );
  var ring = new THREE.Mesh(
    new THREE.RingGeometry(0.84, 0.86, 64),
    new THREE.MeshBasicMaterial({ color: 0xD4AF37, transparent: true, opacity: 0.55, depthWrite: false })
  );
  var glow = new THREE.Mesh(
    new THREE.RingGeometry(0.74, 1.05, 64),
    new THREE.MeshBasicMaterial({ color: 0xD4AF37, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  var glow2 = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 0.92, 64),
    new THREE.MeshBasicMaterial({ color: 0xD4AF37, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  pedestal.add(disc, glow, glow2, ring);
  studio.scene.add(pedestal);

  // 캐릭터를 담을 그룹
  studio.holder = new THREE.Group();
  studio.scene.add(studio.holder);

  // --- 드래그로 돌리기 ---
  // PC: 마우스 왼쪽 버튼을 누른 채 좌우로 드래그 / 모바일: 손가락 드래그
  // 손을 떼면 그 자리에서 멈춰요 (자동 회전 없음)
  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return; // 왼쪽 버튼만
    studio.dragging = true;
    studio.lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!studio.dragging) return;
    studio.rotY += (e.clientX - studio.lastX) * 0.012;
    studio.lastX = e.clientX;
  });
  function endDrag() { studio.dragging = false; }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);

  // 화면 크기 바뀌면 캔버스 크기 맞추기
  window.addEventListener('resize', resizeStudio);

  studio.ready = true;
}


// ===== 캔버스 크기를 미리보기 영역에 맞추기 =====
function resizeStudio() {
  if (!studio.ready) return;
  var wrap = document.getElementById('studio-preview');
  var w = wrap.clientWidth;
  var h = wrap.clientHeight;
  if (w === 0 || h === 0) return;               // 아직 화면에 안 보이는 중
  if (w === studio.width && h === studio.height) return;

  studio.width = w;
  studio.height = h;
  studio.renderer.setSize(w, h, false);
  studio.camera.aspect = w / h;
  // 화면이 세로로 길면(좁으면) 조금 멀리서 보기
  studio.camera.position.z = w / h < 0.8 ? 7.6 : 6.2;
  studio.camera.updateProjectionMatrix();
}


// ===== 애니메이션 루프 =====
function startStudioLoop() {
  if (studio.running) return;
  studio.running = true;

  function loop() {
    if (!studio.running) return;
    studio.rafId = requestAnimationFrame(loop);

    resizeStudio(); // 화면 전환 직후 크기가 정해지는 경우도 처리

    var t = studio.clock.getElapsedTime();
    studio.holder.rotation.y = studio.rotY;   // 드래그한 만큼만 회전
    if (studio.avatar) animateIdle(studio.avatar, t); // 숨쉬기만 유지

    studio.renderer.render(studio.scene, studio.camera);
  }
  loop();
}


// ===== 캐릭터 다시 만들기 =====
function rebuildStudioAvatar() {
  if (!studio.ready) return;
  if (studio.avatar) {
    studio.holder.remove(studio.avatar);
    disposeAvatar(studio.avatar);
  }
  studio.avatar = buildAvatar(studio.config);
  studio.holder.add(studio.avatar);
}


// ================================================================
//  아이템 미리보기 이미지 만들기
//  - 작은 렌더러(128x128) 하나로 "그 아이템을 적용한 캐릭터"를 찍어서 이미지로 저장
//  - 탭을 열 때 그 탭 것만 만들고, 한 번 만든 이미지는 캐시에 보관
//  - 캐시 이름에 "아이템을 적용한 전체 설정"이 들어가서,
//    다른 파츠(피부, 머리 등)를 바꾸면 자동으로 새 이미지가 만들어져요
// ================================================================
var PREVIEW_SIZE = 128;
var previewCache = {};     // { 캐시이름: 이미지 주소(dataURL) }
var previewCacheCount = 0;
var previewJob = 0;        // 탭이 바뀌면 숫자가 올라가서 이전 작업을 멈춰요
var preview = null;        // 미리보기용 렌더러, 장면, 카메라

// 카테고리별 카메라 위치
// face: 얼굴 정면 클로즈업 / hair: 머리 모양이 잘 보이게 비스듬히 / upper: 상반신
var PREVIEW_SHOTS = {
  face:  { camY: 1.94, camZ: 2.6, lookY: 1.9,  rotY: 0.18 },
  hair:  { camY: 1.98, camZ: 2.8, lookY: 1.86, rotY: 0.85 },
  upper: { camY: 1.62, camZ: 3.8, lookY: 1.5,  rotY: 0.3 }  // 허리·치마 라인까지 보이게
};
var PREVIEW_SHOT_OF = {
  gender: 'upper', outfit: 'upper',
  skin: 'face', face: 'face', eyes: 'face', nose: 'face',
  mouth: 'face', hair: 'hair', hairColor: 'face'
};

function initPreviewRenderer() {
  var canvas = document.createElement('canvas'); // 화면에 붙이지 않는 캔버스 (오프스크린)
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2); // 선명하게 (실제 픽셀 256x256)
  renderer.setSize(PREVIEW_SIZE, PREVIEW_SIZE, false);
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  addStudioLights(scene);

  var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);

  preview = { renderer: renderer, scene: scene, camera: camera };
}

// 아이템 하나의 미리보기 이미지 만들기
function renderItemPreview(category, itemId) {
  var cfg = {};
  for (var key in studio.config) cfg[key] = studio.config[key];
  cfg[category] = itemId;

  var shot = PREVIEW_SHOTS[PREVIEW_SHOT_OF[category] || 'face'];
  var cacheKey = (PREVIEW_SHOT_OF[category] || 'face') + '|' + JSON.stringify(cfg);
  if (previewCache[cacheKey]) return previewCache[cacheKey];

  if (!preview) initPreviewRenderer();

  var avatar = buildAvatar(cfg);
  avatar.rotation.y = shot.rotY;
  preview.scene.add(avatar);

  preview.camera.position.set(0, shot.camY, shot.camZ);
  preview.camera.lookAt(0, shot.lookY, 0);
  preview.renderer.render(preview.scene, preview.camera);
  var url = preview.renderer.domElement.toDataURL('image/png');

  preview.scene.remove(avatar);
  disposeAvatar(avatar);

  // 캐시가 너무 커지면 비우기
  if (previewCacheCount > 300) {
    previewCache = {};
    previewCacheCount = 0;
  }
  previewCache[cacheKey] = url;
  previewCacheCount++;
  return url;
}

// 지금 탭의 카드들에 미리보기 이미지를 하나씩 채우기 (화면이 멈추지 않게 조금씩)
function fillStudioPreviews() {
  if (typeof THREE === 'undefined') return;
  var job = ++previewJob;
  var category = studio.category;
  var imgs = Array.prototype.slice.call(document.querySelectorAll('#studio-items img[data-item]'));
  var i = 0;

  function next() {
    if (job !== previewJob) return; // 탭이 바뀌었거나 화면을 떠났으면 중단
    // 한 번에 2개씩 만들고 다음 프레임에 이어서
    for (var n = 0; n < 2 && i < imgs.length; n++, i++) {
      var img = imgs[i];
      try {
        img.src = renderItemPreview(category, img.getAttribute('data-item'));
        img.parentNode.classList.remove('loading');
      } catch (err) {
        console.error('Preview failed:', err);
      }
    }
    if (i < imgs.length) requestAnimationFrame(next);
  }
  next();
}


// ===== 카테고리 탭 그리기 (아이콘 그리드) =====
function renderStudioTabs() {
  var box = document.getElementById('studio-tabs');
  box.innerHTML = '';
  AVATAR_CATEGORIES.forEach(function (cat) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'studio-tab' + (cat.key === studio.category ? ' active' : '');
    btn.title = cat.label;
    btn.innerHTML =
      '<span class="studio-tab-icon">' + studioIconSvg(cat.key) + '</span>' +
      '<span class="studio-tab-label">' + cat.label + '</span>';
    btn.onclick = function () {
      if (studio.category === cat.key) return;
      studio.category = cat.key;
      renderStudioTabs();
      renderStudioItems();
    };
    box.appendChild(btn);
  });
}


// ===== 아이템 그리드 그리기 (그림 카드) =====
function renderStudioItems() {
  var box = document.getElementById('studio-items');
  box.innerHTML = '';
  box.scrollTop = 0;

  var items = AVATAR_CATALOG[studio.category];

  items.forEach(function (item) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.title = item.name + (item.price > 0 ? ' · ' + item.price : '') + (item.locked ? ' (locked)' : '');
    btn.setAttribute('aria-label', item.name);

    var selected = studio.config[studio.category] === item.id;
    btn.className = 'item-card loading' + (selected ? ' selected' : '') + (item.locked ? ' locked' : '');

    // 미리보기 그림 (fillStudioPreviews 가 채워요)
    var img = document.createElement('img');
    img.alt = '';
    img.setAttribute('data-item', item.id);
    btn.appendChild(img);

    // 색상 아이템: 동그란 색 칩
    if (item.color) {
      var chip = document.createElement('span');
      chip.className = 'color-dot';
      chip.style.background = item.color;
      btn.appendChild(chip);
    }

    // 유료 아이템: 가격 뱃지
    if (item.price > 0) {
      var badge = document.createElement('span');
      badge.className = 'price-badge';
      badge.textContent = item.price;
      btn.appendChild(badge);
    }

    // 잠긴 아이템: 자물쇠 + 선택 불가
    if (item.locked) {
      var lock = document.createElement('span');
      lock.className = 'lock-icon';
      lock.textContent = '🔒';
      btn.appendChild(lock);
      btn.disabled = true;
    } else {
      btn.onclick = function () { selectStudioItem(studio.category, item.id); };
    }

    box.appendChild(btn);
  });

  fillStudioPreviews();
}


// ===== 아이템 선택 =====
function selectStudioItem(category, id) {
  var item = getCatalogItem(category, id);
  if (!item || item.locked) return;
  if (studio.config[category] === id) return;
  studio.config[category] = id;
  renderStudioItems();
  rebuildStudioAvatar();
}


// ===== 🎲 Random (무작위 조합) =====
function randomizeAvatar() {
  AVATAR_CATEGORIES.forEach(function (cat) {
    var choices = AVATAR_CATALOG[cat.key].filter(function (item) { return !item.locked; });
    if (choices.length === 0) return;
    studio.config[cat.key] = choices[Math.floor(Math.random() * choices.length)].id;
  });
  renderStudioItems();
  rebuildStudioAvatar();
}


// ===== 에러 표시 =====
function showStudioError(text) {
  var el = document.getElementById('studio-error');
  el.textContent = text;
  el.className = 'auth-msg error';
}


// ===== Save & Enter → =====
async function saveAvatar() {
  var button = document.getElementById('studio-save-btn');
  var label = 'Save & Enter →';
  document.getElementById('studio-error').textContent = '';

  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    var session = await getSession();
    if (!session) throw new Error('You are signed out. Please sign in again.');

    var result = await sb
      .from('profiles')
      .update({ avatar: studio.config, updated_at: new Date().toISOString() })
      .eq('id', session.user.id)
      .select()
      .single();
    if (result.error) throw result.error;

    // 저장된 프로필로 매장 열기 (바뀐 아바타가 매장에 바로 반영됨)
    openShop(result.data);
    showScreen('shop');
  } catch (err) {
    console.error(err);
    showStudioError('Could not save your avatar. ' + (err.message || ''));
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}
