// ===== 플레이어 이동 (바깥/실내 공통) =====
// - 클릭(탭) 이동: A* 길찾기로 장애물을 돌아서 걸어가요
// - 방향키 / WASD / 모바일 조이스틱: 누르는 방향으로 바로 걸어가요 (벽에 막히면 미끄러지듯)
// 위치는 "발 밑" 픽셀 좌표예요.

var PLAYER_SPEED = 4 * TILE;   // 초당 4칸
var FEET_HALF_W = 9;           // 발 충돌 상자 (가로 반)
var FEET_HALF_H = 5;           // 발 충돌 상자 (세로 반)

class Player {
  // tx, ty: 시작 타일 / facing: 'up' | 'down' | 'left' | 'right'
  constructor(scene, tx, ty, config, facing) {
    this.scene = scene;
    this.x = (tx + 0.5) * TILE;
    this.y = (ty + 0.75) * TILE;
    this.dir = facing || 'down';
    this.path = [];
    this.onArrive = null;
    this.moving = false;

    this.key = ensureCharacterTexture(scene, config);
    this.sprite = scene.add.sprite(this.x, this.y, this.key, this.idleFrame());
    this.sprite.setOrigin(0.5, 0.9);
    this.sync();
  }

  // 아바타가 바뀌면 그림만 바꾸기
  setLook(config) {
    this.key = ensureCharacterTexture(this.scene, config);
    this.sprite.setTexture(this.key, this.idleFrame());
  }

  idleFrame() {
    return CHAR_DIRS.indexOf(this.dir) * 3;
  }

  get tileX() { return Math.floor(this.x / TILE); }
  get tileY() { return Math.floor(this.y / TILE); }

  // 특정 타일로 바로 옮기기
  placeAt(tx, ty, facing) {
    this.x = (tx + 0.5) * TILE;
    this.y = (ty + 0.75) * TILE;
    if (facing) this.dir = facing;
    this.stop();
    this.sync();
  }

  // 클릭 이동: 목표 타일까지 길찾기 → 걸어가기. 도착하면 onArrive 실행
  walkTo(tx, ty, onArrive) {
    var path = this.scene.grid.findPath(this.tileX, this.tileY, tx, ty);
    if (!path) return false;
    this.path = path.map(function (p) { return { x: (p.x + 0.5) * TILE, y: (p.y + 0.75) * TILE }; });
    this.onArrive = onArrive || null;
    if (!this.path.length) this.arrive();
    return true;
  }

  stop() {
    this.path = [];
    this.onArrive = null;
    this.setMoving(false);
  }

  arrive() {
    this.path = [];
    this.setMoving(false);
    var done = this.onArrive;
    this.onArrive = null;
    if (done) done();
  }

  // 바라보기 (월드 픽셀 좌표 쪽으로)
  faceTowards(x, y) {
    var dx = x - this.x, dy = y - this.y;
    this.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    if (!this.moving) this.sprite.setFrame(this.idleFrame());
  }

  setMoving(on) {
    this.moving = on;
    if (on) {
      this.sprite.anims.play(this.key + '_walk_' + this.dir, true);
    } else {
      this.sprite.anims.stop();
      this.sprite.setFrame(this.idleFrame());
    }
  }

  // 발 충돌 상자가 지나갈 수 없는 칸에 걸리는지
  canStand(x, y) {
    var g = this.scene.grid;
    var pts = [[x - FEET_HALF_W, y - FEET_HALF_H], [x + FEET_HALF_W, y - FEET_HALF_H], [x - FEET_HALF_W, y + FEET_HALF_H], [x + FEET_HALF_W, y + FEET_HALF_H]];
    for (var i = 0; i < pts.length; i++) {
      if (!g.isFree(Math.floor(pts[i][0] / TILE), Math.floor(pts[i][1] / TILE))) return false;
    }
    return true;
  }

  // 매 프레임: input = { x, y } 직접 조작 방향 (-1~1), 없으면 길 따라가기
  update(dt, input) {
    var step = PLAYER_SPEED * dt;
    var vx = 0, vy = 0;

    if (input && (Math.abs(input.x) > 0.15 || Math.abs(input.y) > 0.15)) {
      // 방향키 / 조이스틱: 클릭 이동은 취소
      if (this.path.length) this.stop();
      var len = Math.min(1, Math.sqrt(input.x * input.x + input.y * input.y));
      var nx = input.x / (Math.sqrt(input.x * input.x + input.y * input.y) || 1);
      var ny = input.y / (Math.sqrt(input.x * input.x + input.y * input.y) || 1);
      vx = nx * step * len;
      vy = ny * step * len;
      // 벽에 막히면 막히지 않은 축으로만 (미끄러지듯)
      if (this.canStand(this.x + vx, this.y)) this.x += vx; else vx = 0;
      if (this.canStand(this.x, this.y + vy)) this.y += vy; else vy = 0;
    } else if (this.path.length) {
      var target = this.path[0];
      var dx = target.x - this.x, dy = target.y - this.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= step) {
        this.x = target.x;
        this.y = target.y;
        this.path.shift();
        vx = dx; vy = dy;
        if (!this.path.length) {
          this.sync();
          this.arrive();
          return;
        }
      } else {
        vx = dx / dist * step;
        vy = dy / dist * step;
        this.x += vx;
        this.y += vy;
      }
    }

    var moved = Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01;
    if (moved) {
      var newDir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : (vy < 0 ? 'up' : 'down');
      if (newDir !== this.dir || !this.moving) {
        this.dir = newDir;
        this.setMoving(true);
      }
    } else if (this.moving) {
      this.setMoving(false);
    }
    this.sync();
  }

  sync() {
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y));
    this.sprite.setDepth(this.y);
  }
}
