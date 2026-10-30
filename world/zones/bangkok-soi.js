// ===== 지역 지도 데이터: 방콕 소이(골목) =====
// 코드가 아니라 "목록 데이터"예요. 오브젝트를 추가·이동하려면 objects 에 한 줄만 고치면 돼요.
//
// 좌표: x = 동서 (서쪽 -, 동쪽 +), z = 남북 (북쪽 -, 남쪽 +), 단위 미터
// 오브젝트 형식: { type, x, z, rotY(도), variant, collider:[가로, 세로] 또는 colliders:[[x, z, 가로, 세로], ...] }
// - collider 는 오브젝트 기준(회전 전) 크기예요. 이 영역은 걸어서 지나갈 수 없어요.
// - occluder:true 면 카메라를 가릴 때 반투명해져요.
// - path 가 있으면 그 경로를 따라 천천히 왕복해요 (뚝뚝, 행인).

var ZONES = window.ZONES || {};
window.ZONES = ZONES;

ZONES['bangkok-soi'] = {
  name: 'Soi allAbut, Bangkok',
  label: 'Soi allAbut · Bangkok',
  size: { width: 60, depth: 140 },
  walkBounds: { minX: -21, maxX: 21, minZ: -63, maxZ: 66 },
  spawn: { x: 0, z: 60, facing: 'north' },
  timeOfDay: 'golden_hour',

  objects: [
    // ----- 도로 · 인도 · 횡단보도 -----
    { type: 'road', x: 0, z: 0, width: 8, length: 132 },
    { type: 'sidewalk', x: -5.5, z: 0, width: 3, length: 132, curbSide: 1 },
    { type: 'sidewalk', x: 5.5, z: 0, width: 3, length: 132, curbSide: -1 },
    { type: 'crosswalk', x: 0, z: 34 },
    { type: 'crosswalk', x: 0, z: -12 },

    // ----- 서쪽 숍하우스 (앞면이 동쪽을 봄: rotY 90) -----
    { type: 'shophouse', x: -12, z: 50,   rotY: 90, variant: 0, sign: 'Noodle',    lit: true,  collider: [6, 10], occluder: true },
    { type: 'shophouse', x: -12, z: 43.5, rotY: 90, variant: 1, sign: 'Pharmacy',  signBg: '#1f6f45', signFg: '#ffffff', lit: true, collider: [6, 10], occluder: true },
    { type: 'shophouse', x: -12, z: 37,   rotY: 90, variant: 2, collider: [6, 10], occluder: true },
    { type: 'shophouse', x: -12, z: 20,   rotY: 90, variant: 3, sign: 'Mini Mart', signBg: '#d35400', signFg: '#ffffff', lit: true, collider: [6, 10], occluder: true },
    { type: 'shophouse', x: -12, z: 13.5, rotY: 90, variant: 0, sign: 'Massage',   signBg: '#6b2d5c', signFg: '#ffd9f0', collider: [6, 10], occluder: true },
    { type: 'shophouse', x: -12, z: -14,  rotY: 90, variant: 1, sign: 'Coffee',    signBg: '#3b2a20', signFg: '#f3d9b1', lit: true, collider: [6, 10], occluder: true },

    // ----- 동쪽 숍하우스 (앞면이 서쪽을 봄: rotY -90) -----
    { type: 'shophouse', x: 12, z: 50,   rotY: -90, variant: 2, sign: 'Fruit',     signBg: '#2f7d4f', signFg: '#fff6c2', collider: [6, 10], occluder: true },
    { type: 'shophouse', x: 12, z: 43.5, rotY: -90, variant: 3, sign: 'Laundry',   signBg: '#2e86ab', signFg: '#ffffff', collider: [6, 10], occluder: true },
    { type: 'shophouse', x: 12, z: 30,   rotY: -90, variant: 1, sign: 'Gold Shop', signBg: '#8a1c1c', signFg: '#ffd56b', lit: true, collider: [6, 10], occluder: true },
    { type: 'shophouse', x: 12, z: -14,  rotY: -90, variant: 0, collider: [6, 10], occluder: true },
    { type: 'shophouse', x: 12, z: -20.5, rotY: -90, variant: 2, sign: 'Noodle',   collider: [6, 10], occluder: true },
    { type: 'shophouse', x: 12, z: -27,  rotY: -90, variant: 3, sign: 'Mini Mart', signBg: '#d35400', signFg: '#ffffff', collider: [6, 10], occluder: true },

    // ----- allAbut 빌딩 (골목 중간 동쪽) -----
    { type: 'allabut_building', id: 'allabut', x: 13, z: 14, rotY: -90, width: 18, depth: 12,
      enterable: true, interior: 'allabut-shop', collider: [18, 12], occluder: true },

    // ----- BTS 고가 선로 + 역 (북쪽) -----
    { type: 'bts_track', x: 0, z: -50, rotY: 0, length: 70, height: 8, pillars: [-12, 12],
      colliders: [[-12, 0, 1.6, 1.6], [12, 0, 1.6, 1.6]] },
    { type: 'bts_station', x: 0, z: -57.5, rotY: 0, width: 22, depth: 9, stairX: -6, portal: true,
      colliders: [[-9.5, -3.3, 1.5, 1.5], [9.5, -3.3, 1.5, 1.5], [-9.5, 3.3, 1.5, 1.5], [9.5, 3.3, 1.5, 1.5], [-6, 8.5, 3, 9.2]],
      occluder: true },

    // ----- 야자수 (인도) -----
    { type: 'tree', x: -6.4, z: 56, seed: 0.3, collider: [0.6, 0.6] },
    { type: 'tree', x: 6.4,  z: 56, seed: 1.1, collider: [0.6, 0.6] },
    { type: 'tree', x: -6.4, z: 27, seed: 2.2, collider: [0.6, 0.6] },
    { type: 'tree', x: 6.4,  z: 37, seed: 0.7, collider: [0.6, 0.6] },
    { type: 'tree', x: -6.4, z: 5,  seed: 1.9, collider: [0.6, 0.6] },
    { type: 'tree', x: -6.4, z: -4, seed: 2.8, collider: [0.6, 0.6] },
    { type: 'tree', x: 6.4,  z: -4, seed: 0.1, collider: [0.6, 0.6] },
    { type: 'tree', x: -6.4, z: -30, seed: 1.4, collider: [0.6, 0.6] },
    { type: 'tree', x: 6.4,  z: -36, seed: 2.5, collider: [0.6, 0.6] },

    // ----- 전봇대 (wireGroup 이 같은 것끼리 전깃줄로 이어짐) -----
    { type: 'power_pole', x: -4.5, z: 62,  wireGroup: 'west', collider: [0.4, 0.4] },
    { type: 'power_pole', x: -4.5, z: 46,  wireGroup: 'west', variant: 1, collider: [0.4, 0.4] },
    { type: 'power_pole', x: -4.5, z: 30,  wireGroup: 'west', collider: [0.4, 0.4] },
    { type: 'power_pole', x: -4.5, z: 10,  wireGroup: 'west', collider: [0.4, 0.4] },
    { type: 'power_pole', x: -4.5, z: -8,  wireGroup: 'west', variant: 1, collider: [0.4, 0.4] },
    { type: 'power_pole', x: -4.5, z: -26, wireGroup: 'west', collider: [0.4, 0.4] },
    { type: 'power_pole', x: -4.5, z: -42, wireGroup: 'west', collider: [0.4, 0.4] },
    { type: 'power_pole', x: 4.5,  z: 58,  wireGroup: 'east', collider: [0.4, 0.4] },
    { type: 'power_pole', x: 4.5,  z: 40,  wireGroup: 'east', variant: 1, collider: [0.4, 0.4] },
    { type: 'power_pole', x: 4.5,  z: 24,  wireGroup: 'east', collider: [0.4, 0.4] },
    { type: 'power_pole', x: 4.5,  z: -6,  wireGroup: 'east', collider: [0.4, 0.4] },
    { type: 'power_pole', x: 4.5,  z: -24, wireGroup: 'east', variant: 1, collider: [0.4, 0.4] },
    { type: 'power_pole', x: 4.5,  z: -40, wireGroup: 'east', collider: [0.4, 0.4] },

    // ----- 가로등 (rotY 로 불빛이 도로 쪽을 향함) -----
    { type: 'street_lamp', x: -4.7, z: 52, rotY: 90,  collider: [0.3, 0.3] },
    { type: 'street_lamp', x: 4.7,  z: 32, rotY: -90, collider: [0.3, 0.3] },
    { type: 'street_lamp', x: -4.7, z: 18, rotY: 90,  collider: [0.3, 0.3] },
    { type: 'street_lamp', x: 4.7,  z: 2,  rotY: -90, collider: [0.3, 0.3] },
    { type: 'street_lamp', x: -4.7, z: -18, rotY: 90, collider: [0.3, 0.3] },
    { type: 'street_lamp', x: 4.7,  z: -32, rotY: -90, lit: false, collider: [0.3, 0.3] },

    // ----- 노점 수레 -----
    { type: 'food_cart', x: -5.4, z: 31,  rotY: 90,  color: '#c0392b', parasol: '#f2c14e', collider: [1.8, 1.2] },
    { type: 'food_cart', x: 5.4,  z: 36,  rotY: -90, color: '#2e86ab', parasol: '#e74c3c', collider: [1.8, 1.2] },
    { type: 'food_cart', x: -5.4, z: -1,  rotY: 90,  color: '#27ae60', parasol: '#ffffff', collider: [1.8, 1.2] },
    { type: 'food_cart', x: 5.4,  z: -9,  rotY: -90, color: '#d35400', parasol: '#2ecc71', collider: [1.8, 1.2] },

    // ----- 뚝뚝 (도로 위 경로를 천천히 왕복) -----
    { type: 'tuktuk', path: [[2, 60], [2, -44]], speed: 3.2, color: '#1e6fb8' },
    { type: 'tuktuk', path: [[-2, -44], [-2, 60]], speed: 2.6, color: '#d6336c' },

    // ----- 행인 (인도 위 구간을 천천히 걸어다님, mobile:false 는 모바일에서 생략) -----
    { type: 'pedestrian', path: [[-5.2, 58], [-5.2, 34]], speed: 1.1, seed: 1 },
    { type: 'pedestrian', path: [[5.95, 40], [5.95, 52]], speed: 1.0, seed: 2 },
    { type: 'pedestrian', path: [[-5.9, -26], [-5.9, -6]], speed: 1.2, seed: 3 },
    { type: 'pedestrian', path: [[5.2, -32], [5.2, -14]], speed: 0.9, seed: 4, mobile: false },
    { type: 'pedestrian', path: [[-5.2, 22], [-5.2, 10]], speed: 1.0, seed: 5, mobile: false },
    { type: 'pedestrian', path: [[5.9, 60], [5.9, 54]], speed: 0.8, seed: 6, mobile: false },

    // ----- 먼 배경: 사원 지붕 (북서쪽, 접근 불가) -----
    { type: 'temple_roof', x: -46, z: -100, rotY: 25, scale: 1.4 },

    // ----- 배경 건물 덩어리 (숍하우스 뒤쪽) -----
    { type: 'block', x: -26, z: 40,  width: 8, depth: 18, height: 14, color: '#cbbfa8' },
    { type: 'block', x: -27, z: 10,  width: 9, depth: 16, height: 22, color: '#b9b2a6' },
    { type: 'block', x: -26, z: -20, width: 8, depth: 20, height: 17, color: '#d2c3ad' },
    { type: 'block', x: 27,  z: 46,  width: 9, depth: 14, height: 18, color: '#c4b9a5' },
    { type: 'block', x: 26,  z: -12, width: 8, depth: 22, height: 26, color: '#b5ada0' },
    { type: 'block', x: -14, z: -78, width: 18, depth: 10, height: 30, color: '#a9a49c' },
    { type: 'block', x: 16,  z: -76, width: 14, depth: 12, height: 38, color: '#9fa3a8' },
    { type: 'block', x: 0,   z: 82,  width: 30, depth: 8, height: 16, color: '#c8b9a2' }
  ]
};
