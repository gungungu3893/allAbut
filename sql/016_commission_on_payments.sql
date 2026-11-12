-- ================================================================
-- allAbut — 016: 영업 커미션 기준을 "배송된 주문" → "수금(충전 입금 승인)" 으로
-- ================================================================
-- 015 를 이미 실행했다고 보고 그 위에 바꿔요 (015 파일은 고치지 않아요). 그대로 다시 쓰는 것:
--   sales 역할 · is_admin() · sales_reps · sales_rep_rates(요율 이력) · profiles.sales_rep_id(고객 담당) · commission_payouts(정산 잠금)
--
-- 1) 실적 = 수금
--    · topup_requests.sales_rep_id: 충전 요청이 승인(approved)되는 순간 트리거가 그 고객의 담당자(켜진 담당자만)를 기록, 없으면 null
--      이미 승인된 예전 충전은 지금 고객 담당자로 한 번 채워요 (null 인 것만)
--    · 커미션 달 = 승인 시각(reviewed_at)의 방콕 달 / 요율 = 승인일(방콕)에 유효한 요율 (effective_from <= 승인일 중 가장 최근)
--    · percent    = 입금 subtotal(VAT 제외) × 값%
--      per_credit = 충전 크레딧 수 × 값 THB   (015 의 'per_tooth' 요율은 'per_credit' 로 이름만 바꿔 이어 써요)
--      소수 2자리 반올림. 무료 크레딧 지급(관리자 지급 · 이벤트)은 topup_requests 가 아니라서 실적이 아니에요
--    · 현금 환불(admin_refund_cash): 어느 묶음(→ 충전 요청)에서 나온 환불인지 refund_cash_lots 에 나눠 기록 →
--      그 충전의 담당자에게 환불한 달(방콕)에 마이너스 커미션 (원래 요율 = 그 충전 승인일의 요율)
--        percent → 환불액(VAT 제외) × 원래 % / per_credit → 환불된 크레딧 수 × 원래 THB
--      추적이 안 되는 환불(016 전에 한 환불 · 묶음에 충전 기록이 없는 것)은 마이너스 없이 관리자 화면에 "확인 필요"
--    · admin_set_topup_rep (manager 이상): 정산 잠긴 달이면 COMMISSION_LOCKED, 작업 기록 'topup_rep'
--    · admin_set_customer_rep: 앞으로의 입금에만 적용 (p_apply_open_orders 인자는 예전 호출 호환용, 무시)
-- 2) 주문 기준 제거: cnc_orders.sales_rep_id · cnc_orders.shipped_at(커미션 전용이었어요) · 주문 트리거 ·
--    admin_set_order_rep · sales_my_orders · 배송일 기준 계산 함수
--    (create_cnc_order 는 015 에서도 바꾸지 않았어요 — 담당자 복사는 주문 트리거가 했고, 그 트리거를 지워요. 012 의 최신 정의 그대로)
-- 3) 정산 스냅샷: commission_payouts.basis = 'payment'(이번부터) / 'order'(015 때 만든 정산 — 숫자 그대로 보여줘요)
--
-- 실행 순서: 015 다음. 두 번 실행해도 안전.
-- 다시 정의하는 기존 함수 (전부 가장 최신 정의 + 필요한 부분만):
--   admin_refund_cash (004 본문 + 005 가 바꿔 끼운 owner 권한 + 묶음별 환불 기록)
--   admin_set_customer_rep · admin_set_rep_rate · admin_mark_commission_paid · _commission_items · _commission_month_json · admin_commission_month (015)
--   → 002 · 004 를 다시 실행하면 005 → 016 도 다시 (admin_refund_cash 가 묶음별 기록이 없는 예전 모양으로 돌아가서)
--   → 015 를 다시 실행하면 016 도 다시 (주문 기준 함수 · 칸이 돌아와서)
-- 충전 승인 함수(admin_approve_topup)는 고치지 않아요 — 담당자 기록은 트리거가 해요.


-- ================================================================
-- 1) 주문 기준 제거
-- ================================================================
drop trigger if exists trg_orders_sales_rep on public.cnc_orders;
drop function if exists public._trg_orders_sales_rep();
drop function if exists public.admin_set_order_rep(text, uuid, text);
drop function if exists public.sales_my_orders(integer);
drop function if exists public._order_commission_locked(text, timestamptz, uuid, uuid);
drop function if exists public._commission_rows(integer, integer, uuid);
drop function if exists public._safe_ts(text);
alter table public.cnc_orders drop column if exists sales_rep_id;   -- FK · 인덱스도 같이 지워져요
alter table public.cnc_orders drop column if exists shipped_at;


