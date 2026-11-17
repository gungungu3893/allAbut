-- ================================================================
-- allAbut — 020: 주문 파일 2년 보관 후 자동 삭제 (개인정보처리방침의 약속을 실제 기능으로)
-- ================================================================
-- 무엇을 하나요
--   완료(done) 또는 취소(cancelled)된 지 보관 기간(기본 24개월)이 지난 주문에서
--     ① Storage 파일 삭제: 스캔 · 사진 · PDF (cnc-files 버킷, cases[].stlPaths) + 디자인 파일 (cnc-designs 버킷, design_versions[].paths)
--     ② 주문 안의 환자 · 메모 정보 지우기: patient → 'deleted', cases[].patient → 'deleted', cases[].memo → '',
--        cases[].stls(파일 이름) · cases[].stlPaths(파일 경로) → [], design_versions[].paths · names → [], review_history[].note → ''
--     ③ 남기는 것 (세금 · 회계 보관): 주문번호 · 날짜 · 단계 · 치아(번호 · 제품 · 브랜드 · 사이즈 · 쉐이드) · 치아 수 · 크레딧 사용 · 치과 · 배송 정보
--   Storage 파일은 SQL 로 지울 수 없어서 Edge Function 'data-retention'(서비스 키 사용)이 지워요.
--     pg_cron 이 매일 방콕 02:15 (UTC 19:15) 에 pg_net 으로 그 함수를 불러요 (기존 01:00 만료 · 01:05 알림 · 01:30 방문 기록 정리와 안 겹침)
--     헤더 x-notify-secret = Vault 의 'notify_secret' (line-notify 와 같은 NOTIFY_SECRET 을 다시 써요 — 값은 이 파일에 없어요)
--
-- 안전장치
--   - 처음에는 "미리보기" 모드 (data_retention_settings.mode = 'preview'): 지울 주문 목록만 retention_log 에 남기고 아무것도 안 지워요.
--     owner 가 관리자 Settings → "🗂 주문 파일 보관 기간" 에서 "실제 삭제" 로 바꿔야 지워요 (이 파일은 절대 'delete' 로 바꾸지 않아요)
--   - 한 번에 처리하는 주문 수 제한 batch_limit (기본 50) — 남은 것은 다음 날
--   - 파일 삭제에 실패한 주문은 표시하지 않고 기록(status 'error')만 → 다음 실행 때 다시
--   - 기록: retention_runs (실행마다 1줄) · retention_log (주문마다: 주문번호 · 찾은/지운 파일 수 · 시각 · 상태)
--
-- 새 칸 · 표
--   cnc_orders.closed_at          완료 · 취소된 시각 (트리거가 채워요, 예전 주문은 한 번 채움 — 단계 기록의 마지막 날짜 → 없으면 updated_at)
--   cnc_orders.files_purged_at    파일을 지운 시각 (고객 화면: "보관 기간이 지나 파일이 삭제됐어요")
--   cnc_orders.files_purged_count 지운 파일 수
--   data_retention_settings       id 1 줄: months(12~120, 기본 24) · mode('preview' | 'delete', 기본 preview) · batch_limit(1~500, 기본 50)
--   retention_runs · retention_log RLS 켜고 정책 없음 = 함수로만
--
-- 함수
--   서비스 키(Edge Function)만: retention_begin_run(p_trigger) · retention_finish_order(...) · retention_end_run(...)
--   예약 작업 · owner: run_data_retention(p_trigger)  → pg_net 으로 Edge Function 호출
--   owner: admin_get_retention() · admin_set_retention(p_months, p_mode) · admin_run_retention_now()  (작업 기록 'retention_settings' · 'retention_run')
--
-- 실행 순서: 019 다음. 두 번 실행해도 안전. 기존 SQL 파일은 고치지 않아요.
-- launch_reset.sql 의 지울 표 목록에 retention_runs · retention_log 를 넣었어요.


-- ================================================================
-- 1) 주문 칸: 완료 · 취소 시각, 파일 삭제 표시
-- ================================================================
alter table public.cnc_orders add column if not exists closed_at timestamptz;
alter table public.cnc_orders add column if not exists files_purged_at timestamptz;
alter table public.cnc_orders add column if not exists files_purged_count integer not null default 0;
create index if not exists idx_cnc_orders_retention on public.cnc_orders (closed_at) where files_purged_at is null;

