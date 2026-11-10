-- ================================================================
-- allAbut 008 — 무료 크레딧(가입 선물·이벤트·관리자 지급) 과 산 크레딧 구분
--               + 등록된 치과 정보(잠금) + 등록 정보 변경 요청
-- ================================================================
-- 실행: Supabase 대시보드 → SQL Editor → New query → 이 파일 전체를 붙여넣고 Run
--       (002 ~ 007 다음에 실행. 두 번 실행해도 오류 없이 같은 결과)
--       ⚠️ 002_credit_topups.sql 을 다시 실행하면 이 파일(008)도 다시 실행하세요 (create_cnc_order 가 예전 모양으로 돌아가서)
--
-- 규칙
--   - 무료 크레딧 = credit_lots.restriction = 'clinic_address_only' (source 'bonus' 묶음은 자동으로 이렇게 표시)
--       · 현금 환불 불가 (예전부터 보너스 묶음은 환불 계산에서 빠져요)
--       · 주문할 때 "무료 크레딧으로 주문하기"(p_use_free) 를 켜야만 써요 → 그때 배송 정보는 "등록된 치과 정보"로 DB 가 강제로 바꿔요
--       · 켜지 않은 주문은 무료 묶음을 건너뛰고 산 크레딧만 써요. 산 크레딧이 모자라는데 무료로는 충분하면 에러 'bonus_address_only'
--   - 등록된 치과 정보 = profiles.reg_clinic / reg_addr / reg_phone (+ reg_addr_norm, clinic_locked_at)
--       · 치과 이름·주소·전화가 처음으로 모두 채워지는 순간 자동으로 잠겨요 (가입할 때 모두 입력했으면 가입 시점)
--       · 그 뒤 고객이 프로필을 고쳐도 등록 정보는 그대로 (유료 주문용 배송 정보만 바뀜)
--       · 바꾸려면 request_clinic_change() → 관리자(manager 이상) admin_review_clinic_change() 승인
--   - 가입 선물: payment_settings.signup_bonus_credits (기본 0 = 지급 안 함) — 관리자 Settings 에서 나중에 정해요
--       · 등록 정보가 처음 잠기는 순간 1번 지급 (signup_bonus_grants 에 기록, 같은 사람 두 번 지급 안 됨)
--   - 주문에 bonus_used (사용한 무료 크레딧 수), addr_norm (배송 주소 정규화 값) 저장
--   - 주문 취소 환불은 예전처럼 원래 묶음으로 돌아가요 → restriction 도 그대로 유지


-- ================================================================
-- 1) 주소 정규화 (대소문자·공백·기호 무시)  예) "99 Sukhumvit Rd., Bangkok" = "99 sukhumvit rd bangkok"
-- ================================================================
create or replace function public._norm_addr(p text)
returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(p, '')), '[[:space:][:punct:]]+', '', 'g');
$$;


-- ================================================================
-- 2) credit_lots.restriction (null = 제한 없음)
-- ================================================================
alter table public.credit_lots add column if not exists restriction text;
alter table public.credit_lots drop constraint if exists credit_lots_restriction_check;
alter table public.credit_lots add constraint credit_lots_restriction_check
  check (restriction is null or restriction in ('clinic_address_only'));

-- 보너스(무료) 묶음은 만들어질 때 자동으로 'clinic_address_only'
create or replace function public._trg_credit_lot_restriction()
returns trigger language plpgsql as $$
begin
  if new.source = 'bonus' and new.restriction is null then
    new.restriction := 'clinic_address_only';
  end if;
  return new;
end $$;
drop trigger if exists trg_credit_lot_restriction on public.credit_lots;
create trigger trg_credit_lot_restriction before insert on public.credit_lots
  for each row execute function public._trg_credit_lot_restriction();

-- 이미 있는 보너스 묶음도 무료로 표시
update public.credit_lots set restriction = 'clinic_address_only' where source = 'bonus' and restriction is null;


-- ================================================================
-- 3) 등록된 치과 정보 (profiles)
-- ================================================================
alter table public.profiles
  add column if not exists reg_clinic       text,
  add column if not exists reg_addr         text,
  add column if not exists reg_phone        text,
  add column if not exists reg_addr_norm    text,
  add column if not exists clinic_locked_at timestamptz;