-- ================================================================
-- 2) 충전 요청의 담당 영업
-- ================================================================
alter table public.topup_requests add column if not exists sales_rep_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'topup_requests_sales_rep_fk') then
    alter table public.topup_requests add constraint topup_requests_sales_rep_fk
      foreign key (sales_rep_id) references public.sales_reps(user_id) on delete set null;
  end if;
end $$;
create index if not exists idx_topup_requests_rep on public.topup_requests (sales_rep_id, reviewed_at);
create index if not exists idx_topup_requests_reviewed on public.topup_requests (reviewed_at) where status = 'approved';

-- 고객의 (켜진) 담당자
create or replace function public._customer_rep(p_user uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select p.sales_rep_id
    from public.profiles p join public.sales_reps r on r.user_id = p.sales_rep_id and r.active
   where p.id = p_user;
$$;

-- 승인되는 순간 담당자 기록 · 직접 수정은 되돌림 (관리자 함수만 set_config('allabut.rep_ok','1', true) 로 허용 — 015 의 _rep_change_ok)
create or replace function public._trg_topup_sales_rep()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public._rep_change_ok() then return new; end if;
  if tg_op = 'INSERT' then
    new.sales_rep_id := case when new.status = 'approved' then public._customer_rep(new.user_id) else null end;
    return new;
  end if;
  if new.sales_rep_id is distinct from old.sales_rep_id then
    new.sales_rep_id := old.sales_rep_id;
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.sales_rep_id := public._customer_rep(new.user_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_topup_sales_rep on public.topup_requests;
create trigger trg_topup_sales_rep before insert or update on public.topup_requests
  for each row execute function public._trg_topup_sales_rep();

-- 이미 승인된 예전 충전: 지금 고객 담당자로 한 번 채우기 (null 인 것만)
select set_config('allabut.rep_ok', '1', false);
update public.topup_requests t
   set sales_rep_id = public._customer_rep(t.user_id)
 where t.status = 'approved' and t.sales_rep_id is null and public._customer_rep(t.user_id) is not null;
select set_config('allabut.rep_ok', '0', false);


-- ================================================================
-- 3) 요율 방식: 'per_tooth' → 'per_credit' (값 · 시작일 · 이력은 그대로)
-- ================================================================
alter table public.sales_rep_rates drop constraint if exists sales_rep_rates_type_check;
update public.sales_rep_rates set type = 'per_credit' where type = 'per_tooth';
alter table public.sales_rep_rates add constraint sales_rep_rates_type_check check (type in ('percent', 'per_credit'));

-- 요율 추가 (owner) — 015 정의 + 방식 이름만 (예전 'per_tooth' 로 불러도 'per_credit' 로 받아요)
create or replace function public.admin_set_rep_rate(p_rep uuid, p_type text, p_value numeric, p_effective_from date default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_from date := coalesce(p_effective_from, (now() at time zone 'Asia/Bangkok')::date);
  v_type text := case when p_type = 'per_tooth' then 'per_credit' else p_type end;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  if not exists (select 1 from public.sales_reps where user_id = p_rep) then raise exception 'REP_NOT_FOUND'; end if;
  if v_type is null or v_type not in ('percent', 'per_credit') then raise exception 'INVALID_RATE_TYPE'; end if;
  if p_value is null or p_value < 0 or (v_type = 'percent' and p_value > 100) or p_value > 1000000 then
    raise exception 'INVALID_RATE_VALUE';
  end if;
  insert into public.sales_rep_rates (rep_id, type, value, effective_from, created_by)
  values (p_rep, v_type, round(p_value, 2), v_from, auth.uid())
  returning id into v_id;
  perform public._audit('commission_rate', 'member', p_rep::text,
    jsonb_build_object('name', public._admin_name(p_rep), 'type', v_type, 'value', round(p_value, 2), 'effective_from', v_from));
  return v_id;
end $$;

-- 그 날(방콕)에 유효한 요율
create or replace function public._rep_rate_at(p_rep uuid, p_day date)
returns table (type text, value numeric)
language sql stable security definer set search_path = public as $$
  select r.type, r.value from public.sales_rep_rates r
   where r.rep_id = p_rep and r.effective_from <= p_day
   order by r.effective_from desc, r.created_at desc, r.id desc limit 1;
$$;


-- ================================================================
-- 4) 현금 환불 → 어느 충전에서 나왔는지 (마이너스 커미션용)
-- ================================================================
create table if not exists public.refund_cash_lots (
  id          bigint generated by default as identity primary key,
  history_id  uuid not null references public.credit_history(id) on delete cascade,
  user_id     uuid not null,
  lot_id      uuid,
  topup_id    text,
  credits     integer not null default 0,
  amount_thb  numeric(12,2) not null default 0,   -- 이 묶음 몫 환불액 (VAT 포함, 실제 송금액을 묶음 환불 가능액 비율로 나눔)
  created_at  timestamptz not null default now()
);
create index if not exists idx_refund_cash_lots_topup on public.refund_cash_lots (topup_id);
create index if not exists idx_refund_cash_lots_created on public.refund_cash_lots (created_at);
create index if not exists idx_refund_cash_lots_history on public.refund_cash_lots (history_id);
alter table public.refund_cash_lots enable row level security;
drop policy if exists "refund_cash_lots: owner read" on public.refund_cash_lots;
create policy "refund_cash_lots: owner read" on public.refund_cash_lots
  for select to authenticated using (public.has_admin_role('owner'));
revoke insert, update, delete on public.refund_cash_lots from anon, authenticated;
revoke all on public.refund_cash_lots from anon;

-- admin_refund_cash — 004 정의 + 005 가 바꿔 끼운 권한(owner) 그대로 + 묶음별 환불 기록(refund_cash_lots)
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
    end if;
  end loop;
  if v_count <> array_length(p_lot_ids, 1) then raise exception 'LOT_NOT_REFUNDABLE'; end if;
  if p_amount > v_max + 0.005 then raise exception 'AMOUNT_TOO_HIGH'; end if;

  update public.credit_lots set remaining = 0 where user_id = p_user and id = any (p_lot_ids);
  insert into public.credit_history (user_id, amount, type, description, amount_thb)
  values (p_user, -v_credits, 'refund_cash',
          'Cash refund THB ' || to_char(p_amount, 'FM999,999,990.00') || coalesce(' · ' || nullif(trim(p_note), ''), ''),
          round(p_amount, 2))
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
-- 5) 정산 스냅샷 종류
-- ================================================================
alter table public.commission_payouts add column if not exists basis text;
update public.commission_payouts set basis = 'order' where basis is null;   -- 015 때 만든 정산 (주문 기준)
alter table public.commission_payouts alter column basis set default 'payment';
alter table public.commission_payouts alter column basis set not null;


