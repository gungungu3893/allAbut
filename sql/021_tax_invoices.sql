-- ================================================================
-- allAbut — 021: 태국 세금계산서(ใบกำกับภาษี) · 해외 고객 영수증(Receipt) · 크레딧 노트 · 고객 국가
-- ================================================================
-- ① 고객 국가: profiles.country (ISO 2글자, 기본 'TH') + reg_country (등록 정보와 함께 잠김 — 변경은 등록 정보 변경 요청 → manager 승인)
--    정규화 · 검사가 국가에 따라 (JS cnc/cnc-identity.js 와 똑같이):
--      TH  : 전화 = 숫자만 + 66… → 0…, 형식 숫자 9~15자리 / Tax ID = 숫자 13자리 + 체크섬, 필수
--      그 외: 전화 = '+' + 숫자 (00 으로 시작하면 00 을 뺌), 입력이 + 또는 00 으로 시작해야 하고 숫자 8~15자리 /
--            Tax/VAT ID = 대문자 · 공백 없앰, 영문 · 숫자 · 하이픈 5~30자, 선택 (값이 있을 때만 중복 검사)
--    _norm_phone(p, country) · _valid_phone(p, country) · _norm_tax_id(p, country) · _valid_tax_id(p, country) (예전 1인자 함수 = 태국 그대로)
--    다시 정의: _trg_profile_identity · _profile_complete (010 정의 + 국가) · check_signup_available(…, p_country) · request_clinic_change(…, p_country) · admin_review_clinic_change
-- ② 고객 문서 정보: profiles.doc_name (법인명/이름, 비우면 등록 치과명) · doc_address (비우면 등록 주소) · doc_branch ('' = สำนักงานใหญ่, 5자리 = สาขาที่)
-- ③ 판매자 정보 (company_settings, owner): vat_registered · seller_name_th/en · seller_address_th/en · seller_branch · mail_cycle('each' | 'monthly')
--    Tax ID 는 기존 company_settings.tax_id (13자리 + 체크섬)
-- ④ 해외 고객 VAT (payment_settings.overseas_vat_mode 'charge'(기본, 같은 VAT %) | 'zero') → create_topup_request (018 정의 + 고객 국가)
--    topup_requests.vat_rate = 그 요청에 실제로 쓴 VAT % (예전 요청은 vat_amount/subtotal 로 채움), 환불 계산 _credit_refund_quote 도 그 요청의 VAT 로 (018 정의 + 묶음별 VAT)
-- ⑤ tax_invoices (문서) · tax_doc_counters (번호): doc_type 'invoice' | 'credit_note' | 'receipt' | 'receipt_refund'
--    번호 = IV / CN / RC / RF + YYMM + '-' + 4자리, 종류 · 달마다 0001 부터 빠짐없이 (카운터 줄 잠금 — 동시에 승인해도 안 겹치고 안 건너뜀, 실패하면 같이 취소)
--    발행된 문서 내용은 수정 · 삭제 불가 (트리거), 우편 칸(mail_status · mailed_at · mail_tracking · mailed_by)만 함수로
--    RLS: 고객 = 자기 것 읽기, manager 이상 = 전부 읽기, 쓰기는 함수만
-- ⑥ 자동 발행: 충전 요청이 승인되는 순간 (topup_requests 트리거) — 승인 시점의 reg_country 가 TH 면 세금계산서(mail 'pending'), 그 외 영수증(mail 'not_required')
--    금액은 topup_requests 의 subtotal · vat_amount · total 그대로. 설정이 안 되어 있으면 발행 안 함 → 관리자 "발행" (admin_issue_tax_doc)
--    현금 환불 (refund_cash_lots 트리거 — admin_refund_cash 는 그대로): 원래 문서가 세금계산서면 크레딧 노트, 영수증이면 환불 영수증
-- ⑦ 함수: get_my_vat_rate() · admin_issue_tax_doc(topup) · admin_topups_without_docs() (manager) · admin_mark_invoices_mailed(ids, date, tracking) (manager, 작업 기록 'invoices_mailed') ·
--         admin_tax_report(y, m) (owner — 매출 세금 보고서 + 해외 매출)
--
-- 실행 순서: 020 다음. 두 번 실행해도 안전. 기존 SQL 파일은 고치지 않아요.
-- ⚠️ 이 파일 다음에 010 을 다시 실행하면 021 도 다시 (국가를 모르는 예전 identity 트리거 · 필수 정보 판단 · 변경 요청 함수로 돌아가서),
--    018 을 다시 실행하면 021 도 다시 (create_topup_request · _credit_refund_quote 가 해외 VAT 를 모르는 모양으로)
-- 예전 invoices 표(주문 기준, 코드에서 안 씀)는 그대로 두고, 고객이 직접 넣을 수 있던 insert 정책만 지워요.


-- ================================================================
-- 0) 예전 invoices 표: 고객이 직접 넣는 정책 지우기 (쓰지 않는 표 — 가짜 문서를 막아요)
-- ================================================================
drop policy if exists "invoices: insert own" on public.invoices;


-- ================================================================
-- 1) 국가 · 문서 정보 칸
-- ================================================================
alter table public.profiles
  add column if not exists country     text not null default 'TH',
  add column if not exists reg_country text,
  add column if not exists doc_name    text not null default '',
  add column if not exists doc_address text not null default '',
  add column if not exists doc_branch  text not null default '';
