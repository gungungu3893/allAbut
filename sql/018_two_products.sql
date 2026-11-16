-- ================================================================
-- allAbut — 018: 상품 두 종류 — 🔩 커스텀 어버트먼트 / 👑 어버트먼트 + 지르코니아 크라운 세트
-- ================================================================
-- 상품 종류 값: 'abutment'(기본) | 'crown_set'
--   크레딧도 종류별로 따로예요. 어버트먼트 크레딧으로 크라운 세트를 주문할 수 없고, 반대도 안 돼요.
--
-- 바뀌는 것
--   1) 칸: credit_packages.product · topup_requests.product · credit_lots.product (기존 줄은 전부 'abutment')
--          credit_wallets.balance_crown_set (balance = 어버트먼트 그대로 → 기존에 balance 를 읽는 곳은 안 깨져요)
--          cnc_orders.crown_set_count (그 주문의 크라운 세트 치아 수, 어버트먼트 = teeth_count - crown_set_count)
--          credit_history.product ('abutment' | 'crown_set' | 'mixed', 트리거가 묶음 · 주문을 보고 채워요)
--          payment_settings.signup_bonus_product (신규 가입 이벤트 지급 종류), signup_bonus_grants.product
--      가격표 중복 검사: (credits) → (product, credits) — 같은 1개 · 10개 패키지가 종류마다 있을 수 있어요
--      세트 패키지 5개 미리 만들기: 1 · 10 · 30 · 50 · 100 크레딧, 1크레딧당 임시 가격 9,999, 판매 중 = false (가격을 정한 뒤 관리자가 켜요)
--   2) 잔액: _credit_recalc / _credit_expire_lots 가 종류별로 계산 (balance = abutment, balance_crown_set = crown_set)
--   3) 차감: _credit_take · _credit_take_mode 에 종류 인자 (예전 인자 모양은 어버트먼트로)
--   4) 충전: create_topup_request 가 패키지 종류를 요청에 저장 → admin_approve_topup 이 같은 종류 묶음 생성
--   5) 주문: create_cnc_order — cases 의 치아마다 product (없으면 abutment, 저장할 때 채워 넣어요)
--      종류별 필요 수를 세서 각 종류 묶음에서 FIFO 차감 (무료 · 등록 주소 전용 규칙은 종류별로 그대로)
--      모자라면 INSUFFICIENT_CREDITS_ABUTMENT / INSUFFICIENT_CREDITS_CROWN_SET (등록 주소 무료로 채울 수 있으면 bonus_address_only)
--      취소 복구는 credit_lot_usage → 원래 묶음 (묶음이 종류를 알고 있어서 종류별로 정확)
--   6) 무료 크레딧: admin_grant_free_credits · admin_revoke_free_credits · admin_add_credits 에 p_product (기본 abutment)
--      신규 가입 이벤트: payment_settings.signup_bonus_product (기본 abutment) → 승인 대기 중인 신청은 신청할 때의 종류로
--   7) 현금 환불 재계산 "1개 가격" = 그 묶음 종류의 1크레딧 패키지 가격
--   8) 요약 · 집계에 종류 칸: get_my_credit_summary(abutment · crown_set 별 paid · free · free_open, crown_set_on_sale),
--      admin_credit_split, admin_finance_month(by_product), admin_outstanding_credits, admin_finance_free_month, admin_topups_export(product 칸),
--      커미션 항목(_commission_items, 입금 기준 · per_credit 은 종류 상관없이 크레딧 수), sales_my_payments, 만료 알림, 계정 삭제 요청(남은 크레딧 = 두 종류 합)
--
-- 실행 순서: 017 다음. 두 번 실행해도 안전. 기존 SQL 파일은 고치지 않아요.
-- ⚠️ 이 파일 다음에 002 · 003 · 004 · 008 · 009 · 010 · 011 · 012 · 016 중 하나를 다시 실행하면 → 018 도 다시 (함수가 종류를 모르는 예전 모양으로 돌아가서)
-- ⚠️ 018 이후에는 002 를 다시 실행하면 가격표 줄(on conflict (credits))에서 오류가 나요 — 가격표 중복 검사가 (종류, 크레딧) 으로 바뀌어서.
--    002 를 꼭 다시 실행해야 하면 먼저 알려 주세요.


-- ================================================================
-- 1) 칸 · 제약 · 세트 패키지
-- ================================================================
alter table public.credit_packages add column if not exists product text not null default 'abutment';
alter table public.credit_packages drop constraint if exists credit_packages_product_check;
alter table public.credit_packages add constraint credit_packages_product_check check (product in ('abutment', 'crown_set'));
alter table public.credit_packages drop constraint if exists credit_packages_credits_key;
alter table public.credit_packages drop constraint if exists credit_packages_product_credits_key;
alter table public.credit_packages add constraint credit_packages_product_credits_key unique (product, credits);

insert into public.credit_packages (product, credits, unit_price, active, sort_order) values
  ('crown_set', 1, 9999, false, 11), ('crown_set', 10, 9999, false, 12), ('crown_set', 30, 9999, false, 13),
  ('crown_set', 50, 9999, false, 14), ('crown_set', 100, 9999, false, 15)
on conflict (product, credits) do nothing;

alter table public.topup_requests add column if not exists product text not null default 'abutment';
alter table public.topup_requests drop constraint if exists topup_requests_product_check;
alter table public.topup_requests add constraint topup_requests_product_check check (product in ('abutment', 'crown_set'));

alter table public.credit_lots add column if not exists product text not null default 'abutment';
alter table public.credit_lots drop constraint if exists credit_lots_product_check;
alter table public.credit_lots add constraint credit_lots_product_check check (product in ('abutment', 'crown_set'));
create index if not exists idx_credit_lots_user_product on public.credit_lots (user_id, product, expires_at);

alter table public.credit_wallets add column if not exists balance_crown_set integer not null default 0;
alter table public.credit_wallets drop constraint if exists credit_wallets_balance_crown_set_check;
alter table public.credit_wallets add constraint credit_wallets_balance_crown_set_check check (balance_crown_set >= 0);

alter table public.cnc_orders add column if not exists crown_set_count integer not null default 0;

alter table public.credit_history add column if not exists product text;
alter table public.credit_history drop constraint if exists credit_history_product_check;
alter table public.credit_history add constraint credit_history_product_check check (product is null or product in ('abutment', 'crown_set', 'mixed'));
update public.credit_history set product = 'abutment' where product is null;   -- 지금까지 기록은 전부 어버트먼트

alter table public.payment_settings add column if not exists signup_bonus_product text not null default 'abutment';
alter table public.payment_settings drop constraint if exists payment_settings_signup_bonus_product_check;
alter table public.payment_settings add constraint payment_settings_signup_bonus_product_check check (signup_bonus_product in ('abutment', 'crown_set'));