-- 처음으로 치과 이름·주소·전화가 모두 채워지면 잠그고, 잠긴 뒤에는 고객이 직접 못 바꿔요
--   (관리자 승인 함수만 set_config('allabut.reg_change', '1') 로 바꿀 수 있어요)
create or replace function public._trg_profile_clinic_lock()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.clinic_locked_at is not null
     and coalesce(current_setting('allabut.reg_change', true), '') <> '1' then
    new.reg_clinic := old.reg_clinic;
    new.reg_addr := old.reg_addr;
    new.reg_phone := old.reg_phone;
    new.reg_addr_norm := old.reg_addr_norm;
    new.clinic_locked_at := old.clinic_locked_at;
    return new;
  end if;
  if (tg_op = 'INSERT' or old.clinic_locked_at is null)
     and coalesce(current_setting('allabut.reg_change', true), '') <> '1' then
    if coalesce(trim(new.clinic_name), '') <> '' and coalesce(trim(new.address), '') <> '' and coalesce(trim(new.phone), '') <> '' then
      new.reg_clinic := trim(new.clinic_name);
      new.reg_addr := trim(new.address);
      new.reg_phone := trim(new.phone);
      new.clinic_locked_at := now();
    else
      -- 아직 다 안 채워졌으면 등록 정보는 비워 둬요 (고객이 직접 넣은 값은 무시)
      new.reg_clinic := null; new.reg_addr := null; new.reg_phone := null; new.clinic_locked_at := null;
    end if;
  end if;
  new.reg_addr_norm := case when new.reg_addr is null then null else public._norm_addr(new.reg_addr) end;
  return new;
end $$;
drop trigger if exists trg_profile_clinic_lock on public.profiles;
create trigger trg_profile_clinic_lock before insert or update on public.profiles
  for each row execute function public._trg_profile_clinic_lock();

-- 이미 치과 정보를 다 채운 고객은 지금 값으로 잠가요 (한 번만)
update public.profiles set clinic_name = clinic_name
 where clinic_locked_at is null
   and coalesce(trim(clinic_name), '') <> '' and coalesce(trim(address), '') <> '' and coalesce(trim(phone), '') <> '';


-- ================================================================
-- 4) 가입 선물 (설정 + 지급 기록)
-- ================================================================
alter table public.payment_settings add column if not exists signup_bonus_credits integer not null default 0;
alter table public.payment_settings drop constraint if exists payment_settings_signup_bonus_check;
alter table public.payment_settings add constraint payment_settings_signup_bonus_check
  check (signup_bonus_credits between 0 and 100);

create table if not exists public.signup_bonus_grants (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  lot_id     uuid references public.credit_lots(id) on delete set null,
  credits    integer not null,
  granted_at timestamptz not null default now()
);
alter table public.signup_bonus_grants enable row level security;
drop policy if exists "signup_bonus_grants: read" on public.signup_bonus_grants;
create policy "signup_bonus_grants: read" on public.signup_bonus_grants
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
grant select on public.signup_bonus_grants to authenticated;

-- 가입 선물 지급 (설정이 0 이면 안 줘요, 같은 사람 한 번만). 돌려주는 값: 지급한 크레딧 수
create or replace function public.grant_signup_bonus(p_user uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
  v_lot uuid;
  v_exp timestamptz := now() + interval '12 months';
begin
  select coalesce(signup_bonus_credits, 0) into v_n from public.payment_settings where id = 1;
  if coalesce(v_n, 0) <= 0 then return 0; end if;
  if exists (select 1 from public.signup_bonus_grants where user_id = p_user) then return 0; end if;
  insert into public.credit_wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  insert into public.credit_lots (user_id, source, quantity, remaining, unit_price, expires_at, restriction)
  values (p_user, 'bonus', v_n, v_n, 0, v_exp, 'clinic_address_only') returning id into v_lot;
  insert into public.signup_bonus_grants (user_id, lot_id, credits) values (p_user, v_lot, v_n)
  on conflict (user_id) do nothing;
  insert into public.credit_history (user_id, amount, type, description, lot_id)
  values (p_user, v_n, 'charge', 'Welcome gift (valid until ' || to_char(v_exp at time zone 'Asia/Bangkok', 'YYYY-MM-DD') || ')', v_lot);
  perform public._credit_recalc(p_user);
  return v_n;
end $$;
revoke all on function public.grant_signup_bonus(uuid) from public, anon, authenticated;

-- 등록 정보가 처음 잠기는 순간 가입 선물 지급
create or replace function public._trg_profile_signup_bonus()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.clinic_locked_at is not null and (tg_op = 'INSERT' or old.clinic_locked_at is null) then
    perform public.grant_signup_bonus(new.id);
  end if;
  return null;
end $$;
drop trigger if exists trg_profile_signup_bonus on public.profiles;
create trigger trg_profile_signup_bonus after insert or update of clinic_locked_at, clinic_name, address, phone on public.profiles
  for each row execute function public._trg_profile_signup_bonus();

-- 이미 지급된 가입 선물 묶음도 무료로 표시 (lot_id 기준)
update public.credit_lots l set restriction = 'clinic_address_only'
  from public.signup_bonus_grants g where g.lot_id = l.id and l.restriction is null;


-- ================================================================
-- 5) 주문: bonus_used, addr_norm
-- ================================================================
alter table public.cnc_orders
  add column if not exists bonus_used integer not null default 0,
  add column if not exists addr_norm  text;


