// ===== 로우폴리 아바타 만들기 =====
// buildAvatar(config) 로 THREE.Group 캐릭터를 만들어요.
// 이 파일은 화면(HTML)과 상관없이 독립적으로 동작해서, 매장 화면에서도 그대로 쓸 수 있어요.
//
// 캐릭터 구조 (각 파츠는 이름이 붙은 Group 이라 나중에 따로 갈아끼울 수 있어요)
//   avatar
//   ├─ legL, legR      다리 + 신발
//   ├─ body            몸통 + 옷 디테일
//   ├─ armL, armR      팔 + 손
//   └─ head            머리
//       ├─ face        얼굴(머리 모양) + 귀
//       ├─ eyes
//       ├─ nose
//       ├─ mouth
//       └─ hair
//
// 크기 기준: 발바닥 y=0, 머리 지름 약 1, 전체 키 약 2.4 (2.5등신)


// ----- 기본 치수 -----
var AV = {
  legTop: 0.6,       // 다리 윗부분 높이
  torsoTop: 1.35,    // 몸통 윗부분(어깨) 높이
  headY: 1.88,       // 머리 중심 높이
  headR: 0.5         // 머리 반지름
};

// 몸통 앞면이 평평하도록 8각 기둥을 22.5도 돌려서 만들어요
var TORSO_SIDES = 8;
var TORSO_TURN = Math.PI / TORSO_SIDES;


// ----- 재료(색) 만들기 -----
function avMat(color, options) {
  var params = {
    color: color,
    flatShading: true,   // 로우폴리 느낌 (면이 각지게 보임)
    roughness: 0.75,
    metalness: 0
  };
  if (options) {
    for (var key in options) params[key] = options[key];
  }
  return new THREE.MeshStandardMaterial(params);
}

// 골드 재료 (살짝 반짝임)
function avGold() {
  return avMat('#D4AF37', { metalness: 0.6, roughness: 0.35 });
}

// 도형(geometry) + 재료(material) → 메시(mesh), 위치까지 한 번에
function avMesh(geometry, material, x, y, z) {
  var mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x || 0, y || 0, z || 0);
  return mesh;
}

// 이름 붙은 그룹 만들기
function avGroup(name) {
  var g = new THREE.Group();
  g.name = name;
  return g;
}

// 색을 조금 어둡게/밝게 (amount: -1 ~ 1)
function avShade(hex, amount) {
  var c = new THREE.Color(hex);
  if (amount < 0) c.lerp(new THREE.Color('#000000'), -amount);
  else c.lerp(new THREE.Color('#ffffff'), amount);
  return '#' + c.getHexString();
}


// ===== 머리 모양 =====
// 구(sphere)의 점들을 얼굴형에 맞게 변형해요.
// 머리카락도 같은 변형을 써서 어떤 얼굴형이든 딱 맞게 씌워져요.
function avDeformPoint(v, radius, faceId) {
  if (faceId === 'face_oval') {
    v.x *= 0.9; v.y *= 1.1; v.z *= 0.95;
  } else if (faceId === 'face_square') {
    // 구와 정육면체의 중간 모양 (모서리가 둥근 네모)
    var nx = v.x / radius, ny = v.y / radius, nz = v.z / radius;
    var m = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz)) || 1;
    var k = 0.45;
    v.x = (nx * (1 - k) + (nx / m) * k) * radius * 0.95;
    v.y = (ny * (1 - k) + (ny / m) * k) * radius * 0.95;
    v.z = (nz * (1 - k) + (nz / m) * k) * radius * 0.92;
  }
  return v;
}

