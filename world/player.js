// ===== 내 캐릭터 + 클릭 이동 + 길찾기 + 카메라 (바깥/내부 공통) =====


// ================================================================
//  길찾기 그리드 (셀 0.5m, A* 알고리즘)
//  - 장애물(충돌 박스) 칸은 막힘, 나머지는 걸을 수 있음
// ================================================================
var NAV_CELL = 0.5;
var PLAYER_RADIUS = 0.35; // 캐릭터 몸 반지름 (벽에 너무 붙지 않게)

function NavGrid(bounds) {
  this.minX = bounds.minX;
  this.minZ = bounds.minZ;
  this.cols = Math.ceil((bounds.maxX - bounds.minX) / NAV_CELL);
  this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / NAV_CELL);
  this.blocked = new Uint8Array(this.cols * this.rows);
}

// 사각형 영역 막기 (월드 좌표, 캐릭터 반지름만큼 넓혀서)
NavGrid.prototype.blockRect = function (minX, minZ, maxX, maxZ) {
  var pad = PLAYER_RADIUS;
  var c0 = Math.max(0, Math.floor((minX - pad - this.minX) / NAV_CELL));
  var c1 = Math.min(this.cols - 1, Math.floor((maxX + pad - this.minX) / NAV_CELL));
  var r0 = Math.max(0, Math.floor((minZ - pad - this.minZ) / NAV_CELL));
  var r1 = Math.min(this.rows - 1, Math.floor((maxZ + pad - this.minZ) / NAV_CELL));
  for (var r = r0; r <= r1; r++) {
    for (var c = c0; c <= c1; c++) this.blocked[r * this.cols + c] = 1;
  }
};

NavGrid.prototype.inside = function (c, r) {
  return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
};
NavGrid.prototype.free = function (c, r) {
  return this.inside(c, r) && !this.blocked[r * this.cols + c];
};
NavGrid.prototype.cellOf = function (x, z) {
  return { c: Math.floor((x - this.minX) / NAV_CELL), r: Math.floor((z - this.minZ) / NAV_CELL) };
};
NavGrid.prototype.centerOf = function (c, r) {
  return { x: this.minX + (c + 0.5) * NAV_CELL, z: this.minZ + (r + 0.5) * NAV_CELL };
};
NavGrid.prototype.isWalkable = function (x, z) {
  var p = this.cellOf(x, z);
  return this.free(p.c, p.r);
};

// 막힌 칸이면 가장 가까운 걸을 수 있는 칸 찾기
NavGrid.prototype.nearestFree = function (c, r) {
  c = Math.max(0, Math.min(this.cols - 1, c));
  r = Math.max(0, Math.min(this.rows - 1, r));
  if (this.free(c, r)) return { c: c, r: r };
  for (var rad = 1; rad < 80; rad++) {
    var best = null, bestD = Infinity;
    for (var dr = -rad; dr <= rad; dr++) {
      for (var dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        if (this.free(c + dc, r + dr)) {
          var d = dc * dc + dr * dr;
          if (d < bestD) { bestD = d; best = { c: c + dc, r: r + dr }; }
        }
      }
    }
    if (best) return best;
  }
  return null;
};

// 두 점 사이가 막힘 없이 직선으로 이어지는지 (길을 매끄럽게 만들 때 사용)
NavGrid.prototype.lineFree = function (ax, az, bx, bz) {
  var dx = bx - ax, dz = bz - az;
  var len = Math.sqrt(dx * dx + dz * dz);
  var steps = Math.ceil(len / (NAV_CELL * 0.4));
  for (var i = 0; i <= steps; i++) {
    var t = steps === 0 ? 0 : i / steps;
    if (!this.isWalkable(ax + dx * t, az + dz * t)) return false;
  }
  return true;
};

