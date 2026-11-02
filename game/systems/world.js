// ===== 바깥/실내 공통 장면 (ZoneScene, InteriorScene 이 이 클래스를 이어받아요) =====
// - 지도 데이터 → 바닥 타일 + 오브젝트 + 충돌 그리드
// - 클릭 이동 / 방향키 / 조이스틱
// - 상호작용 (건물 입장, 출구, NPC·데스크 대화, BTS 역)
// - 카메라 따라가기 + 줌, 장면 전환 페이드, 위치 저장

class WorldScene extends Phaser.Scene {

  // 장면을 시작할 때 받는 값: { id: 지도 id, entry: 들어오는 위치 이름, pos: {x, y} 저장된 타일 위치 }
  init(data) {
    this.mapId = data.id;
    this.entry = data.entry || null;
    this.startPos = data.pos || null;
    this.transitioning = false;
  }

  // 하위 장면이 지도 데이터를 돌려줘요
  getMapData() { return null; }
  // 하위 장면 전용 추가 작업
  buildExtras() {}
  updateExtras() {}
  paintExtras() {}

  create() {
    // 이 장면에 추가되는 글자는 모두 부드럽게 (픽셀아트 모드에서도 깨지지 않게)
    this.events.on('addedtoscene', function (obj) { if (obj.type === 'Text') smoothText(obj); });
    var d = this.mapData = this.getMapData();
    this.mapW = d.width;
    this.mapH = d.height;
    this.interactables = [];
    this.npcs = [];
    this.lastSave = 0;

    // ----- 바닥 + 충돌 그리드 -----
    this.grid = new TileGrid(d.width, d.height);
    this.buildGround(d);

    // ----- 오브젝트 -----
    var self = this;
    (d.objects || []).forEach(function (o) { self.buildObject(o); });
    this.buildExtras(d);

    // ----- 플레이어 -----
    var start = this.findStart(d);
    this.player = new Player(this, start.x, start.y, GameState.profile, start.facing);

    // ----- 클릭 마커 / 상호작용 말풍선 -----
    this.marker = this.add.image(0, 0, ASSETS.ui.marker).setVisible(false).setDepth(5);
    this.hint = smoothText(this.add.text(0, 0, '', {
      fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', color: '#0b2350',
      backgroundColor: '#ffffff', padding: { x: 4, y: 2 }, resolution: 4
    })).setOrigin(0.5, 1).setDepth(2000000).setVisible(false);
    this.hintTarget = null;

    // ----- 카메라 / 입력 -----
    this.setupCamera();
    this.setupInput();

    GameState.current = this;
    this.game.events.emit('world-ready', this);
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.saveLocation();

    this.events.once('shutdown', function () {
      self.scale.off('resize', self.onResize, self);
    });
  }


  // ================================================================
  //  바닥 타일
  // ================================================================
  buildGround(d) {
    var rows = [];
    var fill = TILE_TYPES.indexOf(d.fill || 'grass');
    for (var y = 0; y < d.height; y++) {
      var row = [];
      for (var x = 0; x < d.width; x++) row.push(fill);
      rows.push(row);
    }
    (d.paint || []).forEach(function (p) {
      var idx = TILE_TYPES.indexOf(p.tile);
      for (var ty = p.y; ty < p.y + p.h; ty++) {
        for (var tx = p.x; tx < p.x + p.w; tx++) {
          if (rows[ty] && rows[ty][tx] !== undefined) rows[ty][tx] = idx;
        }
      }
    });
    this.paintExtras(rows, d);
    this.groundRows = rows;

    // 지나갈 수 없는 바닥 (벽, 파티션 등)
    for (y = 0; y < d.height; y++) {
      for (x = 0; x < d.width; x++) {
        if (BLOCKING_TILES.indexOf(TILE_TYPES[rows[y][x]]) !== -1) this.grid.block(x, y);
      }
    }

    var map = this.make.tilemap({ data: rows, tileWidth: TILE, tileHeight: TILE });
    var tiles = map.addTilesetImage('tiles', ASSETS.tileset, TILE, TILE, 0, 0);
    var layer = map.createLayer(0, tiles, 0, 0);
    layer.setDepth(-100);
  }


