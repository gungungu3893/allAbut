// ===== Phaser 게임 만들기 + 앱(로그인 흐름)과 연결 =====

var GAME_START_ZONE = 'bangkok-soi';
var LOCATION_KEY = 'allabut_location';

// 게임 전체에서 함께 쓰는 상태
var GameState = {
  game: null,       // Phaser.Game
  profile: null,    // profiles 테이블 행 (nickname, avatar)
  pending: null,    // 게임을 처음 만들 때 시작할 장면 { key, data }
  current: null,    // 지금 보이는 월드 장면 (ZoneScene / InteriorScene)
  ui: null,         // UIScene
  joystick: { active: false, x: 0, y: 0 }
};

// 주문 진행 상태 (데스크에서 주문을 마치면 true)
var order = {
  progress: { reception: false, toothmap: false, designlab: false, scandata: false, checkout: false }
};

function completeDesk(deskId) {
  if (deskId in order.progress) order.progress[deskId] = true;
}

// 다음에 가야 할 데스크 (모두 끝났으면 null)
function getNextDesk() {
  var desks = GAME_INTERIORS['allabut-shop'].desks;
  for (var i = 0; i < desks.length; i++) {
    if (!order.progress[desks[i].id]) return desks[i].id;
  }
  return null;
}


// ================================================================
//  게임 열기 / 닫기 (app.js 에서 불러요)
// ================================================================
// opts.spawn: true 면 골목 입구에서 시작 (Avatar Studio 에서 처음 입장할 때)
function openGame(profile, opts) {
  opts = opts || {};
  GameState.profile = profile || GameState.profile;

  if (typeof Phaser === 'undefined') {
    console.error('Phaser failed to load.');
    return;
  }

  // 어디서 시작할지
  var target = null;
  if (opts.spawn) {
    target = { key: 'Zone', data: { id: GAME_START_ZONE, entry: 'spawn' } };
  } else if (!GameState.current) {
    var saved = loadGameLocation();
    if (saved) {
      target = { key: GAME_ZONES[saved.scene] ? 'Zone' : 'Interior', data: { id: saved.scene, pos: saved } };
    } else {
      target = { key: 'Zone', data: { id: GAME_START_ZONE, entry: 'spawn' } };
    }
  }

  if (!GameState.game) {
    GameState.pending = target;
    GameState.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-container',
      backgroundColor: '#06090f',
      pixelArt: true,          // 픽셀아트 선명하게 (안티앨리어싱 끔)
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.RESIZE,   // 화면 크기에 맞춰 자동으로
        width: '100%',
        height: '100%'
      },
      input: { activePointers: 3 },
      scene: [BootScene, ZoneScene, InteriorScene, UIScene]
    });
    return;
  }

  // 이미 게임이 있으면: 다시 깨우기
  GameState.game.loop.wake();
  GameState.game.scale.refresh();
  if (target && GameState.current) {
    GameState.current.scene.start(target.key, target.data);
  } else if (GameState.current && GameState.current.player) {
    // Edit Avatar 갔다 온 경우: 같은 위치에서 바뀐 모습으로
    GameState.current.player.setLook(GameState.profile && GameState.profile.avatar);
  }
}

// 게임 화면을 떠날 때 (Edit Avatar, Sign Out): 위치 저장 + 멈춤
function closeGame() {
  if (GameState.current && GameState.current.saveLocation) GameState.current.saveLocation();
  if (GameState.ui) GameState.ui.closeDialog();
  if (GameState.game) GameState.game.loop.sleep();
}


// ================================================================
//  위치 저장 (새로고침하면 마지막 위치에서 시작)
//  localStorage.allabut_location = { scene, x, y, facing } (x, y 는 타일)
// ================================================================
function saveGameLocation(sceneId, x, y, facing) {
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify({ scene: sceneId, x: x, y: y, facing: facing }));
  } catch (e) { /* 저장 불가 */ }
}

function loadGameLocation() {
  try {
    var v = JSON.parse(localStorage.getItem(LOCATION_KEY) || 'null');
    // 예전 3D 버전 값({ scene, x, z })은 무시
    if (v && typeof v.x === 'number' && typeof v.y === 'number' && (GAME_ZONES[v.scene] || GAME_INTERIORS[v.scene])) return v;
  } catch (e) { /* 무시 */ }
  return null;
}


// ================================================================
//  줌: 타일이 너무 작아 보이지 않게
//  모바일은 가로로 약 13타일, PC 는 약 24타일이 보이게 (세로는 최소 15타일)
// ================================================================
function computeZoom(w, h) {
  var tilesAcross = w < 768 ? 13 : 24;
  var z = w / (tilesAcross * TILE);
  if (w >= 768) z = Math.min(z, h / (15 * TILE));
  z = Math.max(1, Math.min(3, z));
  return Math.floor(z * 4) / 4;
}

window.addEventListener('beforeunload', function () {
  if (GameState.current && GameState.current.saveLocation) GameState.current.saveLocation();
});
