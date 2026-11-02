// ===== 건물 내부 지도 데이터: allAbut 체험관 =====
// 30 x 40 타일. 남쪽이 입구, 안쪽으로 갈수록 북쪽.
// 동선: 입구 → 01 RECEPTION → 02 TOOTH MAP(서쪽) → 03 DESIGN LAB(북서) → 04 SCAN DATA(북동) → 05 CHECKOUT(동쪽)

var GAME_INTERIORS = window.GAME_INTERIORS || {};
window.GAME_INTERIORS = GAME_INTERIORS;

GAME_INTERIORS['allabut-shop'] = {
  name: 'allAbut Experience Center',
  label: 'allAbut Experience Center',
  width: 30,
  height: 40,
  fill: 'floor',

  paint: [
    // 바깥 벽
    { tile: 'wall', x: 0,  y: 0,  w: 30, h: 1 },
    { tile: 'wall', x: 0,  y: 39, w: 30, h: 1 },
    { tile: 'wall', x: 0,  y: 0,  w: 1,  h: 40 },
    { tile: 'wall', x: 29, y: 0,  w: 1,  h: 40 },

    // 03 DESIGN LAB 방 (북서) - 동쪽 벽에 통로 (y 5~7)
    { tile: 'partition', x: 11, y: 1,  w: 1, h: 4 },
    { tile: 'partition', x: 11, y: 8,  w: 1, h: 5 },
    // 03 과 02 사이 (y 13) - 통로 (x 6~8)
    { tile: 'partition', x: 1,  y: 13, w: 5, h: 1 },
    { tile: 'partition', x: 9,  y: 13, w: 3, h: 1 },
    // 02 TOOTH MAP 방 (서쪽) - 동쪽 벽에 통로 (y 18~20), 남쪽은 막힘
    { tile: 'partition', x: 9,  y: 14, w: 1, h: 4 },
    { tile: 'partition', x: 9,  y: 21, w: 1, h: 4 },
    { tile: 'partition', x: 1,  y: 25, w: 9, h: 1 },

    // 04 SCAN DATA 방 (북동) - 서쪽 벽에 통로 (y 5~7)
    { tile: 'partition', x: 18, y: 1,  w: 1, h: 4 },
    { tile: 'partition', x: 18, y: 8,  w: 1, h: 5 },
    // 04 와 05 사이 (y 13) - 통로 (x 24~26)
    { tile: 'partition', x: 18, y: 13, w: 6, h: 1 },
    { tile: 'partition', x: 27, y: 13, w: 2, h: 1 },
    // 05 CHECKOUT 방 (동쪽) - 서쪽 벽에 통로 (y 18~20), 남쪽은 막힘
    { tile: 'partition', x: 20, y: 14, w: 1, h: 4 },
    { tile: 'partition', x: 20, y: 21, w: 1, h: 4 },
    { tile: 'partition', x: 20, y: 25, w: 9, h: 1 }
  ],

  // 바닥 골드 안내선 (데스크 순서대로 이어지는 점들, 가로·세로 선분)
  guide: [[15, 37], [15, 26], [10, 26], [10, 19], [4, 19], [7, 19], [7, 7], [6, 7], [24, 7], [25, 7], [25, 20]],

  entries: {
    entrance: { x: 15, y: 37, facing: 'up' }
  },
  exitTo: { zone: 'bangkok-soi', entry: 'from:allabut-shop' },

  // 미니맵에 표시할 구역 이름
  rooms: [
    { name: 'LOBBY',      x: 1,  y: 26, w: 28, h: 13 },
    { name: 'TOOTH MAP',  x: 1,  y: 14, w: 8,  h: 11 },
    { name: 'DESIGN LAB', x: 1,  y: 1,  w: 10, h: 12 },
    { name: 'SCAN DATA',  x: 19, y: 1,  w: 10, h: 12 },
    { name: 'CHECKOUT',   x: 21, y: 14, w: 8,  h: 11 }
  ],

  // 데스크 (facing: down = 플레이어가 아래(남쪽)에서 다가옴 / up = 위(북쪽)에서 다가옴)
  desks: [
    { id: 'reception', no: '01', title: 'RECEPTION',  npcName: 'Mina', x: 12, y: 25, w: 6, facing: 'down',
      npc: { gender: 'female', skin: 'skin_02', hair: 'hair_bob',      hairColor: 'hc_darkbrown', outfit: 'outfit_suit' } },
    { id: 'toothmap',  no: '02', title: 'TOOTH MAP',  npcName: 'Ken',  x: 3,  y: 18, w: 3, facing: 'down',
      npc: { gender: 'male',   skin: 'skin_03', hair: 'hair_short',    hairColor: 'hc_black',     outfit: 'outfit_scrubs' } },
    { id: 'designlab', no: '03', title: 'DESIGN LAB', npcName: 'Sora', x: 4,  y: 6,  w: 4, facing: 'down',
      npc: { gender: 'female', skin: 'skin_01', hair: 'hair_ponytail', hairColor: 'hc_blonde',    outfit: 'outfit_labcoat' } },
    { id: 'scandata',  no: '04', title: 'SCAN DATA',  npcName: 'Leo',  x: 22, y: 6,  w: 4, facing: 'down',
      npc: { gender: 'male',   skin: 'skin_05', hair: 'hair_curly',    hairColor: 'hc_black',     outfit: 'outfit_scrubs' } },
    { id: 'checkout',  no: '05', title: 'CHECKOUT',   npcName: 'Nara', x: 24, y: 21, w: 3, facing: 'up',
      npc: { gender: 'female', skin: 'skin_04', hair: 'hair_long',     hairColor: 'hc_brown',     outfit: 'outfit_labcoat' } }
  ],

  objects: [
    // EXIT 문 (남쪽 벽)
    { type: 'exit_door', x: 14, y: 39, w: 2, h: 1, solid: false,
      interact: { kind: 'exit', approach: { x: 15, y: 38 }, label: '▶ Exit' } },

    // 중앙 CNC 기계
    { type: 'cnc', x: 13, y: 14, w: 4, h: 3, label: 'PRECISION 5μm' },

    // 02: FDI 치아 배치도 보드 (데스크 뒤)
    { type: 'fdi_board', x: 2, y: 14, w: 4, h: 1 },
    // 03: 쉐이드 가이드 진열장
    { type: 'cabinet', x: 1, y: 2, w: 2, h: 2 },
    // 04: 모니터 벽
    { type: 'monitors', x: 21, y: 1, w: 6, h: 1 },
    // 로비: 소파 + 화분
    { type: 'sofa', x: 3, y: 30, w: 3, h: 1 },
    { type: 'sofa', x: 24, y: 30, w: 3, h: 1 },
    { type: 'plant', x: 1, y: 38 }, { type: 'plant', x: 28, y: 38 },
    { type: 'plant', x: 1, y: 26 }, { type: 'plant', x: 28, y: 26 },
    { type: 'plant', x: 1, y: 11 }, { type: 'plant', x: 28, y: 11 },
    // 05: 라운지 의자
    { type: 'chair', x: 22, y: 22 }, { type: 'chair', x: 28, y: 22 }
  ]
};
