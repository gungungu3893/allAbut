// ===== Avatar Studio (단순 버전 + Pet 탭) =====
// 2D 꾸미기(얼굴·머리·옷)는 다음 단계에서 다시 만들 예정이에요.
// 지금은 픽셀 캐릭터를 미리 보여 주고, "Pet" 탭에서 어깨 펫을 고를 수 있어요.
// Save & Enter 를 누르면 profiles.avatar 에 저장돼요 (펫은 avatar.pet).

var studio = {
  profile: null,      // 지금 프로필 (길드 정보 유지용)
  config: null,       // 저장할 아바타 설정
  fromWorld: false,   // 월드에서 Edit Avatar 로 왔는지 (저장 후 원래 위치로 복귀)
  tab: 'pet'          // 지금 열린 탭
};

// 탭 목록 (나중에 Face / Hair / Outfit ... 탭을 여기에 추가)
var STUDIO_TABS = [
  { key: 'pet', label: 'Pet', icon: 'paw' }
];

// 탭 아이콘 (SVG 선 아이콘)
var STUDIO_ICONS = {
  // 발바닥
  paw: '<circle cx="7" cy="9" r="2"/><circle cx="11" cy="5.5" r="2"/><circle cx="16" cy="5.5" r="2"/><circle cx="19.5" cy="10" r="2"/>' +
       '<path d="M13 11c-3 0-6 3.5-6 6.5 0 1.8 1.4 2.8 3 2.8 1.2 0 2-.6 3-.6s1.8.6 3 .6c1.6 0 3-1 3-2.8 0-3-3-6.5-6-6.5z"/>'
};


// ===== 화면 열기 =====
// profile: profiles 테이블의 행 (nickname, avatar, guild ...)
// fromWorld: 월드에서 Edit Avatar 로 왔으면 true
function openAvatarStudio(profile, fromWorld) {
  studio.profile = profile || null;
  studio.fromWorld = !!fromWorld;
  studio.config = normalizeAvatarConfig(profile && profile.avatar ? profile.avatar : DEFAULT_AVATAR);

  document.getElementById('studio-nickname').textContent = profile && profile.nickname ? profile.nickname : '';
  var err = document.getElementById('studio-error');
  err.textContent = '';
  err.className = 'auth-msg';

  renderStudioTabs();
  renderStudioItems();
  drawStudioPreview();
}

// 화면을 떠날 때 (app.js 의 화면 전환에서 불러요) - 지금은 할 일 없음
function closeAvatarStudio() {}


// ===== 탭 =====
function renderStudioTabs() {
  var box = document.getElementById('studio-tabs');
  box.innerHTML = '';
  STUDIO_TABS.forEach(function (tab) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'studio-tab' + (tab.key === studio.tab ? ' active' : '');
    btn.innerHTML =
      '<span class="studio-tab-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      STUDIO_ICONS[tab.icon] + '</svg></span>' +
      '<span class="studio-tab-label">' + tab.label + '</span>';
    btn.onclick = function () {
      studio.tab = tab.key;
      renderStudioTabs();
      renderStudioItems();
    };
    box.appendChild(btn);
  });
}


// ===== 아이템 카드 (지금은 펫) =====
function renderStudioItems() {
  var box = document.getElementById('studio-items');
  box.innerHTML = '';
  var items = AVATAR_CATALOG[studio.tab] || [];

  items.forEach(function (item) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.title = item.name + (item.price > 0 ? ' · ' + item.price : '') + (item.locked ? ' (locked)' : '');
    btn.setAttribute('aria-label', item.name);
    var selected = studio.config[studio.tab] === item.id;
    btn.className = 'studio-card' + (selected ? ' selected' : '') + (item.locked ? ' locked' : '');

    // 그림: 펫 앞모습 (펫 없음은 빈 원)
    if (studio.tab === 'pet' && item.id !== 'pet_none' && typeof drawPetFrame === 'function') {
      var c = document.createElement('canvas');
      c.width = 16;
      c.height = 16;
      var ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      drawPetFrame(ctx, item.id, 'down', false);
      btn.appendChild(c);
    } else {
      var none = document.createElement('span');
      none.className = 'studio-card-none';
      none.textContent = '∅';
      btn.appendChild(none);
    }
    var name = document.createElement('span');
    name.className = 'studio-card-name';
    name.textContent = item.name;
    btn.appendChild(name);

    // 유료 / 잠김 (지금은 전부 무료지만 구조만 준비)
    if (item.price > 0) {
      var badge = document.createElement('span');
      badge.className = 'price-badge';
      badge.textContent = item.price;
      btn.appendChild(badge);
    }
    if (item.locked) {
      var lock = document.createElement('span');
      lock.className = 'lock-icon';
      lock.textContent = '🔒';
      btn.appendChild(lock);
      btn.disabled = true;
    } else {
      btn.onclick = function () {
        studio.config[studio.tab] = item.id;
        renderStudioItems();
        drawStudioPreview();
      };
    }
    box.appendChild(btn);
  });
}


// ===== 픽셀 캐릭터 미리보기 (앞·왼쪽·오른쪽·뒤, 펫이 어깨에 올라간 모습) =====
function drawStudioPreview() {
  var canvas = document.getElementById('studio-preview-canvas');
  if (!canvas || typeof drawCharacterFrame !== 'function') return;
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  var look = characterLook(studio.config);
  var pet = studio.config.pet;
  var hasPet = pet && pet !== 'pet_none' && typeof drawPetFrame === 'function';

  ['down', 'left', 'right', 'up'].forEach(function (dir, i) {
    var spot = PET_SPOTS[dir];
    // 펫 위치: 캐릭터 발(16, 60) 기준
    var petX = 16 + spot.x - PET_SIZE / 2, petY = CHAR_FEET + spot.y - PET_SIZE;
    ctx.save();
    ctx.translate(i * CHAR_W, 0);
    if (hasPet && !spot.front) { ctx.save(); ctx.translate(petX, petY); drawPetFrame(ctx, pet, dir, false); ctx.restore(); }
    drawCharacterFrame(ctx, dir, 0, look);
    if (hasPet && spot.front) { ctx.save(); ctx.translate(petX, petY); drawPetFrame(ctx, pet, dir, false); ctx.restore(); }
    ctx.restore();
  });
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

    // 길드 정보는 저장 결과에 없으니 원래 프로필 것을 그대로 유지
    result.data.guild = studio.profile ? studio.profile.guild || null : null;

    // 저장된 프로필로 게임 입장
    // - 처음 꾸민 경우: 골목 입구에서
    // - Edit Avatar 로 온 경우: 원래 있던 위치로 복귀
    openGame(result.data, { spawn: !studio.fromWorld });
    showScreen('game');
  } catch (err) {
    console.error(err);
    showStudioError('Could not save your avatar. ' + (err.message || ''));
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}
