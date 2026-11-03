// ================================================================
// line-webhook — LINE → allAbut 서버
// ================================================================
// LINE 공식계정(@925caqxb)에 친구추가하거나 메시지를 보내면 LINE 이 이 함수를 불러요.
//
// 하는 일
//  1) 진짜 LINE 이 보낸 요청인지 확인 (x-line-signature 를 LINE_CHANNEL_SECRET 으로 HMAC-SHA256 검증, 틀리면 401)
//  2) follow(친구추가)  → "Profile 화면의 연결 코드를 보내 주세요" 안내 (영어 + 태국어 + 한국어)
//  3) 글자 메시지        → AB-XXXX 연결 코드면 profiles.line_link_code 로 찾아서 line_user_id 저장
//                          (같은 LINE 계정이 다른 프로필에 연결돼 있으면 거기서는 해제)
//                          → 그 사용자 언어(profiles.lang)로 "연결 완료" 답장
//                          → 못 찾으면 "코드를 찾을 수 없어요" (3개 언어)
//                          → 코드가 아닌 일반 메시지는 아직 연결 안 된 사람에게만 짧은 안내
//  4) 답장은 reply API (replyToken) 로 보내요
//
// 배포: Supabase 대시보드 → Edge Functions → 이름 "line-webhook" → Verify JWT 끄기 (LINE 은 Supabase 로그인 토큰이 없어요)
// 비밀값(토큰·시크릿)은 코드에 쓰지 않고 Deno.env.get() 으로만 읽어요 (Supabase → Edge Functions → Secrets).
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 자동으로 넣어 주는 서버 전용 값이에요.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const LINE_CHANNEL_SECRET = Deno.env.get('LINE_CHANNEL_SECRET') ?? '';
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// LINE API 주소 (테스트용으로만 바꿔요. 보통은 비워 두면 https://api.line.me)
const LINE_API_BASE = Deno.env.get('LINE_API_BASE') ?? 'https://api.line.me';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// 사이트 주소: Supabase Secrets 에 SITE_URL 이 있으면 그것, 없으면 정식 도메인 (끝의 / 는 떼요)
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://allabut.com').replace(/\/+$/, '');
const SITE_PROFILE_URL = SITE_URL + '/#/profile';

// 서버 전용 관리 키로 접속 (RLS 를 건너뛰어요 — 이 함수 안에서만 사용)
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});


// ================================================================
// 문구
// ================================================================

// 친구추가 / 코드 못 찾음 / 일반 메시지 안내: 영어 + 태국어 + 한국어 3줄
const FOLLOW_TEXT = [
  'Welcome to allAbut! To receive order notifications, send the link code from the Profile page of the allAbut website (e.g. AB-7K2Q) to this chat.',
  'ยินดีต้อนรับสู่ allAbut! หากต้องการรับการแจ้งเตือนคำสั่งงาน กรุณาส่งรหัสเชื่อมต่อจากหน้าโปรไฟล์บนเว็บไซต์ allAbut (เช่น AB-7K2Q) มาที่แชทนี้',
  'allAbut 알림을 받으려면 allAbut 웹사이트 Profile 화면의 연결 코드(예: AB-7K2Q)를 이 채팅에 보내주세요.',
].join('\n\n') + '\n\n' + SITE_PROFILE_URL;

const NOT_FOUND_TEXT = [
  'We could not find this code. Please check the code on your Profile page and send it again.',
  'ไม่พบรหัสนี้ กรุณาตรวจสอบรหัสในหน้าโปรไฟล์แล้วส่งอีกครั้ง',
  '코드를 찾을 수 없어요. Profile 화면의 코드를 확인하고 다시 보내주세요.',
].join('\n\n');

const HINT_TEXT = [
  'To connect your account, please send the link code (e.g. AB-7K2Q) shown on your allAbut Profile page.',
  'หากต้องการเชื่อมต่อบัญชี กรุณาส่งรหัสเชื่อมต่อ (เช่น AB-7K2Q) จากหน้าโปรไฟล์ allAbut',
  '계정을 연결하려면 allAbut Profile 화면의 연결 코드(예: AB-7K2Q)를 보내주세요.',
].join('\n\n');

// 연결 완료: 사용자 언어로 (없는 언어는 영어)
const LINKED_TEXT: Record<string, string> = {
  en: '✅ Connected! You will now receive allAbut order notifications on LINE.',
  ko: '✅ 연결되었어요! 이제 allAbut 주문 알림을 LINE으로 받아요.',
  th: '✅ เชื่อมต่อแล้ว! คุณจะได้รับการแจ้งเตือนคำสั่งงาน allAbut ทาง LINE',
  zh: '✅ 已连接！您将通过 LINE 接收 allAbut 订单通知。',
  vi: '✅ Đã kết nối! Bạn sẽ nhận thông báo đơn hàng allAbut qua LINE.',
  es: '✅ ¡Conectado! Ahora recibirá las notificaciones de pedidos de allAbut en LINE.',
  tr: '✅ Bağlandı! allAbut sipariş bildirimlerini artık LINE üzerinden alacaksınız.',
  ar: '✅ تم الربط! ستصلك الآن إشعارات طلبات allAbut عبر LINE.',
  fa: '✅ متصل شد! از این پس اعلان‌های سفارش allAbut را در LINE دریافت می‌کنید.',
};


