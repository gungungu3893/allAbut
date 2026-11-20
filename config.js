// Supabase 접속 정보
// (publishable 키는 브라우저에 공개돼도 되는 키예요. 데이터 보호는 Supabase의 RLS 정책이 담당해요.)
var SUPABASE_URL = 'https://jtqsbzihnduktffymncm.supabase.co';
var SUPABASE_KEY = 'sb_publishable_KQOqjDy0v-b_xY2KgoNh0g_L36S2Mh9';

// 사이트 정식 주소 (끝에 / 없이). 사이트 주소가 필요한 곳은 모두 이 값만 써요 — 다른 곳에 주소를 직접 쓰지 마세요.
// 주소가 바뀌면 여기 한 곳 + Supabase Edge Function Secrets 의 SITE_URL 만 바꾸면 돼요.
var SITE_URL = 'https://allabut.com';

// 로봇 차단 (Cloudflare Turnstile) 사이트 키 — 공개돼도 되는 키예요. 비워 두면 위젯을 숨기고 예전처럼 동작해요.
// ⚠️ 시크릿 키는 여기에 넣지 마세요 → Supabase 대시보드 Authentication → Bot and Abuse Protection 에만 넣어요.
var TURNSTILE_SITE_KEY = '0x4AAAAAAF8VDP_n3vg55h4E';

// 사이트 디자인 스위치 — 'mono' = 흑백 미니멀(새 디자인) / 'classic' = 예전 디자인(네이비 · 골드 · 다크 랜딩 · 불꽃 인트로)
//   'classic' 으로 바꾸면 모든 화면이 예전과 완전히 같아요 (새 스타일은 css/theme-mono.css 에만 있고 mono 일 때만 적용).
//   theme.js 가 <html data-site-theme="..."> 를 붙여요. 다른 값이면 'classic'.
var SITE_THEME = 'mono';

// mono 랜딩의 "주문 5단계" 면 위쪽에 보여 줄 사진 주소 (비워 두면 사진 자리 없음). 예: 'assets/landing/abutment.jpg' (build.sh 목록에 그 폴더도 추가)
var LANDING_IMAGE = '';
