// ===== ZoneScene: 바깥 지역 (어느 지역이든 같은 코드) =====
// 지도 데이터는 game/config/zones/ 에 있어요 (GAME_ZONES[지역id])

class ZoneScene extends WorldScene {
  constructor() {
    super('Zone');
  }

  getMapData() {
    return GAME_ZONES[this.mapId];
  }

  // 뚝뚝 + 행인
  buildExtras(d) {
    var self = this;
    this.movers = [];

    (d.movers || []).forEach(function (m) {
      var a = { x: (m.path[0][0] + 0.5) * TILE, y: (m.path[0][1] + 0.5) * TILE };
      var b = { x: (m.path[1][0] + 0.5) * TILE, y: (m.path[1][1] + 0.5) * TILE };
      var img = self.add.image(a.x, a.y, ASSETS.objects.tuktuk).setOrigin(0.5, 0.75);
      self.movers.push({
        img: img, a: a, b: b,
        len: Math.hypot(b.x - a.x, b.y - a.y),
        pos: 0, forward: true, pause: 0,
        speed: (m.speed || 2) * TILE
      });
    });

    (d.pedestrians || []).forEach(function (p) {
      self.npcs.push(new Npc(self, {
        x: p.path[0][0], y: p.path[0][1],
        config: randomLook(p.seed || 1),
        behavior: 'patrol', path: p.path, speed: p.speed
      }));
    });
  }

  updateExtras(dt) {
    this.movers.forEach(function (m) {
      if (m.pause > 0) { m.pause -= dt; return; }
      m.pos += (m.forward ? 1 : -1) * m.speed * dt;
      if (m.pos >= m.len) { m.pos = m.len; m.forward = false; m.pause = 1.5; }
      if (m.pos <= 0) { m.pos = 0; m.forward = true; m.pause = 1.5; }
      var k = m.pos / m.len;
      var x = m.a.x + (m.b.x - m.a.x) * k;
      var y = m.a.y + (m.b.y - m.a.y) * k;
      m.img.setPosition(Math.round(x), Math.round(y)).setDepth(y + 8);
      // 그림은 위쪽을 향해 있어서, 아래로 갈 때는 뒤집기
      var goingDown = (m.b.y - m.a.y) * (m.forward ? 1 : -1) > 0;
      m.img.setFlipY(goingDown);
    });
  }
}
