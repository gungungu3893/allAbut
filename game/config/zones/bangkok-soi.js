// ===== 지역 지도 데이터: 방콕 소이(골목) =====
// 코드가 아니라 "목록 데이터"예요. 숫자만 바꾸면 지도가 바뀌어요.
//
// 좌표는 타일 단위 (1칸 = 32px). x = 가로(서쪽 0 → 동쪽), y = 세로(북쪽 0 → 남쪽)
// - fill   : 기본 바닥
// - paint  : 위에서부터 차례로 칠하는 바닥 사각형 { tile, x, y, w, h }
// - objects: 건물·나무 등 (차지하는 칸은 지나갈 수 없음)
//   interact 가 있으면 클릭해서 상호작용 (approach = 그 앞에 서는 칸)
// - movers : 경로를 왕복하는 것 (뚝뚝)
// - pedestrians: 인도에서 왔다갔다하는 행인
//
// 가로 배치: 빈 땅(0~1) | 서쪽 숍하우스(2~7) | 인도(8~9) | 도로(10~16, 중앙선 13) | 인도(17~18) | 동쪽 건물(19~25) | 빈 땅(26~27)

var GAME_ZONES = window.GAME_ZONES || {};
window.GAME_ZONES = GAME_ZONES;

GAME_ZONES['bangkok-soi'] = {
  name: 'Soi allAbut, Bangkok',
  label: 'Soi allAbut · Bangkok',
  width: 28,
  height: 40,
  fill: 'grass',

  paint: [
    { tile: 'plaza',     x: 4,  y: 0,  w: 20, h: 7 },   // BTS 역 앞 광장
    { tile: 'sidewalk',  x: 8,  y: 7,  w: 2,  h: 33 },  // 서쪽 인도
    { tile: 'asphalt',   x: 10, y: 7,  w: 7,  h: 33 },  // 도로
    { tile: 'roadLine',  x: 13, y: 7,  w: 1,  h: 33 },  // 노란 중앙선
    { tile: 'sidewalk',  x: 17, y: 7,  w: 2,  h: 33 },  // 동쪽 인도
    { tile: 'crosswalk', x: 10, y: 13, w: 7,  h: 2 },   // 횡단보도
    { tile: 'crosswalk', x: 10, y: 29, w: 7,  h: 2 },
    { tile: 'carpet',    x: 18, y: 18, w: 1,  h: 2 }    // allAbut 입구 골드 카펫
  ],

  spawn: { x: 13, y: 38, facing: 'up' },  // 골목 남쪽 입구

  entries: {
    'from:allabut-shop': { x: 18, y: 19, facing: 'left' }  // 체험관에서 나오면 서는 곳
  },

  objects: [
    // ----- 북쪽 끝 BTS 역 -----
    { type: 'bts_station', x: 6, y: 0, w: 16, h: 4,
      interact: { kind: 'portal', approach: { x: 13, y: 5 }, label: '💬', message: 'Other districts coming soon' } },

    // ----- 서쪽 숍하우스 (앞면이 동쪽 도로를 봄) -----
    { type: 'shophouse', x: 2, y: 7,  w: 6, h: 4, variant: 0, front: 'east', sign: 'Noodle' },
    { type: 'shophouse', x: 2, y: 11, w: 6, h: 4, variant: 2, front: 'east', sign: 'Pharmacy' },
    { type: 'shophouse', x: 2, y: 15, w: 6, h: 4, variant: 1, front: 'east' },
    { type: 'shophouse', x: 2, y: 21, w: 6, h: 4, variant: 3, front: 'east', sign: 'Mini Mart' },
    { type: 'shophouse', x: 2, y: 25, w: 6, h: 4, variant: 0, front: 'east', sign: 'Coffee' },
    { type: 'shophouse', x: 2, y: 30, w: 6, h: 4, variant: 2, front: 'east' },
    { type: 'shophouse', x: 2, y: 34, w: 6, h: 4, variant: 1, front: 'east', sign: 'Laundry' },

    // ----- 동쪽 숍하우스 (앞면이 서쪽 도로를 봄) -----
    { type: 'shophouse', x: 19, y: 7,  w: 6, h: 4, variant: 1, front: 'west', sign: 'Gold Shop' },
    { type: 'shophouse', x: 19, y: 11, w: 6, h: 4, variant: 3, front: 'west', sign: 'Massage' },
    { type: 'shophouse', x: 19, y: 23, w: 6, h: 4, variant: 2, front: 'west', sign: 'Noodle' },
    { type: 'shophouse', x: 19, y: 27, w: 6, h: 4, variant: 0, front: 'west' },
    { type: 'shophouse', x: 19, y: 31, w: 6, h: 4, variant: 3, front: 'west', sign: 'Mini Mart' },
    { type: 'shophouse', x: 19, y: 35, w: 6, h: 4, variant: 1, front: 'west', sign: 'Fruit' },

    // ----- allAbut 빌딩 (골목 중간 동쪽, 문 = 입장 지점) -----
    { type: 'allabut_building', x: 19, y: 15, w: 7, h: 7, front: 'west', door: { x: 19, y: 18 },
      interact: { kind: 'enter', target: 'allabut-shop', approach: { x: 18, y: 18 }, label: '▶ Enter' } },

    // ----- 나무 -----
    { type: 'tree', x: 3, y: 19 },  { type: 'tree', x: 6, y: 20 },  { type: 'tree', x: 8, y: 10 },
    { type: 'tree', x: 18, y: 26 }, { type: 'tree', x: 0, y: 13 },  { type: 'tree', x: 1, y: 28 },
    { type: 'tree', x: 0, y: 37 },  { type: 'tree', x: 26, y: 9 },  { type: 'tree', x: 27, y: 18 },
    { type: 'tree', x: 26, y: 28 }, { type: 'tree', x: 27, y: 36 }, { type: 'tree', x: 5, y: 29 },
    { type: 'tree', x: 3, y: 5 },   { type: 'tree', x: 24, y: 5 },

    // ----- 가로등 -----
    { type: 'lamp', x: 9, y: 16 },  { type: 'lamp', x: 17, y: 12 },
    { type: 'lamp', x: 9, y: 31 },  { type: 'lamp', x: 17, y: 33 },

    // ----- 노점 수레 -----
    { type: 'food_cart', x: 8, y: 23 }, { type: 'food_cart', x: 18, y: 9 }, { type: 'food_cart', x: 8, y: 35 }
  ],

  // ----- 도로를 왕복하는 뚝뚝 -----
  movers: [
    { type: 'tuktuk', path: [[11, 8], [11, 39]], speed: 2.4 },
    { type: 'tuktuk', path: [[15, 39], [15, 8]], speed: 2.0 }
  ],

  // ----- 인도의 행인 (무작위 외형, 펫이 있을 수도 있어요) -----
  pedestrians: [
    { path: [[9, 8], [9, 15]],   speed: 1.2, seed: 1 },
    { path: [[17, 23], [17, 32]], speed: 1.0, seed: 2 },
    { path: [[9, 17], [9, 30]],  speed: 1.1, seed: 3 },
    { path: [[17, 34], [17, 39]], speed: 0.9, seed: 4 }
  ]
};