alter table public.signup_bonus_grants add column if not exists product text not null default 'abutment';
alter table public.signup_bonus_grants drop constraint if exists signup_bonus_grants_product_check;
alter table public.signup_bonus_grants add constraint signup_bonus_grants_product_check check (product in ('abutment', 'crown_set'));


-- ================================================================
-- 2) 작은 도우미
-- ================================================================
-- 종류 값 검사: 빈 값 → 'abutment', 모르는 값 → INVALID_PRODUCT
create or replace function public._product_check(p_product text)
returns text
language plpgsql immutable as $$
begin
  if p_product is null or trim(p_product) = '' then return 'abutment'; end if;
  if p_product in ('abutment', 'crown_set') then return p_product; end if;
  raise exception 'INVALID_PRODUCT';
end $$;

-- 치아 하나의 종류 (cases[].teeth[] 의 한 칸). 객체가 아니면(예전 숫자 모양) 어버트먼트
create or replace function public._tooth_product(p_tooth jsonb)
returns text
language sql immutable as $$
  select case when jsonb_typeof(p_tooth) = 'object' then public._product_check(p_tooth ->> 'product') else 'abutment' end;
$$;

-- 종류 하나의 잔액 나눔 { paid, free, free_open, total } (get_my_credit_summary 와 같은 규칙)
create or replace function public._credit_split_json(p_user uuid, p_product text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'paid', coalesce(sum(remaining) filter (where restriction is null and not public._is_free_source(source)), 0),
    'free', coalesce(sum(remaining) filter (where restriction is not null), 0),
    'free_open', coalesce(sum(remaining) filter (where restriction is null and public._is_free_source(source)), 0),
    'total', coalesce(sum(remaining), 0))
  from public.credit_lots
  where user_id = p_user and product = p_product and remaining > 0 and expires_at > now();
$$;
revoke all on function public._credit_split_json(uuid, text) from public, anon, authenticated;

-- 이력의 종류 채우기: 묶음이 있으면 묶음 종류 / 주문이면 주문의 치아 종류 (섞였으면 'mixed') / 없으면 어버트먼트
create or replace function public._trg_credit_history_product()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_o record;
begin
  if new.product is null then
    if new.lot_id is not null then
      select product into new.product from public.credit_lots where id = new.lot_id;
    end if;
    if new.product is null and new.order_id is not null then
      select teeth_count, crown_set_count into v_o from public.cnc_orders where id = new.order_id;
      if found then
        new.product := case when coalesce(v_o.crown_set_count, 0) = 0 then 'abutment'
                            when v_o.crown_set_count >= coalesce(v_o.teeth_count, 0) then 'crown_set'
                            else 'mixed' end;
      end if;
    end if;
    new.product := coalesce(new.product, 'abutment');
  end if;
  return new;
end $$;
drop trigger if exists trg_credit_history_product on public.credit_history;
create trigger trg_credit_history_product before insert on public.credit_history
  for each row execute function public._trg_credit_history_product();

-- 신규 가입 이벤트 신청: 종류를 안 넣으면 지금 설정의 지급 종류로
create or replace function public._trg_signup_grant_product()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and (new.product is null or new.product = 'abutment') then
    new.product := coalesce((select signup_bonus_product from public.payment_settings where id = 1), 'abutment');
  end if;
  return new;
end $$;
drop trigger if exists trg_signup_grant_product on public.signup_bonus_grants;
create trigger trg_signup_grant_product before insert on public.signup_bonus_grants
  for each row execute function public._trg_signup_grant_product();


