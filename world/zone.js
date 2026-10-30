// ===== 바깥 지역 만들기 (모든 지역 공통 코드) =====
// ZONES[지역id] 의 지도 데이터를 읽어서 3D 장면을 만들어요.
// 새 지역을 추가할 때는 world/zones/ 에 데이터 파일만 추가하면 돼요.

// 하늘 색 (시간대별)
var SKY_PRESETS = {
  golden_hour: {
    top: '#1b2450', middle: '#e9768f', bottom: '#ff9a5a',
    fog: '#e58f6e', sun: '#ffb46b', sunPos: [-320, 45, -80],
    hemiSky: '#ffc9a3', hemiGround: '#3a3048'
  }
};


// 지도 데이터 → 장면 정의
// 돌려주는 값: { id, kind, label, scene, nav, interactives, occluders, update, minimap, entries, camera, sun }
function buildZone(zoneId, quality) {
  var data = ZONES[zoneId];
  var ctx = createBuildContext(quality);
  var scene = new THREE.Scene();
  var sky = SKY_PRESETS[data.timeOfDay] || SKY_PRESETS.golden_hour;

  // ----- 하늘 (노을 그라데이션) + 안개 -----
  scene.add(makeSkyDome(sky));
  scene.fog = new THREE.Fog(sky.fog, quality.mobile ? 30 : 45, quality.mobile ? 110 : 170);

  // 해 (서쪽 낮게)
  var sunSprite = makeGlowSprite('#ffd7a0', 90, 0.95);
  sunSprite.position.set(sky.sunPos[0], sky.sunPos[1], sky.sunPos[2]);
  sunSprite.material.fog = false;
  scene.add(sunSprite);

  // ----- 조명 -----
  scene.add(new THREE.HemisphereLight(sky.hemiSky, sky.hemiGround, 1.3));
  scene.add(new THREE.AmbientLight('#ffe2cc', 0.25));
  var sun = new THREE.DirectionalLight(sky.sun, 2.4);
  var sunDir = new THREE.Vector3(sky.sunPos[0], sky.sunPos[1] + 60, sky.sunPos[2]).normalize();
  sun.userData.dir = sunDir;
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 160;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
  }
  scene.add(sun);
  scene.add(sun.target);

  // ----- 땅 -----
  var ground = wMesh(new THREE.PlaneGeometry(data.size.width * 3, data.size.depth * 2), ctx.mat('#6d6152', { roughness: 1 }), 0, 0, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ----- 오브젝트 배치 -----
  var wb = data.walkBounds;
  var nav = new NavGrid(wb);
  var interactives = [];
  var occluders = [];
  var updaters = [];
  var movers = [];
  var wireGroups = {};
  var minimapRects = [];
  var specialMarks = [];
  var exitPoints = {};

  data.objects.forEach(function (o) {
    if (o.type === 'pedestrian') {
      if (quality.mobile && o.mobile === false) return;
      movers.push(makePedestrian(o, scene));
      return;
    }
    var builder = WORLD_BUILDERS[o.type];
    if (!builder) {
      console.warn('No builder for type:', o.type);
      return;
    }

    var obj = builder(o, ctx);
    var rot = (o.rotY || 0) * Math.PI / 180;
    obj.position.set(o.x || 0, 0, o.z || 0);
    obj.rotation.y = rot;
    if (o.scale) obj.scale.setScalar(o.scale);

    // 그림자
    var bigFlat = o.type === 'road' || o.type === 'sidewalk' || o.type === 'crosswalk';
    obj.traverse(function (m) {
      if (!m.isMesh) return;
      m.receiveShadow = quality.shadows;
      m.castShadow = quality.shadows && !bigFlat;
    });
    scene.add(obj);
    obj.updateMatrixWorld(true);

    // 충돌 박스 → 길찾기 그리드에 막힘 표시
    var rects = colliderRects(o, rot);
    rects.forEach(function (r) {
      nav.blockRect(r.minX, r.minZ, r.maxX, r.maxZ);
      if (o.type === 'shophouse' || o.type === 'allabut_building' || o.type === 'bts_station') {
        minimapRects.push({ r: r, type: o.type });
      }
    });

    // 카메라를 가리면 반투명해지는 건물
    if (o.occluder && rects.length) {
      var height = obj.userData.height || 8;
      rects.forEach(function (r) {
        occluders.push(makeOccluderProxy(scene, obj, r, height));
      });
    }

    // 나무처럼 잎이 넓은 것: 카메라를 가리면 반투명 (잎 크기만큼의 판정 상자)
    if (obj.userData.occluderBox) {
      var half = obj.userData.occluderBox / 2;
      occluders.push(makeOccluderProxy(scene, obj, { minX: o.x - half, maxX: o.x + half, minZ: o.z - half, maxZ: o.z + half }, (obj.userData.height || 6) + 1));
    }

    // 클릭할 수 있는 곳 (건물 입구, BTS 역 계단)
    (obj.userData.interactive || []).forEach(function (it) {
      interactives.push(makeInteractive(scene, obj, it, o));
    });
    if (o.type === 'allabut_building') {
      specialMarks.push({ x: o.x, z: o.z, kind: 'star' });
      var ep = toWorld(obj, obj.userData.exitPoint);
      exitPoints[o.interior] = { x: ep.x, z: ep.z, angle: rot };
    }

    // 움직이는 것들
    if (obj.userData.update) updaters.push(obj.userData.update);
    if (obj.userData.sway) {
      var sway = obj.userData.sway, seed = o.seed || 0;
      updaters.push(function (dt, t) {
        sway.rotation.z = Math.sin(t * 0.9 + seed * 3) * 0.04;
        sway.rotation.x = Math.cos(t * 0.7 + seed * 2) * 0.03;
      });
    }
    if (o.path) movers.push(makePathMover(obj, o));
    if (o.wireGroup) {
      (wireGroups[o.wireGroup] = wireGroups[o.wireGroup] || []).push(obj);
    }
  });

  // ----- 전깃줄 (같은 그룹의 전봇대를 순서대로 잇기, 늘어진 곡선) -----
  makeWires(scene, wireGroups, quality);

  // ----- 미니맵 정보 -----
  var minimap = {
    scale: 2.2,  // 1m = 2.2px
    draw: function (g, toPx) {
      // 인도 + 도로
      var a = toPx(-7, -66), b = toPx(7, 66);
      g.fillStyle = 'rgba(201,191,174,0.35)';
      g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      a = toPx(-4, -66); b = toPx(4, 66);
      g.fillStyle = 'rgba(70,74,82,0.9)';
      g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      g.strokeStyle = 'rgba(232,185,35,0.7)';
      g.lineWidth = 1;
      a = toPx(0, -66); b = toPx(0, 66);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      // 건물
      minimapRects.forEach(function (m) {
        var p1 = toPx(m.r.minX, m.r.minZ), p2 = toPx(m.r.maxX, m.r.maxZ);
        g.fillStyle = m.type === 'allabut_building' ? 'rgba(11,35,80,0.95)' : (m.type === 'bts_station' ? 'rgba(47,158,91,0.6)' : 'rgba(225,205,180,0.55)');
        g.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
        if (m.type === 'allabut_building') {
          g.strokeStyle = '#D4AF37';
          g.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
        }
      });
    },
    marks: specialMarks
  };

  // ----- 들어오는 위치 -----
  var entries = {
    spawn: { x: data.spawn.x, z: data.spawn.z, angle: facingToAngle(data.spawn.facing) }
  };
  Object.keys(exitPoints).forEach(function (interiorId) {
    entries['from:' + interiorId] = exitPoints[interiorId];
  });

  return {
    id: zoneId,
    kind: 'zone',
    label: data.label || data.name,
    scene: scene,
    ctx: ctx,
    nav: nav,
    interactives: interactives,
    occluders: occluders,
    minimap: minimap,
    entries: entries,
    sun: sun,
    camera: {
      dist: 14, pitch: 0.62, minDist: 7, maxDist: 26, lead: 4,
      bounds: { minX: wb.minX - 4, maxX: wb.maxX + 4, minZ: wb.minZ - 4, maxZ: wb.maxZ + 6 }
    },
    update: function (dt, t) {
      for (var i = 0; i < updaters.length; i++) updaters[i](dt, t);
      for (var j = 0; j < movers.length; j++) movers[j](dt, t);
    }
  };
}


