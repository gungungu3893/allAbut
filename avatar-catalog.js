// ===== 아바타 꾸미기 아이템 목록 =====
// 새 아이템을 추가하려면 해당 카테고리 배열에 한 줄만 추가하면 돼요.
// - id     : 고유 이름 (저장될 때 이 값이 저장돼요)
// - name   : 화면에 보이는 이름
// - price  : 0 이면 무료, 0보다 크면 가격 뱃지가 표시돼요
// - locked : true 면 자물쇠가 표시되고 선택할 수 없어요
// - color  : 색상 아이템에만 있어요 (동그란 색 칩으로 표시)

var AVATAR_CATALOG = {

  gender: [
    { id: 'male',   name: 'Male',   price: 0, locked: false },
    { id: 'female', name: 'Female', price: 0, locked: false }
  ],

  skin: [
    { id: 'skin_01', name: 'Porcelain', color: '#ffe0cc', price: 0, locked: false },
    { id: 'skin_02', name: 'Light',     color: '#f5cba7', price: 0, locked: false },
    { id: 'skin_03', name: 'Warm',      color: '#e0ac80', price: 0, locked: false },
    { id: 'skin_04', name: 'Tan',       color: '#c68642', price: 0, locked: false },
    { id: 'skin_05', name: 'Brown',     color: '#8d5524', price: 0, locked: false },
    { id: 'skin_06', name: 'Deep',      color: '#5c3a21', price: 0, locked: false }
  ],

  face: [
    { id: 'face_round',  name: 'Round',  price: 0, locked: false },
    { id: 'face_oval',   name: 'Oval',   price: 0, locked: false },
    { id: 'face_square', name: 'Square', price: 0, locked: false }
  ],

  eyes: [
    { id: 'eyes_dot',   name: 'Dot',   price: 0, locked: false },
    { id: 'eyes_round', name: 'Round', price: 0, locked: false },
    { id: 'eyes_smile', name: 'Smile', price: 0, locked: false },
    { id: 'eyes_sharp', name: 'Sharp', price: 0, locked: false }
  ],

  nose: [
    { id: 'nose_small', name: 'Small', price: 0, locked: false },
    { id: 'nose_round', name: 'Round', price: 0, locked: false },
    { id: 'nose_none',  name: 'None',  price: 0, locked: false }
  ],

  mouth: [
    { id: 'mouth_smile', name: 'Smile', price: 0, locked: false },
    { id: 'mouth_flat',  name: 'Flat',  price: 0, locked: false },
    { id: 'mouth_open',  name: 'Open',  price: 0, locked: false },
    { id: 'mouth_grin',  name: 'Grin',  price: 0, locked: false }
  ],

  hair: [
    { id: 'hair_bald',     name: 'Bald',          price: 0, locked: false },
    { id: 'hair_short',    name: 'Short Crop',    price: 0, locked: false },
    { id: 'hair_sidepart', name: 'Side Part',     price: 0, locked: false },
    { id: 'hair_curly',    name: 'Curly',         price: 0, locked: false },
    { id: 'hair_bob',      name: 'Bob',           price: 0, locked: false },
    { id: 'hair_long',     name: 'Long Straight', price: 0, locked: false },
    { id: 'hair_ponytail', name: 'Ponytail',      price: 0, locked: false }
  ],

  hairColor: [
    { id: 'hc_black',     name: 'Black',      color: '#1b1b1f', price: 0, locked: false },
    { id: 'hc_darkbrown', name: 'Dark Brown', color: '#3b2417', price: 0, locked: false },
    { id: 'hc_brown',     name: 'Brown',      color: '#6b4226', price: 0, locked: false },
    { id: 'hc_blonde',    name: 'Blonde',     color: '#d9b46a', price: 0, locked: false },
    { id: 'hc_gray',      name: 'Gray',       color: '#9aa0a6', price: 0, locked: false },
    { id: 'hc_navy',      name: 'Navy',       color: '#1c3a6e', price: 0, locked: false }
  ],

  outfit: [
    { id: 'outfit_labcoat', name: 'White Lab Coat', price: 0, locked: false },
    { id: 'outfit_scrubs',  name: 'Navy Scrubs',    price: 0, locked: false },
    { id: 'outfit_suit',    name: 'Gold-Trim Suit', price: 0, locked: false },
    { id: 'outfit_hoodie',  name: 'Casual Hoodie',  price: 0, locked: false },
    { id: 'outfit_polo',    name: 'Polo Shirt',     price: 0, locked: false }
  ]
};


// 꾸미기 화면의 탭 순서와 탭 이름
var AVATAR_CATEGORIES = [
  { key: 'gender',    label: 'Gender' },
  { key: 'skin',      label: 'Skin' },
  { key: 'face',      label: 'Face' },
  { key: 'eyes',      label: 'Eyes' },
  { key: 'nose',      label: 'Nose' },
  { key: 'mouth',     label: 'Mouth' },
  { key: 'hair',      label: 'Hair' },
  { key: 'hairColor', label: 'Hair Color' },
  { key: 'outfit',    label: 'Outfit' }
];


// 기본 아바타: 각 카테고리의 첫 번째 아이템
var DEFAULT_AVATAR = {};
AVATAR_CATEGORIES.forEach(function (cat) {
  DEFAULT_AVATAR[cat.key] = AVATAR_CATALOG[cat.key][0].id;
});


// 카테고리와 id로 아이템 찾기 (없으면 null)
function getCatalogItem(category, id) {
  var list = AVATAR_CATALOG[category] || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}


// 저장된 아바타 값 정리하기
// (빠진 카테고리나, 목록에서 사라진 아이템이 있으면 기본값으로 채워요)
function normalizeAvatarConfig(config) {
  var result = {};
  AVATAR_CATEGORIES.forEach(function (cat) {
    var id = config && config[cat.key];
    result[cat.key] = getCatalogItem(cat.key, id) ? id : DEFAULT_AVATAR[cat.key];
  });
  return result;
}
