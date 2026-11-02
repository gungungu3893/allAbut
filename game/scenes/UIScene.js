// ===== UIScene: 화면 위에 고정되는 UI =====
// - 왼쪽 위: 작은 allAbut 로고 + 현재 위치 이름
// - 오른쪽 위: 닉네임 / 세션 타이머 + [+1h] / Edit Avatar / Sign Out
// - 오른쪽 아래: 미니맵
// - 아래: NPC 대화창, 처음 안내 문구
// - 모바일: 왼쪽 아래 가상 조이스틱

var UI_FONT = '"IBM Plex Mono", monospace';
var UI_GOLD = '#D4AF37';

// 미니맵 바닥 색
var MINIMAP_TILE_COLORS = {
  grass: 0x4f7a3e, asphalt: 0x3b3d42, roadLine: 0xe8b923, crosswalk: 0xcfcfc8, sidewalk: 0xb8b3aa,
  plaza: 0xcbbfa9, floor: 0xcfc8bd, guide: 0xD4AF37, wall: 0xf4f2ee, partition: 0x9fc6d8,
  carpet: 0xc9a13a, dark: 0x06090f, empty: 0x06090f
};

class UIScene extends Phaser.Scene {
  constructor() {
    super('UI');
  }

  create() {
    GameState.ui = this;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.dialogOpen = false;

    this.buildTopLeft();
    this.buildTopRight();
    this.buildMinimap();
    this.buildDialog();
    this.buildJoystick();
    this.buildBanner();

    this.scale.on('resize', this.layout, this);
    this.layout();

    this.game.events.on('world-ready', this.onWorldReady, this);
    if (GameState.current) this.onWorldReady(GameState.current);

    this.time.addEvent({ delay: 250, loop: true, callback: this.updateSession, callbackScope: this });
    this.updateSession();
  }

  textStyle(size, color, extra) {
    var s = { fontFamily: UI_FONT, fontSize: size + 'px', color: color || '#ffffff', resolution: this.dpr * 2 };
    if (extra) for (var k in extra) s[k] = extra[k];
    return s;
  }

  // ================================================================
  //  왼쪽 위: 로고 + 위치 이름
  // ================================================================
  buildTopLeft() {
    this.logoBg = this.add.graphics();   // 글자가 지도와 겹쳐도 잘 보이게 어두운 배경
    this.logo = makeLogoText(this, 0, 0, 16);
    this.locationText = this.add.text(0, 0, '', this.textStyle(10, UI_GOLD, { letterSpacing: 1 }));
  }

  // ================================================================
  //  오른쪽 위: 닉네임 / 세션 타이머 / +1h / Edit Avatar / Sign Out
  // ================================================================
  buildTopRight() {
    var self = this;
    this.panel = this.add.graphics();
    this.nickText = this.add.text(0, 0, '', this.textStyle(11, '#e8ebf1'));
    this.timerText = this.add.text(0, 0, '--:--', this.textStyle(11, UI_GOLD));
    this.extendBtn = this.add.text(0, 0, '+1h', this.textStyle(10, UI_GOLD, { padding: { x: 6, y: 2 } }));
    this.extendBorder = this.add.graphics();
    this.editBtn = this.add.text(0, 0, 'Edit Avatar', this.textStyle(11, '#8892a4'));
    this.signOutBtn = this.add.text(0, 0, 'Sign Out', this.textStyle(11, '#8892a4'));

    function button(t, onClick) {
      t.setInteractive({ useHandCursor: true });
      t.on('pointerover', function () { t.setColor(UI_GOLD); });
      t.on('pointerout', function () { if (t !== self.extendBtn) t.setColor('#8892a4'); });
      t.on('pointerdown', function (pointer) { pointer.usedByUI = true; });
      t.on('pointerup', onClick);
    }
    button(this.extendBtn, function () { self.onExtend(); });
    button(this.editBtn, function () { if (typeof editAvatar === 'function') editAvatar(); });
    button(this.signOutBtn, function () { if (typeof endSession === 'function') endSession('manual'); });
  }

  onExtend() {
    var self = this;
    var ok = typeof extendSession === 'function' ? extendSession() : false;
    this.extendBtn.setText(ok ? '+1h ✓' : 'Max 3h');
    this.layout();
    this.time.delayedCall(1500, function () { self.extendBtn.setText('+1h'); self.layout(); });
    this.updateSession();
  }