alter table public.profiles drop constraint if exists profiles_country_check;
alter table public.profiles add constraint profiles_country_check check (country ~ '^[A-Z]{2}$');
alter table public.profiles drop constraint if exists profiles_doc_branch_check;
alter table public.profiles add constraint profiles_doc_branch_check check (doc_branch ~ '^([0-9]{5})?$');

alter table public.clinic_change_requests add column if not exists country text;

-- 이미 잠긴(등록된) 계정은 태국으로
update public.profiles set reg_country = 'TH' where reg_country is null and clinic_locked_at is not null;


-- ================================================================
-- 2) 국가별 정규화 · 검사 (JS cnc/cnc-identity.js 와 똑같이 — 한쪽을 바꾸면 다른 쪽도)
-- ================================================================
create or replace function public._norm_country(p text)
returns text language sql immutable as $$
  select case when upper(trim(coalesce(p, ''))) ~ '^[A-Z]{2}$' then upper(trim(p)) else 'TH' end;
$$;

create or replace function public._norm_phone(p text, p_country text)
returns text language sql immutable as $$
  select case
    when public._norm_country(p_country) = 'TH' then public._norm_phone(p)
    else case when d = '' then '' else '+' || case when trim(coalesce(p, '')) like '00%' then substr(d, 3) else d end end
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

create or replace function public._valid_phone(p text, p_country text)
returns boolean language sql immutable as $$
  select case
    when public._norm_country(p_country) = 'TH' then public._valid_phone(p)
    else (trim(coalesce(p, '')) like '+%' or trim(coalesce(p, '')) like '00%')
         and public._norm_phone(p, p_country) ~ '^\+[0-9]{8,15}$'
  end;
$$;

create or replace function public._norm_tax_id(p text, p_country text)
returns text language sql immutable as $$
  select case
    when public._norm_country(p_country) = 'TH' then public._norm_tax_id(p)
    else upper(regexp_replace(coalesce(p, ''), '\s+', '', 'g'))
  end;
$$;

create or replace function public._valid_tax_id(p text, p_country text)
returns boolean language sql immutable as $$
  select case
    when public._norm_country(p_country) = 'TH' then public._valid_tax_id(p)
    else public._norm_tax_id(p, p_country) ~ '^[A-Z0-9-]{5,30}$'
  end;
$$;


-- ================================================================
-- 3) profiles 트리거
-- ================================================================
-- 3-1) 국가 잠금 (trg_profile_clinic_lock 다음, trg_profile_identity 전에 실행 — 트리거는 이름 순서)
--      등록 정보가 잠기는 순간 reg_country = country, 그 뒤에는 country · reg_country 모두 고객이 못 바꿔요 (관리자 승인 함수만)
create or replace function public._trg_profile_country()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_admin boolean := coalesce(current_setting('allabut.reg_change', true), '') = '1';
begin
  new.country := public._norm_country(new.country);
  new.doc_name := left(trim(coalesce(new.doc_name, '')), 200);
  new.doc_address := left(trim(coalesce(new.doc_address, '')), 500);
  new.doc_branch := regexp_replace(coalesce(new.doc_branch, ''), '\s+', '', 'g');
  if new.doc_branch !~ '^([0-9]{5})?$' then raise exception 'BRANCH_INVALID'; end if;
  if new.doc_branch = '00000' then new.doc_branch := ''; end if;   -- 00000 = 본점
  if v_admin then
    new.reg_country := case when new.reg_country is null then null else public._norm_country(new.reg_country) end;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.reg_country is not null then
    new.country := old.country;
    new.reg_country := old.reg_country;
  elsif new.clinic_locked_at is not null then
    new.reg_country := new.country;
  else
    new.reg_country := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_profile_country on public.profiles;
create trigger trg_profile_country before insert or update on public.profiles
  for each row execute function public._trg_profile_country();

-- 3-2) identity: 010 정의 + 국가 (전화 · Tax ID 정규화 · 형식 · 중복이 국가에 따라)
create or replace function public._trg_profile_identity()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean := coalesce(current_setting('allabut.reg_change', true), '') = '1';
  v_email text;
  v_c text := public._norm_country(new.country);
  v_old_c text := case when tg_op = 'UPDATE' then public._norm_country(old.country) else v_c end;