// 얼굴형이 적용된 구 도형 (일부분만 잘라서 만들 수도 있음)
function avHeadGeometry(faceId, radius, wSeg, hSeg, phiStart, phiLength, thetaStart, thetaLength) {
  var geo = new THREE.SphereGeometry(
    radius, wSeg, hSeg,
    phiStart === undefined ? 0 : phiStart,
    phiLength === undefined ? Math.PI * 2 : phiLength,
    thetaStart === undefined ? 0 : thetaStart,
    thetaLength === undefined ? Math.PI : thetaLength
  );
  var pos = geo.attributes.position;
  var v = new THREE.Vector3();
  for (var i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    avDeformPoint(v, radius, faceId);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// 얼굴 앞면에서 (x, y) 위치의 표면 z 좌표 찾기 (눈·코·입을 표면에 딱 붙이기 위해)
function avSurfaceZ(headMesh, x, y) {
  headMesh.updateMatrixWorld(true);
  var ray = new THREE.Raycaster(new THREE.Vector3(x, y, 3), new THREE.Vector3(0, 0, -1));
  var hit = ray.intersectObject(headMesh, false)[0];
  return hit ? hit.point.z : AV.headR * 0.9;
}


// ===== 얼굴 파츠 =====
function avBuildFace(faceId, skin) {
  var g = avGroup('face');
  var head = avMesh(avHeadGeometry(faceId, AV.headR, 10, 8), avMat(skin));
  head.name = 'headShape';
  g.add(head);

  // 귀
  var earX = faceId === 'face_oval' ? 0.44 : 0.47;
  var earGeo = new THREE.SphereGeometry(0.09, 6, 4);
  var earL = avMesh(earGeo, avMat(skin), -earX, -0.02, 0);
  var earR = avMesh(earGeo, avMat(skin), earX, -0.02, 0);
  earL.scale.set(0.6, 1, 0.8);
  earR.scale.set(0.6, 1, 0.8);
  g.add(earL, earR);

  return { group: g, headMesh: head };
}

function avBuildEyes(eyesId, headMesh) {
  var g = avGroup('eyes');
  var dark = '#1a1a2e';
  var ex = 0.17, ey = 0.02;

  [-1, 1].forEach(function (side) {
    var x = ex * side;
    var z = avSurfaceZ(headMesh, x, ey);
    var eye = avGroup('eye');
    eye.position.set(x, ey, z);

    if (eyesId === 'eyes_dot') {
      var dot = avMesh(new THREE.SphereGeometry(0.05, 6, 4), avMat(dark));
      dot.scale.set(1, 1.15, 0.5);
      eye.add(dot);

    } else if (eyesId === 'eyes_round') {
      var white = avMesh(new THREE.SphereGeometry(0.085, 8, 6), avMat('#ffffff'));
      white.scale.set(1, 1.1, 0.45);
      var pupil = avMesh(new THREE.SphereGeometry(0.05, 6, 4), avMat(dark), 0, -0.005, 0.03);
      pupil.scale.set(1, 1.1, 0.5);
      var shine = avMesh(new THREE.SphereGeometry(0.016, 4, 3), avMat('#ffffff'), 0.018, 0.02, 0.055);
      eye.add(white, pupil, shine);

    } else if (eyesId === 'eyes_smile') {
      // ∩ 모양 (웃는 눈)
      var arc = avMesh(new THREE.TorusGeometry(0.055, 0.016, 4, 8, Math.PI), avMat(dark), 0, -0.02, 0);
      eye.add(arc);

    } else if (eyesId === 'eyes_sharp') {
      // 바깥쪽이 살짝 올라간 날카로운 눈
      var slit = avMesh(new THREE.BoxGeometry(0.13, 0.04, 0.03), avMat(dark));
      slit.rotation.z = 0.28 * side;
      var spark = avMesh(new THREE.SphereGeometry(0.012, 4, 3), avMat('#ffffff'), 0.02 * side, 0.005, 0.018);
      eye.add(slit, spark);
    }

    g.add(eye);
  });

  return g;
}

function avBuildNose(noseId, headMesh, skin) {
  var g = avGroup('nose');
  if (noseId === 'nose_none') return g;

  var y = -0.1;
  var z = avSurfaceZ(headMesh, 0, y);
  var color = avShade(skin, -0.12);
  var r = noseId === 'nose_round' ? 0.06 : 0.035;
  var nose = avMesh(new THREE.SphereGeometry(r, 6, 4), avMat(color), 0, y, z);
  nose.scale.set(1, 0.85, 0.8);
  g.add(nose);
  return g;
}

function avBuildMouth(mouthId, headMesh) {
  var g = avGroup('mouth');
  var y = -0.23;
  var z = avSurfaceZ(headMesh, 0, y);
  var lip = '#7a2e3a';
  g.position.set(0, y, z);

  if (mouthId === 'mouth_smile') {
    // ∪ 모양
    var smile = avMesh(new THREE.TorusGeometry(0.07, 0.015, 4, 8, Math.PI), avMat(lip), 0, 0.03, 0);
    smile.rotation.z = Math.PI;
    g.add(smile);

  } else if (mouthId === 'mouth_flat') {
    g.add(avMesh(new THREE.BoxGeometry(0.12, 0.022, 0.02), avMat(lip)));

  } else if (mouthId === 'mouth_open') {
    var open = avMesh(new THREE.SphereGeometry(0.055, 8, 6), avMat('#5a1a26'));
    open.scale.set(1, 0.85, 0.35);
    g.add(open);

  } else if (mouthId === 'mouth_grin') {
    // 반달 모양 입 + 하얀 이
    var half = avMesh(new THREE.CircleGeometry(0.095, 10, Math.PI, Math.PI), avMat('#5a1a26', { side: THREE.DoubleSide }), 0, 0.03, 0);
    var teeth = avMesh(new THREE.BoxGeometry(0.17, 0.028, 0.01), avMat('#ffffff'), 0, 0.018, 0.004);
    g.add(half, teeth);
  }
  return g;
}


// ===== 머리카락 =====
function avBuildHair(hairId, hairColor, faceId) {
  var g = avGroup('hair');
  if (hairId === 'hair_bald') return g;

  var mat = avMat(hairColor, { side: THREE.DoubleSide });
  var R = AV.headR;
  var PI = Math.PI;

  // 머리 윗부분을 덮는 모자 모양 (뒤로 살짝 기울여서 이마는 드러나고 뒤통수는 더 덮음)
  function cap(thetaLength, tilt, scale) {
    var c = avMesh(avHeadGeometry(faceId, R * (scale || 1.08), 12, 6, 0, PI * 2, 0, thetaLength), mat);
    c.rotation.x = -tilt;
    return c;
  }

  // 얼굴 쪽만 비워 둔 옆·뒷머리 (gap: 앞쪽 빈 각도)
  function shell(thetaStart, thetaEnd, gap, scale) {
    var phiStart = PI / 2 + gap / 2;
    var geo = avHeadGeometry(faceId, R * (scale || 1.1), 14, 6, phiStart, PI * 2 - gap, thetaStart, thetaEnd - thetaStart);
    return avMesh(geo, mat);
  }

  if (hairId === 'hair_short') {
    g.add(cap(PI * 0.45, 0.3));

  } else if (hairId === 'hair_sidepart') {
    g.add(cap(PI * 0.5, 0.32));
    // 한쪽으로 넘긴 앞머리
    var swoop = avMesh(new THREE.SphereGeometry(0.3, 8, 5), mat, 0.12, 0.36, 0.26);
    swoop.scale.set(1.05, 0.38, 0.7);
    swoop.rotation.z = -0.35;
    g.add(swoop);

  } else if (hairId === 'hair_curly') {
    g.add(cap(PI * 0.42, 0.25, 1.04));
    // 구 표면에 고르게 퍼진 작은 덩어리들 (피보나치 배치)
    var bumpGeo = new THREE.IcosahedronGeometry(0.13, 0);
    var n = 70, golden = PI * (3 - Math.sqrt(5));
    for (var i = 0; i < n; i++) {
      var y = 1 - (i / (n - 1)) * 2;
      var r = Math.sqrt(1 - y * y);
      var a = golden * i;
      var p = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      if (p.y < -0.05) continue;                // 아래쪽은 비움
      if (p.z > 0.3 && p.y < 0.55) continue;    // 얼굴 앞쪽은 비움
      p.multiplyScalar(R * 1.08);
      avDeformPoint(p, R * 1.08, faceId);
      var bump = avMesh(bumpGeo, mat, p.x, p.y, p.z);
      bump.rotation.set(i, i * 2, 0);
      g.add(bump);
    }

  } else if (hairId === 'hair_bob') {
    g.add(cap(PI * 0.42, 0.22));
    g.add(shell(PI * 0.2, PI * 0.68, PI * 0.62));
    // 앞머리
    var bang = avMesh(new THREE.SphereGeometry(0.34, 8, 4, 0, PI * 2, 0, PI * 0.5), mat, 0, 0.3, 0.2);
    bang.scale.set(1.15, 0.5, 0.75);
    g.add(bang);

  } else if (hairId === 'hair_long') {
    g.add(cap(PI * 0.45, 0.25));
    g.add(shell(PI * 0.2, PI * 0.78, PI * 0.6));
    // 등 뒤로 내려오는 긴 머리 (뒤쪽 반원 기둥)
    var back = avMesh(
      new THREE.CylinderGeometry(0.4, 0.37, 0.45, 12, 1, true, PI / 2 + 0.3, PI - 0.6),
      mat, 0, -0.6, 0
    );
    g.add(back);

  } else if (hairId === 'hair_ponytail') {
    g.add(cap(PI * 0.5, 0.3));
    // 머리끈 (골드)
    var tie = avMesh(new THREE.TorusGeometry(0.075, 0.025, 4, 8), avGold(), 0, 0.08, -0.56);
    g.add(tie);
    // 묶은 머리 (머리끈에서 아래로 늘어짐)
    var tail = avMesh(new THREE.CylinderGeometry(0.12, 0.05, 0.5, 6), mat, 0, -0.18, -0.6);
    tail.rotation.x = 0.12;
    g.add(tail);
    var knot = avMesh(new THREE.SphereGeometry(0.11, 6, 4), mat, 0, 0.06, -0.6);
    g.add(knot);
  }

  return g;
}


// ===== 옷 스타일 =====
// torso: 몸통색, upper/lower: 팔 윗부분/아랫부분 색 (null 이면 피부색 = 반팔)
var AVATAR_OUTFITS = {
  outfit_labcoat: { torso: '#f2f4f7', upper: '#f2f4f7', lower: '#f2f4f7', pants: '#2b3443', shoes: '#1f2329' },
  outfit_scrubs:  { torso: '#0b2a5b', upper: '#0b2a5b', lower: null,      pants: '#0b2a5b', shoes: '#e5e7eb' },
  outfit_suit:    { torso: '#151b27', upper: '#151b27', lower: '#151b27', pants: '#151b27', shoes: '#0d0f14' },
  outfit_hoodie:  { torso: '#4b5563', upper: '#4b5563', lower: '#4b5563', pants: '#2f4a6b', shoes: '#e5e7eb' },
  outfit_polo:    { torso: '#1d6f7a', upper: '#1d6f7a', lower: null,      pants: '#cbb994', shoes: '#5a3d2b' }
};

// 몸통 치수 (gender 에 따라 어깨 폭, 허리가 조금 달라요)
function avBodySize(genderId) {
  if (genderId === 'female') {
    return { top: 0.27, bottom: 0.3, legX: 0.12, legR: 0.105 };
  }
  return { top: 0.34, bottom: 0.28, legX: 0.135, legR: 0.115 };
}

// 몸통 앞면 z 좌표 (높이 y 에서)
function avTorsoFrontZ(size, y) {
  var t = (y - AV.legTop) / (AV.torsoTop - AV.legTop);
  var r = size.bottom + (size.top - size.bottom) * t;
  return r * Math.cos(TORSO_TURN) + 0.006;
}

// 아래로 뾰족한 V 모양 (V넥, 셔츠 깃 등에 사용)
function avVShape(width, depth, material) {
  var shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, -depth);
  shape.lineTo(-width / 2, 0);
  return new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
}

// 몸통 앞면에 붙는 작은 상자 (주머니, 단추 줄 등)
function avFrontBox(size, w, h, x, y, color) {
  return avMesh(new THREE.BoxGeometry(w, h, 0.02), avMat(color), x, y, avTorsoFrontZ(size, y));
}

// 몸통 앞면에 붙는 단추
function avButton(size, x, y, material) {
  var b = avMesh(new THREE.SphereGeometry(0.022, 5, 4), material, x, y, avTorsoFrontZ(size, y) + 0.005);
  b.scale.z = 0.6;
  return b;
}


// ===== 몸통 + 옷 디테일 =====
function avBuildBody(config, skin) {
  var g = avGroup('body');
  var size = avBodySize(config.gender);
  var style = AVATAR_OUTFITS[config.outfit] || AVATAR_OUTFITS.outfit_labcoat;
  var torsoH = AV.torsoTop - AV.legTop;

  // 몸통
  var torso = avMesh(
    new THREE.CylinderGeometry(size.top, size.bottom, torsoH, TORSO_SIDES, 1, false, TORSO_TURN),
    avMat(style.torso), 0, AV.legTop + torsoH / 2, 0
  );
  g.add(torso);

  // 어깨 (둥글게)
  var shoulderGeo = new THREE.SphereGeometry(0.12, 6, 4);
  g.add(avMesh(shoulderGeo, avMat(style.upper || style.torso), -(size.top - 0.03), AV.torsoTop - 0.06, 0));
  g.add(avMesh(shoulderGeo, avMat(style.upper || style.torso), size.top - 0.03, AV.torsoTop - 0.06, 0));

  // 목
  g.add(avMesh(new THREE.CylinderGeometry(0.1, 0.11, 0.14, 6), avMat(skin), 0, AV.torsoTop + 0.04, 0));

  // 골반 (바지색)
  g.add(avMesh(
    new THREE.CylinderGeometry(size.bottom, size.bottom * 0.92, 0.14, TORSO_SIDES, 1, false, TORSO_TURN),
    avMat(style.pants), 0, AV.legTop - 0.04, 0
  ));

  var neckY = AV.torsoTop - 0.02;

  if (config.outfit === 'outfit_labcoat') {
    // 안쪽 하늘색 셔츠 V
    var shirt = avVShape(0.2, 0.2, avMat('#9cc3e6', { side: THREE.DoubleSide }));
    shirt.position.set(0, neckY, avTorsoFrontZ(size, neckY));
    g.add(shirt);
    // 깃 (라펠)
    [-1, 1].forEach(function (side) {
      var lapel = avFrontBox(size, 0.06, 0.28, 0.085 * side, AV.torsoTop - 0.16, '#d9dde3');
      lapel.rotation.z = 0.38 * side;
      g.add(lapel);
    });
    // 단추 3개
    var btnMat = avMat('#9aa3b0');
    [1.08, 0.92, 0.76].forEach(function (y) { g.add(avButton(size, 0, y, btnMat)); });
    // 주머니 + 골드 펜
    g.add(avFrontBox(size, 0.11, 0.07, -0.15, 1.12, '#e3e7ec'));
    g.add(avMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 4), avGold(), -0.13, 1.17, avTorsoFrontZ(size, 1.17) + 0.01));
    // 긴 코트 자락 (허벅지까지)
    var skirt = avMesh(
      new THREE.CylinderGeometry(size.bottom + 0.01, size.bottom + 0.08, 0.34, TORSO_SIDES, 1, true, TORSO_TURN),
      avMat(style.torso, { side: THREE.DoubleSide }), 0, AV.legTop - 0.15, 0
    );
    g.add(skirt);

  } else if (config.outfit === 'outfit_scrubs') {
    // 피부가 보이는 V넥
    var vneck = avVShape(0.2, 0.17, avMat(skin, { side: THREE.DoubleSide }));
    vneck.position.set(0, neckY, avTorsoFrontZ(size, neckY));
    g.add(vneck);
    // 가슴 주머니
    g.add(avFrontBox(size, 0.1, 0.08, -0.15, 1.1, '#123a78'));

  } else if (config.outfit === 'outfit_suit') {
    var gold = avGold();
    // 흰 셔츠 + 골드 넥타이
    var suitShirt = avVShape(0.22, 0.3, avMat('#f2f4f7', { side: THREE.DoubleSide }));
    suitShirt.position.set(0, neckY, avTorsoFrontZ(size, neckY));
    g.add(suitShirt);
    var tie = avMesh(new THREE.BoxGeometry(0.045, 0.22, 0.015), gold, 0, AV.torsoTop - 0.15, avTorsoFrontZ(size, AV.torsoTop - 0.15) + 0.008);
    g.add(tie);
    // 골드 라펠 라인
    [-1, 1].forEach(function (side) {
      var y = AV.torsoTop - 0.17;
      var line = avMesh(new THREE.BoxGeometry(0.018, 0.32, 0.02), gold, 0.1 * side, y, avTorsoFrontZ(size, y) + 0.004);
      line.rotation.z = 0.33 * side;
      g.add(line);
    });
    // 골드 단추 2개
    [0.92, 0.8].forEach(function (y) { g.add(avButton(size, 0, y, gold)); });
    // 골드 밑단 테두리
    var hem = avMesh(new THREE.TorusGeometry(size.bottom + 0.005, 0.014, 4, TORSO_SIDES), gold, 0, AV.legTop + 0.02, 0);
    hem.rotation.x = Math.PI / 2;
    hem.rotation.z = TORSO_TURN;
    g.add(hem);

  } else if (config.outfit === 'outfit_hoodie') {
    // 목 뒤 후드
    var hood = avMesh(new THREE.TorusGeometry(0.17, 0.07, 5, 8), avMat(avShade(style.torso, -0.1)), 0, AV.torsoTop + 0.02, -0.06);
    hood.rotation.x = Math.PI / 2 - 0.35;
    g.add(hood);
    // 후드 끈
    [-1, 1].forEach(function (side) {
      var y = AV.torsoTop - 0.13;
      g.add(avMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4), avMat('#f2f4f7'), 0.05 * side, y, avTorsoFrontZ(size, y) + 0.01));
    });
    // 캥거루 주머니
    g.add(avFrontBox(size, 0.3, 0.13, 0, 0.78, avShade(style.torso, -0.12)));

  } else if (config.outfit === 'outfit_polo') {
    // 카라
    [-1, 1].forEach(function (side) {
      var collar = avMesh(new THREE.BoxGeometry(0.13, 0.05, 0.1), avMat(avShade(style.torso, 0.15)), 0.07 * side, AV.torsoTop + 0.01, 0.13);
      collar.rotation.z = -0.35 * side;
      collar.rotation.x = 0.4;
      g.add(collar);
    });
    // 단추 줄 + 단추 2개
    g.add(avFrontBox(size, 0.045, 0.15, 0, AV.torsoTop - 0.1, avShade(style.torso, 0.1)));
    var white = avMat('#f2f4f7');
    [AV.torsoTop - 0.06, AV.torsoTop - 0.13].forEach(function (y) { g.add(avButton(size, 0, y, white)); });
  }

  return g;
}