-- ================================================================
-- 6) 커미션 계산 (방콕 달)
-- ================================================================
-- 고객 이름 (치과명 → 본명 → 닉네임)
create or replace function public._customer_label(p_user uuid)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(p.clinic_name), ''), nullif(trim(p.full_name), ''), nullif(trim(p.nickname), ''), '')
    from public.profiles p where p.id = p_user;
$$;

-- 입금 (그 달에 승인된 충전, 담당자 있는 것)
create or replace function public._commission_payment_rows(p_year integer, p_month integer, p_rep uuid default null)
returns table (topup_id text, rep_id uuid, user_id uuid, customer text, approved_at timestamptz, package_credits integer,
               credits integer, subtotal numeric, total numeric, rate_type text, rate_value numeric, commission numeric)
language sql stable security definer set search_path = public as $$
  select t.id, t.sales_rep_id, t.user_id, public._customer_label(t.user_id), t.reviewed_at,
         coalesce((select c.credits from public.credit_packages c where c.id = t.package_id), t.credits),
         t.credits, t.subtotal, t.total, rt.type, rt.value,
         round(case rt.type when 'percent' then t.subtotal * rt.value / 100
                            when 'per_credit' then t.credits * rt.value
                            else 0 end, 2)
    from public.topup_requests t
    left join lateral public._rep_rate_at(t.sales_rep_id, (t.reviewed_at at time zone 'Asia/Bangkok')::date) rt on true
   where t.status = 'approved' and t.sales_rep_id is not null
     and (p_rep is null or t.sales_rep_id = p_rep)
     and t.reviewed_at >= public._bkk_month_start(p_year, p_month)
     and t.reviewed_at <  public._bkk_month_end(p_year, p_month)
   order by t.reviewed_at, t.id;
