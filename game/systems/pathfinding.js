// ===== 타일 기반 A* 길찾기 =====
// - 지나갈 수 없는 칸(벽, 건물, 나무 등)을 피해서 가장 가까운 길을 찾아요.
// - 막힌 칸을 클릭하면 가장 가까운 지나갈 수 있는 칸으로 가요.

function TileGrid(width, height) {
  this.width = width;
  this.height = height;
  this.blocked = new Uint8Array(width * height);
}

TileGrid.prototype.inside = function (x, y) {
  return x >= 0 && y >= 0 && x < this.width && y < this.height;
};

TileGrid.prototype.isFree = function (x, y) {
  return this.inside(x, y) && !this.blocked[y * this.width + x];
};

TileGrid.prototype.block = function (x, y) {
  if (this.inside(x, y)) this.blocked[y * this.width + x] = 1;
};

TileGrid.prototype.unblock = function (x, y) {
  if (this.inside(x, y)) this.blocked[y * this.width + x] = 0;
};

// 사각형 영역 막기 (타일 단위)
TileGrid.prototype.blockRect = function (x, y, w, h) {
  for (var ty = y; ty < y + h; ty++) {
    for (var tx = x; tx < x + w; tx++) this.block(tx, ty);
  }
};

// 막힌 칸이면 가장 가까운 지나갈 수 있는 칸 (없으면 null)
TileGrid.prototype.nearestFree = function (x, y) {
  x = Math.max(0, Math.min(this.width - 1, x));
  y = Math.max(0, Math.min(this.height - 1, y));
  if (this.isFree(x, y)) return { x: x, y: y };
  for (var r = 1; r < 30; r++) {
    var best = null, bestD = Infinity;
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (this.isFree(x + dx, y + dy)) {
          var d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = { x: x + dx, y: y + dy }; }
        }
      }
    }
    if (best) return best;
  }
  return null;
};

// A* 길찾기: 시작 칸 → 목표 칸. 칸 목록 [{x, y}, ...] (시작 칸 제외), 못 찾으면 null
TileGrid.prototype.findPath = function (sx, sy, gx, gy) {
  var start = this.nearestFree(sx, sy);
  var goal = this.nearestFree(gx, gy);
  if (!start || !goal) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  var W = this.width, total = W * this.height;
  var startI = start.y * W + start.x, goalI = goal.y * W + goal.x;
  var g = new Float32Array(total).fill(Infinity);
  var came = new Int32Array(total).fill(-1);
  var closed = new Uint8Array(total);
  var open = new PathHeap();
  var self = this;

  function h(i) {
    var dx = Math.abs((i % W) - goal.x), dy = Math.abs(Math.floor(i / W) - goal.y);
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
  }

  g[startI] = 0;
  open.push(startI, h(startI));
  var dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
              [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  var found = false;

  while (open.size() > 0) {
    var cur = open.pop();
    if (cur === goalI) { found = true; break; }
    if (closed[cur]) continue;
    closed[cur] = 1;
    var cx = cur % W, cy = Math.floor(cur / W);
    for (var k = 0; k < 8; k++) {
      var nx = cx + dirs[k][0], ny = cy + dirs[k][1];
      if (!self.isFree(nx, ny)) continue;
      // 대각선은 모서리를 깎고 지나가지 않게 (양 옆이 모두 비어 있어야 함)
      if (dirs[k][2] > 1 && (!self.isFree(cx + dirs[k][0], cy) || !self.isFree(cx, cy + dirs[k][1]))) continue;
      var ni = ny * W + nx;
      if (closed[ni]) continue;
      var cost = g[cur] + dirs[k][2];
      if (cost < g[ni]) {
        g[ni] = cost;
        came[ni] = cur;
        open.push(ni, cost + h(ni));
      }
    }
  }
  if (!found) return null;

  var path = [];
  for (var i = goalI; i !== startI && i !== -1; i = came[i]) {
    path.push({ x: i % W, y: Math.floor(i / W) });
  }
  path.reverse();
  return path;
};


// ----- A* 에 쓰는 작은 우선순위 큐 -----
function PathHeap() { this.items = []; this.prio = []; }
PathHeap.prototype.size = function () { return this.items.length; };
PathHeap.prototype.push = function (item, p) {
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
PathHeap.prototype.pop = function () {
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