begin
  -- 정규화
  new.full_name := nullif(trim(regexp_replace(coalesce(new.full_name, ''), '\s+', ' ', 'g')), '');
  new.tax_id := public._norm_tax_id(new.tax_id, v_c);

  -- 잠금: 본명 · (올바른) Tax ID 는 처음 채워지면 고객이 못 바꿔요 (관리자 승인 함수만)
  if tg_op = 'UPDATE' and not v_admin then
    if old.full_name is not null and old.full_name <> '' then new.full_name := old.full_name; end if;
    if public._valid_tax_id(old.tax_id, v_old_c) then new.tax_id := old.tax_id; end if;
  end if;

  new.phone_norm := public._norm_phone(new.phone, v_c);

  -- 형식 · 중복 (바뀐 값만 검사 → 예전 데이터가 있어도 다른 칸 저장은 돼요). 해외 Tax ID 는 선택 — 값이 있을 때만
  if new.tax_id <> '' and (tg_op = 'INSERT' or new.tax_id is distinct from coalesce(old.tax_id, '') or v_c is distinct from v_old_c) then
    if not public._valid_tax_id(new.tax_id, v_c) then raise exception 'TAX_ID_INVALID'; end if;
    if public._tax_id_policy() = 'block'
       and exists (select 1 from public.profiles p where p.tax_id = new.tax_id and p.id <> new.id) then
      raise exception 'TAX_ID_TAKEN';
    end if;
  end if;
  if new.phone_norm <> '' and (tg_op = 'INSERT' or new.phone_norm is distinct from old.phone_norm) then
    if not public._valid_phone(new.phone, v_c) then raise exception 'PHONE_INVALID'; end if;
    if exists (select 1 from public.profiles p where p.phone_norm = new.phone_norm and p.id <> new.id) then
      raise exception 'PHONE_TAKEN';
    end if;
  end if;

  -- 일회용 메일은 계정(프로필)을 만들 수 없어요
  if tg_op = 'INSERT' then
    select email into v_email from auth.users where id = new.id;
    if public._email_disposable(v_email) then raise exception 'EMAIL_DISPOSABLE'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_profile_identity on public.profiles;
create trigger trg_profile_identity before insert or update on public.profiles
  for each row execute function public._trg_profile_identity();

-- 3-3) 필수 정보 (010 정의 + 국가): Tax ID 는 태국만 필수, 전화 형식은 국가에 따라
create or replace function public._profile_complete(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_user
       and coalesce(p.full_name, '') <> '' and public._valid_phone(p.phone, p.country)
       and coalesce(trim(p.clinic_name), '') <> '' and coalesce(trim(p.address), '') <> ''
       and (public._norm_country(p.country) <> 'TH' or public._valid_tax_id(p.tax_id, 'TH'))
  );
$$;


-- ================================================================
-- 4) 가입 전 확인 · 등록 정보 변경 요청 (국가 인자 추가 — 예전 모양은 지우고 새로)
-- ================================================================
drop function if exists public.check_signup_available(text, text, text);
create or replace function public.check_signup_available(p_phone text, p_tax_id text, p_email text default null, p_country text default 'TH')
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'phone_taken', public._norm_phone(p_phone, p_country) <> ''
                   and exists (select 1 from public.profiles where phone_norm = public._norm_phone(p_phone, p_country)),
    'tax_id_taken', public._norm_tax_id(p_tax_id, p_country) <> '' and public._tax_id_policy() = 'block'
                    and exists (select 1 from public.profiles where tax_id = public._norm_tax_id(p_tax_id, p_country)),
    'email_blocked', p_email is not null and public._email_disposable(p_email)
  );
$$;
grant execute on function public.check_signup_available(text, text, text, text) to anon, authenticated;

drop function if exists public.request_clinic_change(text, text, text, text, text, text);
create or replace function public.request_clinic_change(
  p_clinic text, p_addr text, p_phone text, p_reason text default '', p_full_name text default null, p_tax_id text default null,
  p_country text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_country text;
  v_tax text;
begin
  if v_uid is null then raise exception 'NOT_LOGGED_IN'; end if;
  select public._norm_country(coalesce(nullif(trim(coalesce(p_country, '')), ''), reg_country, country)) into v_country from public.profiles where id = v_uid;
  v_country := coalesce(v_country, 'TH');
  v_tax := nullif(public._norm_tax_id(p_tax_id, v_country), '');
  if coalesce(trim(p_clinic), '') = '' or coalesce(trim(p_addr), '') = '' or coalesce(trim(p_phone), '') = '' then
    raise exception 'DELIVERY_REQUIRED';
  end if;
  if not public._valid_phone(p_phone, v_country) then raise exception 'PHONE_INVALID'; end if;
  if exists (select 1 from public.profiles where phone_norm = public._norm_phone(p_phone, v_country) and id <> v_uid) then raise exception 'PHONE_TAKEN'; end if;
  if v_tax is not null then
    if not public._valid_tax_id(v_tax, v_country) then raise exception 'TAX_ID_INVALID'; end if;
    if public._tax_id_policy() = 'block' and exists (select 1 from public.profiles where tax_id = v_tax and id <> v_uid) then raise exception 'TAX_ID_TAKEN'; end if;
  end if;
  -- 태국으로 바꾸면 태국 Tax ID(13자리)가 있어야 해요 (지금 값이 태국 형식이 아니면 새로 입력)
  if v_country = 'TH' and v_tax is null
     and not exists (select 1 from public.profiles where id = v_uid and public._valid_tax_id(tax_id, 'TH')) then
    raise exception 'TAX_ID_REQUIRED';
  end if;
  update public.clinic_change_requests set status = 'cancelled' where user_id = v_uid and status = 'pending';
  insert into public.clinic_change_requests (user_id, clinic, addr, phone, reason, full_name, tax_id, country)
  values (v_uid, left(trim(p_clinic), 200), left(trim(p_addr), 500), left(trim(p_phone), 40), left(coalesce(trim(p_reason), ''), 500),
          nullif(left(trim(coalesce(p_full_name, '')), 200), ''), v_tax, v_country)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.request_clinic_change(text, text, text, text, text, text, text) to authenticated;

-- 승인 → 등록 정보 + 프로필 (010 정의 + 국가)
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
           clinic_name = r.clinic, address = r.addr, phone = r.phone,
           full_name = coalesce(r.full_name, full_name), tax_id = coalesce(r.tax_id, tax_id),
           country = coalesce(r.country, country), reg_country = coalesce(r.country, reg_country, country)
     where id = r.user_id;
    perform set_config('allabut.reg_change', '', true);
  end if;
end $$;
grant execute on function public.admin_review_clinic_change(bigint, boolean, text) to authenticated;


-- ================================================================
-- 5) 판매자 정보 · 해외 VAT 설정
-- ================================================================
alter table public.company_settings
  add column if not exists vat_registered    boolean not null default false,
  add column if not exists seller_name_th    text not null default '',
  add column if not exists seller_name_en    text not null default '',
  add column if not exists seller_address_th text not null default '',
  add column if not exists seller_address_en text not null default '',
  add column if not exists seller_branch     text not null default '',
  add column if not exists mail_cycle        text not null default 'monthly';