$$;

-- 환불 차감 (그 달에 한 현금 환불 중 담당자 있는 충전에서 나온 것) — 커미션은 마이너스
create or replace function public._commission_refund_rows(p_year integer, p_month integer, p_rep uuid default null)
returns table (refund_id bigint, topup_id text, rep_id uuid, user_id uuid, customer text, refunded_at timestamptz, credits integer,
               amount_thb numeric, amount_ex_vat numeric, rate_type text, rate_value numeric, commission numeric)
language sql stable security definer set search_path = public as $$
  with x as (
    select r.id, r.topup_id, t.sales_rep_id, r.user_id, r.created_at, r.credits, r.amount_thb,
           round(case when coalesce(t.total, 0) > 0 then r.amount_thb * t.subtotal / t.total else r.amount_thb end, 2) as ex_vat,
           rt.type, rt.value
      from public.refund_cash_lots r
      join public.topup_requests t on t.id = r.topup_id
      left join lateral public._rep_rate_at(t.sales_rep_id, (t.reviewed_at at time zone 'Asia/Bangkok')::date) rt on true
     where t.sales_rep_id is not null
       and (p_rep is null or t.sales_rep_id = p_rep)
       and r.created_at >= public._bkk_month_start(p_year, p_month)
       and r.created_at <  public._bkk_month_end(p_year, p_month)
  )
  select x.id, x.topup_id, x.sales_rep_id, x.user_id, public._customer_label(x.user_id), x.created_at, x.credits, x.amount_thb, x.ex_vat,
         x.type, x.value,
         -round(case x.type when 'percent' then x.ex_vat * x.value / 100
                            when 'per_credit' then x.credits * x.value
                            else 0 end, 2)
    from x
   order by x.created_at, x.id;
$$;

-- 추적이 안 되는 현금 환불 (그 달) → 마이너스 없이 "확인 필요"
create or replace function public._commission_unresolved_refunds(p_year integer, p_month integer)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'history_id', h.id, 'user_id', h.user_id, 'customer', public._customer_label(h.user_id),
           'refunded_at', h.created_at, 'credits', abs(h.amount), 'amount_thb', h.amount_thb,
           'reason', case when not exists (select 1 from public.refund_cash_lots r where r.history_id = h.id) then 'no_breakdown'
                          else 'no_topup' end)
         order by h.created_at), '[]'::jsonb)
    from public.credit_history h
   where h.type = 'refund_cash'
     and h.created_at >= public._bkk_month_start(p_year, p_month)
     and h.created_at <  public._bkk_month_end(p_year, p_month)
     and (not exists (select 1 from public.refund_cash_lots r where r.history_id = h.id)
          or exists (select 1 from public.refund_cash_lots r where r.history_id = h.id
                      and (r.topup_id is null or not exists (select 1 from public.topup_requests t where t.id = r.topup_id))));
$$;

-- 건별 상세 (입금 + 환불 차감, 시각 순) — 스냅샷과 화면이 같은 모양
create or replace function public._commission_items(p_year integer, p_month integer, p_rep uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(i order by (i ->> 'date')::timestamptz, i ->> 'topup_id'), '[]'::jsonb)
    from (
      select jsonb_build_object('kind', 'payment', 'topup_id', c.topup_id, 'customer', c.customer, 'date', c.approved_at,
               'package_credits', c.package_credits, 'credits', c.credits, 'subtotal', c.subtotal, 'total', c.total,
               'rate_type', c.rate_type, 'rate_value', c.rate_value, 'commission', c.commission) as i
        from public._commission_payment_rows(p_year, p_month, p_rep) c
      union all
      select jsonb_build_object('kind', 'refund', 'topup_id', r.topup_id, 'refund_id', r.refund_id, 'customer', r.customer, 'date', r.refunded_at,
               'credits', r.credits, 'amount_thb', r.amount_thb, 'subtotal', r.amount_ex_vat,
               'rate_type', r.rate_type, 'rate_value', r.rate_value, 'commission', r.commission)
        from public._commission_refund_rows(p_year, p_month, p_rep) r
    ) s;
$$;

