// ===== InteriorScene: 건물 내부 (공통) =====
// 지도 데이터는 game/config/interiors/ 에 있어요 (GAME_INTERIORS[건물id])

class InteriorScene extends WorldScene {
  constructor() {
    super('Interior');
  }

  getMapData() {
    return GAME_INTERIORS[this.mapId];
  }

  // 바닥 골드 안내선 (가로·세로 선분을 타일로 칠하기)
  paintExtras(rows, d) {
    var guide = TILE_TYPES.indexOf('guide');
    var floor = TILE_TYPES.indexOf('floor');
    var pts = d.guide || [];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
      var x = a[0], y = a[1];
      while (true) {
        if (rows[y] && rows[y][x] === floor) rows[y][x] = guide;
        if (x === b[0] && y === b[1]) break;
        if (x !== b[0]) x += dx;
        else y += dy;
      }
    }
  }

  // 데스크 + NPC + 간판 + 다음 데스크 화살표
  buildExtras(d) {
    var self = this;
    this.desks = {};

    (d.desks || []).forEach(function (dd) {
      var T = TILE;
      var mid = dd.x + Math.floor(dd.w / 2);
      var up = dd.facing === 'up';                 // 플레이어가 위(북쪽)에서 다가오는 데스크
      var npcTile = { x: mid, y: up ? dd.y + 1 : dd.y - 1 };
      var approach = { x: mid, y: up ? dd.y - 1 : dd.y + 1 };

      // 데스크 (흰 상판 + 네이비 몸체)
      var key = ensureDeskTexture(self, dd.w);
      self.add.image(dd.x * T, dd.y * T - 8, key).setOrigin(0, 0).setDepth((dd.y + 1) * T - 2);
      self.grid.blockRect(dd.x, dd.y, dd.w, 1);

      // NPC (데스크 뒤, 플레이어 쪽을 바라봄). 이름표: "Reception · Mina"
      var npc = new Npc(self, {
        x: npcTile.x, y: npcTile.y, config: dd.npc,
        label: capitalizeWords(dd.title) + ' · ' + dd.npcName,
        behavior: 'idle', facing: up ? 'up' : 'down'
      });
      self.npcs.push(npc);
      self.grid.block(npcTile.x, npcTile.y);

      // 간판 (네이비 박스 + 골드 글씨 + 번호)
      // - 아래에서 다가가는 데스크: NPC 이름표 위
      // - 위에서 다가가는 데스크: NPC 발 아래쪽 (플레이어 머리를 가리지 않게)
      var signBottom = up ? npc.y + 34 : npc.labelTop - 4;
      var sign = self.addLabelBox(npc.x, signBottom, dd.no + '  ' + dd.title, 1500000);
      var signTop = signBottom - sign.label.height;

      // 다음 데스크 화살표 / 상호작용 말풍선 위치
      var arrowY = (up ? npc.labelTop : signTop) - 4;
      var hintY = arrowY - 22;

      // 클릭 영역 (데스크 + NPC)
      var top = Math.min(dd.y, npcTile.y) * T - T;
      var item = self.addInteractable({
        kind: 'desk', deskId: dd.id, npcName: dd.npcName, title: dd.title, npc: npc,
        approach: approach, label: '💬',
        face: { x: npc.x, y: npc.y },
        anchor: { x: npc.x, y: hintY },
        rect: new Phaser.Geom.Rectangle(dd.x * T - 4, top, dd.w * T + 8, 3 * T),
        depth: (dd.y + 1) * T
      });

      self.desks[dd.id] = { data: dd, npc: npc, sign: sign, item: item, arrowY: arrowY };
    });

    // 다음 방문할 데스크 위 골드 ▼
    this.arrow = this.add.image(0, 0, ASSETS.ui.arrow).setOrigin(0.5, 1).setDepth(1500010);
  }

  updateExtras(dt, t) {
    var next = getNextDesk();
    if (next && this.desks[next]) {
      var d = this.desks[next];
      this.arrow.setVisible(true);
      this.arrow.setPosition(d.npc.x, Math.round(d.arrowY + Math.sin(t * 3) * 3));
    } else {
      this.arrow.setVisible(false);
    }
  }
}

// RECEPTION → Reception, TOOTH MAP → Tooth Map
function capitalizeWords(text) {
  return String(text).toLowerCase().replace(/(^|\s)\S/g, function (s) { return s.toUpperCase(); });
}