-- ================================================================
-- 6) 묶음에서 빼기 (모드별) — 기존 _credit_take 는 그대로 두고 새 함수로
--    p_mode: 'paid' = 무료 묶음 건너뛰기 / 'free_first' = 무료 묶음 먼저(FIFO) → 나머지 산 묶음(FIFO)
--    돌려주는 값: 무료 묶음에서 뺀 수
-- ================================================================
create or replace function public._credit_take_mode(p_user uuid, p_amount integer, p_order text, p_mode text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_need integer := p_amount;
  v_take integer;
  v_free integer := 0;
begin
  if p_amount <= 0 then return 0; end if;
  for r in
    select id, remaining, restriction from public.credit_lots
     where user_id = p_user and remaining > 0 and expires_at > now()
       and (p_mode <> 'paid' or restriction is null)
     order by case when p_mode = 'free_first' and restriction is not null then 0 else 1 end, expires_at, created_at
     for update
  loop
    exit when v_need <= 0;
    v_take := least(r.remaining, v_need);
    update public.credit_lots set remaining = remaining - v_take where id = r.id;
    if p_order is not null then
      insert into public.credit_lot_usage (order_id, lot_id, quantity) values (p_order, r.id, v_take);
    end if;
    if r.restriction is not null then v_free := v_free + v_take; end if;
    v_need := v_need - v_take;
  end loop;
  if v_need > 0 then raise exception 'INSUFFICIENT_CREDITS'; end if;
  return v_free;
end $$;
revoke all on function public._credit_take_mode(uuid, integer, text, text) from public, anon, authenticated;


-- ================================================================
-- 7) 주문 만들기 (+ p_use_free) — 예전 7개 인자 함수는 지우고 새로 (호출이 헷갈리지 않게)
-- ================================================================
drop function if exists public.create_cnc_order(text, date, text, text, text, text, jsonb);

