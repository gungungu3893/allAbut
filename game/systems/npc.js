// ===== NPC (데스크 직원, 행인) =====
// behavior:
//   'idle'   : 제자리에 서 있고, 플레이어가 가까이 오면 그쪽을 바라봄
//   'patrol' : 정해진 두 지점 사이를 천천히 왔다갔다 (행인)
// 크기·이름표·펫은 플레이어와 같은 부품을 써요.

class Npc {
  // opts: { x, y (타일), config (아바타), label (이름표 글자), facing, behavior, path:[[x,y],[x,y]], speed (칸/초) }
  constructor(scene, opts) {
    this.scene = scene;
    this.behavior = opts.behavior || 'idle';
    this.baseDir = opts.facing || 'down';
    this.dir = this.baseDir;
    this.key = ensureCharacterTexture(scene, opts.config);
    this.x = (opts.x + 0.5) * TILE;
    this.y = (opts.y + 0.75) * TILE;

    this.sprite = scene.add.sprite(this.x, this.y, this.key, this.idleFrame());
    this.sprite.setOrigin(0.5, CHAR_FEET / CHAR_H);

    // 어깨 펫 (아바타 설정에 펫이 있으면)
    this.pet = new Pet(scene, normalizeAvatarConfig(opts.config || DEFAULT_AVATAR).pet);

    // 머리 위 이름표 (NPC 는 "Reception · Mina" 형식, 네이비 배경)
    this.nameplate = opts.label ? createNameplate(scene, { name: opts.label, kind: 'npc' }) : null;

    // 왔다갔다 경로
    if (this.behavior === 'patrol' && opts.path) {
      this.a = { x: (opts.path[0][0] + 0.5) * TILE, y: (opts.path[0][1] + 0.75) * TILE };
      this.b = { x: (opts.path[1][0] + 0.5) * TILE, y: (opts.path[1][1] + 0.75) * TILE };
      this.len = Math.hypot(this.b.x - this.a.x, this.b.y - this.a.y);
      this.pos = Math.random() * this.len;
      this.forward = true;
      this.pause = 0;
      this.speed = (opts.speed || 1) * TILE;
    }
    this.walking = false;
    this.sync();
  }

  idleFrame() {
    return CHAR_DIRS.indexOf(this.dir) * 3;
  }

  // 바라보기
  faceTowards(x, y) {
    var dx = x - this.x, dy = y - this.y;
    var d = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    this.setDir(d);
  }

  setDir(d) {
    if (d === this.dir) return;
    this.dir = d;
    if (this.walking) this.sprite.anims.play(this.key + '_walk_' + d, true);
    else this.sprite.setFrame(this.idleFrame());
  }

  setWalking(on) {
    if (on === this.walking) return;
    this.walking = on;
    if (on) this.sprite.anims.play(this.key + '_walk_' + this.dir, true);
    else { this.sprite.anims.stop(); this.sprite.setFrame(this.idleFrame()); }
  }

  // 매 프레임
  update(dt, player) {
    if (this.behavior === 'patrol' && this.len) {
      if (this.pause > 0) {
        this.pause -= dt;
        this.setWalking(false);
      } else {
        this.pos += (this.forward ? 1 : -1) * this.speed * dt;
        if (this.pos >= this.len) { this.pos = this.len; this.forward = false; this.pause = 1.5 + Math.random() * 2; }
        if (this.pos <= 0) { this.pos = 0; this.forward = true; this.pause = 1.5 + Math.random() * 2; }
        var k = this.pos / this.len;
        var from = this.forward ? this.a : this.b, to = this.forward ? this.b : this.a;
        this.x = this.a.x + (this.b.x - this.a.x) * k;
        this.y = this.a.y + (this.b.y - this.a.y) * k;
        this.faceTowards(this.x + (to.x - from.x), this.y + (to.y - from.y));
        this.setWalking(true);
      }
    } else if (player) {
      // 플레이어가 3칸 안에 오면 바라봄
      var near = Math.hypot(player.x - this.x, player.y - this.y) < 3 * TILE;
      if (near) this.faceTowards(player.x, player.y);
      else this.setDir(this.baseDir);
    }
    this.sync();
  }

  // 그림 + 펫 + 이름표 위치 맞추기
  sync() {
    var x = Math.round(this.x), y = Math.round(this.y);
    this.sprite.setPosition(x, y);
    this.sprite.setDepth(this.y);
    this.pet.update({ x: x, y: y, dir: this.dir, moving: this.walking, depth: this.y }, this.scene.time.now / 1000);
    if (this.nameplate) {
      var top = y - CHAR_HEAD_TOP;
      var petTop = this.pet.topY(y, this.dir);
      if (petTop !== null) top = Math.min(top, petTop);
      this.nameplate.setPosition(x, top - 2);
    }
  }

  // 이름표 꼭대기 y (말풍선·간판을 그 위에 두기 위해)
  get labelTop() {
    var top = this.y - CHAR_HEAD_TOP - 2;
    return this.nameplate ? top - this.nameplate.height : top;
  }
}

// 행인 외형을 seed 로 정하기 (늘 같은 사람이 나오게, 펫이 있을 수도 있어요)
function randomLook(seed) {
  var s = seed * 7919 + 17;
  function pick(list) {
    s = (s * 9301 + 49297) % 233280;
    return list[Math.floor((s / 233280) * list.length)].id;
  }
  var config = {};
  AVATAR_CATEGORIES.forEach(function (cat) {
    config[cat.key] = pick(AVATAR_CATALOG[cat.key].filter(function (i) { return !i.locked; }));
  });
  return config;
}