-- ================================================================
-- 3) 잔액 다시 계산 · 만료 (종류별)
-- ================================================================
-- 반환값은 예전처럼 balance (= 어버트먼트)
create or replace function public._credit_recalc(p_user uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  perform public._credit_expire_lots(p_user);
  insert into public.credit_wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  update public.credit_wallets
     set balance = coalesce((select sum(remaining) from public.credit_lots
                              where user_id = p_user and product = 'abutment' and expires_at > now()), 0),
         balance_crown_set = coalesce((select sum(remaining) from public.credit_lots
                              where user_id = p_user and product = 'crown_set' and expires_at > now()), 0),
         updated_at = now()
   where user_id = p_user
   returning balance into v_balance;
  return v_balance;
end $$;

create or replace function public._credit_expire_lots(p_user uuid default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_count integer := 0;
  v_users uuid[] := '{}';
begin
  for r in
    select id, user_id, remaining, expires_at, product from public.credit_lots
     where remaining > 0 and expires_at <= now() and (p_user is null or user_id = p_user)
     order by expires_at
     for update
  loop
    update public.credit_lots set remaining = 0 where id = r.id;
    insert into public.credit_history (user_id, amount, type, description, lot_id, product)
    values (r.user_id, -r.remaining, 'expire',
            'Expired ' || r.remaining || case when r.product = 'crown_set' then ' crown set' else '' end
            || ' credits (valid until ' || to_char(r.expires_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD') || ')',
            r.id, r.product);
    v_count := v_count + 1;
    if not (r.user_id = any (v_users)) then v_users := v_users || r.user_id; end if;
  end loop;

  if array_length(v_users, 1) > 0 then
    insert into public.credit_wallets (user_id, balance)
    select u, 0 from unnest(v_users) u on conflict (user_id) do nothing;
    update public.credit_wallets w
       set balance = coalesce((select sum(l.remaining) from public.credit_lots l where l.user_id = w.user_id and l.product = 'abutment'), 0),
           balance_crown_set = coalesce((select sum(l.remaining) from public.credit_lots l where l.user_id = w.user_id and l.product = 'crown_set'), 0),
           updated_at = now()
     where w.user_id = any (v_users);
  end if;
  return v_count;
end $$;

-- 지금 잔액을 한 번 맞춰요 (기존 지갑의 balance_crown_set = 0)
update public.credit_wallets w
   set balance = coalesce((select sum(l.remaining) from public.credit_lots l where l.user_id = w.user_id and l.product = 'abutment' and l.expires_at > now()), 0),
       balance_crown_set = coalesce((select sum(l.remaining) from public.credit_lots l where l.user_id = w.user_id and l.product = 'crown_set' and l.expires_at > now()), 0)
 where exists (select 1 from public.credit_lots l where l.user_id = w.user_id);


-- ================================================================
-- 4) 차감 (FIFO, 종류별)
-- ================================================================
create or replace function public._credit_take(p_user uuid, p_amount integer, p_order text, p_product text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_need integer := p_amount;
  v_take integer;
  v_available integer;
  v_product text := public._product_check(p_product);
begin
  if p_amount <= 0 then return; end if;
  select coalesce(sum(remaining), 0) into v_available
    from public.credit_lots where user_id = p_user and product = v_product and remaining > 0 and expires_at > now();
  if v_available < p_amount then raise exception 'INSUFFICIENT_CREDITS'; end if;

  for r in
    select id, remaining from public.credit_lots
     where user_id = p_user and product = v_product and remaining > 0 and expires_at > now()
     order by expires_at, created_at
     for update
  loop
    exit when v_need <= 0;
    v_take := least(r.remaining, v_need);
    update public.credit_lots set remaining = remaining - v_take where id = r.id;
    if p_order is not null then
      insert into public.credit_lot_usage (order_id, lot_id, quantity) values (p_order, r.id, v_take);
    end if;
    v_need := v_need - v_take;
  end loop;
  if v_need > 0 then raise exception 'INSUFFICIENT_CREDITS'; end if;
end $$;

-- 예전 모양 (종류 없음) = 어버트먼트
create or replace function public._credit_take(p_user uuid, p_amount integer, p_order text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._credit_take(p_user, p_amount, p_order, 'abutment');
end $$;

-- p_mode: 'paid' = 등록 주소 전용 무료 건너뜀 / 'free_first' = 등록 주소 전용 무료 먼저. 반환 = 쓴 등록 주소 전용 무료 수
create or replace function public._credit_take_mode(p_user uuid, p_amount integer, p_order text, p_mode text, p_product text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_need integer := p_amount;
  v_take integer;
  v_free integer := 0;
  v_product text := public._product_check(p_product);
begin
  if p_amount <= 0 then return 0; end if;
  for r in
    select id, remaining, restriction from public.credit_lots
     where user_id = p_user and product = v_product and remaining > 0 and expires_at > now()
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

create or replace function public._credit_take_mode(p_user uuid, p_amount integer, p_order text, p_mode text)
returns integer
language plpgsql security definer set search_path = public as $$
begin
  return public._credit_take_mode(p_user, p_amount, p_order, p_mode, 'abutment');
end $$;

revoke all on function public._credit_take(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public._credit_take_mode(uuid, integer, text, text, text) from public, anon, authenticated;


-- ================================================================
-- 5) 충전 요청 · 승인 (패키지 종류 → 요청 → 묶음)
-- ================================================================
create or replace function public.create_topup_request(p_package_id bigint, p_slip_path text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pkg record;
  v_vat numeric;
  v_sub numeric;
  v_vat_amt numeric;
  v_id text;
begin
  if v_uid is null then raise exception 'NOT_LOGGED_IN'; end if;
  select * into v_pkg from public.credit_packages where id = p_package_id and active;
  if not found then raise exception 'PACKAGE_NOT_FOUND'; end if;

  -- 슬립 파일은 본인 폴더에 실제로 올라가 있어야 해요
  if p_slip_path is null or split_part(p_slip_path, '/', 1) <> v_uid::text or p_slip_path like '%..%' or length(p_slip_path) > 300 then
    raise exception 'SLIP_INVALID';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'topup-slips' and name = p_slip_path) then
    raise exception 'SLIP_NOT_FOUND';
  end if;
  if (select count(*) from public.topup_requests where user_id = v_uid and status = 'pending') >= 5 then
    raise exception 'TOO_MANY_PENDING';
  end if;

  v_vat := coalesce((select vat_rate from public.payment_settings where id = 1), 7);
  v_sub := v_pkg.credits * v_pkg.unit_price;
  v_vat_amt := round(v_sub * v_vat / 100, 2);
  v_id := 'TP' || to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD') || '-' || lpad(nextval('public.topup_seq')::text, 4, '0');

  insert into public.topup_requests (id, user_id, package_id, credits, unit_price, subtotal, vat_amount, total, slip_path, product)
  values (v_id, v_uid, v_pkg.id, v_pkg.credits, v_pkg.unit_price, v_sub, v_vat_amt, v_sub + v_vat_amt, p_slip_path, v_pkg.product);

  return jsonb_build_object('id', v_id, 'credits', v_pkg.credits, 'subtotal', v_sub, 'vat_amount', v_vat_amt, 'total', v_sub + v_vat_amt,
                            'product', v_pkg.product);
end $$;

create or replace function public.admin_approve_topup(p_id text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_req record;
  v_lot uuid;
  v_exp timestamptz := now() + interval '12 months';
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  select * into v_req from public.topup_requests where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_req.status <> 'pending' then raise exception 'ALREADY_REVIEWED'; end if;

  insert into public.credit_lots (user_id, source, quantity, remaining, unit_price, topup_id, expires_at, product)
  values (v_req.user_id, 'purchase', v_req.credits, v_req.credits, v_req.unit_price, v_req.id, v_exp, coalesce(v_req.product, 'abutment'))
  returning id into v_lot;

  update public.topup_requests set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  insert into public.credit_history (user_id, amount, type, description, lot_id, product)
  values (v_req.user_id, v_req.credits, 'charge',
          'Top-up ' || v_req.id || case when v_req.product = 'crown_set' then ' · crown set' else '' end
          || ' (valid until ' || to_char(v_exp at time zone 'Asia/Bangkok', 'YYYY-MM-DD') || ')', v_lot, coalesce(v_req.product, 'abutment'));
  return public._credit_recalc(v_req.user_id);
end $$;


-- ================================================================
-- 6) 관리자 크레딧 조정 · 무료 크레딧 지급 · 회수 (p_product, 기본 abutment)
--    인자가 늘어서 예전 모양을 지우고 새로 만들어요 (같은 이름이 두 개면 화면에서 부를 때 헷갈려요)
-- ================================================================
drop function if exists public.admin_add_credits(uuid, integer, text);
create or replace function public.admin_add_credits(p_user uuid, p_amount integer, p_description text default '', p_product text default 'abutment')
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_lot uuid;
  v_exp timestamptz := now() + interval '12 months';
  v_product text := public._product_check(p_product);
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'INVALID_AMOUNT'; end if;
  insert into public.credit_wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  perform 1 from public.credit_wallets where user_id = p_user for update;

  if p_amount > 0 then
    insert into public.credit_lots (user_id, source, quantity, remaining, unit_price, expires_at, product)
    values (p_user, 'bonus', p_amount, p_amount, 0, v_exp, v_product) returning id into v_lot;
    insert into public.credit_history (user_id, amount, type, description, lot_id, product)
    values (p_user, p_amount, 'charge',
            coalesce(nullif(trim(p_description), ''), 'Bonus') || ' (valid until ' || to_char(v_exp at time zone 'Asia/Bangkok', 'YYYY-MM-DD') || ')', v_lot, v_product);
  else
    perform public._credit_expire_lots(p_user);
    begin
      perform public._credit_take(p_user, -p_amount, null, v_product);
    exception when others then
      raise exception 'BALANCE_NEGATIVE: not enough balance to deduct';
    end;
    insert into public.credit_history (user_id, amount, type, description, product)
    values (p_user, p_amount, 'adjust', coalesce(p_description, ''), v_product);
  end if;
  return public._credit_recalc(p_user);
end $$;
revoke all on function public.admin_add_credits(uuid, integer, text, text) from public, anon;
grant execute on function public.admin_add_credits(uuid, integer, text, text) to authenticated;

drop function if exists public.admin_grant_free_credits(uuid, text, integer, integer, boolean);
create or replace function public.admin_grant_free_credits(
  p_user uuid, p_event text, p_credits integer, p_days integer default 365, p_address_only boolean default true, p_product text default 'abutment'
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_event text := left(trim(coalesce(p_event, '')), 100);
  v_days integer := coalesce(p_days, 365);
  v_exp timestamptz;
  v_lot uuid;
  v_balance integer;
  v_product text := public._product_check(p_product);
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  if v_event = '' then raise exception 'EVENT_REQUIRED'; end if;
  if p_credits is null or p_credits < 1 or p_credits > 1000 then raise exception 'INVALID_AMOUNT'; end if;
  if v_days < 1 or v_days > 3650 then raise exception 'INVALID_AMOUNT'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'NOT_FOUND'; end if;

  v_exp := now() + make_interval(days => v_days);
  insert into public.credit_wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  perform 1 from public.credit_wallets where user_id = p_user for update;

  insert into public.credit_lots (user_id, source, quantity, remaining, unit_price, expires_at, restriction, event_name, granted_by, product)
  values (p_user, 'free', p_credits, p_credits, 0, v_exp,
          case when coalesce(p_address_only, true) then 'clinic_address_only' else null end, v_event, auth.uid(), v_product)
  returning id into v_lot;
  insert into public.credit_history (user_id, amount, type, description, lot_id, product)
  values (p_user, p_credits, 'charge',
          'Free credits: ' || v_event || ' (valid until ' || to_char(v_exp at time zone 'Asia/Bangkok', 'YYYY-MM-DD') || ')', v_lot, v_product);
  v_balance := public._credit_recalc(p_user);

  -- 작업 기록 (005 를 실행했으면)
  if to_regprocedure('public._audit(text,text,text,jsonb)') is not null then
    perform public._audit('credits_added', 'customer', p_user::text, jsonb_build_object(
      'amount', p_credits, 'free', true, 'event', v_event, 'days', v_days, 'product', v_product,
      'address_only', coalesce(p_address_only, true), 'description', 'Free credits: ' || v_event));
  end if;
  return v_balance;
end $$;
revoke all on function public.admin_grant_free_credits(uuid, text, integer, integer, boolean, text) from public, anon;
grant execute on function public.admin_grant_free_credits(uuid, text, integer, integer, boolean, text) to authenticated;

drop function if exists public.admin_revoke_free_credits(uuid, integer, text);
create or replace function public.admin_revoke_free_credits(p_user uuid, p_amount integer, p_reason text, p_product text default 'abutment')
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_need integer := p_amount;
  v_take integer;
  v_avail integer;
  v_reason text := left(trim(coalesce(p_reason, '')), 300);
  v_product text := public._product_check(p_product);
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  if v_reason = '' then raise exception 'REASON_REQUIRED'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'INVALID_AMOUNT'; end if;
  insert into public.credit_wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  perform 1 from public.credit_wallets where user_id = p_user for update;
  perform public._credit_expire_lots(p_user);

  select coalesce(sum(remaining), 0) into v_avail from public.credit_lots
   where user_id = p_user and product = v_product and remaining > 0 and expires_at > now() and public._is_free_source(source);
  if v_avail < p_amount then raise exception 'INSUFFICIENT_CREDITS'; end if;

  for r in
    select id, remaining from public.credit_lots
     where user_id = p_user and product = v_product and remaining > 0 and expires_at > now() and public._is_free_source(source)
     order by expires_at, created_at
     for update
  loop
    exit when v_need <= 0;
    v_take := least(r.remaining, v_need);
    update public.credit_lots set remaining = remaining - v_take where id = r.id;
    v_need := v_need - v_take;
  end loop;

  -- 이력 'adjust' → 005 의 트리거가 작업 기록(credits_removed)을 남겨요
  insert into public.credit_history (user_id, amount, type, description, product)
  values (p_user, -p_amount, 'adjust', 'Free credits revoked: ' || v_reason, v_product);
  return public._credit_recalc(p_user);
end $$;
revoke all on function public.admin_revoke_free_credits(uuid, integer, text, text) from public, anon;
grant execute on function public.admin_revoke_free_credits(uuid, integer, text, text) to authenticated;

-- 신규 가입 이벤트 지급: 신청 기록의 종류 → 없으면 지금 설정의 지급 종류
create or replace function public._signup_bonus_issue(p_user uuid, p_credits integer, p_campaign text, p_days integer)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lot uuid;
  v_exp timestamptz := now() + make_interval(days => greatest(1, coalesce(p_days, 365)));
  v_name text := coalesce(nullif(trim(p_campaign), ''), 'New member event');
  v_product text;
begin
  v_product := coalesce((select product from public.signup_bonus_grants where user_id = p_user),
                        (select signup_bonus_product from public.payment_settings where id = 1), 'abutment');
  insert into public.credit_wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  insert into public.credit_lots (user_id, source, quantity, remaining, unit_price, expires_at, restriction, event_name, granted_by, product)
  values (p_user, 'free', p_credits, p_credits, 0, v_exp, 'clinic_address_only', v_name, auth.uid(), v_product)
  returning id into v_lot;
  insert into public.credit_history (user_id, amount, type, description, lot_id, product)
  values (p_user, p_credits, 'charge',
          'Free credits: ' || v_name || ' (valid until ' || to_char(v_exp at time zone 'Asia/Bangkok', 'YYYY-MM-DD') || ')', v_lot, v_product);
  perform public._credit_recalc(p_user);
  return v_lot;
end $$;

-- 신규 가입 이벤트 안내 (누구나): product 추가
create or replace function public.get_signup_campaign()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when s.signup_bonus_enabled and s.signup_bonus_credits >= 1 and s.signup_bonus_starts is not null and s.signup_bonus_ends is not null
         and now() <@ public._bonus_window(s.signup_bonus_starts, s.signup_bonus_ends)
    then jsonb_build_object('active', true, 'credits', s.signup_bonus_credits, 'starts', s.signup_bonus_starts, 'ends', s.signup_bonus_ends,
                            'banner', s.signup_bonus_banner, 'valid_days', s.signup_bonus_valid_days, 'require_line', s.signup_bonus_require_line,
                            'product', coalesce(s.signup_bonus_product, 'abutment'))
    else jsonb_build_object('active', false) end
  from public.payment_settings s where s.id = 1;
$$;


-- ================================================================
-- 7) 주문 — 치아마다 종류, 종류별 차감
-- ================================================================
create or replace function public.create_cnc_order(
  p_patient text, p_deadline date, p_clinic text, p_addr text,
  p_phone text, p_line_id text, p_cases jsonb, p_use_free boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_teeth integer;
  v_crown integer;
  v_cases jsonb;
  v_id text;
  v_balance integer;
  v_paid integer;
  v_free_avail integer;
  v_free_used integer := 0;
  v_free_taken integer := 0;
  v_need integer;
  v_p text;
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

  -- 치아마다 종류를 채워 넣어요 (없으면 abutment, 모르는 값이면 INVALID_PRODUCT)
  select coalesce(jsonb_agg(
           case when jsonb_typeof(c) = 'object' then
             jsonb_set(c, '{teeth}', coalesce((
               select jsonb_agg(case when jsonb_typeof(t) = 'object' then t || jsonb_build_object('product', public._tooth_product(t)) else t end order by o)
                 from jsonb_array_elements(case when jsonb_typeof(c -> 'teeth') = 'array' then c -> 'teeth' else '[]'::jsonb end) with ordinality x(t, o)
             ), '[]'::jsonb))
           else c end order by co), '[]'::jsonb)
    into v_cases
    from jsonb_array_elements(case when jsonb_typeof(p_cases) = 'array' then p_cases else '[]'::jsonb end) with ordinality y(c, co);

  select count(*), count(*) filter (where public._tooth_product(t) = 'crown_set')
    into v_teeth, v_crown
    from jsonb_array_elements(v_cases) c,
         jsonb_array_elements(case when jsonb_typeof(c -> 'teeth') = 'array' then c -> 'teeth' else '[]'::jsonb end) t;
  if v_teeth < 1 then raise exception 'NO_TEETH'; end if;

  -- 같은 사용자의 동시 주문을 줄 세우기 (지갑 행 잠금)
  insert into public.credit_wallets (user_id, balance) values (v_uid, 0) on conflict (user_id) do nothing;
  perform 1 from public.credit_wallets where user_id = v_uid for update;
  perform public._credit_expire_lots(v_uid);

  -- 종류마다 따로 검사 (어버트먼트 크레딧으로 크라운 세트를 못 사고, 반대도 안 돼요)
  foreach v_p in array array['abutment', 'crown_set'] loop
    v_need := case when v_p = 'crown_set' then v_crown else v_teeth - v_crown end;
    continue when v_need <= 0;
    select coalesce(sum(remaining) filter (where restriction is null), 0),
           coalesce(sum(remaining) filter (where restriction is not null), 0)
      into v_paid, v_free_avail
      from public.credit_lots where user_id = v_uid and product = v_p and remaining > 0 and expires_at > now();

    if coalesce(p_use_free, false) then
      if v_paid + v_free_avail < v_need then raise exception '%', 'INSUFFICIENT_CREDITS_' || upper(v_p); end if;
    elsif v_paid < v_need then
      -- 산 크레딧은 모자라지만 무료 크레딧을 쓰면 충분 → 등록 주소로 주문해야 써요
      if v_paid + v_free_avail >= v_need and v_free_avail > 0 then raise exception 'bonus_address_only'; end if;
      raise exception '%', 'INSUFFICIENT_CREDITS_' || upper(v_p);
    end if;
    -- 무료 먼저 쓰는 수를 미리 정해서 주문과 함께 저장 (새 주문 LINE 알림이 INSERT 때 bonus_used 를 볼 수 있게)
    if coalesce(p_use_free, false) then v_free_used := v_free_used + least(v_free_avail, v_need); end if;
  end loop;

  -- 납품일은 디자인 승인 때 정해요 (012) → 새 주문은 항상 null
  v_id := 'CA' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.cnc_order_seq')::text, 4, '0');
  insert into public.cnc_orders (id, user_id, patient, deadline, clinic, addr, phone, line_id, cases, teeth_count, credits_used, addr_norm, bonus_used, crown_set_count)
  values (v_id, v_uid, coalesce(p_patient, ''), null, trim(v_clinic), trim(v_addr), trim(v_phone), coalesce(p_line_id, ''), v_cases, v_teeth, v_teeth,
          public._norm_addr(v_addr), v_free_used, v_crown);

  foreach v_p in array array['abutment', 'crown_set'] loop
    v_need := case when v_p = 'crown_set' then v_crown else v_teeth - v_crown end;
    continue when v_need <= 0;
    v_free_taken := v_free_taken + public._credit_take_mode(v_uid, v_need, v_id,
                      case when coalesce(p_use_free, false) then 'free_first' else 'paid' end, v_p);
  end loop;
  if v_free_taken <> v_free_used then
    raise exception 'CREDIT_SPLIT_MISMATCH';   -- 일어나면 안 돼요 (지갑 행을 잠가서 그 사이 바뀌지 않아요)
  end if;
  v_balance := public._credit_recalc(v_uid);
  insert into public.credit_history (user_id, amount, type, order_id, description)
  values (v_uid, -v_teeth, 'use', v_id, 'CNC order ' || v_id || ' (' || v_teeth || ' teeth'
          || case when v_crown > 0 then ', ' || v_crown || ' crown set' else '' end
          || case when v_free_used > 0 then ', ' || v_free_used || ' free' else '' end || ')');

  return jsonb_build_object('id', v_id, 'teeth', v_teeth, 'balance', v_balance, 'bonus_used', v_free_used,
                            'abutment', v_teeth - v_crown, 'crown_set', v_crown,
                            'balance_crown_set', (select balance_crown_set from public.credit_wallets where user_id = v_uid));
end $$;


-- ================================================================
-- 8) 현금 환불 — 재계산 "1개 가격" = 그 묶음 종류의 1크레딧 패키지 가격
-- ================================================================
create or replace function public._credit_refund_quote(p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_vat numeric := coalesce((select vat_rate from public.payment_settings where id = 1), 7);
  v_single_abut numeric := coalesce((select unit_price from public.credit_packages where product = 'abutment' and credits = 1 order by active desc limit 1), 2200);
  v_single_crown numeric := coalesce((select unit_price from public.credit_packages where product = 'crown_set' and credits = 1 order by active desc limit 1), 2200);
  v_single numeric;
  v_paid numeric;
  v_used integer;
  v_refund numeric;
  v_rule text;
  v_lots jsonb := '[]'::jsonb;
  v_total numeric := 0;
begin
  for r in
    select l.*, t.total as topup_total
      from public.credit_lots l left join public.topup_requests t on t.id = l.topup_id
     where l.user_id = p_user and l.remaining > 0
     order by l.expires_at
  loop
    v_single := case when r.product = 'crown_set' then v_single_crown else v_single_abut end;
    v_used := r.quantity - r.remaining;
    v_paid := coalesce(r.topup_total, round(r.quantity * r.unit_price * (1 + v_vat / 100), 2));
    v_refund := 0;
    if r.expires_at <= now() then
      v_rule := 'expired';
    elsif r.source <> 'purchase' or r.unit_price = 0 then
      v_rule := 'bonus';
    elsif r.created_at < now() - interval '14 days' then
      v_rule := 'over_14_days';
    elsif v_used = 0 then
      v_rule := 'full';
      v_refund := v_paid;
    else
      v_rule := 'recalculated';
      v_refund := greatest(0, round(v_paid - v_used * v_single * (1 + v_vat / 100), 2));
    end if;
    v_total := v_total + v_refund;
    v_lots := v_lots || jsonb_build_object(
      'lot_id', r.id, 'source', r.source, 'created_at', r.created_at, 'expires_at', r.expires_at,
      'quantity', r.quantity, 'remaining', r.remaining, 'used', v_used, 'unit_price', r.unit_price,
      'paid_total', v_paid, 'refundable', v_refund, 'rule', v_rule, 'topup_id', r.topup_id,
      'product', r.product, 'single_price', v_single);
  end loop;
  return jsonb_build_object('lots', v_lots, 'total_refundable', v_total, 'single_price', v_single_abut, 'vat_rate', v_vat,
                            'single_prices', jsonb_build_object('abutment', v_single_abut, 'crown_set', v_single_crown));
end $$;

create or replace function public.admin_refund_cash(p_user uuid, p_lot_ids uuid[], p_amount numeric, p_note text default '')
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_quote jsonb;
  v_lot jsonb;
  v_max numeric := 0;
  v_credits integer := 0;
  v_count integer := 0;
  v_sel jsonb := '[]'::jsonb;   -- 고른 묶음들 (환불 가능액 · 남은 크레딧 · 충전 번호)
  v_hist uuid;
  v_left numeric;
  v_part numeric;
  v_i integer := 0;
  v_products text[] := '{}';
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  if p_lot_ids is null or array_length(p_lot_ids, 1) is null then raise exception 'NO_LOTS'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'INVALID_AMOUNT'; end if;

  perform public._credit_recalc(p_user);
  v_quote := public._credit_refund_quote(p_user);
  for v_lot in select * from jsonb_array_elements(v_quote -> 'lots') loop
    if (v_lot ->> 'lot_id')::uuid = any (p_lot_ids) then
      if (v_lot ->> 'rule') not in ('full', 'recalculated') then raise exception 'LOT_NOT_REFUNDABLE'; end if;
      v_max := v_max + (v_lot ->> 'refundable')::numeric;
      v_credits := v_credits + (v_lot ->> 'remaining')::int;
      v_count := v_count + 1;
      v_sel := v_sel || jsonb_build_array(v_lot);
      if not (coalesce(v_lot ->> 'product', 'abutment') = any (v_products)) then v_products := v_products || coalesce(v_lot ->> 'product', 'abutment'); end if;
    end if;
  end loop;
  if v_count <> array_length(p_lot_ids, 1) then raise exception 'LOT_NOT_REFUNDABLE'; end if;
  if p_amount > v_max + 0.005 then raise exception 'AMOUNT_TOO_HIGH'; end if;

  update public.credit_lots set remaining = 0 where user_id = p_user and id = any (p_lot_ids);
  insert into public.credit_history (user_id, amount, type, description, amount_thb, product)
  values (p_user, -v_credits, 'refund_cash',
          'Cash refund THB ' || to_char(p_amount, 'FM999,999,990.00') || coalesce(' · ' || nullif(trim(p_note), ''), ''),
          round(p_amount, 2), case when array_length(v_products, 1) = 1 then v_products[1] else 'mixed' end)
  returning id into v_hist;

  -- 묶음별 몫: 실제 송금액을 각 묶음의 환불 가능액 비율로 (마지막 묶음이 반올림 나머지)
  v_left := round(p_amount, 2);
  for v_lot in select * from jsonb_array_elements(v_sel) loop
    v_i := v_i + 1;
    if v_i = v_count then
      v_part := v_left;
    elsif v_max > 0 then
      v_part := round(p_amount * (v_lot ->> 'refundable')::numeric / v_max, 2);
    else
      v_part := 0;
    end if;
    v_left := v_left - v_part;
    insert into public.refund_cash_lots (history_id, user_id, lot_id, topup_id, credits, amount_thb)
    values (v_hist, p_user, (v_lot ->> 'lot_id')::uuid, nullif(v_lot ->> 'topup_id', ''), (v_lot ->> 'remaining')::int, v_part);
  end loop;
  return public._credit_recalc(p_user);
end $$;


-- ================================================================
-- 9) 요약 (고객 · 관리자)
-- ================================================================
-- 맨 위 paid · free · free_open = 어버트먼트 (예전 화면 그대로), abutment · crown_set 에 종류별
create or replace function public.get_my_credit_summary()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ab jsonb;
begin
  if v_uid is null then raise exception 'NOT_LOGGED_IN'; end if;
  perform public._credit_recalc(v_uid);
  v_ab := public._credit_split_json(v_uid, 'abutment');
  return jsonb_build_object(
    'paid', (v_ab ->> 'paid')::int,
    'free', (v_ab ->> 'free')::int,
    'free_open', (v_ab ->> 'free_open')::int,
    'abutment', v_ab,
    'crown_set', public._credit_split_json(v_uid, 'crown_set'),
    'crown_set_on_sale', exists (select 1 from public.credit_packages where product = 'crown_set' and active),
    'lots', coalesce((select jsonb_agg(jsonb_build_object(
              'id', l.id, 'source', l.source, 'quantity', l.quantity, 'remaining', l.remaining, 'unit_price', l.unit_price,
              'created_at', l.created_at, 'expires_at', l.expires_at, 'restriction', l.restriction,
              'free', public._is_free_source(l.source), 'event_name', l.event_name, 'product', l.product,
              'signup', exists (select 1 from public.signup_bonus_grants g where g.lot_id = l.id))
              order by l.product, l.expires_at, l.created_at)
            from public.credit_lots l where l.user_id = v_uid and l.remaining > 0 and l.expires_at > now()), '[]'::jsonb)
  );
end $$;

-- 관리자 고객별: paid · free = 어버트먼트 (예전 그대로) + crown_paid · crown_free
create or replace function public.admin_credit_split(p_users uuid[] default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', s.user_id,
      'paid', s.paid, 'free', s.free,
      'paid_next_expiry', s.paid_next, 'free_next_expiry', s.free_next,
      'crown_paid', s.crown_paid, 'crown_free', s.crown_free,
      'crown_paid_next_expiry', s.crown_paid_next, 'crown_free_next_expiry', s.crown_free_next))
    from (
      select l.user_id,
        coalesce(sum(l.remaining) filter (where l.product = 'abutment' and l.restriction is null and not public._is_free_source(l.source)), 0) as paid,
        coalesce(sum(l.remaining) filter (where l.product = 'abutment' and not (l.restriction is null and not public._is_free_source(l.source))), 0) as free,
        min(l.expires_at) filter (where l.product = 'abutment' and l.restriction is null and not public._is_free_source(l.source)) as paid_next,
        min(l.expires_at) filter (where l.product = 'abutment' and not (l.restriction is null and not public._is_free_source(l.source))) as free_next,
        coalesce(sum(l.remaining) filter (where l.product = 'crown_set' and l.restriction is null and not public._is_free_source(l.source)), 0) as crown_paid,
        coalesce(sum(l.remaining) filter (where l.product = 'crown_set' and not (l.restriction is null and not public._is_free_source(l.source))), 0) as crown_free,
        min(l.expires_at) filter (where l.product = 'crown_set' and l.restriction is null and not public._is_free_source(l.source)) as crown_paid_next,
        min(l.expires_at) filter (where l.product = 'crown_set' and not (l.restriction is null and not public._is_free_source(l.source))) as crown_free_next
      from public.credit_lots l
      where l.remaining > 0 and l.expires_at > now()
        and (p_users is null or l.user_id = any (p_users))
      group by l.user_id
    ) s
  ), '[]'::jsonb);
end $$;

-- 계정 삭제 요청: 남은 크레딧 = 두 종류 합
create or replace function public.request_account_deletion(p_reason text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_already boolean := false;
  v_active integer;
  v_balance integer;
begin
  if v_uid is null then raise exception 'NOT_LOGGED_IN'; end if;

  select id into v_id from public.account_deletion_requests
   where user_id = v_uid and status = 'pending' order by created_at desc limit 1;
  if v_id is not null then
    v_already := true;
  else
    insert into public.account_deletion_requests (user_id, reason)
    values (v_uid, left(coalesce(trim(p_reason), ''), 1000))
    returning id into v_id;
  end if;

  select count(*) into v_active from public.cnc_orders where user_id = v_uid and stage not in ('done', 'cancelled');
  select coalesce(balance, 0) + coalesce(balance_crown_set, 0) into v_balance from public.credit_wallets where user_id = v_uid;

  return jsonb_build_object('id', v_id, 'status', 'pending', 'already', v_already,
                            'active_orders', v_active, 'balance', coalesce(v_balance, 0));
end $$;


-- ================================================================
-- 10) 만료 알림 — 묶음마다 product
-- ================================================================
create or replace function public.send_credit_expiry_reminders()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
  v_url text := 'https://jtqsbzihnduktffymncm.supabase.co/functions/v1/line-notify';
  r record;
  v_sent integer := 0;
begin
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
  exception when others then
    v_secret := null;
  end;
  if v_secret is null or v_secret = '' then
    raise notice 'notify_secret is not in Vault — skipping expiry reminders';
    return 0;
  end if;

  -- 7일 이내 (아직 7일 알림 안 보낸 것)
  for r in
    select user_id, jsonb_agg(jsonb_build_object('id', id, 'remaining', remaining, 'expires_at', expires_at, 'product', product) order by expires_at) as lots,
           array_agg(id) as ids
      from public.credit_lots
     where remaining > 0 and expires_at > now() and expires_at <= now() + interval '7 days' and not notified_7
     group by user_id
  loop
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('type', 'EXPIRY_REMINDER', 'user_id', r.user_id, 'days', 7, 'lots', r.lots),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret)
    );
    update public.credit_lots set notified_7 = true, notified_30 = true where id = any (r.ids);
    v_sent := v_sent + 1;
  end loop;

  -- 30일 이내 (아직 30일 알림 안 보낸 것)
  for r in
    select user_id, jsonb_agg(jsonb_build_object('id', id, 'remaining', remaining, 'expires_at', expires_at, 'product', product) order by expires_at) as lots,
           array_agg(id) as ids
      from public.credit_lots
     where remaining > 0 and expires_at > now() and expires_at <= now() + interval '30 days' and not notified_30
     group by user_id
  loop
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('type', 'EXPIRY_REMINDER', 'user_id', r.user_id, 'days', 30, 'lots', r.lots),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret)
    );
    update public.credit_lots set notified_30 = true where id = any (r.ids);
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;


