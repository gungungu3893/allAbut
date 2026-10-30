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
  rotY: 0,
  dragging: false,
  lastX: 0,
  width: 0,
  height: 0
};


// ===== 화면 열기 =====
// profile: profiles 테이블의 행 (nickname, avatar)
function openAvatarStudio(profile) {
  document.getElementById('studio-nickname').textContent = profile && profile.nickname ? profile.nickname : '';
  document.getElementById('studio-error').textContent = '';
  document.getElementById('studio-error').className = 'auth-msg';

  // 저장된 아바타가 있으면 그걸로, 없으면 기본 아바타로 시작
  studio.config = normalizeAvatarConfig(profile && profile.avatar ? profile.avatar : DEFAULT_AVATAR);
  studio.category = AVATAR_CATEGORIES[0].key;

  if (typeof THREE === 'undefined') {
    showStudioError('3D engine failed to load. Please check your connection and refresh.');
    renderStudioTabs();
    renderStudioItems();
    return;
  }

  if (!studio.ready) initStudioScene();

  renderStudioTabs();
  renderStudioItems();
  rebuildStudioAvatar();
  startStudioLoop();
}

// ===== 화면 닫기 (애니메이션 루프 정지) =====
function closeAvatarStudio() {
  studio.running = false;
  if (studio.rafId) cancelAnimationFrame(studio.rafId);
  studio.rafId = null;
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

  // --- 조명 ---
  // 부드러운 전체 조명
  studio.scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5368, 1.5));
  // 앞쪽 위에서 비추는 조명
  var key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1.5, 4, 5);
  studio.scene.add(key);
  // 뒤쪽 골드 림라이트 (윤곽이 금색으로 빛나게)
  var rim = new THREE.DirectionalLight(0xD4AF37, 3.2);
  rim.position.set(-2, 3, -4);
  studio.scene.add(rim);
  var rim2 = new THREE.DirectionalLight(0xD4AF37, 2.0);
  rim2.position.set(2.5, 1.5, -3);
  studio.scene.add(rim2);

  // --- 골드 원형 받침대 ---
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

  // --- 마우스/손가락 드래그로 돌리기 ---
  canvas.addEventListener('pointerdown', function (e) {
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
    if (!studio.dragging) studio.rotY += 0.003; // 아주 천천히 자동 회전
    studio.holder.rotation.y = studio.rotY;
    if (studio.avatar) animateIdle(studio.avatar, t);

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


// ===== 카테고리 탭 그리기 =====
function renderStudioTabs() {
  var box = document.getElementById('studio-tabs');
  box.innerHTML = '';
  AVATAR_CATEGORIES.forEach(function (cat) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'studio-tab' + (cat.key === studio.category ? ' active' : '');
    btn.textContent = cat.label;
    btn.onclick = function () {
      studio.category = cat.key;
      renderStudioTabs();
      renderStudioItems();
    };
    box.appendChild(btn);
  });
}


// ===== 아이템 그리드 그리기 =====
function renderStudioItems() {
  var box = document.getElementById('studio-items');
  box.innerHTML = '';

  var items = AVATAR_CATALOG[studio.category];
  var isColor = items.length > 0 && !!items[0].color;
  box.className = 'studio-items ' + (isColor ? 'colors' : 'cards');

  items.forEach(function (item) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.title = item.name;

    var selected = studio.config[studio.category] === item.id;
    btn.className = (isColor ? 'color-chip' : 'item-card') +
      (selected ? ' selected' : '') +
      (item.locked ? ' locked' : '');

    if (isColor) {
      btn.style.background = item.color;
    } else {
      btn.textContent = item.name;
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
}


// ===== 아이템 선택 =====
function selectStudioItem(category, id) {
  var item = getCatalogItem(category, id);
  if (!item || item.locked) return;
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

    showScreen('shop');
  } catch (err) {
    console.error(err);
    showStudioError('Could not save your avatar. ' + (err.message || ''));
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}