-- 글자를 시각으로 (안 되면 null) — 예전 단계 기록의 date 를 읽을 때
create or replace function public._try_ts(p text)
returns timestamptz
language plpgsql immutable as $$
begin
  if p is null or p = '' then return null; end if;
  return p::timestamptz;
exception when others then
  return null;
end $$;

-- 완료 · 취소가 되는 순간 시각 기록 (다시 다른 단계로 가면 비움)
create or replace function public._trg_orders_closed_at()
returns trigger
language plpgsql as $$
begin
  if new.stage in ('done', 'cancelled') then
    if old.stage is distinct from new.stage or new.closed_at is null then
      new.closed_at := coalesce(case when old.stage in ('done', 'cancelled') then old.closed_at end, now());
    end if;
  else
    new.closed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_closed_at on public.cnc_orders;
create trigger trg_orders_closed_at before update on public.cnc_orders
  for each row execute function public._trg_orders_closed_at();

-- 예전에 이미 끝난 주문: 단계 기록의 마지막 날짜 → 없으면 updated_at (null 인 것만, 두 번 실행해도 같음)
update public.cnc_orders o
   set closed_at = coalesce(
         (select max(public._try_ts(e ->> 'date'))
            from jsonb_array_elements(case when jsonb_typeof(o.review_history) = 'array' then o.review_history else '[]'::jsonb end) e
           where jsonb_typeof(e) = 'object'),
         o.updated_at, o.created_at)
 where o.stage in ('done', 'cancelled') and o.closed_at is null;


-- ================================================================
-- 2) 설정 · 기록 표
-- ================================================================
create table if not exists public.data_retention_settings (
  id          integer primary key default 1 check (id = 1),
  months      integer not null default 24 check (months between 12 and 120),
  mode        text not null default 'preview' check (mode in ('preview', 'delete')),
  batch_limit integer not null default 50 check (batch_limit between 1 and 500),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
insert into public.data_retention_settings (id) values (1) on conflict (id) do nothing;   -- 이미 있으면 그대로 (모드를 바꾸지 않아요)
alter table public.data_retention_settings enable row level security;

create table if not exists public.retention_runs (
  id               uuid primary key default gen_random_uuid(),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  trigger          text not null default 'cron',     -- 'cron' | 'manual'
  mode             text not null,                    -- 'preview' | 'delete'
  months           integer not null,
  due_total        integer not null default 0,       -- 시작할 때 보관 기간이 지난 주문 수 (전체)
  orders_processed integer not null default 0,       -- 미리보기면 목록에 올린 수, 실제 삭제면 지운 주문 수
  files_found      integer not null default 0,
  files_deleted    integer not null default 0,
  errors           integer not null default 0,
  note             text
);
create index if not exists idx_retention_runs_started on public.retention_runs (started_at desc);
alter table public.retention_runs enable row level security;

create table if not exists public.retention_log (
  id            bigserial primary key,
  run_id        uuid,
  order_id      text not null,
  user_id       uuid,
  mode          text not null,                       -- 'preview' | 'delete'
  status        text not null check (status in ('preview', 'deleted', 'error')),
  files_found   integer not null default 0,
  files_deleted integer not null default 0,
  closed_at     timestamptz,
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_retention_log_created on public.retention_log (created_at desc);
create index if not exists idx_retention_log_order on public.retention_log (order_id);
alter table public.retention_log enable row level security;

revoke all on public.data_retention_settings, public.retention_runs, public.retention_log from anon, authenticated;
do $$ begin
  revoke all on sequence public.retention_log_id_seq from anon, authenticated;
exception when others then null; end $$;


-- ================================================================
-- 3) 주문 하나의 파일 목록 [{ bucket, path }]
-- ================================================================
create or replace function public._retention_order_files(p_cases jsonb, p_designs jsonb)
returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('bucket', f.bucket, 'path', f.path) order by f.bucket, f.path), '[]'::jsonb)
    from (
      select distinct 'cnc-files'::text as bucket, p.v as path
        from jsonb_array_elements(case when jsonb_typeof(p_cases) = 'array' then p_cases else '[]'::jsonb end) c,
             jsonb_array_elements_text(case when jsonb_typeof(c -> 'stlPaths') = 'array' then c -> 'stlPaths' else '[]'::jsonb end) p(v)
       where coalesce(p.v, '') <> ''
      union
      select distinct 'cnc-designs'::text, p.v
        from jsonb_array_elements(case when jsonb_typeof(p_designs) = 'array' then p_designs else '[]'::jsonb end) d,
             jsonb_array_elements_text(case when jsonb_typeof(d -> 'paths') = 'array' then d -> 'paths' else '[]'::jsonb end) p(v)
       where coalesce(p.v, '') <> ''
    ) f
