// ===== Avatar Studio (단순 버전) =====
// 2D 꾸미기 화면은 다음 단계에서 다시 만들 예정이에요.
// 지금은 기본 아바타(또는 이미 저장된 아바타)를 픽셀 캐릭터로 보여 주고, Save & Enter 로 저장만 해요.

var studio = {
  config: null,       // 저장할 아바타 설정
  fromWorld: false    // 월드에서 Edit Avatar 로 왔는지 (저장 후 원래 위치로 복귀)
};


// ===== 화면 열기 =====
// profile: profiles 테이블의 행 (nickname, avatar)
// fromWorld: 월드에서 Edit Avatar 로 왔으면 true
function openAvatarStudio(profile, fromWorld) {
  studio.fromWorld = !!fromWorld;
  studio.config = normalizeAvatarConfig(profile && profile.avatar ? profile.avatar : DEFAULT_AVATAR);

  document.getElementById('studio-nickname').textContent = profile && profile.nickname ? profile.nickname : '';
  var err = document.getElementById('studio-error');
  err.textContent = '';
  err.className = 'auth-msg';
  drawStudioPreview();
}

// 화면을 떠날 때 (app.js 의 화면 전환에서 불러요) - 지금은 할 일 없음
function closeAvatarStudio() {}


// ===== 픽셀 캐릭터 미리보기 (앞·왼쪽·오른쪽·뒤) =====
function drawStudioPreview() {
  var canvas = document.getElementById('studio-preview-canvas');
  if (!canvas || typeof drawCharacterFrame !== 'function' || typeof Phaser === 'undefined') return;
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  var look = characterLook(studio.config);
  ['down', 'left', 'right', 'up'].forEach(function (dir, i) {
    ctx.save();
    ctx.translate(i * 32, 0);
    drawCharacterFrame(ctx, dir, 0, look);
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
