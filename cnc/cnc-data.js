// ===== CNC 주문에 쓰는 고정 데이터 =====
// (Dentalk app.js / custom.js 의 상수를 정리해서 가져왔어요)

// 임플란트 브랜드 11종 (마지막 'Other' = 기타)
var IMPLANT_BRANDS = [
  'BIOTEM N', 'BIOTEM R',
  'Osstem US', 'Osstem TS',
  'Straumann BL', 'Straumann TL',
  'Nobel Active', 'Nobel Replace',
  'Zimmer TSV', 'Dentium SuperLine',
  'Other'
];

// VITA 쉐이드 14색
var TOOTH_COLORS = ['A1', 'A2', 'A3', 'A3.5', 'A4', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D2', 'D3', 'BL (Bleach)'];

// 쉐이드 버튼에 칠할 색 (실제 치아 색에 가까운 견본 색)
var VITA_BG = {
  'A1': '#f5ede0', 'A2': '#f2e5d0', 'A3': '#efdcc0', 'A3.5': '#ecce9e', 'A4': '#d4a86a',
  'B1': '#f7eedf', 'B2': '#f3e7cd', 'B3': '#e8d7aa',
  'C1': '#f0e9de', 'C2': '#dfd3bb', 'C3': '#c9b88e',
  'D2': '#f3e4c8', 'D3': '#d9c298',
  'BL (Bleach)': '#f9f5ee'
};

// 주문 진행 단계 7개 (진행 막대에 이 순서로 보여요)
// design_revision(디자인 수정 중)은 design_ready 자리에, cancelled(취소)는 막대 밖에 따로 표시해요
var ORDER_STAGES = [
  { key: 'submitted' },
  { key: 'confirmed' },
  { key: 'design_ready' },
  { key: 'approved' },
  { key: 'milling' },
  { key: 'shipped' },
  { key: 'done' }
];

// 진행 막대에서 몇 번째 단계인지 (0~6, 취소는 -1)
function stageIndex(stage) {
  if (stage === 'design_revision') stage = 'design_ready';
  for (var i = 0; i < ORDER_STAGES.length; i++) {
    if (ORDER_STAGES[i].key === stage) return i;
  }
  return -1;
}

// 끝난 주문인지 (완료 또는 취소)
function isClosedStage(stage) {
  return stage === 'done' || stage === 'cancelled';
}


// ===== FDI 치아 번호 32개 (사랑니 포함) =====
// 화면에서 보는 순서 그대로 (환자를 마주 보고: 오른쪽(R)이 화면 왼쪽)
var FDI_UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
var FDI_UPPER_LEFT  = [21, 22, 23, 24, 25, 26, 27, 28];
var FDI_LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
var FDI_LOWER_LEFT  = [31, 32, 33, 34, 35, 36, 37, 38];
var FDI_ALL = FDI_UPPER_RIGHT.concat(FDI_UPPER_LEFT, FDI_LOWER_RIGHT, FDI_LOWER_LEFT);

function isValidTooth(num) {
  return FDI_ALL.indexOf(Number(num)) !== -1;
}

// 치아 종류 번역 키 (번호 끝자리 1~8)
function toothTypeKey(num) {
  return 'tooth_type_' + (Number(num) % 10);
}

// "#16 1st Molar" (현재 언어)
function getToothName(num) {
  return '#' + num + ' ' + t(toothTypeKey(num));
}

// "#16 1st Molar" (영어 — 주문 데이터에 저장할 때)
function getToothNameEn(num) {
  return '#' + num + ' ' + tEn(toothTypeKey(num));
}

// 치아 정렬 순서 (차트 순서: 위 오른쪽 → 위 왼쪽 → 아래 오른쪽 → 아래 왼쪽)
function sortTeeth(list) {
  return list.slice().sort(function (a, b) {
    return FDI_ALL.indexOf(Number(a)) - FDI_ALL.indexOf(Number(b));
  });
}


// ===== 파일 규칙 =====
var FILE_MAX_COUNT = 10;
var FILE_MAX_BYTES = 50 * 1024 * 1024;   // 50MB
var FILE_3D_EXT = ['stl', 'ply', 'obj', '3mf'];
var FILE_IMAGE_EXT = ['jpg', 'jpeg', 'png'];
var FILE_ALLOWED_EXT = FILE_3D_EXT.concat(FILE_IMAGE_EXT, ['pdf']);

// 파일 이름에서 확장자 (소문자)
function fileExt(name) {
  var m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

// '3d' / 'image' / 'pdf' / 'other'
function fileKind(name) {
  var ext = fileExt(name);
  if (FILE_3D_EXT.indexOf(ext) !== -1) return '3d';
  if (FILE_IMAGE_EXT.indexOf(ext) !== -1) return 'image';
  if (ext === 'pdf') return 'pdf';
  return 'other';
}

// <input type="file" accept="..."> 에 넣을 값
var FILE_ACCEPT = FILE_ALLOWED_EXT.map(function (e) { return '.' + e; }).join(',');