create or replace function public.create_cnc_order(
  p_patient text, p_deadline date, p_clinic text, p_addr text,
  p_phone text, p_line_id text, p_cases jsonb, p_use_free boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_teeth integer;
  v_id text;
  v_balance integer;
  v_paid integer;
  v_free_avail integer;
  v_free_used integer := 0;
  v_prof record;
  v_clinic text := p_clinic;
  v_addr text := p_addr;
  v_phone text := p_phone;
begin
  if v_uid is null then raise exception 'NOT_LOGGED_IN'; end if;

  -- 무료 크레딧 주문: 배송 정보는 화면 값이 아니라 등록된 치과 정보로 (DB 가 정해요)
  if coalesce(p_use_free, false) then
    select reg_clinic, reg_addr, reg_phone, clinic_locked_at into v_prof from public.profiles where id = v_uid;
    if v_prof.clinic_locked_at is null then raise exception 'NO_REGISTERED_CLINIC'; end if;
    v_clinic := v_prof.reg_clinic; v_addr := v_prof.reg_addr; v_phone := v_prof.reg_phone;
  end if;

  if coalesce(trim(v_clinic), '') = '' or coalesce(trim(v_addr), '') = '' or coalesce(trim(v_phone), '') = '' then
    raise exception 'DELIVERY_REQUIRED';
  end if;

  select coalesce(sum(jsonb_array_length(coalesce(c -> 'teeth', '[]'::jsonb))), 0)
    into v_teeth from jsonb_array_elements(coalesce(p_cases, '[]'::jsonb)) c;
  if v_teeth < 1 then raise exception 'NO_TEETH'; end if;

  -- 같은 사용자의 동시 주문을 줄 세우기 (지갑 행 잠금)
  insert into public.credit_wallets (user_id, balance) values (v_uid, 0) on conflict (user_id) do nothing;
  perform 1 from public.credit_wallets where user_id = v_uid for update;
  perform public._credit_expire_lots(v_uid);

  select coalesce(sum(remaining) filter (where restriction is null), 0),
         coalesce(sum(remaining) filter (where restriction is not null), 0)
    into v_paid, v_free_avail
    from public.credit_lots where user_id = v_uid and remaining > 0 and expires_at > now();

  if coalesce(p_use_free, false) then
    if v_paid + v_free_avail < v_teeth then raise exception 'INSUFFICIENT_CREDITS'; end if;
  elsif v_paid < v_teeth then
    -- 산 크레딧은 모자라지만 무료 크레딧을 쓰면 충분 → 등록 주소로 주문해야 써요
    if v_paid + v_free_avail >= v_teeth and v_free_avail > 0 then raise exception 'bonus_address_only'; end if;
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  -- 무료 먼저 쓰는 수를 미리 정해서 주문과 함께 저장 (새 주문 LINE 알림이 INSERT 때 bonus_used 를 볼 수 있게)
  v_free_used := case when coalesce(p_use_free, false) then least(v_free_avail, v_teeth) else 0 end;

  v_id := 'CA' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.cnc_order_seq')::text, 4, '0');
  insert into public.cnc_orders (id, user_id, patient, deadline, clinic, addr, phone, line_id, cases, teeth_count, credits_used, addr_norm, bonus_used)
  values (v_id, v_uid, coalesce(p_patient, ''), p_deadline, trim(v_clinic), trim(v_addr), trim(v_phone), coalesce(p_line_id, ''), p_cases, v_teeth, v_teeth,
          public._norm_addr(v_addr), v_free_used);

  if public._credit_take_mode(v_uid, v_teeth, v_id, case when coalesce(p_use_free, false) then 'free_first' else 'paid' end) <> v_free_used then
    raise exception 'CREDIT_SPLIT_MISMATCH';   -- 일어나면 안 돼요 (지갑 행을 잠가서 그 사이 바뀌지 않아요)
  end if;
  v_balance := public._credit_recalc(v_uid);
  insert into public.credit_history (user_id, amount, type, order_id, description)
  values (v_uid, -v_teeth, 'use', v_id, 'CNC order ' || v_id || ' (' || v_teeth || ' teeth'
          || case when v_free_used > 0 then ', ' || v_free_used || ' free' else '' end || ')');

  return jsonb_build_object('id', v_id, 'teeth', v_teeth, 'balance', v_balance, 'bonus_used', v_free_used);
end $$;
grant execute on function public.create_cnc_order(text, date, text, text, text, text, jsonb, boolean) to authenticated;


-- ================================================================
-- 8) 내 크레딧 요약 (산 / 무료 + 묶음 목록, restriction 포함)
-- ================================================================
create or replace function public.get_my_credit_summary()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_LOGGED_IN'; end if;
  perform public._credit_recalc(v_uid);
  return jsonb_build_object(
    'paid', coalesce((select sum(remaining) from public.credit_lots where user_id = v_uid and remaining > 0 and expires_at > now() and restriction is null), 0),
    'free', coalesce((select sum(remaining) from public.credit_lots where user_id = v_uid and remaining > 0 and expires_at > now() and restriction is not null), 0),
    'lots', coalesce((select jsonb_agg(jsonb_build_object(
              'id', l.id, 'source', l.source, 'quantity', l.quantity, 'remaining', l.remaining, 'unit_price', l.unit_price,
              'created_at', l.created_at, 'expires_at', l.expires_at, 'restriction', l.restriction,
              'signup', exists (select 1 from public.signup_bonus_grants g where g.lot_id = l.id))
              order by l.expires_at, l.created_at)
            from public.credit_lots l where l.user_id = v_uid and l.remaining > 0 and l.expires_at > now()), '[]'::jsonb)
  );
end $$;
grant execute on function public.get_my_credit_summary() to authenticated;