  // 남은 시간 (10분 이하 주황, 5분 이하 빨강 + 깜빡임)
  updateSession() {
    if (typeof getRemaining !== 'function') return;
    var left = getRemaining();
    this.timerText.setText('◷ ' + formatRemaining(left));
    var color = left <= 5 * 60 * 1000 ? '#ff5c5c' : (left <= 10 * 60 * 1000 ? '#ff9f43' : UI_GOLD);
    this.timerText.setColor(color);
    this.timerText.setAlpha(left <= 5 * 60 * 1000 ? (Math.floor(this.time.now / 800) % 2 ? 0.35 : 1) : 1);
    var nick = GameState.profile && GameState.profile.nickname ? '@' + GameState.profile.nickname : '';
    if (this.nickText.text !== nick) {
      this.nickText.setText(nick.length > 16 ? nick.slice(0, 15) + '…' : nick);
      this.layout();
    }
  }

  // ================================================================
  //  오른쪽 아래: 미니맵
  // ================================================================
  buildMinimap() {
    this.miniBg = this.add.graphics();
    this.miniMap = this.add.graphics();
    this.miniLabels = [];
    this.miniDot = this.add.graphics();
    this.miniNext = this.add.graphics();
  }

  // 장면이 바뀌면 미니맵을 다시 그려요
  drawMinimap(world) {
    var g = this.miniMap;
    g.clear();
    this.miniLabels.forEach(function (l) { l.destroy(); });
    this.miniLabels = [];
    if (!world || !world.groundRows) return;

    var box = this.miniSize;
    var s = Math.min((box - 12) / world.mapW, (box - 12) / world.mapH);
    var ox = this.miniX + (box - world.mapW * s) / 2;
    var oy = this.miniY + (box - world.mapH * s) / 2;
    this.miniTransform = { s: s, ox: ox, oy: oy };

    // 바닥
    for (var y = 0; y < world.mapH; y++) {
      for (var x = 0; x < world.mapW; x++) {
        g.fillStyle(MINIMAP_TILE_COLORS[TILE_TYPES[world.groundRows[y][x]]] || 0x000000, 1);
        g.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s));
      }
    }
    // 건물
    var self = this;
    (world.mapData.objects || []).forEach(function (o) {
      var r = [ox + o.x * s, oy + o.y * s, (o.w || 1) * s, (o.h || 1) * s];
      if (o.type === 'shophouse') {
        g.fillStyle(Phaser.Display.Color.HexStringToColor(SHOPHOUSE_COLORS[(o.variant || 0) % 4]).color, 1);
        g.fillRect(r[0], r[1], r[2], r[3]);
      } else if (o.type === 'allabut_building') {
        g.fillStyle(0x0b2350, 1); g.fillRect(r[0], r[1], r[2], r[3]);
        g.lineStyle(1, 0xD4AF37, 1); g.strokeRect(r[0], r[1], r[2], r[3]);
        self.drawStar(g, r[0] + r[2] / 2, r[1] + r[3] / 2, 5);
      } else if (o.type === 'bts_station') {
        g.fillStyle(0x2f9e5b, 1); g.fillRect(r[0], r[1], r[2], r[3]);
      } else if (o.type === 'cnc') {
        g.lineStyle(1, 0x57d0ff, 1); g.strokeRect(r[0], r[1], r[2], r[3]);
      }
    });
    // 실내: 구역 이름 + 데스크 번호
    (world.mapData.rooms || []).forEach(function (room) {
      var t = self.add.text(ox + (room.x + room.w / 2) * s, oy + room.y * s + 2, room.name, self.textStyle(6, '#0b2350')).setOrigin(0.5, 0);
      self.miniLabels.push(t);
    });
    (world.mapData.desks || []).forEach(function (dd) {
      var cx = ox + (dd.x + dd.w / 2) * s, cy = oy + (dd.y + 0.5) * s;
      g.fillStyle(0xD4AF37, 1); g.fillCircle(cx, cy, 5);
      var t = self.add.text(cx, cy, dd.no, self.textStyle(6, '#0b2350', { fontStyle: '600' })).setOrigin(0.5);
      self.miniLabels.push(t);
    });
  }

  drawStar(g, x, y, r) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 ? r * 0.45 : r;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
    }
    g.fillStyle(0xD4AF37, 1);
    g.fillPoints(pts, true);
  }

  // ================================================================
  //  대화창 (네이비 반투명 + 골드 테두리)
  // ================================================================
  buildDialog() {
    this.dlg = this.add.container(0, 0).setVisible(false);
    this.dlgBg = this.add.graphics();
    this.dlgFaceBg = this.add.graphics();
    this.dlgFace = this.add.image(0, 0, ASSETS.ui.marker).setVisible(false);
    this.dlgName = this.add.text(0, 0, '', this.textStyle(11, UI_GOLD, { letterSpacing: 2 }));
    this.dlgText = this.add.text(0, 0, '', {
      fontFamily: '"IBM Plex Sans", sans-serif', fontSize: '15px', color: '#e8ebf1',
      lineSpacing: 4, resolution: this.dpr * 2, wordWrap: { width: 400 }
    });
    this.dlgMore = this.add.text(0, 0, '▼', this.textStyle(10, UI_GOLD)).setOrigin(1, 1);
    this.dlg.add([this.dlgBg, this.dlgFaceBg, this.dlgFace, this.dlgName, this.dlgText, this.dlgMore]);
    this.tweens.add({ targets: this.dlgMore, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });

    var self = this;
    // 대화창이 열려 있을 때 클릭: 타이핑 중이면 바로 전체 표시, 다 보였으면 닫기
    this.input.on('pointerdown', function (pointer) {
      pointer.usedByDialog = self.dialogOpen;
    });
    this.input.on('pointerup', function (pointer) {
      if (!pointer.usedByDialog || !self.dialogOpen) return;
      if (self.typing) self.finishTyping();
      else self.closeDialog();
    });
  }

  // opts: { name, title, text, faceKey }
  openDialog(opts) {
    this.dialogOpen = true;
    this.dlg.setVisible(true);
    this.dlgName.setText((opts.name || '').toUpperCase() + (opts.title ? '  ·  ' + opts.title : ''));
    if (opts.faceKey && this.textures.exists(opts.faceKey)) {
      this.dlgFace.setTexture(opts.faceKey, 0).setVisible(true);
    } else {
      this.dlgFace.setVisible(false);
    }
    this.layout();
    this.typeText(opts.text || '');
  }

  closeDialog() {
    if (!this.dialogOpen) return;
    this.dialogOpen = false;
    this.dlg.setVisible(false);
    if (this.typeTimer) this.typeTimer.remove();
    this.typing = false;
  }

  // 한 글자씩 타이핑 (초당 약 40자)
  typeText(text) {
    var self = this;
    if (this.typeTimer) this.typeTimer.remove();
    this.fullText = text;
    this.shown = 0;
    this.typing = true;
    this.dlgText.setText('');
    this.dlgMore.setVisible(false);
    this.typeTimer = this.time.addEvent({
      delay: 25, loop: true, callback: function () {
        self.shown++;
        self.dlgText.setText(self.fullText.slice(0, self.shown));
        if (self.shown >= self.fullText.length) self.finishTyping();
      }
    });
  }

  finishTyping() {
    if (this.typeTimer) this.typeTimer.remove();
    this.typing = false;
    this.dlgText.setText(this.fullText);
    this.dlgMore.setVisible(true);
  }

  // ================================================================
  //  모바일 가상 조이스틱 (왼쪽 아래, 손 떼면 사라짐)
  // ================================================================
  buildJoystick() {
    var self = this;
    this.joyBase = this.add.circle(0, 0, 46, 0xffffff, 0.12).setStrokeStyle(2, 0xD4AF37, 0.5).setVisible(false);
    this.joyKnob = this.add.circle(0, 0, 20, 0xD4AF37, 0.45).setVisible(false);
    GameState.joystick = { active: false, x: 0, y: 0 };

    this.input.on('pointerdown', function (pointer) {
      pointer.usedByJoystick = false;
      var touch = pointer.wasTouch || pointer.pointerType === 'touch';
      if (!touch || self.dialogOpen || pointer.usedByUI) return;
      if (pointer.x > self.scale.width * 0.45 || pointer.y < self.scale.height * 0.45) return;
      pointer.usedByJoystick = true;
      self.joyPointer = pointer;
      self.joyBase.setPosition(pointer.x, pointer.y).setVisible(true);
      self.joyKnob.setPosition(pointer.x, pointer.y).setVisible(true);
      GameState.joystick.active = true;
      GameState.joystick.x = 0;
      GameState.joystick.y = 0;
    });
    this.input.on('pointermove', function (pointer) {
      if (pointer !== self.joyPointer || !GameState.joystick.active) return;
      var dx = pointer.x - self.joyBase.x, dy = pointer.y - self.joyBase.y;
      var len = Math.sqrt(dx * dx + dy * dy), max = 40;
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      self.joyKnob.setPosition(self.joyBase.x + dx, self.joyBase.y + dy);
      GameState.joystick.x = dx / max;
      GameState.joystick.y = dy / max;
    });
    this.input.on('pointerup', function (pointer) {
      if (pointer !== self.joyPointer) return;
      self.joyPointer = null;
      self.joyBase.setVisible(false);
      self.joyKnob.setVisible(false);
      GameState.joystick.active = false;
      GameState.joystick.x = 0;
      GameState.joystick.y = 0;
    });
  }

  // 월드 장면이 이 클릭을 무시해야 하는지 (UI 버튼, 대화창, 조이스틱, 미니맵 위)
  claimsPointer(pointer) {
    var used = pointer.usedByUI || pointer.usedByJoystick || pointer.usedByDialog;
    pointer.usedByUI = false; // 다음 클릭을 위해 초기화
    if (used) return true;
    var x = pointer.x, y = pointer.y;
    if (this.panelRect && Phaser.Geom.Rectangle.Contains(this.panelRect, x, y)) return true;
    if (x >= this.miniX && x <= this.miniX + this.miniSize && y >= this.miniY && y <= this.miniY + this.miniSize) return true;
    return false;
  }

  // ================================================================
  //  처음 안내 문구
  // ================================================================
  buildBanner() {
    this.banner = this.add.text(0, 0, '', this.textStyle(12, UI_GOLD, {
      backgroundColor: 'rgba(12,16,24,0.8)', padding: { x: 14, y: 7 }
    })).setOrigin(0.5, 1).setVisible(false);
  }

  showBanner(text, ms) {
    var self = this;
    this.banner.setText(text).setVisible(true).setAlpha(1);
    this.layout();
    if (this.bannerTimer) this.bannerTimer.remove();
    this.bannerTimer = this.time.delayedCall(ms, function () {
      self.tweens.add({ targets: self.banner, alpha: 0, duration: 400, onComplete: function () { self.banner.setVisible(false); } });
    });
  }

  // ================================================================
  //  월드 장면이 바뀌었을 때
  // ================================================================
  onWorldReady(world) {
    this.world = world;
    this.closeDialog();
    this.locationText.setText(world.mapData.label || world.mapData.name || '');
    this.layout();
    this.drawMinimap(world);
    if (world.entry === 'spawn') {
      this.showBanner('Click to walk · Find the allAbut shop', 10000);
    } else {
      if (this.bannerTimer) this.bannerTimer.remove();
      this.banner.setVisible(false);
    }
  }

  // ================================================================
  //  화면 크기에 맞게 배치
  // ================================================================
  layout() {
    var W = this.scale.width, H = this.scale.height;
    var mobile = W < 640;
    var pad = mobile ? 10 : 16;

    // 왼쪽 위
    var lb = this.logo.getBounds();
    this.logo.setPosition(pad + 10 + lb.width / 2, pad + 8);
    this.locationText.setPosition(pad + 10, pad + 28);
    var bgW = Math.max(lb.width, this.locationText.width) + 20;
    this.logoBg.clear().fillStyle(0x0c1018, 0.65).fillRoundedRect(pad, pad, bgW, 48, 10)
      .lineStyle(1, 0xD4AF37, 0.3).strokeRoundedRect(pad, pad, bgW, 48, 10);

    // 오른쪽 위 패널
    var right = W - pad - 10;
    var row1 = pad + 9, row2 = pad + 29;
    this.extendBtn.setPosition(right - this.extendBtn.width, row1 - 2);
    this.extendBorder.clear().lineStyle(1, 0xD4AF37, 0.8)
      .strokeRoundedRect(this.extendBtn.x, this.extendBtn.y, this.extendBtn.width, this.extendBtn.height, 8);
    this.timerText.setPosition(this.extendBtn.x - 10 - this.timerText.width, row1);
    this.nickText.setPosition(this.timerText.x - 12 - this.nickText.width, row1);
    this.signOutBtn.setPosition(right - this.signOutBtn.width, row2);
    this.editBtn.setPosition(this.signOutBtn.x - 14 - this.editBtn.width, row2);
    var left = Math.min(this.nickText.x, this.editBtn.x) - 12;
    this.panelRect = new Phaser.Geom.Rectangle(left, pad, W - pad - left, 48);
    this.panel.clear().fillStyle(0x0c1018, 0.65).fillRoundedRect(left, pad, W - pad - left, 48, 10)
      .lineStyle(1, 0xD4AF37, 0.3).strokeRoundedRect(left, pad, W - pad - left, 48, 10);

    // 오른쪽 아래 미니맵
    this.miniSize = mobile ? 110 : 150;
    this.miniX = W - pad - this.miniSize;
    this.miniY = H - pad - this.miniSize;
    this.miniBg.clear().fillStyle(0x06090f, 0.82).fillRoundedRect(this.miniX, this.miniY, this.miniSize, this.miniSize, 8)
      .lineStyle(1.5, 0xD4AF37, 0.8).strokeRoundedRect(this.miniX, this.miniY, this.miniSize, this.miniSize, 8);
    if (this.world) this.drawMinimap(this.world);

    // 대화창
    var dw = Math.min(640, W - 2 * pad);
    var dh = 118;
    var dx = (W - dw) / 2;
    var dy = H - pad - dh - (mobile ? this.miniSize + 8 : 0);
    this.dlgBg.clear().fillStyle(0x0b2350, 0.9).fillRect(dx, dy, dw, dh)
      .lineStyle(2, 0xD4AF37, 1).strokeRect(dx + 3, dy + 3, dw - 6, dh - 6);
    // 픽셀 느낌 모서리
    this.dlgBg.fillStyle(0xD4AF37, 1);
    [[dx, dy], [dx + dw - 6, dy], [dx, dy + dh - 6], [dx + dw - 6, dy + dh - 6]].forEach(function (c) {
      this.dlgBg.fillRect(c[0], c[1], 6, 6);
    }, this);
    var face = 72;
    this.dlgFaceBg.clear().fillStyle(0x06142e, 1).fillRect(dx + 16, dy + 22, face, face)
      .lineStyle(2, 0xD4AF37, 1).strokeRect(dx + 16, dy + 22, face, face);
    this.dlgFace.setPosition(dx + 16 + face / 2, dy + 22 + face / 2 + 8).setScale(2.6).setCrop(0, 0, 32, 22);
    this.dlgName.setPosition(dx + 104, dy + 16);
    this.dlgText.setPosition(dx + 104, dy + 38);
    this.dlgText.setWordWrapWidth(dw - 130);
    this.dlgMore.setPosition(dx + dw - 14, dy + dh - 10);
    this.dialogRect = new Phaser.Geom.Rectangle(dx, dy, dw, dh);

    // 안내 문구 (모바일은 조이스틱과 겹치지 않게 위쪽에)
    if (mobile) this.banner.setOrigin(0.5, 0).setPosition(W / 2, pad + 60);
    else this.banner.setOrigin(0.5, 1).setPosition(W / 2, H - pad - 24);
  }

  update() {
    // 미니맵의 내 위치 (골드 점)
    var w = this.world;
    this.miniDot.clear();
    this.miniNext.clear();
    if (!w || !w.player || !this.miniTransform) return;
    var t = this.miniTransform;
    var px = t.ox + (w.player.x / TILE) * t.s, py = t.oy + (w.player.y / TILE) * t.s;
    this.miniDot.fillStyle(0xffffff, 1).fillCircle(px, py, 4).fillStyle(0xD4AF37, 1).fillCircle(px, py, 2.8);

    // 실내: 다음 데스크 반짝임
    if (w.desks) {
      var next = getNextDesk();
      if (next && w.desks[next]) {
        var dd = w.desks[next].data;
        var pulse = (Math.sin(this.time.now / 160) + 1) / 2;
        this.miniNext.lineStyle(1.5, 0xD4AF37, 0.4 + pulse * 0.6)
          .strokeCircle(t.ox + (dd.x + dd.w / 2) * t.s, t.oy + (dd.y + 0.5) * t.s, 7 + pulse * 3);
      }
    }
  }
}