// ----- 하늘 돔 (위: 남색 → 가운데: 분홍 → 아래: 주황) -----
function makeSkyDome(sky) {
  var geo = new THREE.SphereGeometry(450, 32, 16);
  var mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(sky.top) },
      middle: { value: new THREE.Color(sky.middle) },
      bottom: { value: new THREE.Color(sky.bottom) }
    },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 middle; uniform vec3 bottom; varying vec3 vPos;' +
      'void main(){ float h = vPos.y;' +
      ' vec3 c = h < 0.12 ? mix(bottom, middle, smoothstep(-0.05, 0.12, h)) : mix(middle, top, smoothstep(0.12, 0.6, h));' +
      ' gl_FragColor = vec4(c, 1.0); }'
  });
  var dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -1;
  return dome;
}


// ----- 충돌 박스 → 월드 좌표 사각형 목록 -----
function colliderRects(o, rot) {
  var list = [];
  if (o.collider) list.push([0, 0, o.collider[0], o.collider[1]]);
  if (o.colliders) list = list.concat(o.colliders);
  var cos = Math.cos(rot), sin = Math.sin(rot);
  return list.map(function (c) {
    // 네 꼭짓점을 돌려서 감싸는 사각형
    var hw = c[2] / 2, hd = c[3] / 2;
    var xs = [], zs = [];
    [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].forEach(function (p) {
      var lx = c[0] + p[0], lz = c[1] + p[1];
      xs.push((o.x || 0) + lx * cos + lz * sin);
      zs.push((o.z || 0) - lx * sin + lz * cos);
    });
    return { minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs), minZ: Math.min.apply(null, zs), maxZ: Math.max.apply(null, zs) };
  });
}