-- ================================================================
-- 11) 매출 집계 — 종류별
-- ================================================================
create or replace function public.admin_finance_month(p_year integer, p_month integer)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v jsonb;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  if p_month < 1 or p_month > 12 or p_year < 2000 or p_year > 2100 then raise exception 'INVALID_ACTION'; end if;
  v_start := public._bkk_month_start(p_year, p_month);
  v_end := public._bkk_month_end(p_year, p_month);

  with
  t as (
    select * from public.topup_requests
     where status = 'approved' and reviewed_at >= v_start and reviewed_at < v_end
  ),
  rf as (
    select * from public.credit_history
     where type = 'refund_cash' and created_at >= v_start and created_at < v_end
  ),
  used as (
    select u.quantity, l.unit_price, l.product, public._is_free_source(l.source) as free
      from public.credit_lot_usage u join public.credit_lots l on l.id = u.lot_id
     where u.created_at >= v_start and u.created_at < v_end and u.restored_at is null
  ),
  exp as (
    select h.amount, l.unit_price, coalesce(l.product, h.product, 'abutment') as product
      from public.credit_history h left join public.credit_lots l on l.id = h.lot_id
     where h.type = 'expire' and h.created_at >= v_start and h.created_at < v_end
  ),
  bonus as (
    select quantity from public.credit_lots
     where source = 'bonus' and created_at >= v_start and created_at < v_end
  ),
  pkg as (
    select product, credits, unit_price, count(*) as cnt, sum(credits) as total_credits, sum(total) as total
      from t group by product, credits, unit_price
  ),
  topc as (
    select t.user_id, sum(t.total) as total, count(*) as cnt,
           coalesce(nullif(p.clinic_name, ''), p.nickname, '') as name
      from t left join public.profiles p on p.id = t.user_id
     group by t.user_id, p.clinic_name, p.nickname
     order by sum(t.total) desc
     limit 5
  ),
  prods as (select unnest(array['abutment', 'crown_set']) as product)
  select jsonb_build_object(
    'year', p_year, 'month', p_month,
    'topups', (select jsonb_build_object(
        'count', count(*), 'credits', coalesce(sum(credits), 0),
        'subtotal', coalesce(sum(subtotal), 0), 'vat', coalesce(sum(vat_amount), 0), 'total', coalesce(sum(total), 0)) from t),
    'pending', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(total), 0))
                  from public.topup_requests where status = 'pending' and created_at >= v_start and created_at < v_end),
    'pending_now', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(total), 0))
                      from public.topup_requests where status = 'pending'),
    'refunds', (select jsonb_build_object('count', count(*), 'credits', coalesce(-sum(amount), 0), 'amount', coalesce(sum(amount_thb), 0)) from rf),
    'net', (select coalesce(sum(total), 0) from t) - (select coalesce(sum(amount_thb), 0) from rf),
    'consumed', (select jsonb_build_object('credits', coalesce(sum(quantity), 0), 'value', coalesce(round(sum(quantity * unit_price), 2), 0)) from used),
    'expired', (select jsonb_build_object('credits', coalesce(-sum(amount), 0), 'value', coalesce(round(sum(-amount * coalesce(unit_price, 0)), 2), 0)) from exp),
    'bonus', (select jsonb_build_object('credits', coalesce(sum(quantity), 0)) from bonus),
    'by_package', (select coalesce(jsonb_agg(jsonb_build_object(
        'product', product, 'credits', credits, 'unit_price', unit_price, 'count', cnt, 'total_credits', total_credits, 'total', total)
        order by product, credits), '[]'::jsonb) from pkg),
    'by_product', (select jsonb_object_agg(pr.product, jsonb_build_object(
        'topups', (select jsonb_build_object('count', count(*), 'credits', coalesce(sum(credits), 0),
                                             'subtotal', coalesce(sum(subtotal), 0), 'total', coalesce(sum(total), 0))
                     from t where t.product = pr.product),
        'consumed', (select jsonb_build_object('credits', coalesce(sum(quantity), 0), 'value', coalesce(round(sum(quantity * unit_price), 2), 0),
                                               'free', coalesce(sum(quantity) filter (where free), 0))
                       from used where used.product = pr.product),
        'expired', (select jsonb_build_object('credits', coalesce(-sum(amount), 0)) from exp where exp.product = pr.product)))
      from prods pr),
    'top_customers', (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', user_id, 'name', name, 'count', cnt, 'total', total) order by total desc), '[]'::jsonb) from topc)
  ) into v;
  return v;