  // ================================================================
  //  오브젝트 (건물, 나무, 가구 ...)
  // ================================================================
  buildObject(o) {
    var T = TILE;
    var w = o.w || 1, h = o.h || 1;
    var left = o.x * T, top = o.y * T, bottom = (o.y + h) * T;
    var anchor = { x: (o.x + w / 2) * T, y: top - 4 };  // 말풍선 위치 (기본: 위쪽 가운데)
    var img;

    switch (o.type) {
      case 'shophouse':
        img = this.add.image(left, top, ASSETS.objects.shophouse[(o.variant || 0) % 4]).setOrigin(0, 0);
        if (o.front === 'west') img.setFlipX(true);
        if (o.sign) {
          smoothText(this.add.text((o.x + w / 2) * T, (o.y + 1) * T, o.sign, {
            fontFamily: '"IBM Plex Sans", sans-serif', fontSize: '12px', fontStyle: '600',
            color: '#ffe08a', backgroundColor: 'rgba(29,42,58,0.92)', padding: { x: 6, y: 2 }, resolution: 4
          })).setOrigin(0.5).setDepth(bottom + 1);
        }
        break;

      case 'allabut_building':
        img = this.add.image(left, top, ASSETS.objects.allabutBuilding).setOrigin(0, 0);
        makeLogoText(this, (o.x + w / 2 + 0.6) * T, (o.y + h / 2) * T, 22).setDepth(bottom + 1);
        if (o.door) anchor = { x: o.door.x * T, y: o.door.y * T - 2 };
        break;

      case 'bts_station':
        img = this.add.image(left, top, ASSETS.objects.btsStation).setOrigin(0, 0);
        smoothText(this.add.text((o.x + w / 2) * T, top + 18, 'BTS · Soi allAbut', {
          fontFamily: '"IBM Plex Sans", sans-serif', fontSize: '12px', fontStyle: '600',
          color: '#ffffff', backgroundColor: '#1f6f45', padding: { x: 8, y: 2 }, resolution: 4
        })).setOrigin(0.5).setDepth(bottom + 1);
        anchor = { x: (o.x + w / 2) * T, y: bottom - 30 };
        break;

      case 'tree':
        img = this.add.image(left + T / 2, bottom + 4, ASSETS.objects.tree).setOrigin(0.5, 1);
        break;
      case 'lamp':
        img = this.add.image(left + T / 2, bottom + 2, ASSETS.objects.lamp).setOrigin(0.5, 1);
        break;
      case 'food_cart':
        img = this.add.image(left + T / 2, bottom + 4, ASSETS.objects.foodCart).setOrigin(0.5, 1);
        break;

      case 'cnc':
        img = this.add.image(left, top - 16, ASSETS.objects.cnc).setOrigin(0, 0);
        this.addLabelBox((o.x + w / 2) * T, top - 26, o.label || 'PRECISION 5μm', bottom + 2);
        // 파란 상태 표시등 깜빡임
        var light = this.add.rectangle((o.x + w / 2) * T, bottom - 12, w * T - 36, 4, 0x57d0ff).setDepth(bottom + 1);
        this.tweens.add({ targets: light, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
        // 스핀들 회전
        var spindle = this.add.rectangle((o.x + w / 2) * T, top + 26, 3, 14, 0xffd76a).setDepth(bottom + 1);
        this.tweens.add({ targets: spindle, angle: 360, duration: 500, repeat: -1 });
        break;

      case 'fdi_board':  img = this.add.image(left, top, ASSETS.objects.fdiBoard).setOrigin(0, 0); break;
      case 'cabinet':    img = this.add.image(left, top, ASSETS.objects.cabinet).setOrigin(0, 0); break;
      case 'monitors':   img = this.add.image(left, top, ASSETS.objects.monitors).setOrigin(0, 0); break;
      case 'sofa':       img = this.add.image(left, top - 8, ASSETS.objects.sofa).setOrigin(0, 0); break;
      case 'chair':      img = this.add.image(left, top - 4, ASSETS.objects.chair).setOrigin(0, 0); break;
      case 'plant':      img = this.add.image(left + T / 2, bottom + 2, ASSETS.objects.plant).setOrigin(0.5, 1); break;

      case 'exit_door':
        img = this.add.image(left, top, ASSETS.objects.exitDoor).setOrigin(0, 0);
        this.addLabelBox((o.x + w / 2) * T, top - 6, 'EXIT', top);
        anchor = { x: (o.x + w / 2) * T, y: top - 16 };
        break;

      default:
        console.warn('Unknown object type:', o.type);
        return;
    }
    if (img) img.setDepth(o.type === 'exit_door' ? -50 : bottom);

    // 충돌 (solid:false 가 아니면 차지한 칸은 지나갈 수 없음)
    if (o.solid !== false) this.grid.blockRect(o.x, o.y, w, h);

    // 클릭해서 상호작용하는 곳
    if (o.interact) {
      this.addInteractable(Object.assign({}, o.interact, {
        rect: new Phaser.Geom.Rectangle(left, top - (o.type === 'tree' ? T : 0), w * T, h * T),
        anchor: anchor,
        depth: bottom
      }));
    }
    return img;
  }

  // 네이비 박스 + 골드 테두리 + 골드 글씨 (간판)
  addLabelBox(x, y, text, depth) {
    var label = smoothText(this.add.text(x, y, text, {
      fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontStyle: '500',
      color: '#D4AF37', backgroundColor: 'rgba(11,35,80,0.95)', padding: { x: 6, y: 3 }, resolution: 4
    })).setOrigin(0.5, 1).setDepth(depth + 1);
    var border = this.add.rectangle(x, y - label.height / 2, label.width + 2, label.height + 2)
      .setStrokeStyle(1, 0xD4AF37).setDepth(depth + 2);
    return { label: label, border: border };
  }

  // item: { kind, approach:{x,y}, label, rect, anchor, depth, ... }
  addInteractable(item) {
    this.interactables.push(item);
    return item;
  }


  // ================================================================
  //  시작 위치
  // ================================================================
  findStart(d) {
    var p = null;
    if (this.startPos) {
      p = { x: this.startPos.x, y: this.startPos.y, facing: this.startPos.facing || 'down' };
    } else if (this.entry && d.entries && d.entries[this.entry]) {
      p = d.entries[this.entry];
    } else if (this.entry === 'spawn' && d.spawn) {
      p = d.spawn;
    } else {
      p = d.spawn || (d.entries && d.entries.entrance) || { x: 1, y: 1 };
    }
    var free = this.grid.nearestFree(p.x, p.y) || { x: p.x, y: p.y };
    return { x: free.x, y: free.y, facing: p.facing || 'down' };
  }


  // ================================================================
  //  카메라: 플레이어를 부드럽게 따라가고, 맵 밖은 안 보이게
  // ================================================================
  setupCamera() {
    var cam = this.cameras.main;
    cam.setBounds(0, 0, this.mapW * TILE, this.mapH * TILE);
    cam.setRoundPixels(true);
    cam.startFollow(this.player.sprite, true, 0.1, 0.1);
    cam.setBackgroundColor('#06090f');
    this.onResize();
    this.scale.on('resize', this.onResize, this);
  }

  onResize() {
    var cam = this.cameras.main;
    cam.setZoom(computeZoom(this.scale.width, this.scale.height));
  }


  // ================================================================
  //  입력
  // ================================================================
  setupInput() {
    var self = this;
    this.keys = this.input.keyboard.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
      w: 'W', a: 'A', s: 'S', d: 'D', enter: 'ENTER', space: 'SPACE'
    });
    this.input.keyboard.on('keydown-ENTER', function () { self.useHint(); });
    this.input.keyboard.on('keydown-SPACE', function () { self.useHint(); });

    this.input.on('pointerdown', function (pointer) {
      pointer.downX = pointer.x;
      pointer.downY = pointer.y;
    });
    this.input.on('pointerup', function (pointer) {
      if (self.transitioning) return;
      if (GameState.ui && GameState.ui.claimsPointer(pointer)) return;
      var moved = Math.abs(pointer.x - (pointer.downX || pointer.x)) + Math.abs(pointer.y - (pointer.downY || pointer.y));
      if (moved > 12) return;
      var p = self.cameras.main.getWorldPoint(pointer.x, pointer.y);
      self.handleClick(p.x, p.y);
    });
  }

