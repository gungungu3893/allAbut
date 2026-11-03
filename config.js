// Supabase 접속 정보
// (publishable 키는 브라우저에 공개돼도 되는 키예요. 데이터 보호는 Supabase의 RLS 정책이 담당해요.)
var SUPABASE_URL = 'https://jtqsbzihnduktffymncm.supabase.co';
var SUPABASE_KEY = 'sb_publishable_KQOqjDy0v-b_xY2KgoNh0g_L36S2Mh9';

// 사이트 정식 주소 (끝에 / 없이). 사이트 주소가 필요한 곳은 모두 이 값만 써요 — 다른 곳에 주소를 직접 쓰지 마세요.
// 주소가 바뀌면 여기 한 곳 + Supabase Edge Function Secrets 의 SITE_URL 만 바꾸면 돼요.
var SITE_URL = 'https://allabut.com';