// ===== 팔 =====
function avBuildArm(side, config, skin) {
  var g = avGroup(side < 0 ? 'armL' : 'armR');
  var size = avBodySize(config.gender);
  var style = AVATAR_OUTFITS[config.outfit] || AVATAR_OUTFITS.outfit_labcoat;

  // 어깨 위치를 기준점으로 해서 팔이 매달려 있어요
  g.position.set((size.top + 0.07) * side, AV.torsoTop - 0.07, 0);
  g.rotation.z = 0.1 * side;

  var upperColor = style.upper || skin;
  var lowerColor = style.lower || skin;
  g.add(avMesh(new THREE.CylinderGeometry(0.088, 0.082, 0.3, 6), avMat(upperColor), 0, -0.15, 0));
  g.add(avMesh(new THREE.CylinderGeometry(0.08, 0.075, 0.26, 6), avMat(lowerColor), 0, -0.42, 0));
  g.add(avMesh(new THREE.SphereGeometry(0.095, 6, 5), avMat(skin), 0, -0.6, 0));

  // 정장은 손목에 골드 테두리
  if (config.outfit === 'outfit_suit') {
    var cuff = avMesh(new THREE.TorusGeometry(0.078, 0.014, 4, 6), avGold(), 0, -0.54, 0);
    cuff.rotation.x = Math.PI / 2;
    g.add(cuff);
  }
  // 반팔은 소매 끝을 살짝 두껍게
  if (!style.lower) {
    g.add(avMesh(new THREE.CylinderGeometry(0.095, 0.095, 0.05, 6), avMat(avShade(style.upper, -0.1)), 0, -0.29, 0));
  }
  return g;
}