  // 방향키 / WASD / 조이스틱 → 이동 방향
  readInput() {
    var k = this.keys, x = 0, y = 0;
    if (k.left.isDown || k.a.isDown) x -= 1;
    if (k.right.isDown || k.d.isDown) x += 1;
    if (k.up.isDown || k.w.isDown) y -= 1;
    if (k.down.isDown || k.s.isDown) y += 1;
    var j = GameState.joystick;
    if (j && j.active) { x += j.x; y += j.y; }
    return { x: x, y: y };
  }

  // 클릭(탭): 상호작용 대상 → 그 앞까지 걸어가서 실행 / 바닥 → 걸어가기
  handleClick(wx, wy) {
    if (GameState.ui) GameState.ui.closeDialog();
    var hit = null;
    this.interactables.forEach(function (it) {
      if (it.rect.contains(wx, wy) && (!hit || it.depth > hit.depth)) hit = it;
    });
    if (hit) {
      this.goInteract(hit);
      return;
    }
    var tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    var goal = this.grid.nearestFree(tx, ty);
    if (!goal) return;
    if (this.player.walkTo(goal.x, goal.y)) this.showMarker(goal.x, goal.y);
  }

  goInteract(item) {
    var self = this;
    this.showMarker(item.approach.x, item.approach.y);
    if (item.kind === 'portal' && item.message) this.say(item.anchor.x, item.anchor.y, item.message);
    this.player.walkTo(item.approach.x, item.approach.y, function () {
      self.interact(item);
    });
  }

