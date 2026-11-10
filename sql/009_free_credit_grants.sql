-- ================================================================
-- allAbut 009 — "가입 선물" → "무료 크레딧" 으로 일반화 + 관리자 무료 크레딧 지급·회수
-- ================================================================
-- 실행: Supabase 대시보드 → SQL Editor → New query → 이 파일 전체를 붙여넣고 Run
--       (008_free_credits.sql 다음에 실행. 두 번 실행해도 오류 없이 같은 결과)
--       ⚠️ 008 을 다시 실행하면 이 파일(009)도 다시 실행하세요 (grant_signup_bonus · get_my_credit_summary 가 008 모양으로 돌아가서)
--
-- 무료 크레딧 기준 (하나로 통일)
--   - 무료 묶음 = credit_lots.source = 'free' (새로 지급하는 것) 또는 'bonus' (예전 관리자 지급 · 예전 가입 선물)
--   - 무료 묶음은 기본으로 restriction = 'clinic_address_only' (등록된 치과로 배송하는 주문에만) — 관리자가 지급할 때 끌 수 있어요
--   - 현금 환불 불가 (unit_price 0, 환불 계산은 source 'purchase' 만)
--   - 이벤트 이름: credit_lots.event_name, 지급한 사람: credit_lots.granted_by
--   - credit_history 설명(새 기록부터): "Free credits: 이벤트명 (valid until YYYY-MM-DD)"
--
-- DB 테이블·함수 이름(signup_bonus_grants, grant_signup_bonus, payment_settings.signup_bonus_credits)은 그대로 둬요 (화면 문구만 바뀜)
--
-- 새 함수
--   admin_grant_free_credits(고객, 이벤트명, 크레딧 수, 유효일수=365, 등록 주소 전용=true) → 잔액   (manager 이상)
--   admin_revoke_free_credits(고객, 크레딧 수, 사유)                                   → 잔액   (manager 이상, 사유 필수, 무료 묶음에서만)
--   admin_finance_free_month(년, 월) → { granted, used, expired }  (owner, 매출이 아닌 "무료"로 따로 보여주기)


-- ================================================================
-- 1) credit_lots: source 'free' 허용 + 이벤트 이름 · 지급자
-- ================================================================
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
     where con.conrelid = 'public.credit_lots'::regclass and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%source%'
  loop
    execute format('alter table public.credit_lots drop constraint %I', c.conname);
  end loop;
  alter table public.credit_lots add constraint credit_lots_source_check
    check (source in ('purchase', 'bonus', 'migration', 'free'));
end $$;

alter table public.credit_lots
  add column if not exists event_name text,
  add column if not exists granted_by uuid;

-- 무료 묶음인지 (한 곳에서 판단)
create or replace function public._is_free_source(p_source text)
returns boolean language sql immutable as $$
  select p_source in ('free', 'bonus');
$$;

-- 이미 있는 가입 선물 묶음에 이벤트 이름
update public.credit_lots l set event_name = 'New member event'
  from public.signup_bonus_grants g
 where g.lot_id = l.id and l.event_name is null;


-- ================================================================
-- 2) 가입 이벤트 지급도 "무료 크레딧" 으로 (source 'free', 설명 "Free credits: New member event")
-- ================================================================
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
  insert into public.credit_lots (user_id, source, quantity, remaining, unit_price, expires_at, restriction, event_name)
  values (p_user, 'free', v_n, v_n, 0, v_exp, 'clinic_address_only', 'New member event') returning id into v_lot;
  insert into public.signup_bonus_grants (user_id, lot_id, credits) values (p_user, v_lot, v_n)
  on conflict (user_id) do nothing;
  insert into public.credit_history (user_id, amount, type, description, lot_id)
  values (p_user, v_n, 'charge',
          'Free credits: New member event (valid until ' || to_char(v_exp at time zone 'Asia/Bangkok', 'YYYY-MM-DD') || ')', v_lot);
  perform public._credit_recalc(p_user);
  return v_n;
end $$;
revoke all on function public.grant_signup_bonus(uuid) from public, anon, authenticated;