// 로컬 좌표 → 월드 좌표
function toWorld(obj, p) {
  var v = new THREE.Vector3(p.x, p.y || 0, p.z);
  obj.localToWorld(v);
  return v;
}

// 카메라 가림 판정용 투명 상자 (이 상자에 걸리면 group 전체가 반투명)
function makeOccluderProxy(scene, group, r, height) {
  var w = r.maxX - r.minX, d = r.maxZ - r.minZ;
  var proxy = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.position.set((r.minX + r.maxX) / 2, height / 2, (r.minZ + r.maxZ) / 2);
  proxy.userData.fadeGroup = group;
  scene.add(proxy);
  return proxy;
}

// 클릭할 수 있는 곳 만들기 (로컬 데이터 → 월드 좌표)
function makeInteractive(scene, obj, it, data) {
  var proxy = new THREE.Mesh(new THREE.BoxGeometry(it.box.w, it.box.h, it.box.d), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.position.set(it.box.x, it.box.y, it.box.z);
  obj.add(proxy);
  proxy.updateMatrixWorld(true);

  var item = {
    kind: it.kind,
    proxy: proxy,
    approach: toWorld(obj, it.approach),
    face: toWorld(obj, it.face),
    tooltip: it.tooltip || '',
    interior: it.interior || data.interior,
    bubble: it.bubble ? toWorld(obj, it.bubble) : null,
    setHover: function (on) {
      if (obj.userData.hoverOutline) obj.userData.hoverOutline.visible = on;
    }
  };
  proxy.userData.interactive = item;
  return item;
}


// ----- 경로를 따라 왕복하는 것 (뚝뚝 등) -----
function makePathMover(obj, o) {
  var a = { x: o.path[0][0], z: o.path[0][1] };
  var b = { x: o.path[1][0], z: o.path[1][1] };
  var len = Math.hypot(b.x - a.x, b.z - a.z);
  var speed = o.speed || 2;
  var pos = 0, dir = 1, pause = 0;
  obj.position.set(a.x, 0, a.z);
  return function (dt) {
    if (pause > 0) { pause -= dt; return; }
    pos += dir * speed * dt;
    if (pos >= len) { pos = len; dir = -1; pause = 1.5; }
    if (pos <= 0) { pos = 0; dir = 1; pause = 1.5; }
    var t = pos / len;
    obj.position.x = a.x + (b.x - a.x) * t;
    obj.position.z = a.z + (b.z - a.z) * t;
    var heading = Math.atan2((b.x - a.x) * dir, (b.z - a.z) * dir);
    obj.rotation.y = lerpAngle(obj.rotation.y, heading, Math.min(1, dt * 3));
  };
}

// ----- 행인 (무작위 외형, 인도 위를 왕복) -----
function makePedestrian(o, scene) {
  // seed 로 늘 같은 외형이 나오게
  var s = o.seed || 1;
  function pick(list) {
    s = (s * 9301 + 49297) % 233280;
    return list[Math.floor((s / 233280) * list.length)].id;
  }
  var config = {};
  AVATAR_CATEGORIES.forEach(function (cat) {
    config[cat.key] = pick(AVATAR_CATALOG[cat.key].filter(function (i) { return !i.locked; }));
  });
  var avatar = buildAvatar(config);
  avatar.scale.setScalar(0.95);
  avatar.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
  scene.add(avatar);

  var a = { x: o.path[0][0], z: o.path[0][1] };
  var b = { x: o.path[1][0], z: o.path[1][1] };
  var len = Math.hypot(b.x - a.x, b.z - a.z);
  var speed = o.speed || 1;
  var pos = Math.random() * len, dir = 1, pause = 0, walkT = 0;

  return function (dt, t) {
    if (pause > 0) {
      pause -= dt;
      animateIdle(avatar, t + s);
    } else {
      pos += dir * speed * dt;
      if (pos >= len) { pos = len; dir = -1; pause = 2 + (s % 3); }
      if (pos <= 0) { pos = 0; dir = 1; pause = 2 + (s % 2); }
      walkT += dt;
      animateWalk(avatar, walkT, speed * 0.75);
    }
    var k = pos / len;
    avatar.position.set(a.x + (b.x - a.x) * k, 0, a.z + (b.z - a.z) * k);
    var heading = Math.atan2((b.x - a.x) * dir, (b.z - a.z) * dir);
    avatar.rotation.y = lerpAngle(avatar.rotation.y, heading, Math.min(1, dt * 5));
  };
}

// ----- 전깃줄 -----
function makeWires(scene, wireGroups, quality) {
  var mat = new THREE.LineBasicMaterial({ color: 0x1d1d20, transparent: true, opacity: 0.85 });
  Object.keys(wireGroups).forEach(function (key) {
    var poles = wireGroups[key].slice().sort(function (p, q) { return p.position.z - q.position.z; });
    for (var i = 0; i < poles.length - 1; i++) {
      var A = poles[i], B = poles[i + 1];
      var anchors = A.userData.wireAnchors || [];
      anchors.forEach(function (an, k) {
        if (quality.mobile && k > 2) return;
        var p1 = toWorld(A, an), p2 = toWorld(B, an);
        var sag = 0.6 + (k % 3) * 0.35; // 줄마다 늘어진 정도를 다르게
        var pts = [];
        for (var s = 0; s <= 14; s++) {
          var t = s / 14;
          pts.push(new THREE.Vector3(
            p1.x + (p2.x - p1.x) * t,
            p1.y + (p2.y - p1.y) * t - Math.sin(Math.PI * t) * sag,
            p1.z + (p2.z - p1.z) * t
          ));
        }
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
      });
    }
  });

  // 도로를 건너는 전깃줄 몇 가닥
  var west = (wireGroups.west || []), east = (wireGroups.east || []);
  for (var i = 0; i < Math.min(west.length, east.length); i += 2) {
    var p1 = toWorld(west[i], { x: 0.7, y: 8.25, z: 0 });
    var p2 = toWorld(east[i], { x: -0.7, y: 8.25, z: 0 });
    var pts = [];
    for (var s = 0; s <= 12; s++) {
      var t = s / 12;
      pts.push(new THREE.Vector3(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t - Math.sin(Math.PI * t) * 0.5, p1.z + (p2.z - p1.z) * t));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
}