$$;

-- 보관 기간이 지난 주문 (아직 안 지운 것)
create or replace function public._retention_due(p_months integer)
returns setof public.cnc_orders
language sql stable security definer set search_path = public as $$
  select * from public.cnc_orders
   where stage in ('done', 'cancelled')
     and closed_at is not null
     and closed_at < now() - make_interval(months => p_months)
     and files_purged_at is null
   order by closed_at, id
$$;
revoke all on function public._retention_due(integer) from public, anon, authenticated;


-- ================================================================
-- 4) Edge Function 이 부르는 함수 (서비스 키만)
-- ================================================================
-- 실행 시작: 설정 + 이번에 처리할 주문 목록 (batch_limit 개까지)
create or replace function public.retention_begin_run(p_trigger text default 'cron')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.data_retention_settings;
  v_run uuid;
  v_due integer;
  v_orders jsonb;
begin
  select * into s from public.data_retention_settings where id = 1;
  if not found then
    insert into public.data_retention_settings (id) values (1) on conflict (id) do nothing;
    select * into s from public.data_retention_settings where id = 1;
  end if;
  select count(*) into v_due from public._retention_due(s.months);
  insert into public.retention_runs (trigger, mode, months, due_total)
  values (case when p_trigger = 'manual' then 'manual' else 'cron' end, s.mode, s.months, v_due)
  returning id into v_run;
  -- 미리보기: 예전 미리보기 목록은 지우고 이번 목록으로 (목록 = "지금 지워질 주문")
  if s.mode = 'preview' then
    delete from public.retention_log where status = 'preview';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'user_id', o.user_id, 'closed_at', o.closed_at,
           'files', public._retention_order_files(o.cases, o.design_versions)) order by o.closed_at, o.id), '[]'::jsonb)
    into v_orders
    from (select * from public._retention_due(s.months) limit s.batch_limit) o;
  return jsonb_build_object('run_id', v_run, 'mode', s.mode, 'months', s.months, 'batch_limit', s.batch_limit,
                            'due_total', v_due, 'orders', v_orders);
end $$;