  // 도착해서 실제로 하는 일
  interact(item) {
    if (item.face) this.player.faceTowards(item.face.x, item.face.y);
    else this.player.faceTowards(item.anchor.x, item.anchor.y + 20);

    if (item.kind === 'enter') {
      this.goToScene('Interior', { id: item.target, entry: 'entrance' });
    } else if (item.kind === 'exit') {
      var to = this.mapData.exitTo;
      this.goToScene('Zone', { id: to.zone, entry: to.entry });
    } else if (item.kind === 'portal') {
      this.say(item.anchor.x, item.anchor.y, item.message || '');
    } else if (item.kind === 'desk' && GameState.ui) {
      GameState.ui.openDialog({
        name: item.npcName,
        title: item.title,
        faceKey: item.npc ? item.npc.key : null,
        text: "Hello! I'm " + item.npcName + ' at ' + item.title + '. (dialog coming soon)'
      });
    }
  }

  // 가까이 있는 대상을 키보드(Enter/Space)로 실행
  useHint() {
    if (this.hintTarget && !this.transitioning) this.interact(this.hintTarget);
  }


  // ================================================================
  //  화면 효과: 클릭 마커, 말풍선
  // ================================================================
  showMarker(tx, ty) {
    var m = this.marker;
    m.setPosition((tx + 0.5) * TILE, (ty + 0.6) * TILE).setVisible(true).setAlpha(1).setScale(0.6);
    this.tweens.killTweensOf(m);
    this.tweens.add({ targets: m, scale: 1.3, alpha: 0, duration: 900, onComplete: function () { m.setVisible(false); } });
  }

