// ===== 캐릭터 머리 위 이름표 (플레이어 · 다른 유저 · NPC 공통) =====
// 위에서 아래로:
//   1줄: 칭호 (있을 때만, 작은 골드 글씨)          예) VIP Clinic
//   2줄: [길드태그] 닉네임 (태그는 길드 색 둥근 배지) 예) [5μm] gungun
// 글자 뒤에 반투명 둥근 배경 → 어떤 바닥 위에서도 잘 보여요.
// NPC 는 "Reception · Mina" 형식 + 네이비 배경.

// 테스트용: true 로 바꾸면 내 이름표에 샘플 길드 [5μm] (골드) + 칭호 "Founder" 를 보여줘요
var DEBUG_SHOW_SAMPLE_GUILD = false;

var NAMEPLATE_FONT = '"IBM Plex Mono", monospace';

// 이름표 만들기
// opts: { name, title, guild: { tag, color }, kind: 'player' | 'user' | 'npc' }
function createNameplate(scene, opts) {
  return new Nameplate(scene, opts);
}

// 프로필(profiles 행) → 이름표 정보
function nameplateFromProfile(profile, isMe) {
  var p = profile || {};
  var info = {
    name: p.nickname || '',
    title: p.title || '',
    guild: p.guild ? { tag: p.guild.tag, color: p.guild.color } : null,
    kind: isMe ? 'player' : 'user'
  };
  if (isMe && DEBUG_SHOW_SAMPLE_GUILD) {
    info.guild = { tag: '5μm', color: '#D4AF37' };
    info.title = 'Founder';
  }
  return info;
}

class Nameplate {
  constructor(scene, opts) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(1000000);
    this.setInfo(opts || {});
  }

  // 내용 바꾸기 (길드 가입, 칭호 변경 등)
  setInfo(opts) {
    this.opts = opts;
    this.container.removeAll(true);

    var npc = opts.kind === 'npc';
    var pad = 3, gap = 3;
    var items = [];

    // 2줄: [배지] 이름
    var nameText = this.scene.add.text(0, 0, opts.name || '', {
      fontFamily: NAMEPLATE_FONT, fontSize: '9px', fontStyle: '500',
      color: '#ffffff', resolution: 4
    }).setOrigin(0, 0.5);
    smoothText(nameText);

    var badge = null, badgeText = null, badgeW = 0;
    if (opts.guild && opts.guild.tag) {
      badgeText = this.scene.add.text(0, 0, opts.guild.tag, {
        fontFamily: NAMEPLATE_FONT, fontSize: '7px', fontStyle: '600',
        color: textColorFor(opts.guild.color), resolution: 4
      }).setOrigin(0.5);
      smoothText(badgeText);
      badgeW = badgeText.width + 6;
      badge = this.scene.add.graphics();
      badge.fillStyle(hexToInt(opts.guild.color || '#D4AF37'), 1);
      badge.fillRoundedRect(-badgeW / 2, -5, badgeW, 10, 5);
    }

    var row2W = nameText.width + (badge ? badgeW + gap : 0);
    var row2H = 11;

    // 1줄: 칭호
    var titleText = null, row1H = 0;
    if (opts.title) {
      titleText = this.scene.add.text(0, 0, opts.title, {
        fontFamily: NAMEPLATE_FONT, fontSize: '7px', color: '#D4AF37', resolution: 4
      }).setOrigin(0.5, 0.5);
      smoothText(titleText);
      row1H = 9;
    }

    var w = Math.max(row2W, titleText ? titleText.width : 0) + pad * 2;
    var h = row1H + row2H + pad;

    // 배경 (둥근 사각형). 컨테이너의 (0,0) = 이름표 아래 가운데
    var bg = this.scene.add.graphics();
    bg.fillStyle(npc ? 0x0b2350 : 0x000000, npc ? 0.88 : 0.55);
    bg.fillRoundedRect(-w / 2, -h, w, h, 4);
    if (npc) {
      bg.lineStyle(1, 0xD4AF37, 0.6);
      bg.strokeRoundedRect(-w / 2, -h, w, h, 4);
    }
    items.push(bg);

    // 배치
    var row2Y = -pad / 2 - row2H / 2;
    var x = -row2W / 2;
    if (badge) {
      badge.setPosition(x + badgeW / 2, row2Y);
      badgeText.setPosition(x + badgeW / 2, row2Y);
      items.push(badge, badgeText);
      x += badgeW + gap;
    }
    nameText.setPosition(x, row2Y);
    items.push(nameText);
    if (titleText) {
      titleText.setPosition(0, -h + pad / 2 + row1H / 2);
      items.push(titleText);
    }

    this.container.add(items);
    this.height = h;
  }

  // 이름표 아래 가운데를 (x, bottomY) 에 두기
  setPosition(x, bottomY) {
    this.container.setPosition(Math.round(x), Math.round(bottomY));
  }

  setVisible(on) {
    this.container.setVisible(on);
  }

  destroy() {
    this.container.destroy(true);
  }
}


// ----- 도우미 -----

// 픽셀아트 모드에서도 글자는 부드럽게 (확대·축소해도 깨지지 않게)
function smoothText(t) {
  if (t && t.texture && Phaser.Textures && Phaser.Textures.FilterMode) {
    t.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  return t;
}

function hexToInt(hex) {
  return parseInt(String(hex || '#D4AF37').replace('#', ''), 16);
}

// 배경색이 밝으면 어두운 글씨, 어두우면 흰 글씨
function textColorFor(hex) {
  var n = hexToInt(hex);
  var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 0.299 + g * 0.587 + b * 0.114) > 150 ? '#0b2350' : '#ffffff';
}