// A* 길찾기 → 월드 좌표 점 목록 (못 찾으면 null)
NavGrid.prototype.findPath = function (sx, sz, gx, gz) {
  var s = this.cellOf(sx, sz);
  var start = this.nearestFree(s.c, s.r);
  var goalCell = this.cellOf(gx, gz);
  var goal = this.nearestFree(goalCell.c, goalCell.r);
  if (!start || !goal) return null;

  var cols = this.cols, total = cols * this.rows;
  var startI = start.r * cols + start.c, goalI = goal.r * cols + goal.c;
  var gScore = new Float32Array(total).fill(Infinity);
  var came = new Int32Array(total).fill(-1);
  var closed = new Uint8Array(total);
  var heap = new MinHeap();

  function h(i) {
    var dc = Math.abs((i % cols) - goal.c), dr = Math.abs(Math.floor(i / cols) - goal.r);
    return (dc + dr) + (Math.SQRT2 - 2) * Math.min(dc, dr);
  }

  gScore[startI] = 0;
  heap.push(startI, h(startI));
  var dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  var found = false, guard = 0;

  while (heap.size() > 0 && guard++ < 200000) {
    var cur = heap.pop();
    if (cur === goalI) { found = true; break; }
    if (closed[cur]) continue;
    closed[cur] = 1;
    var cc = cur % cols, cr = Math.floor(cur / cols);
    for (var k = 0; k < 8; k++) {
      var nc = cc + dirs[k][0], nr = cr + dirs[k][1];
      if (!this.free(nc, nr)) continue;
      // 대각선은 모서리를 깎고 지나가지 않게
      if (dirs[k][2] > 1 && (!this.free(cc + dirs[k][0], cr) || !this.free(cc, cr + dirs[k][1]))) continue;
      var ni = nr * cols + nc;
      if (closed[ni]) continue;
      var g = gScore[cur] + dirs[k][2];
      if (g < gScore[ni]) {
        gScore[ni] = g;
        came[ni] = cur;
        heap.push(ni, g + h(ni));
      }
    }
  }
  if (!found) return null;

  // 칸 목록 → 월드 좌표
  var cells = [];
  for (var i = goalI; i !== -1; i = came[i]) cells.push(i);
  cells.reverse();
  var pts = cells.map(function (idx) { return this.centerOf(idx % cols, Math.floor(idx / cols)); }, this);

  // 클릭한 곳이 걸을 수 있으면 정확히 그 지점으로
  if (this.isWalkable(gx, gz)) pts[pts.length - 1] = { x: gx, z: gz };

  // 직선으로 갈 수 있는 중간 점은 생략 (지그재그 없애기)
  var smooth = [];
  var anchor = { x: sx, z: sz };
  var idx = 0;
  while (idx < pts.length) {
    var far = idx;
    for (var j = pts.length - 1; j > idx; j--) {
      if (this.lineFree(anchor.x, anchor.z, pts[j].x, pts[j].z)) { far = j; break; }
    }
    smooth.push(pts[far]);
    anchor = pts[far];
    idx = far + 1;
  }
  return smooth;
};

// A* 에 쓰는 작은 우선순위 큐
function MinHeap() { this.items = []; this.prio = []; }
MinHeap.prototype.size = function () { return this.items.length; };
MinHeap.prototype.push = function (item, p) {
  var a = this.items, b = this.prio;
  a.push(item); b.push(p);
  var i = a.length - 1;
  while (i > 0) {
    var parent = (i - 1) >> 1;
    if (b[parent] <= b[i]) break;
    var t = a[i]; a[i] = a[parent]; a[parent] = t;
    t = b[i]; b[i] = b[parent]; b[parent] = t;
    i = parent;
  }
};
MinHeap.prototype.pop = function () {
  var a = this.items, b = this.prio;
  var top = a[0];
  var lastA = a.pop(), lastB = b.pop();
  if (a.length > 0) {
    a[0] = lastA; b[0] = lastB;
    var i = 0, n = a.length;
    while (true) {
      var l = i * 2 + 1, r = l + 1, m = i;
      if (l < n && b[l] < b[m]) m = l;
      if (r < n && b[r] < b[m]) m = r;
      if (m === i) break;
      var t = a[i]; a[i] = a[m]; a[m] = t;
      t = b[i]; b[i] = b[m]; b[m] = t;
      i = m;
    }
  }
  return top;
};


// ================================================================
//  내 캐릭터
// ================================================================
var player = {
  avatar: null,
  x: 0,
  z: 0,
  rotY: 0,          // 바라보는 방향 (0 = 남쪽 +z, PI = 북쪽 -z)
  path: [],
  speed: 3.4,       // 초당 미터
  moving: false,
  onArrive: null,   // 도착하면 실행할 일 (데스크 대화, 건물 입장 등)
  faceTarget: null, // 도착 후 바라볼 지점
  walkTime: 0
};

// 방향 이름 → 각도
function facingToAngle(facing) {
  if (facing === 'north') return Math.PI;
  if (facing === 'east') return Math.PI / 2;
  if (facing === 'west') return -Math.PI / 2;
  return 0; // south
}

// 아바타 만들기 / 바꾸기
function setPlayerAvatar(config) {
  if (player.avatar) {
    if (player.avatar.parent) player.avatar.parent.remove(player.avatar);
    disposeAvatar(player.avatar);
  }
  player.avatar = buildAvatar(config || DEFAULT_AVATAR);
  player.avatar.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
  return player.avatar;
}

// 특정 위치에 바로 세우기
function placePlayer(x, z, angle) {
  player.x = x;
  player.z = z;
  player.rotY = angle || 0;
  player.path = [];
  player.moving = false;
  player.onArrive = null;
  player.faceTarget = null;
  if (player.avatar) {
    player.avatar.position.set(x, 0, z);
    player.avatar.rotation.y = player.rotY;
  }
}

// 걸어가기 (nav: NavGrid). 도착하면 onArrive 실행. 길이 없으면 false
function walkPlayerTo(nav, x, z, onArrive, faceTarget) {
  var path = nav.findPath(player.x, player.z, x, z);
  if (!path) return false;
  player.path = path;
  player.moving = path.length > 0;
  player.onArrive = onArrive || null;
  player.faceTarget = faceTarget || null;
  if (!player.moving) arrivePlayer();
  return true;
}

function stopPlayer() {
  player.path = [];
  player.moving = false;
  player.onArrive = null;
}