-- 한 달 결과 (p_only_rep 가 있으면 그 사람만): 지급 완료된 사람은 스냅샷 그대로, 나머지는 지금 계산 (015 와 같은 틀, 숫자만 입금 기준)
create or replace function public._commission_month_json(p_year integer, p_month integer, p_only_rep uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_reps jsonb := '[]'::jsonb;
  r record;
  v_items jsonb;
  v_pay record;
  v_basis text;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_from timestamptz := public._bkk_month_start(p_year, p_month);
  v_to timestamptz := public._bkk_month_end(p_year, p_month);
begin
  for r in
    select s.user_id, s.active and exists (select 1 from public.admins a where a.user_id = s.user_id) as active
      from public.sales_reps s
     where (p_only_rep is not null and s.user_id = p_only_rep)
        or (p_only_rep is null and (
              s.active
           or exists (select 1 from public.topup_requests t
                       where t.sales_rep_id = s.user_id and t.status = 'approved' and t.reviewed_at >= v_from and t.reviewed_at < v_to)
           or exists (select 1 from public.refund_cash_lots x join public.topup_requests t on t.id = x.topup_id
                       where t.sales_rep_id = s.user_id and x.created_at >= v_from and x.created_at < v_to)
           or exists (select 1 from public.commission_payouts c
                       where c.rep_id = s.user_id and c.year = p_year and c.month = p_month)))
     order by public._admin_name(s.user_id)
  loop
    select * into v_pay from public.commission_payouts c
     where c.rep_id = r.user_id and c.year = p_year and c.month = p_month;
    if found then
      v_items := v_pay.orders;
      v_basis := v_pay.basis;
    else
      v_items := public._commission_items(p_year, p_month, r.user_id);
      v_basis := 'payment';
    end if;
    v_reps := v_reps || jsonb_build_array(jsonb_build_object(
      'rep_id', r.user_id, 'name', public._admin_name(r.user_id), 'active', r.active, 'basis', v_basis,
      'payments', (select count(*) from jsonb_array_elements(v_items) i where i ->> 'kind' = 'payment'),
      'amount', coalesce((select sum((i ->> 'subtotal')::numeric) from jsonb_array_elements(v_items) i where i ->> 'kind' = 'payment'), 0),
      'credits', coalesce((select sum((i ->> 'credits')::int) from jsonb_array_elements(v_items) i where i ->> 'kind' = 'payment'), 0),
      'refunds', (select count(*) from jsonb_array_elements(v_items) i where i ->> 'kind' = 'refund'),
      'refund_deduction', coalesce((select -sum((i ->> 'commission')::numeric) from jsonb_array_elements(v_items) i where i ->> 'kind' = 'refund'), 0),
      'commission', case when v_pay.id is not null then v_pay.total
                         else coalesce((select sum((i ->> 'commission')::numeric) from jsonb_array_elements(v_items) i), 0) end,
      'rate', (select jsonb_build_object('type', x.type, 'value', x.value, 'effective_from', x.effective_from)
                 from public.sales_rep_rates x
                where x.rep_id = r.user_id and x.effective_from <= least(v_today, (v_to at time zone 'Asia/Bangkok')::date - 1)
                order by x.effective_from desc, x.created_at desc, x.id desc limit 1),
      'paid', case when v_pay.id is null then null else jsonb_build_object(
                'paid_at', v_pay.paid_at, 'paid_by_name', case when v_pay.paid_by is null then '' else public._admin_name(v_pay.paid_by) end,
                'note', v_pay.note, 'total', v_pay.total) end,
      'items', v_items));
    v_pay := null;
  end loop;

  return jsonb_build_object(
    'year', p_year, 'month', p_month,
    'month_ended', (make_date(p_year, p_month, 1) + interval '1 month')::date <= v_today,
    'reps', v_reps);
end $$;

-- 관리자 (owner): 직원별 + 담당 미지정 입금 수 + 확인 필요 환불
create or replace function public.admin_commission_month(p_year integer, p_month integer)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  if p_month is null or p_month not between 1 and 12 or p_year is null then raise exception 'INVALID_MONTH'; end if;
  v := public._commission_month_json(p_year, p_month, null);
  return v || jsonb_build_object(
    'unassigned', (
      select count(*) from public.topup_requests t
       where t.status = 'approved' and t.sales_rep_id is null
         and t.reviewed_at >= public._bkk_month_start(p_year, p_month)
         and t.reviewed_at <  public._bkk_month_end(p_year, p_month)),
    'unresolved_refunds', public._commission_unresolved_refunds(p_year, p_month));
end $$;
-- my_commission_month 은 015 정의 그대로 (위 _commission_month_json 을 써서 자동으로 입금 기준)

-- 영업 본인: 내 담당 고객 입금 내역 (환자 · 주문 정보 없음, 슬립 경로도 없음)
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
             'credits', t.credits, 'subtotal', t.subtotal, 'total', t.total)
           order by t.reviewed_at desc)
      from (select * from public.topup_requests
             where sales_rep_id = auth.uid() and status = 'approved'
             order by reviewed_at desc limit greatest(1, least(coalesce(p_limit, 300), 1000))) t), '[]'::jsonb);