alter table public.company_settings drop constraint if exists company_settings_seller_branch_check;
alter table public.company_settings add constraint company_settings_seller_branch_check check (seller_branch ~ '^([0-9]{5})?$');
alter table public.company_settings drop constraint if exists company_settings_mail_cycle_check;
alter table public.company_settings add constraint company_settings_mail_cycle_check check (mail_cycle in ('each', 'monthly'));

alter table public.payment_settings add column if not exists overseas_vat_mode text not null default 'charge';
alter table public.payment_settings drop constraint if exists payment_settings_overseas_vat_check;
alter table public.payment_settings add constraint payment_settings_overseas_vat_check check (overseas_vat_mode in ('charge', 'zero'));

-- 세금계산서를 낼 수 있나요? (VAT 등록 + 태국어 이름 · 주소 + 올바른 Tax ID 13자리)
create or replace function public._tax_invoice_ready()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select vat_registered and trim(seller_name_th) <> '' and trim(seller_address_th) <> '' and public._valid_tax_id(tax_id)
                     from public.company_settings where id = 1), false);
$$;
-- 영수증을 낼 수 있나요? (영어 이름 · 주소 — 비어 있으면 기본 회사 이름 · 주소)
create or replace function public._receipt_ready()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(nullif(trim(seller_name_en), ''), nullif(trim(company_name), '')) is not null
                      and coalesce(nullif(trim(seller_address_en), ''), nullif(trim(address), '')) is not null
                     from public.company_settings where id = 1), false);
$$;


-- ================================================================
-- 6) 충전 요청의 실제 VAT
-- ================================================================
alter table public.topup_requests add column if not exists vat_rate numeric(5,2);
update public.topup_requests set vat_rate = case when subtotal > 0 then round(vat_amount / subtotal * 100, 2) else 0 end
 where vat_rate is null;