end $$;

create or replace function public.admin_outstanding_credits()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  select jsonb_build_object(
    'as_of', now(),
    'paid_credits', coalesce(sum(remaining) filter (where unit_price > 0), 0),
    'paid_value', coalesce(round(sum(remaining * unit_price) filter (where unit_price > 0), 2), 0),
    'free_credits', coalesce(sum(remaining) filter (where unit_price = 0), 0),
    'customers', count(distinct user_id),
    'by_product', jsonb_build_object(
      'abutment', jsonb_build_object(
        'paid_credits', coalesce(sum(remaining) filter (where unit_price > 0 and product = 'abutment'), 0),
        'paid_value', coalesce(round(sum(remaining * unit_price) filter (where unit_price > 0 and product = 'abutment'), 2), 0),
        'free_credits', coalesce(sum(remaining) filter (where unit_price = 0 and product = 'abutment'), 0)),
      'crown_set', jsonb_build_object(
        'paid_credits', coalesce(sum(remaining) filter (where unit_price > 0 and product = 'crown_set'), 0),
        'paid_value', coalesce(round(sum(remaining * unit_price) filter (where unit_price > 0 and product = 'crown_set'), 2), 0),
        'free_credits', coalesce(sum(remaining) filter (where unit_price = 0 and product = 'crown_set'), 0)))
  ) into v
  from public.credit_lots
  where remaining > 0 and expires_at > now();
  return v;