// ================================================================
// 도구
// ================================================================

// x-line-signature 확인: base64(HMAC-SHA256(채널 시크릿, 요청 본문 그대로))
async function verifySignature(body: string, signature: string | null): Promise<boolean> {
  if (!signature || !LINE_CHANNEL_SECRET) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(LINE_CHANNEL_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  let binary = '';
  for (const b of mac) binary += String.fromCharCode(b);
  return safeEqual(btoa(binary), signature);
}

// 글자 비교를 항상 같은 시간에 (비밀값 추측 공격 막기)
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// "ab-7k2q", "AB 7K2Q", "ab7k2q" → "AB-7K2Q" (형식이 아니면 null)
function normalizeCode(text: string): string | null {
  const s = String(text || '').toUpperCase().replace(/\s+/g, '');
  const m = /^AB-?([A-Z0-9]{4,8})$/.exec(s);
  return m ? 'AB-' + m[1] : null;
}

// LINE 사용자 id 모양 (U + 16진수 32자리)
function isLineUserId(id: unknown): boolean {
  return typeof id === 'string' && /^U[0-9a-f]{32}$/.test(id);
}

async function reply(replyToken: string, text: string): Promise<void> {
  if (!replyToken) return;
  try {
    const res = await fetch(LINE_API_BASE + '/v2/bot/message/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
    });
    if (!res.ok) console.error('LINE reply failed', res.status, await res.text());
  } catch (err) {
    console.error('LINE reply error', err);
  }
}


// ================================================================
// 이벤트 처리
// ================================================================

async function handleEvent(ev: any): Promise<void> {
  const userId: string = ev?.source?.userId ?? '';
  const replyToken: string = ev?.replyToken ?? '';

  // 친구추가
  if (ev.type === 'follow') {
    await reply(replyToken, FOLLOW_TEXT);
    return;
  }

  // 글자 메시지만 처리 (스티커·사진 등은 무시)
  if (ev.type !== 'message' || ev.message?.type !== 'text') return;
  if (!isLineUserId(userId)) return;   // 1:1 채팅이 아니면 (그룹 등) 무시

  const code = normalizeCode(ev.message.text);

  if (!code) {
    // 일반 메시지: 아직 연결 안 된 사람에게만 짧은 안내
    const { data: linked } = await db.from('profiles').select('id').eq('line_user_id', userId).limit(1);
    if (!linked || !linked.length) await reply(replyToken, HINT_TEXT);
    return;
  }

  // 연결 코드로 프로필 찾기
  const { data: profile, error } = await db.from('profiles').select('id, lang').eq('line_link_code', code).maybeSingle();
  if (error) {
    console.error('profile lookup failed', error);
    await reply(replyToken, NOT_FOUND_TEXT);
    return;
  }
  if (!profile) {
    await reply(replyToken, NOT_FOUND_TEXT);
    return;
  }

  // 같은 LINE 계정이 다른 프로필에 연결돼 있으면 거기서는 해제
  const unlink = await db.from('profiles').update({ line_user_id: null }).eq('line_user_id', userId).neq('id', profile.id);
  if (unlink.error) console.error('unlink other profiles failed', unlink.error);

  // 이 프로필에 연결
  const link = await db.from('profiles').update({ line_user_id: userId }).eq('id', profile.id);
  if (link.error) {
    console.error('link failed', link.error);
    await reply(replyToken, NOT_FOUND_TEXT);
    return;
  }

  const lang = typeof profile.lang === 'string' && LINKED_TEXT[profile.lang] ? profile.lang : 'en';
  await reply(replyToken, LINKED_TEXT[lang]);
}


// ================================================================
// 입구
// ================================================================
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  const body = await req.text();
  const ok = await verifySignature(body, req.headers.get('x-line-signature'));
  if (!ok) return new Response('invalid signature', { status: 401 });

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response('bad request', { status: 400 });
  }

  // LINE Developers 의 "Verify" 버튼은 events 가 빈 배열이에요 → 200 이면 성공
  for (const ev of payload?.events ?? []) {
    try {
      await handleEvent(ev);
    } catch (err) {
      console.error('event failed', err);
    }
  }
  return new Response('ok', { status: 200 });
});