-- 이 고객에게 적용되는 VAT % (태국 = 설정 VAT, 해외 = overseas_vat_mode 'zero' 면 0)
create or replace function public._customer_vat_rate(p_user uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when coalesce((select public._norm_country(coalesce(reg_country, country)) from public.profiles where id = p_user), 'TH') <> 'TH'
         and coalesce((select overseas_vat_mode from public.payment_settings where id = 1), 'charge') = 'zero' then 0
    else coalesce((select vat_rate from public.payment_settings where id = 1), 7)
  end;
$$;

create or replace function public.get_my_vat_rate()
returns numeric language sql stable security definer set search_path = public as $$
  select public._customer_vat_rate(auth.uid());
$$;
grant execute on function public.get_my_vat_rate() to authenticated;

-- 충전 요청 (018 정의 + 고객 국가에 따른 VAT, vat_rate 저장)
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

  v_vat := public._customer_vat_rate(v_uid);
  v_sub := v_pkg.credits * v_pkg.unit_price;
  v_vat_amt := round(v_sub * v_vat / 100, 2);
  v_id := 'TP' || to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD') || '-' || lpad(nextval('public.topup_seq')::text, 4, '0');

  insert into public.topup_requests (id, user_id, package_id, credits, unit_price, subtotal, vat_amount, total, slip_path, product, vat_rate)
  values (v_id, v_uid, v_pkg.id, v_pkg.credits, v_pkg.unit_price, v_sub, v_vat_amt, v_sub + v_vat_amt, p_slip_path, v_pkg.product, v_vat);

  return jsonb_build_object('id', v_id, 'credits', v_pkg.credits, 'subtotal', v_sub, 'vat_amount', v_vat_amt, 'total', v_sub + v_vat_amt,
                            'product', v_pkg.product, 'vat_rate', v_vat);
end $$;

-- 환불 계산 (018 정의 + 묶음마다 그 충전 요청의 실제 VAT — 해외 0% 요청은 0% 로 다시 계산)
create or replace function public._credit_refund_quote(p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_vat numeric := coalesce((select vat_rate from public.payment_settings where id = 1), 7);
  v_single_abut numeric := coalesce((select unit_price from public.credit_packages where product = 'abutment' and credits = 1 order by active desc limit 1), 2200);
  v_single_crown numeric := coalesce((select unit_price from public.credit_packages where product = 'crown_set' and credits = 1 order by active desc limit 1), 2200);
  v_single numeric;
  v_lot_vat numeric;
  v_paid numeric;
  v_used integer;
  v_refund numeric;
  v_rule text;
  v_lots jsonb := '[]'::jsonb;
  v_total numeric := 0;
begin
  for r in
    select l.*, t.total as topup_total, t.vat_rate as topup_vat
      from public.credit_lots l left join public.topup_requests t on t.id = l.topup_id
     where l.user_id = p_user and l.remaining > 0
     order by l.expires_at
  loop
    v_single := case when r.product = 'crown_set' then v_single_crown else v_single_abut end;
    v_lot_vat := coalesce(r.topup_vat, v_vat);
    v_used := r.quantity - r.remaining;
    v_paid := coalesce(r.topup_total, round(r.quantity * r.unit_price * (1 + v_lot_vat / 100), 2));
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
      v_refund := greatest(0, round(v_paid - v_used * v_single * (1 + v_lot_vat / 100), 2));
    end if;
    v_total := v_total + v_refund;
    v_lots := v_lots || jsonb_build_object(
      'lot_id', r.id, 'source', r.source, 'created_at', r.created_at, 'expires_at', r.expires_at,
      'quantity', r.quantity, 'remaining', r.remaining, 'used', v_used, 'unit_price', r.unit_price,
      'paid_total', v_paid, 'refundable', v_refund, 'rule', v_rule, 'topup_id', r.topup_id,
      'product', r.product, 'single_price', v_single, 'vat_rate', v_lot_vat);
  end loop;
  return jsonb_build_object('lots', v_lots, 'total_refundable', v_total, 'single_price', v_single_abut, 'vat_rate', v_vat,
                            'single_prices', jsonb_build_object('abutment', v_single_abut, 'crown_set', v_single_crown));
end $$;


-- ================================================================
-- 7) 문서 표 · 번호
-- ================================================================
create table if not exists public.tax_doc_counters (
  prefix text not null,          -- IV · CN · RC · RF
  period text not null,          -- YYMM
  last   integer not null default 0,
  primary key (prefix, period)
);
alter table public.tax_doc_counters enable row level security;   -- 정책 없음 = 함수로만

create table if not exists public.tax_invoices (
  id               bigint generated by default as identity primary key,
  doc_type         text not null check (doc_type in ('invoice', 'credit_note', 'receipt', 'receipt_refund')),
  number           text not null unique,
  issue_date       date not null,                         -- 방콕 날짜
  user_id          uuid not null,
  topup_id         text references public.topup_requests(id) on delete restrict,
  ref_invoice_id   bigint references public.tax_invoices(id) on delete restrict,   -- 크레딧 노트 · 환불 영수증 → 원래 문서
  history_id       uuid,                                  -- 환불 이력 (credit_history 'refund_cash')
  approved_date    date,                                  -- 충전 승인일 (나중에 발행하면 발행일과 달라요)
  payment_date     date,                                  -- 입금 슬립을 올린 날
  payment_method   text not null default 'PromptPay / Bank transfer',
  buyer_country    text not null default 'TH',
  seller_name      text not null default '',
  seller_name_en   text not null default '',
  seller_address   text not null default '',
  seller_address_en text not null default '',
  seller_tax_id    text not null default '',
  seller_branch    text not null default '',
  buyer_name       text not null default '',
  buyer_address    text not null default '',
  buyer_tax_id     text not null default '',
  buyer_branch     text not null default '',
  buyer_phone      text not null default '',
  items            jsonb not null default '[]'::jsonb,    -- [{ name_en, name_th, qty, unit_price, amount }]
  subtotal         numeric(12,2) not null default 0,      -- 크레딧 노트 · 환불 영수증은 차액(양수)
  vat_rate         numeric(5,2) not null default 0,
  vat_amount       numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  original_subtotal numeric(12,2),                        -- 크레딧 노트: 원래 금액 · 올바른 금액
  correct_subtotal  numeric(12,2),
  reason           text not null default '',
  mail_status      text not null default 'pending' check (mail_status in ('pending', 'sent', 'not_required')),
  mailed_at        date,
  mail_tracking    text,
  mailed_by        uuid,
  created_at       timestamptz not null default now(),
  created_by       uuid
);
create index if not exists idx_tax_invoices_user on public.tax_invoices (user_id, issue_date desc);
create index if not exists idx_tax_invoices_issue on public.tax_invoices (issue_date, number);
create index if not exists idx_tax_invoices_mail on public.tax_invoices (mail_status) where mail_status = 'pending';
create unique index if not exists tax_invoices_one_per_topup on public.tax_invoices (topup_id) where doc_type in ('invoice', 'receipt');
alter table public.tax_invoices enable row level security;
drop policy if exists "tax_invoices: read own or manager" on public.tax_invoices;
create policy "tax_invoices: read own or manager" on public.tax_invoices
  for select to authenticated using (user_id = auth.uid() or public.has_admin_role('manager'));
revoke all on public.tax_invoices, public.tax_doc_counters from anon;
revoke insert, update, delete on public.tax_invoices from authenticated;
revoke all on public.tax_doc_counters from authenticated;
grant select on public.tax_invoices to authenticated;

-- 발행된 문서는 고칠 수 없어요 (우편 칸만 — 함수가 'allabut.tax_mail' 을 켰을 때), 지울 수도 없어요
create or replace function public._trg_tax_invoice_lock()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'DOC_IMMUTABLE'; end if;
  if coalesce(current_setting('allabut.tax_mail', true), '') <> '1'
     or (to_jsonb(new) - array['mail_status', 'mailed_at', 'mail_tracking', 'mailed_by'])
        is distinct from (to_jsonb(old) - array['mail_status', 'mailed_at', 'mail_tracking', 'mailed_by']) then
    raise exception 'DOC_IMMUTABLE';
  end if;
  return new;
end $$;
drop trigger if exists trg_tax_invoice_lock on public.tax_invoices;
create trigger trg_tax_invoice_lock before update or delete on public.tax_invoices
  for each row execute function public._trg_tax_invoice_lock();

-- 다음 번호 (종류 · 달마다 0001 부터, 카운터 줄을 잠가서 빠짐 · 겹침 없음 — 실패하면 번호도 같이 취소)
create or replace function public._next_tax_doc_number(p_prefix text, p_date date)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_period text := to_char(p_date, 'YYMM');
  v_n integer;
begin
  insert into public.tax_doc_counters (prefix, period, last) values (p_prefix, v_period, 1)
  on conflict (prefix, period) do update set last = public.tax_doc_counters.last + 1
  returning last into v_n;
  return p_prefix || v_period || '-' || lpad(v_n::text, 4, '0');
end $$;

create or replace function public._bkk_today()
returns date language sql stable as $$ select (now() at time zone 'Asia/Bangkok')::date $$;


-- ================================================================
-- 8) 발행 — 충전 승인 → 세금계산서(태국) / 영수증(해외)
-- ================================================================
create or replace function public._issue_tax_doc_for_topup(p_topup text, p_by uuid default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  t public.topup_requests;
  p public.profiles;
  c public.company_settings;
  v_existing bigint;
  v_country text;
  v_type text;
  v_today date := public._bkk_today();
  v_id bigint;
  v_item jsonb;
  v_name_en text;
  v_name_th text;
begin
  select * into t from public.topup_requests where id = p_topup;
  if not found then raise exception 'NOT_FOUND'; end if;
  if t.status <> 'approved' then raise exception 'NOT_APPROVED'; end if;
  select id into v_existing from public.tax_invoices where topup_id = p_topup and doc_type in ('invoice', 'receipt');
  if v_existing is not null then return v_existing; end if;
  select * into p from public.profiles where id = t.user_id;
  select * into c from public.company_settings where id = 1;
  v_country := public._norm_country(coalesce(p.reg_country, p.country));
  if v_country = 'TH' then
    if not public._tax_invoice_ready() then return null; end if;
    v_type := 'invoice';
  else
    if not public._receipt_ready() then return null; end if;
    v_type := 'receipt';
  end if;
  v_name_en := case when t.product = 'crown_set' then 'Abutment + zirconia crown set credits' else 'Custom abutment credits' end;
  v_name_th := case when t.product = 'crown_set' then 'เครดิตชุดแอบัตเมนต์ + ครอบฟันเซอร์โคเนีย' else 'เครดิตแอบัตเมนต์เฉพาะบุคคล' end;
  v_item := jsonb_build_object('name_en', v_name_en, 'name_th', case when v_type = 'invoice' then v_name_th else '' end,
                               'qty', t.credits, 'unit_price', t.unit_price, 'amount', t.subtotal, 'product', coalesce(t.product, 'abutment'));
  insert into public.tax_invoices (
    doc_type, number, issue_date, user_id, topup_id, approved_date, payment_date, buyer_country,
    seller_name, seller_name_en, seller_address, seller_address_en, seller_tax_id, seller_branch,
    buyer_name, buyer_address, buyer_tax_id, buyer_branch, buyer_phone,
    items, subtotal, vat_rate, vat_amount, total, mail_status, created_by)
  values (
    v_type, public._next_tax_doc_number(case when v_type = 'invoice' then 'IV' else 'RC' end, v_today), v_today, t.user_id, t.id,
    (coalesce(t.reviewed_at, now()) at time zone 'Asia/Bangkok')::date, (t.created_at at time zone 'Asia/Bangkok')::date, v_country,
    case when v_type = 'invoice' then trim(c.seller_name_th) else coalesce(nullif(trim(c.seller_name_en), ''), trim(c.company_name)) end,
    coalesce(nullif(trim(c.seller_name_en), ''), trim(c.company_name)),
    case when v_type = 'invoice' then trim(c.seller_address_th) else coalesce(nullif(trim(c.seller_address_en), ''), trim(c.address)) end,
    coalesce(nullif(trim(c.seller_address_en), ''), trim(c.address)),
    public._norm_tax_id(c.tax_id), coalesce(c.seller_branch, ''),
    coalesce(nullif(p.doc_name, ''), nullif(p.reg_clinic, ''), p.clinic_name, ''),
    coalesce(nullif(p.doc_address, ''), nullif(p.reg_addr, ''), p.address, ''),
    coalesce(p.tax_id, ''), case when v_country = 'TH' then coalesce(p.doc_branch, '') else '' end,
    coalesce(nullif(p.reg_phone, ''), p.phone, ''),
    jsonb_build_array(v_item), t.subtotal, coalesce(t.vat_rate, case when t.subtotal > 0 then round(t.vat_amount / t.subtotal * 100, 2) else 0 end),
    t.vat_amount, t.total, case when v_type = 'invoice' then 'pending' else 'not_required' end, coalesce(p_by, auth.uid()))
  returning id into v_id;
  perform public._audit('tax_doc_issued', 'tax_invoice', v_id::text,
    jsonb_build_object('type', v_type, 'topup', t.id, 'total', t.total, 'number', (select number from public.tax_invoices where id = v_id)));
  return v_id;
end $$;
revoke all on function public._issue_tax_doc_for_topup(text, uuid) from public, anon, authenticated;

-- 승인되는 순간 자동 발행 (실패해도 승인은 그대로 — 나중에 관리자가 "발행")
create or replace function public._trg_topup_issue_doc()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    begin
      perform public._issue_tax_doc_for_topup(new.id, new.reviewed_by);
    exception when others then
      raise warning 'tax document not issued for %: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end $$;
drop trigger if exists trg_topup_issue_doc on public.topup_requests;
create trigger trg_topup_issue_doc after update on public.topup_requests
  for each row execute function public._trg_topup_issue_doc();

-- 관리자 "발행" (설정이 꺼져 있을 때 승인된 건, manager 이상)
create or replace function public.admin_issue_tax_doc(p_topup text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_country text;
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  if exists (select 1 from public.tax_invoices where topup_id = p_topup and doc_type in ('invoice', 'receipt')) then raise exception 'ALREADY_ISSUED'; end if;
  v_id := public._issue_tax_doc_for_topup(p_topup, auth.uid());
  if v_id is null then
    select public._norm_country(coalesce(p.reg_country, p.country)) into v_country
      from public.topup_requests t join public.profiles p on p.id = t.user_id where t.id = p_topup;
    raise exception '%', case when v_country = 'TH' then 'TAX_SETTINGS_MISSING' else 'RECEIPT_SETTINGS_MISSING' end;
  end if;
  return v_id;
end $$;
grant execute on function public.admin_issue_tax_doc(text) to authenticated;

-- 문서가 없는 승인된 입금 (manager 이상)
create or replace function public.admin_topups_without_docs()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id, 'user_id', t.user_id, 'clinic', coalesce(nullif(p.reg_clinic, ''), p.clinic_name, ''),
             'country', public._norm_country(coalesce(p.reg_country, p.country)),
             'approved_at', t.reviewed_at, 'credits', t.credits, 'product', t.product,
             'subtotal', t.subtotal, 'vat_amount', t.vat_amount, 'total', t.total) order by t.reviewed_at)
      from public.topup_requests t left join public.profiles p on p.id = t.user_id
     where t.status = 'approved'
       and not exists (select 1 from public.tax_invoices d where d.topup_id = t.id and d.doc_type in ('invoice', 'receipt'))), '[]'::jsonb);
