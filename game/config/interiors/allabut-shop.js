// ===== 건물 내부 지도 데이터: allAbut 체험관 =====
// 22 x 28 타일. 남쪽이 입구, 안쪽으로 갈수록 북쪽.
// 동선: 입구 → 01 RECEPTION → 02 TOOTH MAP(서쪽) → 03 DESIGN LAB(북서) → 04 SCAN DATA(북동) → 05 CHECKOUT(동쪽)

var GAME_INTERIORS = window.GAME_INTERIORS || {};
window.GAME_INTERIORS = GAME_INTERIORS;

GAME_INTERIORS['allabut-shop'] = {
  name: 'allAbut Experience Center',
  label: 'allAbut Experience Center',
  width: 22,
  height: 28,
  fill: 'floor',

  paint: [
    // 바깥 벽
    { tile: 'wall', x: 0,  y: 0,  w: 22, h: 1 },
    { tile: 'wall', x: 0,  y: 27, w: 22, h: 1 },
    { tile: 'wall', x: 0,  y: 0,  w: 1,  h: 28 },
    { tile: 'wall', x: 21, y: 0,  w: 1,  h: 28 },

    // 03 DESIGN LAB 방 (북서, x1~7 y1~8) - 동쪽 벽에 통로 (y 3~5)
    { tile: 'partition', x: 8,  y: 1,  w: 1, h: 2 },
    { tile: 'partition', x: 8,  y: 6,  w: 1, h: 3 },
    // 03 과 02 사이 (y 9) - 통로 (x 4~6)
    { tile: 'partition', x: 1,  y: 9,  w: 3, h: 1 },
    { tile: 'partition', x: 7,  y: 9,  w: 2, h: 1 },
    // 02 TOOTH MAP 방 (서쪽, x1~6 y10~17) - 동쪽 벽에 통로 (y 13~15), 남쪽은 막힘
    { tile: 'partition', x: 7,  y: 10, w: 1, h: 3 },
    { tile: 'partition', x: 7,  y: 16, w: 1, h: 2 },
    { tile: 'partition', x: 1,  y: 18, w: 7, h: 1 },

    // 04 SCAN DATA 방 (북동, x14~20 y1~8) - 서쪽 벽에 통로 (y 3~5)
    { tile: 'partition', x: 13, y: 1,  w: 1, h: 2 },
    { tile: 'partition', x: 13, y: 6,  w: 1, h: 3 },
    // 04 와 05 사이 (y 9) - 통로 (x 16~18)
    { tile: 'partition', x: 13, y: 9,  w: 3, h: 1 },
    { tile: 'partition', x: 19, y: 9,  w: 2, h: 1 },
    // 05 CHECKOUT 방 (동쪽, x15~20 y10~17) - 서쪽 벽에 통로 (y 13~15), 남쪽은 막힘
    { tile: 'partition', x: 14, y: 10, w: 1, h: 3 },
    { tile: 'partition', x: 14, y: 16, w: 1, h: 2 },
    { tile: 'partition', x: 14, y: 18, w: 7, h: 1 }
  ],

  // 바닥 골드 안내선 (데스크 순서대로 이어지는 점들, 가로·세로 선분)
  guide: [[11, 25], [11, 19], [8, 19], [8, 14], [3, 14], [5, 14], [5, 5], [3, 5], [18, 5], [17, 5], [17, 14]],

  entries: {
    entrance: { x: 11, y: 25, facing: 'up' }
  },
  exitTo: { zone: 'bangkok-soi', entry: 'from:allabut-shop' },

  // 미니맵에 표시할 구역 이름
  rooms: [
    { name: 'LOBBY',      x: 1,  y: 19, w: 20, h: 8 },
    { name: 'TOOTH MAP',  x: 1,  y: 10, w: 6,  h: 8 },
    { name: 'DESIGN LAB', x: 1,  y: 1,  w: 7,  h: 8 },
    { name: 'SCAN DATA',  x: 14, y: 1,  w: 7,  h: 8 },
    { name: 'CHECKOUT',   x: 15, y: 10, w: 6,  h: 8 }
  ],

  // 데스크 (facing: down = 플레이어가 아래(남쪽)에서 다가옴 / up = 위(북쪽)에서 다가옴)
  desks: [
    { id: 'reception', no: '01', title: 'RECEPTION',  npcName: 'Mina', x: 9,  y: 18, w: 4, facing: 'down',
      npc: { gender: 'female', skin: 'skin_02', hair: 'hair_bob',      hairColor: 'hc_darkbrown', outfit: 'outfit_suit' } },
    { id: 'toothmap',  no: '02', title: 'TOOTH MAP',  npcName: 'Ken',  x: 2,  y: 13, w: 3, facing: 'down',
      npc: { gender: 'male',   skin: 'skin_03', hair: 'hair_short',    hairColor: 'hc_black',     outfit: 'outfit_scrubs' } },
    { id: 'designlab', no: '03', title: 'DESIGN LAB', npcName: 'Sora', x: 2,  y: 4,  w: 3, facing: 'down',
      npc: { gender: 'female', skin: 'skin_01', hair: 'hair_ponytail', hairColor: 'hc_blonde',    outfit: 'outfit_labcoat' } },
    { id: 'scandata',  no: '04', title: 'SCAN DATA',  npcName: 'Leo',  x: 17, y: 4,  w: 3, facing: 'down',
      npc: { gender: 'male',   skin: 'skin_05', hair: 'hair_curly',    hairColor: 'hc_black',     outfit: 'outfit_scrubs' } },
    { id: 'checkout',  no: '05', title: 'CHECKOUT',   npcName: 'Nara', x: 16, y: 15, w: 3, facing: 'up',
      npc: { gender: 'female', skin: 'skin_04', hair: 'hair_long',     hairColor: 'hc_brown',     outfit: 'outfit_labcoat' } }
  ],

  objects: [
    // EXIT 문 (남쪽 벽)
    { type: 'exit_door', x: 10, y: 27, w: 2, h: 1, solid: false,
      interact: { kind: 'exit', approach: { x: 11, y: 26 }, label: '▶ Exit' } },

    // 중앙 CNC 기계
    { type: 'cnc', x: 9, y: 10, w: 4, h: 3, label: 'PRECISION 5μm' },

    // 02: FDI 치아 배치도 보드 (데스크 뒤)
    { type: 'fdi_board', x: 1, y: 10, w: 4, h: 1 },
    // 03: 쉐이드 가이드 진열장
    { type: 'cabinet', x: 5, y: 1, w: 2, h: 2 },
    // 04: 모니터 벽
    { type: 'monitors', x: 15, y: 1, w: 6, h: 1 },
    // 로비: 소파 + 화분
    { type: 'sofa', x: 2, y: 22, w: 3, h: 1 },
    { type: 'sofa', x: 17, y: 22, w: 3, h: 1 },
    { type: 'plant', x: 1, y: 26 }, { type: 'plant', x: 20, y: 26 },
    { type: 'plant', x: 1, y: 19 }, { type: 'plant', x: 20, y: 19 },
    { type: 'plant', x: 1, y: 8 },  { type: 'plant', x: 20, y: 8 },
    // 05: 라운지 의자
    { type: 'chair', x: 15, y: 16 }, { type: 'chair', x: 20, y: 16 }
  ]
};
