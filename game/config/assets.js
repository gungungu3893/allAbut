// ===== 그림(텍스처) 이름 모음 =====
// 지금은 BootScene 에서 코드로 그린 임시 그림을 써요.
// 나중에 LimeZu Modern Interiors/Exteriors 같은 실제 에셋으로 바꿀 때는
// 이 파일의 이름(키)은 그대로 두고, 같은 키로 이미지를 불러오기만 하면 돼요.

var TILE = 32;     // 타일 한 칸 = 32 x 32 픽셀
var CHAR_W = 32;   // 캐릭터 한 프레임 가로 (1칸)
var CHAR_H = 64;   // 캐릭터 한 프레임 세로 (2칸 높이)
var PET_SIZE = 16; // 펫 한 프레임 (16 x 16)

var ASSETS = {
  // 바닥 타일들을 한 줄로 이어 붙인 타일셋 텍스처
  tileset: 'tileset',

  // 오브젝트
  objects: {
    shophouse: ['shophouse_cream', 'shophouse_pink', 'shophouse_mint', 'shophouse_yellow'],
    allabutBuilding: 'allabut_building',
    btsStation: 'bts_station',
    tree: 'tree',
    lamp: 'street_lamp',
    foodCart: 'food_cart',
    tuktuk: 'tuktuk',
    desk: 'desk_',          // 뒤에 폭(타일 수)이 붙어요: desk_4, desk_6 ...
    cnc: 'cnc_machine',
    fdiBoard: 'fdi_board',
    cabinet: 'shade_cabinet',
    monitors: 'monitor_wall',
    sofa: 'sofa',
    chair: 'lounge_chair',
    plant: 'plant',
    exitDoor: 'exit_door'
  },

  // 어깨 펫 (펫 id → 텍스처 키). 한 텍스처 = 2열(기본, 동작) x 4줄(아래·왼·오른·위)
  pets: {
    pet_cat: 'pet_cat',
    pet_parrot: 'pet_parrot',
    pet_hamster: 'pet_hamster',
    pet_puppy: 'pet_puppy',
    pet_tooth_buddy: 'pet_tooth_buddy'
  },

  // UI / 효과
  ui: {
    marker: 'marker',       // 클릭한 곳 골드 원
    arrow: 'next_arrow',    // 다음 데스크 위 ▼
    shadow: 'shadow'
  },

  // 캐릭터: 아바타 설정마다 'char_xxxx' 텍스처가 만들어져요 (3프레임 x 4방향, 한 프레임 32 x 64)
  characterPrefix: 'char_'
};

// 바닥 타일 순서 (타일셋 안의 번호 = 이 배열의 순서)
var TILE_TYPES = [
  'empty',      // 0
  'grass',      // 1 잔디 / 빈 땅
  'asphalt',    // 2 아스팔트
  'roadLine',   // 3 노란 중앙선
  'crosswalk',  // 4 횡단보도
  'sidewalk',   // 5 인도 (연회색 격자)
  'plaza',      // 6 광장 바닥
  'floor',      // 7 실내 타일 (웜그레이)
  'guide',      // 8 실내 골드 안내선
  'wall',       // 9 실내 벽 (흰색 + 네이비)
  'partition',  // 10 유리 파티션 (낮은 벽)
  'carpet',     // 11 골드 카펫
  'dark'        // 12 맵 바깥
];

// 지나갈 수 없는 바닥 타일
var BLOCKING_TILES = ['empty', 'wall', 'partition', 'dark'];

// 옷 색 (avatar-catalog.js 의 outfit id → 2D 캐릭터 색)
var OUTFIT_COLORS = {
  outfit_labcoat: { body: '#f2f4f7', trim: '#9cc3e6', legs: '#2b3443', shoes: '#1f2329' },
  outfit_scrubs:  { body: '#16386f', trim: '#2a5aa8', legs: '#16386f', shoes: '#e5e7eb' },
  outfit_suit:    { body: '#151b27', trim: '#D4AF37', legs: '#151b27', shoes: '#0d0f14' },
  outfit_hoodie:  { body: '#5b6576', trim: '#f2f4f7', legs: '#2f4a6b', shoes: '#e5e7eb' },
  outfit_polo:    { body: '#1d6f7a', trim: '#e9f3f4', legs: '#cbb994', shoes: '#5a3d2b' }
};