end $$;
grant execute on function public.admin_topups_without_docs() to authenticated;


-- ================================================================
-- 9) 현금 환불 → 크레딧 노트(세금계산서였으면) / 환불 영수증(영수증이었으면)
--    admin_refund_cash 가 refund_cash_lots 에 충전 요청별 몫을 넣을 때마다 1건 (원래 문서가 없으면 건너뜀)
-- ================================================================
create or replace function public._issue_refund_doc(p_history uuid, p_topup text, p_amount numeric)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  o public.tax_invoices;
  v_type text;
  v_today date := public._bkk_today();
  v_total numeric := round(coalesce(p_amount, 0), 2);
  v_vat numeric;
  v_sub numeric;
  v_prev numeric;
  v_orig numeric;
  v_reason text;
  v_id bigint;
begin
  if p_topup is null or v_total <= 0 then return null; end if;
  select * into o from public.tax_invoices where topup_id = p_topup and doc_type in ('invoice', 'receipt');
  if not found then return null; end if;
  v_type := case when o.doc_type = 'invoice' then 'credit_note' else 'receipt_refund' end;
  v_vat := round(v_total * o.vat_rate / (100 + o.vat_rate), 2);
  v_sub := v_total - v_vat;
  select coalesce(sum(subtotal), 0) into v_prev from public.tax_invoices where ref_invoice_id = o.id;
  v_orig := o.subtotal - v_prev;   -- 지금까지 정정한 뒤의 금액
  select coalesce(nullif(trim(description), ''), 'Cash refund') into v_reason from public.credit_history where id = p_history;
  insert into public.tax_invoices (
    doc_type, number, issue_date, user_id, topup_id, ref_invoice_id, history_id, approved_date, payment_date, payment_method, buyer_country,
    seller_name, seller_name_en, seller_address, seller_address_en, seller_tax_id, seller_branch,
    buyer_name, buyer_address, buyer_tax_id, buyer_branch, buyer_phone,
    items, subtotal, vat_rate, vat_amount, total, original_subtotal, correct_subtotal, reason, mail_status, created_by)
  values (
    v_type, public._next_tax_doc_number(case when v_type = 'credit_note' then 'CN' else 'RF' end, v_today), v_today, o.user_id, o.topup_id, o.id, p_history,
    o.approved_date, o.payment_date, 'Bank transfer', o.buyer_country,
    o.seller_name, o.seller_name_en, o.seller_address, o.seller_address_en, o.seller_tax_id, o.seller_branch,
    o.buyer_name, o.buyer_address, o.buyer_tax_id, o.buyer_branch, o.buyer_phone,
    o.items, v_sub, o.vat_rate, v_vat, v_total, v_orig, v_orig - v_sub, left(v_reason, 500),
    case when v_type = 'credit_note' then 'pending' else 'not_required' end, auth.uid())
  returning id into v_id;
  perform public._audit('tax_doc_issued', 'tax_invoice', v_id::text,
    jsonb_build_object('type', v_type, 'topup', o.topup_id, 'total', v_total, 'ref', o.number, 'number', (select number from public.tax_invoices where id = v_id)));
  return v_id;