-- ================================================================
-- 9) 등록 정보 변경 요청 → 관리자 승인
-- ================================================================
create table if not exists public.clinic_change_requests (
  id           bigint generated by default as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  clinic       text not null,
  addr         text not null,
  phone        text not null,
  reason       text not null default '',
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  admin_note   text not null default '',
  reviewed_by  uuid,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_clinic_change_requests_status on public.clinic_change_requests (status, created_at desc);
create index if not exists idx_clinic_change_requests_user on public.clinic_change_requests (user_id, created_at desc);
alter table public.clinic_change_requests enable row level security;
drop policy if exists "clinic_change_requests: read" on public.clinic_change_requests;
create policy "clinic_change_requests: read" on public.clinic_change_requests
  for select to authenticated using (user_id = auth.uid() or public.has_admin_role('manager'));
grant select on public.clinic_change_requests to authenticated;

-- 고객: 변경 요청 (기다리는 요청이 있으면 새 내용으로 바꿔요). 돌려주는 값: 요청 id
create or replace function public.request_clinic_change(p_clinic text, p_addr text, p_phone text, p_reason text default '')
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id bigint;
begin
  if v_uid is null then raise exception 'NOT_LOGGED_IN'; end if;
  if coalesce(trim(p_clinic), '') = '' or coalesce(trim(p_addr), '') = '' or coalesce(trim(p_phone), '') = '' then
    raise exception 'DELIVERY_REQUIRED';
  end if;
  update public.clinic_change_requests set status = 'cancelled' where user_id = v_uid and status = 'pending';
  insert into public.clinic_change_requests (user_id, clinic, addr, phone, reason)
  values (v_uid, left(trim(p_clinic), 200), left(trim(p_addr), 500), left(trim(p_phone), 40), left(coalesce(trim(p_reason), ''), 500))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.request_clinic_change(text, text, text, text) to authenticated;

-- 고객: 기다리는 요청 취소
create or replace function public.cancel_my_clinic_change()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_LOGGED_IN'; end if;
  update public.clinic_change_requests set status = 'cancelled' where user_id = auth.uid() and status = 'pending';
end $$;
grant execute on function public.cancel_my_clinic_change() to authenticated;

-- 관리자(manager 이상): 승인 → 등록 정보를 새 값으로 (+ 프로필 배송 정보도 같이) / 거절
create or replace function public.admin_review_clinic_change(p_id bigint, p_approve boolean, p_note text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  select * into r from public.clinic_change_requests where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.status <> 'pending' then raise exception 'ALREADY_REVIEWED'; end if;
  update public.clinic_change_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         admin_note = left(coalesce(trim(p_note), ''), 500), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
  if p_approve then
    perform set_config('allabut.reg_change', '1', true);
    update public.profiles
       set reg_clinic = r.clinic, reg_addr = r.addr, reg_phone = r.phone,
           reg_addr_norm = public._norm_addr(r.addr), clinic_locked_at = coalesce(clinic_locked_at, now()),
           clinic_name = r.clinic, address = r.addr, phone = r.phone
     where id = r.user_id;
    perform set_config('allabut.reg_change', '', true);
  end if;
end $$;
grant execute on function public.admin_review_clinic_change(bigint, boolean, text) to authenticated;

-- 관리자: 고객의 미사용 무료 크레딧 (승인 전 경고용)
create or replace function public.admin_free_credits(p_user uuid)
returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_admin_role('staff') then raise exception 'NOT_ADMIN'; end if;
  return coalesce((select sum(remaining) from public.credit_lots
                    where user_id = p_user and remaining > 0 and expires_at > now() and restriction is not null), 0);
end $$;
grant execute on function public.admin_free_credits(uuid) to authenticated;

-- 작업 기록 (005 가 있으면): 등록 정보 변경 승인/거절도 남겨요
do $$
begin
  if to_regclass('public.admin_audit_log') is not null then
    execute $f$
      create or replace function public._trg_clinic_change_audit()
      returns trigger language plpgsql security definer set search_path = public as $b$
      begin
        if new.status in ('approved', 'rejected') and old.status = 'pending' and auth.uid() is not null then
          insert into public.admin_audit_log (actor_id, actor_name, action, target_type, target_id, detail)
          values (auth.uid(), coalesce((select display_name from public.admins where user_id = auth.uid()), ''),
                  'settings_changed', 'clinic_change', new.user_id::text,
                  jsonb_build_object('request', new.id, 'status', new.status, 'clinic', new.clinic, 'addr', new.addr));
        end if;
        return null;
      end $b$;
    $f$;
    execute 'drop trigger if exists trg_clinic_change_audit on public.clinic_change_requests';
    execute 'create trigger trg_clinic_change_audit after update on public.clinic_change_requests for each row execute function public._trg_clinic_change_audit()';
  end if;
end $$;

-- (확인용)
-- select id, source, remaining, restriction from public.credit_lots order by created_at desc limit 20;
-- select id, reg_clinic, reg_addr, clinic_locked_at from public.profiles limit 20;
