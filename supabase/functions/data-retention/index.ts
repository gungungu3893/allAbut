// ================================================================
// allAbut — data-retention (주문 파일 2년 보관 후 자동 삭제, sql/020_order_file_retention.sql)
// ================================================================
// 누가 부르나요
//   pg_cron 'allabut-data-retention' (매일 방콕 02:15) 과 관리자 Settings 의 "지금 실행" → DB 함수 run_data_retention()
//   → pg_net 이 이 함수를 POST 로 불러요. 헤더 x-notify-secret = NOTIFY_SECRET (line-notify 와 같은 비밀값)
//
// 하는 일
//   1) retention_begin_run(p_trigger)  : 설정(모드 · 보관 개월 · 한 번에 처리할 수) + 보관 기간이 지난 주문 목록 + 각 주문의 파일 [{ bucket, path }]
//   2) 주문마다
//      - 미리보기(preview): 파일을 지우지 않고 retention_finish_order(…, 찾은 파일 수, 0) → 목록만 기록
//      - 실제 삭제(delete): Storage 에서 파일 삭제 (cnc-files · cnc-designs) → 성공하면 retention_finish_order 가
//        주문 안의 환자 ID · 메모 · 파일 이름 · 파일 경로 · 단계 기록 메모를 지우고 "파일 삭제됨" 표시
//        삭제에 실패하면 오류만 기록하고 주문은 그대로 → 다음 실행 때 다시
//      - 이미 없는 파일(누가 먼저 지웠음)은 오류가 아니에요 (지울 것이 없으니 끝난 것)
//   3) retention_end_run(run, 메모)
//   시간이 너무 오래 걸리면(50초) 남은 주문은 다음 실행으로 넘겨요.
//
// 비밀값 (코드에 쓰지 않아요 — Supabase → Edge Functions → Secrets)
//   NOTIFY_SECRET              line-notify 와 같은 값 (이미 있으면 그대로)
//   SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY  Supabase 가 자동으로 넣어 줘요 (서비스 키는 이 함수 안에서만, 브라우저에는 절대 없음)
// 배포: supabase functions deploy data-retention --no-verify-jwt  (설정 안내: RETENTION_SETUP.md)

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const NOTIFY_SECRET = Deno.env.get('NOTIFY_SECRET') ?? '';

const ALLOWED_BUCKETS = ['cnc-files', 'cnc-designs'];   // 이 두 버킷 말고는 절대 지우지 않아요
const REMOVE_CHUNK = 100;                                // Storage 삭제 한 번에 보내는 파일 수
const TIME_BUDGET_MS = 50_000;                           // 이보다 오래 걸리면 남은 주문은 다음 실행으로

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type FileRef = { bucket: string; path: string };
type OrderJob = { id: string; user_id?: string; closed_at?: string; files: FileRef[] };
type BeginResult = { run_id: string; mode: 'preview' | 'delete'; months: number; batch_limit: number; due_total: number; orders: OrderJob[] };

// 시간에 상관없이 같은 속도로 비교 (비밀값 추측 방지)
function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// 파일 경로가 안전한지 (빈 값 · 앞의 / · .. 금지)
function safePath(p: unknown): p is string {
  return typeof p === 'string' && p.length > 0 && p.length < 1024 && !p.startsWith('/') && !p.split('/').includes('..');
}

// 한 주문의 파일 삭제 → { found, deleted, error }
async function removeFiles(files: FileRef[]): Promise<{ found: number; deleted: number; error: string | null }> {
  const byBucket: Record<string, string[]> = {};
  for (const f of files || []) {
    if (!f || !ALLOWED_BUCKETS.includes(f.bucket) || !safePath(f.path)) continue;
    (byBucket[f.bucket] ||= []).push(f.path);
  }
  let found = 0;
  let deleted = 0;
  for (const bucket of Object.keys(byBucket)) {
    const paths = Array.from(new Set(byBucket[bucket]));
    found += paths.length;
    for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
      const chunk = paths.slice(i, i + REMOVE_CHUNK);
      const { data, error } = await db.storage.from(bucket).remove(chunk);
      if (error) return { found, deleted, error: `storage ${bucket}: ${error.message || String(error)}`.slice(0, 400) };
      deleted += Array.isArray(data) ? data.length : 0;   // 이미 없던 파일은 결과에 안 나와요 (오류 아님)
    }
  }
  return { found, deleted, error: null };
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}

async function runRetention(trigger: string) {
  const started = Date.now();
  const begin = await rpc<BeginResult>('retention_begin_run', { p_trigger: trigger === 'manual' ? 'manual' : 'cron' });
  const summary = { run_id: begin.run_id, mode: begin.mode, due_total: begin.due_total, processed: 0, files_found: 0, files_deleted: 0, errors: 0, skipped: 0 };
  for (const order of begin.orders || []) {
    if (Date.now() - started > TIME_BUDGET_MS) { summary.skipped++; continue; }
    const files = Array.isArray(order.files) ? order.files : [];
    try {
      if (begin.mode === 'delete') {
        const r = await removeFiles(files);
        summary.files_found += r.found;
        summary.files_deleted += r.deleted;
        const status = await rpc<string>('retention_finish_order', {
          p_run: begin.run_id, p_order: order.id, p_files_found: r.found, p_files_deleted: r.deleted, p_error: r.error,
        });
        if (status === 'deleted') summary.processed++; else summary.errors++;
      } else {
        // 미리보기: 아무것도 지우지 않아요
        const found = files.filter((f) => f && ALLOWED_BUCKETS.includes(f.bucket) && safePath(f.path)).length;
        summary.files_found += found;
        await rpc<string>('retention_finish_order', { p_run: begin.run_id, p_order: order.id, p_files_found: found, p_files_deleted: 0, p_error: null });
        summary.processed++;
      }
    } catch (err) {
      summary.errors++;
      console.error('data-retention order failed', order.id, err);
      try {
        await rpc<string>('retention_finish_order', {
          p_run: begin.run_id, p_order: order.id, p_files_found: files.length, p_files_deleted: 0, p_error: String((err as Error)?.message || err).slice(0, 400),
        });
      } catch (_) { /* 기록도 못 하면 다음 실행에서 다시 */ }
    }
  }
  const note = summary.skipped ? `time limit — ${summary.skipped} order(s) left for the next run` : '';
  await rpc('retention_end_run', { p_run: begin.run_id, p_note: note });
  return summary;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!safeEqual(req.headers.get('x-notify-secret') ?? '', NOTIFY_SECRET)) {
    return new Response('unauthorized', { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ ok: false, error: 'missing Supabase env' }, 500);
  let trigger = 'cron';
  try {
    const body = await req.json();
    if (body && body.trigger === 'manual') trigger = 'manual';
  } catch (_) { /* 본문이 없어도 돼요 */ }
  try {
    const summary = await runRetention(trigger);
    console.log('data-retention done', JSON.stringify(summary));
    return json({ ok: true, ...summary });
  } catch (err) {
    console.error('data-retention failed', err);
    return json({ ok: false, error: String((err as Error)?.message || err).slice(0, 300) }, 500);
  }
});
