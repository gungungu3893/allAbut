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

var GAME_ZONES = window.GAME_ZONES || {};
window.GAME_ZONES = GAME_ZONES;

GAME_ZONES['bangkok-soi'] = {
  name: 'Soi allAbut, Bangkok',
  label: 'Soi allAbut · Bangkok',
  width: 40,
  height: 60,
  fill: 'grass',

  paint: [
    { tile: 'plaza',     x: 8,  y: 0,  w: 24, h: 6 },   // BTS 역 앞 광장
    { tile: 'sidewalk',  x: 13, y: 6,  w: 3,  h: 54 },  // 서쪽 인도
    { tile: 'asphalt',   x: 16, y: 6,  w: 7,  h: 54 },  // 도로
    { tile: 'roadLine',  x: 19, y: 6,  w: 1,  h: 54 },  // 노란 중앙선
    { tile: 'sidewalk',  x: 23, y: 6,  w: 3,  h: 54 },  // 동쪽 인도
    { tile: 'crosswalk', x: 16, y: 22, w: 7,  h: 2 },   // 횡단보도
    { tile: 'crosswalk', x: 16, y: 44, w: 7,  h: 2 },
    { tile: 'carpet',    x: 25, y: 29, w: 1,  h: 2 }    // allAbut 입구 골드 카펫
  ],

  spawn: { x: 18, y: 57, facing: 'up' },  // 골목 남쪽 입구

  entries: {
    'from:allabut-shop': { x: 25, y: 30, facing: 'left' }  // 체험관에서 나오면 서는 곳
  },

  objects: [
    // ----- 북쪽 끝 BTS 역 -----
    { type: 'bts_station', x: 12, y: 0, w: 16, h: 4,
      interact: { kind: 'portal', approach: { x: 19, y: 5 }, label: '💬', message: 'Other districts coming soon' } },

    // ----- 서쪽 숍하우스 (앞면이 동쪽 도로를 봄) -----
    { type: 'shophouse', x: 7, y: 8,  w: 6, h: 4, variant: 0, front: 'east', sign: 'Noodle' },
    { type: 'shophouse', x: 7, y: 12, w: 6, h: 4, variant: 2, front: 'east', sign: 'Pharmacy' },
    { type: 'shophouse', x: 7, y: 24, w: 6, h: 4, variant: 1, front: 'east' },
    { type: 'shophouse', x: 7, y: 28, w: 6, h: 4, variant: 3, front: 'east', sign: 'Mini Mart' },
    { type: 'shophouse', x: 7, y: 48, w: 6, h: 4, variant: 0, front: 'east', sign: 'Coffee' },

    // ----- 동쪽 숍하우스 (앞면이 서쪽 도로를 봄) -----
    { type: 'shophouse', x: 26, y: 8,  w: 6, h: 4, variant: 1, front: 'west', sign: 'Gold Shop' },
    { type: 'shophouse', x: 26, y: 12, w: 6, h: 4, variant: 3, front: 'west', sign: 'Massage' },
    { type: 'shophouse', x: 26, y: 40, w: 6, h: 4, variant: 2, front: 'west', sign: 'Noodle' },
    { type: 'shophouse', x: 26, y: 44, w: 6, h: 4, variant: 0, front: 'west' },
    { type: 'shophouse', x: 26, y: 50, w: 6, h: 4, variant: 1, front: 'west', sign: 'Mini Mart' },

    // ----- allAbut 빌딩 (골목 중간 동쪽, 문 = 입장 지점) -----
    { type: 'allabut_building', x: 26, y: 26, w: 9, h: 8, front: 'west', door: { x: 26, y: 29 },
      interact: { kind: 'enter', target: 'allabut-shop', approach: { x: 25, y: 29 }, label: '▶ Enter' } },

    // ----- 나무 (인도 + 빈 땅) -----
    { type: 'tree', x: 13, y: 20 }, { type: 'tree', x: 25, y: 22 }, { type: 'tree', x: 13, y: 36 },
    { type: 'tree', x: 25, y: 37 }, { type: 'tree', x: 13, y: 46 }, { type: 'tree', x: 25, y: 48 },
    { type: 'tree', x: 3, y: 10 },  { type: 'tree', x: 4, y: 20 },  { type: 'tree', x: 2, y: 34 },
    { type: 'tree', x: 5, y: 43 },  { type: 'tree', x: 3, y: 56 },  { type: 'tree', x: 36, y: 10 },
    { type: 'tree', x: 37, y: 21 }, { type: 'tree', x: 37, y: 38 }, { type: 'tree', x: 36, y: 50 },
    { type: 'tree', x: 34, y: 57 }, { type: 'tree', x: 9, y: 40 },  { type: 'tree', x: 30, y: 36 },

    // ----- 가로등 -----
    { type: 'lamp', x: 15, y: 16 }, { type: 'lamp', x: 23, y: 16 }, { type: 'lamp', x: 15, y: 34 },
    { type: 'lamp', x: 23, y: 34 }, { type: 'lamp', x: 15, y: 52 }, { type: 'lamp', x: 23, y: 54 },

    // ----- 노점 수레 -----
    { type: 'food_cart', x: 13, y: 32 }, { type: 'food_cart', x: 25, y: 19 }, { type: 'food_cart', x: 13, y: 54 }
  ],

  // ----- 도로를 왕복하는 뚝뚝 -----
  movers: [
    { type: 'tuktuk', path: [[17, 7], [17, 58]], speed: 2.4 },
    { type: 'tuktuk', path: [[21, 58], [21, 7]], speed: 2.0 }
  ],

  // ----- 인도의 행인 (buildAvatar 대신 무작위 색의 픽셀 캐릭터) -----
  pedestrians: [
    { path: [[14, 8], [14, 22]],  speed: 1.2, seed: 1 },
    { path: [[24, 34], [24, 46]], speed: 1.0, seed: 2 },
    { path: [[14, 38], [14, 50]], speed: 1.1, seed: 3 },
    { path: [[24, 49], [24, 57]], speed: 0.9, seed: 4 }
  ]
};