// ===== 다리 =====
function avBuildLeg(side, config) {
  var g = avGroup(side < 0 ? 'legL' : 'legR');
  var size = avBodySize(config.gender);
  var style = AVATAR_OUTFITS[config.outfit] || AVATAR_OUTFITS.outfit_labcoat;

  g.position.set(size.legX * side, 0, 0);
  g.add(avMesh(new THREE.CylinderGeometry(size.legR, size.legR * 0.9, 0.52, 6), avMat(style.pants), 0, 0.34, 0));
  var shoe = avMesh(new THREE.BoxGeometry(0.2, 0.1, 0.3), avMat(style.shoes), 0, 0.05, 0.04);
  g.add(shoe);
  return g;
}


// ===== 캐릭터 전체 만들기 =====
function buildAvatar(config) {
  config = normalizeAvatarConfig(config);

  var skin = getCatalogItem('skin', config.skin).color;
  var hairColor = getCatalogItem('hairColor', config.hairColor).color;

  var avatar = avGroup('avatar');
  avatar.userData.config = config;

  // 다리
  avatar.add(avBuildLeg(-1, config));
  avatar.add(avBuildLeg(1, config));

  // 몸통
  avatar.add(avBuildBody(config, skin));

  // 팔
  avatar.add(avBuildArm(-1, config, skin));
  avatar.add(avBuildArm(1, config, skin));

  // 머리
  var head = avGroup('head');
  head.position.y = AV.headY;
  var face = avBuildFace(config.face, skin);
  head.add(face.group);
  head.add(avBuildEyes(config.eyes, face.headMesh));
  head.add(avBuildNose(config.nose, face.headMesh, skin));
  head.add(avBuildMouth(config.mouth, face.headMesh));
  head.add(avBuildHair(config.hair, hairColor, config.face));
  avatar.add(head);

  // 숨쉬기 애니메이션용 처음 위치 기억
  ['head', 'body', 'armL', 'armR'].forEach(function (name) {
    var part = avatar.getObjectByName(name);
    part.userData.baseY = part.position.y;
    part.userData.baseRotZ = part.rotation.z;
  });

  return avatar;
}


// ===== 숨쉬는 듯한 아주 약한 움직임 =====
// 매 프레임마다 호출하세요. time 은 초 단위 시간.
function animateIdle(group, time) {
  var breath = Math.sin(time * 1.8);

  var body = group.getObjectByName('body');
  var head = group.getObjectByName('head');
  var armL = group.getObjectByName('armL');
  var armR = group.getObjectByName('armR');

  if (body) body.position.y = body.userData.baseY + breath * 0.006;
  if (head) {
    head.position.y = head.userData.baseY + breath * 0.012;
    head.rotation.z = Math.sin(time * 0.7) * 0.02;
  }
  if (armL) {
    armL.position.y = armL.userData.baseY + breath * 0.008;
    armL.rotation.z = armL.userData.baseRotZ - breath * 0.015;
  }
  if (armR) {
    armR.position.y = armR.userData.baseY + breath * 0.008;
    armR.rotation.z = armR.userData.baseRotZ + breath * 0.015;
  }
}


// ===== 캐릭터 메모리 정리 (교체하거나 화면을 떠날 때) =====
function disposeAvatar(group) {
  group.traverse(function (obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
}