end $$;
revoke all on function public._issue_refund_doc(uuid, text, numeric) from public, anon, authenticated;

create or replace function public._trg_refund_issue_doc()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public._issue_refund_doc(new.history_id, new.topup_id, new.amount_thb);
  exception when others then
    raise warning 'refund document not issued for %: %', new.topup_id, sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists trg_refund_issue_doc on public.refund_cash_lots;
create trigger trg_refund_issue_doc after insert on public.refund_cash_lots
  for each row execute function public._trg_refund_issue_doc();


-- ================================================================
-- 10) 우편 발송 표시 (manager 이상, 세금계산서 · 크레딧 노트만) → 작업 기록
-- ================================================================
create or replace function public.admin_mark_invoices_mailed(p_ids bigint[], p_date date default null, p_tracking text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
  v_numbers text[];
  v_date date := coalesce(p_date, public._bkk_today());
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then raise exception 'NO_DOCS'; end if;
  if v_date > public._bkk_today() then raise exception 'INVALID_DATE'; end if;
  perform set_config('allabut.tax_mail', '1', true);
  update public.tax_invoices
     set mail_status = 'sent', mailed_at = v_date, mail_tracking = nullif(left(trim(coalesce(p_tracking, '')), 60), ''), mailed_by = auth.uid()
   where id = any (p_ids) and doc_type in ('invoice', 'credit_note');
  get diagnostics v_n = row_count;
  perform set_config('allabut.tax_mail', '', true);
  select array_agg(number order by number) into v_numbers from public.tax_invoices where id = any (p_ids) and doc_type in ('invoice', 'credit_note');
  perform public._audit('invoices_mailed', 'tax_invoice', array_to_string(v_numbers, ','),
    jsonb_build_object('count', v_n, 'numbers', to_jsonb(coalesce(v_numbers, '{}')), 'date', v_date, 'tracking', coalesce(p_tracking, '')));
  return v_n;
end $$;
grant execute on function public.admin_mark_invoices_mailed(bigint[], date, text) to authenticated;


-- ================================================================
-- 11) 월별 매출 세금 보고서 (owner) — 세금계산서 · 크레딧 노트(마이너스) / 해외 매출(영수증 · 환불 영수증)
-- ================================================================
create or replace function public.admin_tax_report(p_year integer, p_month integer)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from date;
  v_to date;
  v_out jsonb;
  v_ovs jsonb;