function arrivePlayer() {
  player.moving = false;
  var done = player.onArrive;
  player.onArrive = null;
  if (done) done();
}

// 두 각도 사이를 부드럽게 (가까운 쪽으로 돌기)
function lerpAngle(a, b, t) {
  var d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

// 매 프레임: 이동 + 방향 + 걷기/숨쉬기 동작
function updatePlayer(dt, t) {
  if (!player.avatar) return;

  if (player.moving && player.path.length) {
    var target = player.path[0];
    var dx = target.x - player.x, dz = target.z - player.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    var step = player.speed * dt;
    if (dist <= step) {
      player.x = target.x;
      player.z = target.z;
      player.path.shift();
      if (!player.path.length) arrivePlayer();
    } else {
      player.x += dx / dist * step;
      player.z += dz / dist * step;
    }
    if (dist > 0.01) player.rotY = lerpAngle(player.rotY, Math.atan2(dx, dz), Math.min(1, dt * 12));
    player.walkTime += dt;
    animateWalk(player.avatar, player.walkTime, 1);
  } else {
    if (player.faceTarget) {
      var want = Math.atan2(player.faceTarget.x - player.x, player.faceTarget.z - player.z);
      player.rotY = lerpAngle(player.rotY, want, Math.min(1, dt * 8));
    }
    animateIdle(player.avatar, t);
  }

  player.avatar.position.set(player.x, 0, player.z);
  player.avatar.rotation.y = player.rotY;
}


// ================================================================
//  카메라: 캐릭터를 뒤쪽 위에서 따라가는 3인칭
//  - 각도는 기본 고정 (멀미 방지), 오른쪽 드래그 / 두 손가락으로 회전
//  - 휠 / 핀치로 줌
// ================================================================
var camRig = {
  yaw: 0,        // 카메라가 캐릭터의 어느 쪽에 있는지 (0 = 남쪽에서 북쪽을 봄)
  pitch: 0.75,   // 내려다보는 각도
  dist: 14,
  minDist: 6,
  maxDist: 26,
  lead: 2.5,     // 캐릭터보다 이만큼 앞쪽을 바라봄 (가는 방향이 더 넓게 보이게)
  bounds: null,  // 카메라가 나가면 안 되는 범위 { minX, maxX, minZ, maxZ }
  look: null,    // 카메라가 바라보는 점 (부드럽게 따라감)
  ready: false
};

// 장면이 바뀔 때 카메라 기본값 설정
function setupCamera(opts) {
  camRig.yaw = opts.yaw || 0;
  camRig.pitch = opts.pitch || 0.75;
  camRig.dist = opts.dist || 14;
  camRig.minDist = opts.minDist || 6;
  camRig.maxDist = opts.maxDist || 26;
  camRig.bounds = opts.bounds || null;
  camRig.lead = opts.lead === undefined ? 2.5 : opts.lead;
  if (!camRig.look) camRig.look = new THREE.Vector3();
  camRig.ready = false; // 다음 프레임에 바로 제자리로 (부드럽게 따라가지 않고)
}

function rotateCamera(dx) {
  camRig.yaw -= dx * 0.008;
}

function zoomCamera(delta) {
  camRig.dist = Math.max(camRig.minDist, Math.min(camRig.maxDist, camRig.dist * (1 + delta)));
}

// 매 프레임: 카메라를 캐릭터 쪽으로 부드럽게
function updateCamera(camera, dt) {
  var headY = 1.4;
  var flat = Math.cos(camRig.pitch) * camRig.dist;
  var ox = Math.sin(camRig.yaw) * flat;
  var oz = Math.cos(camRig.yaw) * flat;

  // 맵 경계·벽 밖으로 나가지 않게: 각도는 그대로 두고 거리만 줄여요
  var b = camRig.bounds;
  var k = 1;
  if (b) {
    if (player.x + ox > b.maxX) k = Math.min(k, (b.maxX - player.x) / ox);
    if (player.x + ox < b.minX) k = Math.min(k, (b.minX - player.x) / ox);
    if (player.z + oz > b.maxZ) k = Math.min(k, (b.maxZ - player.z) / oz);
    if (player.z + oz < b.minZ) k = Math.min(k, (b.minZ - player.z) / oz);
    k = Math.max(0.3, k);
  }
  var dist = camRig.dist * k;
  var desired = new THREE.Vector3(
    player.x + ox * k,
    headY + Math.sin(camRig.pitch) * dist,
    player.z + oz * k
  );

  var lookTarget = new THREE.Vector3(
    player.x - Math.sin(camRig.yaw) * camRig.lead,
    headY,
    player.z - Math.cos(camRig.yaw) * camRig.lead
  );
  if (!camRig.ready) {
    camera.position.copy(desired);
    camRig.look.copy(lookTarget);
    camRig.ready = true;
  } else {
    var follow = 1 - Math.exp(-dt * 6);
    camera.position.lerp(desired, follow);
    camRig.look.lerp(lookTarget, 1 - Math.exp(-dt * 10));
  }
  camera.lookAt(camRig.look);
}