end $$;


-- ================================================================
-- 7) 정산 (owner) — 015 정의 + 스냅샷 종류(basis = 'payment')
-- ================================================================
create or replace function public.admin_mark_commission_paid(p_rep uuid, p_year integer, p_month integer, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_items jsonb;
  v_total numeric;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  if p_month is null or p_month not between 1 and 12 or p_year is null then raise exception 'INVALID_MONTH'; end if;
  if not exists (select 1 from public.sales_reps where user_id = p_rep) then raise exception 'REP_NOT_FOUND'; end if;
  if (make_date(p_year, p_month, 1) + interval '1 month')::date > (now() at time zone 'Asia/Bangkok')::date then
    raise exception 'MONTH_NOT_ENDED';
  end if;
  if exists (select 1 from public.commission_payouts where rep_id = p_rep and year = p_year and month = p_month) then
    raise exception 'ALREADY_PAID';
  end if;
  v_items := public._commission_items(p_year, p_month, p_rep);
  v_total := coalesce((select sum((i ->> 'commission')::numeric) from jsonb_array_elements(v_items) i), 0);
  insert into public.commission_payouts (rep_id, year, month, total, orders, paid_at, paid_by, note, basis)
  values (p_rep, p_year, p_month, round(v_total, 2), v_items, now(), auth.uid(), left(trim(coalesce(p_note, '')), 300), 'payment');
  perform public._audit('commission_paid', 'member', p_rep::text, jsonb_build_object(
    'name', public._admin_name(p_rep), 'year', p_year, 'month', p_month, 'total', round(v_total, 2),
    'orders', jsonb_array_length(v_items), 'note', trim(coalesce(p_note, ''))));
  return jsonb_build_object('total', round(v_total, 2), 'items', jsonb_array_length(v_items));
end $$;


-- ================================================================
-- 8) 담당자 지정 (manager 이상)
-- ================================================================
-- 이 충전이 지급 완료로 잠긴 달에 들어 있는지 (승인한 달 · 그 충전의 환불이 있는 달 — 옛 담당 · 새 담당 · 스냅샷 안)
create or replace function public._topup_commission_locked(p_topup text, p_old uuid, p_new uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  with months as (
    select extract(year from t.reviewed_at at time zone 'Asia/Bangkok')::int as y,
           extract(month from t.reviewed_at at time zone 'Asia/Bangkok')::int as m
      from public.topup_requests t where t.id = p_topup and t.reviewed_at is not null
    union
    select extract(year from r.created_at at time zone 'Asia/Bangkok')::int, extract(month from r.created_at at time zone 'Asia/Bangkok')::int
      from public.refund_cash_lots r where r.topup_id = p_topup
  )
  select exists (
    select 1 from public.commission_payouts c join months on c.year = months.y and c.month = months.m
     where c.rep_id = p_old or c.rep_id = p_new
        or c.orders @> jsonb_build_array(jsonb_build_object('topup_id', p_topup)));
$$;

-- 충전(입금) 담당 바꾸기 (p_rep null = 담당 없음). 승인된 충전만, 이미 담당이 있으면 사유 필수
create or replace function public.admin_set_topup_rep(p_topup text, p_rep uuid, p_reason text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_t record;
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  select * into v_t from public.topup_requests where id = p_topup for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_t.status <> 'approved' then raise exception 'NOT_EDITABLE'; end if;
  if p_rep is not null and not exists (select 1 from public.sales_reps where user_id = p_rep and active) then
    raise exception 'REP_NOT_FOUND';
  end if;
  if v_t.sales_rep_id is not distinct from p_rep then return jsonb_build_object('changed', false, 'rep_id', p_rep); end if;
  if v_t.sales_rep_id is not null and coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  if public._topup_commission_locked(p_topup, v_t.sales_rep_id, p_rep) then raise exception 'COMMISSION_LOCKED'; end if;

  perform set_config('allabut.rep_ok', '1', true);
  update public.topup_requests set sales_rep_id = p_rep where id = p_topup;
  perform set_config('allabut.rep_ok', '0', true);

  perform public._audit('topup_rep', 'topup', p_topup, jsonb_build_object(
    'from', v_t.sales_rep_id, 'to', p_rep, 'customer', public._customer_label(v_t.user_id),
    'credits', v_t.credits, 'subtotal', v_t.subtotal, 'reason', trim(coalesce(p_reason, '')),
    'from_name', case when v_t.sales_rep_id is null then '' else public._admin_name(v_t.sales_rep_id) end,
    'to_name', case when p_rep is null then '' else public._admin_name(p_rep) end));
  return jsonb_build_object('changed', true, 'rep_id', p_rep, 'old_rep', v_t.sales_rep_id);
end $$;

-- 고객 담당 바꾸기 — 015 정의에서 "배송 전 주문도 같이" 부분만 뺐어요 (앞으로의 입금에만 적용).
-- 세 번째 인자는 예전 화면 호환용으로 남겨 두고 무시해요
create or replace function public.admin_set_customer_rep(p_user uuid, p_rep uuid, p_apply_open_orders boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_old uuid;
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  select sales_rep_id into v_old from public.profiles where id = p_user for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_rep is not null and not exists (select 1 from public.sales_reps where user_id = p_rep and active) then
    raise exception 'REP_NOT_FOUND';
  end if;
  if v_old is not distinct from p_rep then return jsonb_build_object('changed', false, 'rep_id', p_rep); end if;

  perform set_config('allabut.rep_ok', '1', true);
  update public.profiles set sales_rep_id = p_rep where id = p_user;
  perform set_config('allabut.rep_ok', '0', true);

  perform public._audit('customer_rep', 'customer', p_user::text, jsonb_build_object(
    'from', v_old, 'to', p_rep, 'customer', public._customer_label(p_user),
    'from_name', case when v_old is null then '' else public._admin_name(v_old) end,
    'to_name', case when p_rep is null then '' else public._admin_name(p_rep) end));
  return jsonb_build_object('changed', true, 'rep_id', p_rep);
end $$;


-- ================================================================
-- 9) 권한
-- ================================================================
revoke all on function public._customer_rep(uuid) from public, anon, authenticated;
revoke all on function public._customer_label(uuid) from public, anon, authenticated;
revoke all on function public._rep_rate_at(uuid, date) from public, anon, authenticated;
revoke all on function public._commission_payment_rows(integer, integer, uuid) from public, anon, authenticated;
revoke all on function public._commission_refund_rows(integer, integer, uuid) from public, anon, authenticated;
revoke all on function public._commission_unresolved_refunds(integer, integer) from public, anon, authenticated;
revoke all on function public._commission_items(integer, integer, uuid) from public, anon, authenticated;
revoke all on function public._commission_month_json(integer, integer, uuid) from public, anon, authenticated;
revoke all on function public._topup_commission_locked(text, uuid, uuid) from public, anon, authenticated;

revoke all on function public.admin_refund_cash(uuid, uuid[], numeric, text) from public, anon;
revoke all on function public.admin_set_rep_rate(uuid, text, numeric, date) from public, anon;
revoke all on function public.admin_commission_month(integer, integer) from public, anon;
revoke all on function public.sales_my_payments(integer) from public, anon;
revoke all on function public.admin_mark_commission_paid(uuid, integer, integer, text) from public, anon;
revoke all on function public.admin_set_topup_rep(text, uuid, text) from public, anon;
revoke all on function public.admin_set_customer_rep(uuid, uuid, boolean) from public, anon;

grant execute on function public.admin_refund_cash(uuid, uuid[], numeric, text) to authenticated;
grant execute on function public.admin_set_rep_rate(uuid, text, numeric, date) to authenticated;
grant execute on function public.admin_commission_month(integer, integer) to authenticated;
grant execute on function public.sales_my_payments(integer) to authenticated;
grant execute on function public.admin_mark_commission_paid(uuid, integer, integer, text) to authenticated;
grant execute on function public.admin_set_topup_rep(text, uuid, text) to authenticated;
grant execute on function public.admin_set_customer_rep(uuid, uuid, boolean) to authenticated;