end $$;

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
                          where h.type = 'expire' and public._is_free_source(l.source) and h.created_at >= v_start and h.created_at < v_end), 0),
    'by_product', (select jsonb_object_agg(p, jsonb_build_object(
        'granted', coalesce((select sum(quantity) from public.credit_lots
                              where product = p and public._is_free_source(source) and created_at >= v_start and created_at < v_end), 0),
        'used', coalesce((select sum(u.quantity) from public.credit_lot_usage u join public.credit_lots l on l.id = u.lot_id
                           where l.product = p and public._is_free_source(l.source) and u.restored_at is null and u.created_at >= v_start and u.created_at < v_end), 0),
        'expired', coalesce((select -sum(h.amount) from public.credit_history h join public.credit_lots l on l.id = h.lot_id
                              where l.product = p and h.type = 'expire' and public._is_free_source(l.source) and h.created_at >= v_start and h.created_at < v_end), 0)))
      from unnest(array['abutment', 'crown_set']) p)
  );
end $$;

-- CSV: 종류 칸 추가 (반환 모양이 바뀌어서 지우고 다시 만들어요)
drop function if exists public.admin_topups_export(integer, integer);
create or replace function public.admin_topups_export(p_year integer, p_month integer)
returns table (request_id text, approved_at text, customer_email text, clinic_name text, tax_id text, product text,
               package_credits integer, credits integer, unit_price numeric, subtotal numeric, vat numeric, total numeric)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  return query
    select t.id,
           to_char(t.reviewed_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'),
           coalesce(u.email::text, ''),
           coalesce(p.clinic_name, ''),
           coalesce(p.tax_id, ''),
           coalesce(t.product, 'abutment'),
           coalesce(pk.credits, t.credits),
           t.credits, t.unit_price, t.subtotal, t.vat_amount, t.total
      from public.topup_requests t
      left join public.profiles p on p.id = t.user_id
      left join auth.users u on u.id = t.user_id
      left join public.credit_packages pk on pk.id = t.package_id
     where t.status = 'approved'
       and t.reviewed_at >= public._bkk_month_start(p_year, p_month)
       and t.reviewed_at < public._bkk_month_end(p_year, p_month)
     order by t.reviewed_at, t.id;
end $$;
revoke all on function public.admin_topups_export(integer, integer) from public, anon;
grant execute on function public.admin_topups_export(integer, integer) to authenticated;


-- ================================================================
-- 12) 커미션 · 영업 — 항목에 product (per_credit 은 종류 상관없이 크레딧 수 그대로)
-- ================================================================
create or replace function public._commission_items(p_year integer, p_month integer, p_rep uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(i order by (i ->> 'date')::timestamptz, i ->> 'topup_id'), '[]'::jsonb)
    from (
      select jsonb_build_object('kind', 'payment', 'topup_id', c.topup_id, 'customer', c.customer, 'date', c.approved_at,
               'package_credits', c.package_credits, 'credits', c.credits, 'subtotal', c.subtotal, 'total', c.total,
               'rate_type', c.rate_type, 'rate_value', c.rate_value, 'commission', c.commission,
               'product', coalesce((select t.product from public.topup_requests t where t.id = c.topup_id), 'abutment')) as i
        from public._commission_payment_rows(p_year, p_month, p_rep) c
      union all
      select jsonb_build_object('kind', 'refund', 'topup_id', r.topup_id, 'refund_id', r.refund_id, 'customer', r.customer, 'date', r.refunded_at,
               'credits', r.credits, 'amount_thb', r.amount_thb, 'subtotal', r.amount_ex_vat,
               'rate_type', r.rate_type, 'rate_value', r.rate_value, 'commission', r.commission,
               'product', coalesce((select t.product from public.topup_requests t where t.id = r.topup_id), 'abutment'))
        from public._commission_refund_rows(p_year, p_month, p_rep) r
    ) s;
$$;
revoke all on function public._commission_items(integer, integer, uuid) from public, anon, authenticated;

create or replace function public.sales_my_payments(p_limit integer default 300)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from public.sales_reps where user_id = auth.uid()) then
    raise exception 'NOT_SALES';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id, 'customer', public._customer_label(t.user_id), 'approved_at', t.reviewed_at,
             'credits', t.credits, 'subtotal', t.subtotal, 'total', t.total, 'product', coalesce(t.product, 'abutment'))
           order by t.reviewed_at desc)
      from (select * from public.topup_requests
             where sales_rep_id = auth.uid() and status = 'approved'
             order by reviewed_at desc limit greatest(1, least(coalesce(p_limit, 300), 1000))) t), '[]'::jsonb);
end $$;