-- 주문 하나 끝: 미리보기 = 기록만 / 실제 삭제 = 파일을 지운 뒤 주문 안의 환자 · 메모 · 파일 정보 지우기 + 기록 / 오류 = 기록만 (다음에 다시)
create or replace function public.retention_finish_order(
  p_run uuid, p_order text, p_files_found integer, p_files_deleted integer, p_error text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.retention_runs;
  o public.cnc_orders;
begin
  select * into r from public.retention_runs where id = p_run;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  select * into o from public.cnc_orders where id = p_order for update;
  if not found then
    insert into public.retention_log (run_id, order_id, mode, status, error)
    values (p_run, p_order, r.mode, 'error', 'ORDER_NOT_FOUND');
    update public.retention_runs set errors = errors + 1 where id = p_run;
    return 'error';
  end if;

  if nullif(trim(coalesce(p_error, '')), '') is not null then
    insert into public.retention_log (run_id, order_id, user_id, mode, status, files_found, files_deleted, closed_at, error)
    values (p_run, o.id, o.user_id, r.mode, 'error', coalesce(p_files_found, 0), coalesce(p_files_deleted, 0), o.closed_at, left(p_error, 500));
    update public.retention_runs set errors = errors + 1, files_found = files_found + coalesce(p_files_found, 0),
                                     files_deleted = files_deleted + coalesce(p_files_deleted, 0) where id = p_run;
    return 'error';
  end if;

  if r.mode = 'preview' then
    insert into public.retention_log (run_id, order_id, user_id, mode, status, files_found, files_deleted, closed_at)
    values (p_run, o.id, o.user_id, 'preview', 'preview', coalesce(p_files_found, 0), 0, o.closed_at);
    update public.retention_runs set orders_processed = orders_processed + 1, files_found = files_found + coalesce(p_files_found, 0) where id = p_run;
    return 'preview';
  end if;

  -- 실제 삭제: 그 사이 단계가 바뀌었거나 이미 지웠으면 건드리지 않아요
  if o.stage not in ('done', 'cancelled') or o.closed_at is null
     or o.closed_at >= now() - make_interval(months => r.months) or o.files_purged_at is not null then
    insert into public.retention_log (run_id, order_id, user_id, mode, status, files_found, files_deleted, closed_at, error)
    values (p_run, o.id, o.user_id, r.mode, 'error', coalesce(p_files_found, 0), coalesce(p_files_deleted, 0), o.closed_at, 'NOT_ELIGIBLE');
    update public.retention_runs set errors = errors + 1 where id = p_run;
    return 'error';
  end if;

  update public.cnc_orders c set
    patient = 'deleted',
    cases = (
      select coalesce(jsonb_agg(
               case when jsonb_typeof(x.e) = 'object'
                    then x.e || jsonb_build_object('patient', 'deleted', 'memo', '', 'stls', '[]'::jsonb, 'stlPaths', '[]'::jsonb, 'files_deleted', true)
                    else x.e end order by x.i), '[]'::jsonb)
        from jsonb_array_elements(case when jsonb_typeof(c.cases) = 'array' then c.cases else '[]'::jsonb end) with ordinality x(e, i)),
    design_versions = (
      select coalesce(jsonb_agg(
               case when jsonb_typeof(x.e) = 'object'
                    then x.e || jsonb_build_object('paths', '[]'::jsonb, 'names', '[]'::jsonb, 'files_deleted', true)
                    else x.e end order by x.i), '[]'::jsonb)
        from jsonb_array_elements(case when jsonb_typeof(c.design_versions) = 'array' then c.design_versions else '[]'::jsonb end) with ordinality x(e, i)),
    review_history = (
      select coalesce(jsonb_agg(
               case when jsonb_typeof(x.e) = 'object' and x.e ? 'note' then x.e || jsonb_build_object('note', '') else x.e end
               order by x.i), '[]'::jsonb)
        from jsonb_array_elements(case when jsonb_typeof(c.review_history) = 'array' then c.review_history else '[]'::jsonb end) with ordinality x(e, i)),
    files_purged_at = now(),
    files_purged_count = coalesce(p_files_deleted, 0)
  where c.id = o.id;

  insert into public.retention_log (run_id, order_id, user_id, mode, status, files_found, files_deleted, closed_at)
  values (p_run, o.id, o.user_id, 'delete', 'deleted', coalesce(p_files_found, 0), coalesce(p_files_deleted, 0), o.closed_at);
  update public.retention_runs set orders_processed = orders_processed + 1,
                                   files_found = files_found + coalesce(p_files_found, 0),
                                   files_deleted = files_deleted + coalesce(p_files_deleted, 0) where id = p_run;
  return 'deleted';
end $$;

-- 실행 끝
create or replace function public.retention_end_run(p_run uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.retention_runs;
begin
  update public.retention_runs set finished_at = now(), note = left(nullif(trim(coalesce(p_note, '')), ''), 500)
   where id = p_run returning * into r;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  return to_jsonb(r);
end $$;

revoke all on function public.retention_begin_run(text) from public, anon, authenticated;
revoke all on function public.retention_finish_order(uuid, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.retention_end_run(uuid, text) from public, anon, authenticated;
do $$ begin
  grant execute on function public.retention_begin_run(text) to service_role;
  grant execute on function public.retention_finish_order(uuid, text, integer, integer, text) to service_role;
  grant execute on function public.retention_end_run(uuid, text) to service_role;
exception when undefined_object then raise notice 'service_role not found — skipping grants'; end $$;


-- ================================================================
-- 5) Edge Function 부르기 (예약 작업 · owner 의 "지금 실행")
-- ================================================================
create or replace function public.run_data_retention(p_trigger text default 'cron')
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text;
  v_url text := 'https://jtqsbzihnduktffymncm.supabase.co/functions/v1/data-retention';
begin
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
  exception when others then
    v_secret := null;
  end;
  if v_secret is null or v_secret = '' then
    raise notice 'notify_secret is not in Vault — skipping data retention';
    return false;
  end if;
  begin
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('trigger', case when p_trigger = 'manual' then 'manual' else 'cron' end),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
      timeout_milliseconds := 60000
    );
  exception when others then
    raise notice 'pg_net is not available — skipping data retention: %', sqlerrm;
    return false;
  end;
  return true;
end $$;
revoke all on function public.run_data_retention(text) from public, anon, authenticated;

-- 매일 방콕 02:15 = UTC 19:15
do $$
declare j record;
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice 'pg_cron is not enabled — skipping schedule allabut-data-retention (run select public.run_data_retention(); by hand)';
    return;
  end if;
  for j in select jobid from cron.job where jobname = 'allabut-data-retention' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('allabut-data-retention', '15 19 * * *', 'select public.run_data_retention(''cron'')');
end $$;


-- ================================================================
-- 6) 관리자 (owner)
-- ================================================================
create or replace function public.admin_get_retention()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.data_retention_settings;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  select * into s from public.data_retention_settings where id = 1;
  return jsonb_build_object(
    'months', coalesce(s.months, 24),
    'mode', coalesce(s.mode, 'preview'),
    'batch_limit', coalesce(s.batch_limit, 50),
    'updated_at', s.updated_at,
    'due_total', (select count(*) from public._retention_due(coalesce(s.months, 24))),
    'deleted_total', (select count(*) from public.cnc_orders where files_purged_at is not null),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r.started_at desc)
                        from (select * from public.retention_runs order by started_at desc limit 5) r), '[]'::jsonb),
    'preview', coalesce((select jsonb_agg(jsonb_build_object('order_id', l.order_id, 'files_found', l.files_found,
                                                               'closed_at', l.closed_at, 'created_at', l.created_at) order by l.closed_at, l.order_id)
                           from (select * from public.retention_log where status = 'preview' order by closed_at, order_id limit 100) l), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('order_id', l.order_id, 'status', l.status, 'files_found', l.files_found,
                                                              'files_deleted', l.files_deleted, 'error', l.error, 'created_at', l.created_at) order by l.created_at desc)
                          from (select * from public.retention_log where status <> 'preview' order by created_at desc limit 20) l), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_set_retention(p_months integer, p_mode text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare old public.data_retention_settings;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  if p_months is null or p_months < 12 or p_months > 120 then raise exception 'INVALID_MONTHS'; end if;
  if p_mode is null or p_mode not in ('preview', 'delete') then raise exception 'INVALID_MODE'; end if;
  select * into old from public.data_retention_settings where id = 1;
  insert into public.data_retention_settings (id, months, mode, updated_at, updated_by)
  values (1, p_months, p_mode, now(), auth.uid())
  on conflict (id) do update set months = excluded.months, mode = excluded.mode, updated_at = now(), updated_by = auth.uid();
  perform public._audit('retention_settings', 'settings', 'data_retention',
    jsonb_build_object('from', jsonb_build_object('months', old.months, 'mode', old.mode),
                       'to', jsonb_build_object('months', p_months, 'mode', p_mode)));
  return public.admin_get_retention();
end $$;

create or replace function public.admin_run_retention_now()
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  v_ok := public.run_data_retention('manual');
  perform public._audit('retention_run', 'settings', 'data_retention', jsonb_build_object('started', v_ok));
  return v_ok;
end $$;

revoke all on function public.admin_get_retention() from public, anon;
revoke all on function public.admin_set_retention(integer, text) from public, anon;
revoke all on function public.admin_run_retention_now() from public, anon;
grant execute on function public.admin_get_retention() to authenticated;
grant execute on function public.admin_set_retention(integer, text) to authenticated;
grant execute on function public.admin_run_retention_now() to authenticated;