begin
  if not public.has_admin_role('owner') then raise exception 'NOT_ADMIN'; end if;
  if p_month < 1 or p_month > 12 then raise exception 'INVALID_MONTH'; end if;
  v_from := make_date(p_year, p_month, 1);
  v_to := (v_from + interval '1 month')::date;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'doc_type', doc_type, 'number', number, 'issue_date', issue_date,
           'buyer_name', buyer_name, 'buyer_tax_id', buyer_tax_id, 'buyer_branch', buyer_branch,
           'subtotal', case when doc_type = 'credit_note' then -subtotal else subtotal end,
           'vat_amount', case when doc_type = 'credit_note' then -vat_amount else vat_amount end,
           'total', case when doc_type = 'credit_note' then -total else total end) order by issue_date, number), '[]'::jsonb)
    into v_out
    from public.tax_invoices where doc_type in ('invoice', 'credit_note') and issue_date >= v_from and issue_date < v_to;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'doc_type', doc_type, 'number', number, 'issue_date', issue_date,
           'buyer_name', buyer_name, 'buyer_country', buyer_country,
           'subtotal', case when doc_type = 'receipt_refund' then -subtotal else subtotal end,
           'vat_amount', case when doc_type = 'receipt_refund' then -vat_amount else vat_amount end,
           'total', case when doc_type = 'receipt_refund' then -total else total end) order by issue_date, number), '[]'::jsonb)
    into v_ovs
    from public.tax_invoices where doc_type in ('receipt', 'receipt_refund') and issue_date >= v_from and issue_date < v_to;
  return jsonb_build_object(
    'year', p_year, 'month', p_month,
    'output', v_out,
    'output_totals', jsonb_build_object(
      'subtotal', coalesce((select sum((x ->> 'subtotal')::numeric) from jsonb_array_elements(v_out) x), 0),
      'vat_amount', coalesce((select sum((x ->> 'vat_amount')::numeric) from jsonb_array_elements(v_out) x), 0),
      'total', coalesce((select sum((x ->> 'total')::numeric) from jsonb_array_elements(v_out) x), 0)),
    'overseas', v_ovs,
    'overseas_totals', jsonb_build_object(
      'subtotal', coalesce((select sum((x ->> 'subtotal')::numeric) from jsonb_array_elements(v_ovs) x), 0),
      'vat_amount', coalesce((select sum((x ->> 'vat_amount')::numeric) from jsonb_array_elements(v_ovs) x), 0),
      'total', coalesce((select sum((x ->> 'total')::numeric) from jsonb_array_elements(v_ovs) x), 0)));
end $$;
grant execute on function public.admin_tax_report(integer, integer) to authenticated;