  // 3초 동안 보이는 말풍선
  say(x, y, text) {
    if (this.bubble) this.bubble.destroy();
    var b = this.bubble = smoothText(this.add.text(x, y, text, {
      fontFamily: '"IBM Plex Sans", sans-serif', fontSize: '11px', fontStyle: '600',
      color: '#0b2350', backgroundColor: '#ffffff', padding: { x: 7, y: 4 }, resolution: 4
    })).setOrigin(0.5, 1).setDepth(3000000);
    this.tweens.add({ targets: b, alpha: 0, delay: 2600, duration: 400, onComplete: function () { b.destroy(); } });
  }


  // ================================================================
  //  장면 전환 (검게 페이드아웃 → 새 장면 → 페이드인, 0.5초)
  // ================================================================
  goToScene(key, data) {
    if (this.transitioning) return;
    this.transitioning = true;
    this.player.stop();
    if (GameState.ui) GameState.ui.closeDialog();
    var self = this;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', function () {
      self.scene.start(key, data);
    });
  }


  // ================================================================
  //  매 프레임
  // ================================================================
  update(time, delta) {
    var dt = Math.min(0.05, delta / 1000);
    if (!this.transitioning) {
      var input = this.readInput();
      if ((input.x || input.y) && GameState.ui) GameState.ui.closeDialog();
      this.player.update(dt, input);
    }
    var player = this.player;
    this.npcs.forEach(function (n) { n.update(dt, player); });
    this.updateExtras(dt, time / 1000);
    this.updateHint();

    if (time - this.lastSave > 1000) {
      this.saveLocation();
      this.lastSave = time;
    }
  }

  // 가까이 있는 대상 위에 "💬" / "▶ Enter" 표시
  updateHint() {
    var px = this.player.tileX, py = this.player.tileY;
    var best = null, bestD = 2.1;
    this.interactables.forEach(function (it) {
      var d = Math.max(Math.abs(it.approach.x - px), Math.abs(it.approach.y - py));
      if (d < bestD) { bestD = d; best = it; }
    });
    this.hintTarget = best;
    if (best && !this.player.moving) {
      var bob = Math.sin(this.time.now / 250) * 2;
      this.hint.setText(best.label || '💬').setPosition(best.anchor.x, best.anchor.y + bob).setVisible(true);
    } else {
      this.hint.setVisible(false);
    }
  }

  saveLocation() {
    saveGameLocation(this.mapId, this.player.tileX, this.player.tileY, this.player.dir);
  }
}


// ----- allAbut 로고 글자 (all·but 가늘게, A 크고 굵게, 5μm 위첨자) -----
function makeLogoText(scene, cx, cy, size) {
  var c = scene.add.container(cx, cy);
  var thin = { fontFamily: '"IBM Plex Sans", sans-serif', fontSize: size + 'px', fontStyle: '200', color: '#ffffff', resolution: 3 };
  var bold = { fontFamily: '"IBM Plex Sans", sans-serif', fontSize: Math.round(size * 1.33) + 'px', fontStyle: '600', color: '#D4AF37', resolution: 3 };
  var mono = { fontFamily: '"IBM Plex Mono", monospace', fontSize: Math.max(6, Math.round(size * 0.32)) + 'px', color: '#D4AF37', resolution: 4 };
  var all = smoothText(scene.add.text(0, 0, 'all', thin)).setOrigin(0, 1);
  var A = smoothText(scene.add.text(0, 0, 'A', bold)).setOrigin(0, 1);
  var but = smoothText(scene.add.text(0, 0, 'but', thin)).setOrigin(0, 1);
  var um = smoothText(scene.add.text(0, 0, '5μm', mono)).setOrigin(0, 0);
  var total = all.width + A.width + but.width + um.width;
  var x = -total / 2;
  var baseY = size * 0.45;
  all.setPosition(x, baseY + size * 0.12); x += all.width;
  A.setPosition(x, baseY + size * 0.18); x += A.width;
  but.setPosition(x, baseY + size * 0.12); x += but.width;
  um.setPosition(x + 1, baseY - size * 0.95);
  c.add([all, A, but, um]);
  return c;
}