-- ================================================================
-- 3) 관리자: 무료 크레딧 지급 (manager 이상)
-- ================================================================
create or replace function public.admin_grant_free_credits(
  p_user uuid, p_event text, p_credits integer, p_days integer default 365, p_address_only boolean default true
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_event text := left(trim(coalesce(p_event, '')), 100);
  v_days integer := coalesce(p_days, 365);
  v_exp timestamptz;
  v_lot uuid;
  v_balance integer;
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  if v_event = '' then raise exception 'EVENT_REQUIRED'; end if;
  if p_credits is null or p_credits < 1 or p_credits > 1000 then raise exception 'INVALID_AMOUNT'; end if;
  if v_days < 1 or v_days > 3650 then raise exception 'INVALID_AMOUNT'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'NOT_FOUND'; end if;

  v_exp := now() + make_interval(days => v_days);
  insert into public.credit_wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  perform 1 from public.credit_wallets where user_id = p_user for update;

  insert into public.credit_lots (user_id, source, quantity, remaining, unit_price, expires_at, restriction, event_name, granted_by)
  values (p_user, 'free', p_credits, p_credits, 0, v_exp,
          case when coalesce(p_address_only, true) then 'clinic_address_only' else null end, v_event, auth.uid())
  returning id into v_lot;
  insert into public.credit_history (user_id, amount, type, description, lot_id)
  values (p_user, p_credits, 'charge',
          'Free credits: ' || v_event || ' (valid until ' || to_char(v_exp at time zone 'Asia/Bangkok', 'YYYY-MM-DD') || ')', v_lot);
  v_balance := public._credit_recalc(p_user);

  -- 작업 기록 (005 를 실행했으면)
  if to_regprocedure('public._audit(text,text,text,jsonb)') is not null then
    perform public._audit('credits_added', 'customer', p_user::text, jsonb_build_object(
      'amount', p_credits, 'free', true, 'event', v_event, 'days', v_days,
      'address_only', coalesce(p_address_only, true), 'description', 'Free credits: ' || v_event));
  end if;
  return v_balance;
end $$;
grant execute on function public.admin_grant_free_credits(uuid, text, integer, integer, boolean) to authenticated;


-- ================================================================
-- 4) 관리자: 무료 크레딧 회수 (manager 이상, 사유 필수, 무료 묶음에서만 — 먼저 만료되는 것부터)
-- ================================================================
create or replace function public.admin_revoke_free_credits(p_user uuid, p_amount integer, p_reason text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_need integer := p_amount;
  v_take integer;
  v_avail integer;
  v_reason text := left(trim(coalesce(p_reason, '')), 300);
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  if v_reason = '' then raise exception 'REASON_REQUIRED'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'INVALID_AMOUNT'; end if;
  insert into public.credit_wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  perform 1 from public.credit_wallets where user_id = p_user for update;
  perform public._credit_expire_lots(p_user);

  select coalesce(sum(remaining), 0) into v_avail from public.credit_lots
   where user_id = p_user and remaining > 0 and expires_at > now() and public._is_free_source(source);
  if v_avail < p_amount then raise exception 'INSUFFICIENT_CREDITS'; end if;

  for r in
    select id, remaining from public.credit_lots
     where user_id = p_user and remaining > 0 and expires_at > now() and public._is_free_source(source)
     order by expires_at, created_at
     for update
  loop
    exit when v_need <= 0;
    v_take := least(r.remaining, v_need);
    update public.credit_lots set remaining = remaining - v_take where id = r.id;
    v_need := v_need - v_take;
  end loop;

  -- 이력 'adjust' → 005 의 트리거가 작업 기록(credits_removed)을 남겨요
  insert into public.credit_history (user_id, amount, type, description)
  values (p_user, -p_amount, 'adjust', 'Free credits revoked: ' || v_reason);
  return public._credit_recalc(p_user);
end $$;
grant execute on function public.admin_revoke_free_credits(uuid, integer, text) to authenticated;


-- ================================================================
-- 5) 내 크레딧 요약 (묶음마다 free · event_name 추가)
--    paid      = 산 크레딧 (어디로든 배송)
--    free      = 무료 + 등록 주소 전용 (무료로 주문하기에서만)
--    free_open = 무료 + 제한 없음 (어디로든 배송, 산 크레딧처럼 써요)
-- ================================================================
create or replace function public.get_my_credit_summary()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_LOGGED_IN'; end if;
  perform public._credit_recalc(v_uid);
  return jsonb_build_object(
    'paid', coalesce((select sum(remaining) from public.credit_lots where user_id = v_uid and remaining > 0 and expires_at > now()
                       and restriction is null and not public._is_free_source(source)), 0),
    'free', coalesce((select sum(remaining) from public.credit_lots where user_id = v_uid and remaining > 0 and expires_at > now()
                       and restriction is not null), 0),
    'free_open', coalesce((select sum(remaining) from public.credit_lots where user_id = v_uid and remaining > 0 and expires_at > now()
                       and restriction is null and public._is_free_source(source)), 0),
    'lots', coalesce((select jsonb_agg(jsonb_build_object(
              'id', l.id, 'source', l.source, 'quantity', l.quantity, 'remaining', l.remaining, 'unit_price', l.unit_price,
              'created_at', l.created_at, 'expires_at', l.expires_at, 'restriction', l.restriction,
              'free', public._is_free_source(l.source), 'event_name', l.event_name,
              'signup', exists (select 1 from public.signup_bonus_grants g where g.lot_id = l.id))
              order by l.expires_at, l.created_at)
            from public.credit_lots l where l.user_id = v_uid and l.remaining > 0 and l.expires_at > now()), '[]'::jsonb)
  );
end $$;
grant execute on function public.get_my_credit_summary() to authenticated;


-- ================================================================
-- 6) 매출 대시보드: 무료 크레딧은 매출이 아닌 "무료"로 따로 (owner)
--    granted = 그 달 지급한 무료 크레딧 / used = 그 달 주문에 쓴 무료 크레딧 / expired = 그 달 만료된 무료 크레딧
-- ================================================================
create or replace function public.admin_finance_free_month(p_year integer, p_month integer)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  if p_month < 1 or p_month > 12 or p_year < 2000 or p_year > 2100 then raise exception 'INVALID_ACTION'; end if;
  v_start := public._bkk_month_start(p_year, p_month);
  v_end := public._bkk_month_end(p_year, p_month);
  return jsonb_build_object(
    'granted', coalesce((select sum(quantity) from public.credit_lots
                          where public._is_free_source(source) and created_at >= v_start and created_at < v_end), 0),
    'used', coalesce((select sum(u.quantity) from public.credit_lot_usage u join public.credit_lots l on l.id = u.lot_id
                       where public._is_free_source(l.source) and u.restored_at is null and u.created_at >= v_start and u.created_at < v_end), 0),
    'expired', coalesce((select -sum(h.amount) from public.credit_history h join public.credit_lots l on l.id = h.lot_id
                          where h.type = 'expire' and public._is_free_source(l.source) and h.created_at >= v_start and h.created_at < v_end), 0)
  );
end $$;
grant execute on function public.admin_finance_free_month(integer, integer) to authenticated;

-- (확인용)
-- select id, source, event_name, restriction, remaining from public.credit_lots where source in ('free','bonus') order by created_at desc limit 20;
