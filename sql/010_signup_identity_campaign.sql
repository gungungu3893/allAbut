-- ================================================================
-- allAbut 010 — 회원가입 필수 정보 · 중복 규칙 · 신규 가입 무료 크레딧 이벤트(기간·승인) · 의심 배지
-- ================================================================
-- 실행: Supabase 대시보드 → SQL Editor → New query → 이 파일 전체를 붙여넣고 Run
--       (008 → 009 → 010 순서. 두 번 실행해도 오류 없이 같은 결과)
--       ⚠️ 008 이나 009 를 다시 실행하면 이 파일(010)도 다시 실행하세요 (가입 선물 함수·변경 요청 함수가 예전 모양으로 돌아가서)
--       맨 마지막 결과 표 = 전화번호·Tax ID 가 겹치는 계정 목록 (비어 있으면 겹치는 계정 없음)
--
-- 1) 필수 정보: 본명(full_name) · 전화 · 치과명 · 치과 Tax ID(13자리, 태국 체크섬) · 치과 주소
--    - 정규화 함수 하나 (화면 cnc/cnc-identity.js 와 똑같이):
--        전화 _norm_phone  = 숫자만, +66/66 으로 시작하면 0 으로   예) +66 81-234-5678 → 0812345678
--        Tax ID _norm_tax_id = 숫자만, _valid_tax_id = 13자리 + 체크섬 (앞 12자리 × 13..2 합 → (11 - 합 % 11) % 10 = 13번째 자리)
--    - 본명 · Tax ID 는 처음 채워지면 잠겨요 → 바꾸려면 등록 정보 변경 요청(clinic_change_requests) → manager 이상 승인
--    - 주문(cnc_orders INSERT)은 필수 정보가 다 있어야 돼요 → 아니면 PROFILE_INCOMPLETE
-- 2) 중복 (DB 가 막아요)
--    - 전화 정규화 값: 다른 계정과 같으면 PHONE_TAKEN (가입·수정·변경 승인 모두). 기존 데이터가 안 겹치면 unique 인덱스도 만들어요
--    - Tax ID: payment_settings.tax_id_policy 'block'(기본) = 다른 계정 불가(TAX_ID_TAKEN) / 'allow' = 가입은 되지만 무료 크레딧 이벤트는 Tax ID 당 1번
--    - 본명 · 치과명 · 주소 · 가입 IP · 기기: 막지 않고 관리자 화면에 "의심" 배지 (_suspicion_flags)
--    - 일회용 메일(mailinator 등, blocked_email_domains) 은 가입(프로필 만들기)에서 막아요: EMAIL_DISPOSABLE
-- 3) 신규 가입 무료 크레딧 이벤트 (payment_settings 확장, 기존 signup_bonus_credits 그대로)
--    - signup_bonus_enabled · signup_bonus_starts/ends(방콕 날짜) · signup_bonus_valid_days · signup_bonus_banner(en/th/ko)
--      · signup_bonus_grant_mode('approval' 기본 | 'auto') · signup_bonus_require_line(기본 true) · signup_bonus_campaign(이벤트 이름)
--    - 지급 조건: 켜짐 + 지금 기간 안 + 크레딧 1 이상 + 가입 시각 기간 안 + 이메일 인증 + 필수 정보·등록 치과 + (require_line 이면) LINE 연결
--    - 같은 user · 전화 · LINE · Tax ID 로 이미 받았거나(대기 포함) 신청했으면 안 줘요
--    - 조건이 안 맞으면 보류 → 프로필이 바뀔 때(트리거) · 로그인할 때(claim_signup_bonus) 다시 시도
--    - approval: signup_bonus_grants.status 'pending' → 관리자 승인(admin_review_signup_bonus) 때 지급 / 거절(사유)
--      auto: 바로 지급. 지급 묶음 = 무료 크레딧 규칙 그대로 (source 'free', restriction 'clinic_address_only', "Free credits: 이벤트명")
--    - 회수: admin_revoke_signup_bonus (사유 필수, 그 묶음에 남은 만큼)
-- 4) 가입 기록: profiles.signup_ip (요청 헤더 cf-connecting-ip / x-forwarded-for) · signup_device_id · signup_ua — record_signup_meta()


-- ================================================================
-- 1) 정규화 · 검사 함수
-- ================================================================
create or replace function public._norm_phone(p text)
returns text language sql immutable as $$
  select case
    when d ~ '^66[0-9]{8,}$' then '0' || substr(d, 3)
    else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

create or replace function public._norm_tax_id(p text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
$$;

-- 태국 Tax ID 체크섬
create or replace function public._valid_tax_id(p text)
returns boolean language plpgsql immutable as $$
declare
  d text := public._norm_tax_id(p);
  s integer := 0;
  i integer;
begin
  if d !~ '^[0-9]{13}$' then return false; end if;
  for i in 1..12 loop
    s := s + substr(d, i, 1)::int * (14 - i);
  end loop;
  return (11 - s % 11) % 10 = substr(d, 13, 1)::int;
end $$;

-- 전화 형식 (정규화 후 숫자 9~15자리)
create or replace function public._valid_phone(p text)
returns boolean language sql immutable as $$
  select public._norm_phone(p) ~ '^[0-9]{9,15}$';
$$;

-- 이름 비교용 (소문자, 공백 하나로)
create or replace function public._norm_name(p text)
returns text language sql immutable as $$
  select lower(trim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')));
$$;

-- 치과명 비교용 (흔한 단어·공백·기호 빼기) 예) "Smile Dental Clinic" = "smile"
create or replace function public._norm_clinic(p text)
returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(lower(coalesce(p, '')), '(dental|clinic|dentistry|co\.?,? ?ltd\.?|คลินิก|ทันตกรรม|치과|의원)', '', 'g'),
           '[[:space:][:punct:]]+', '', 'g');
$$;


-- ================================================================
-- 2) 일회용 메일 도메인
-- ================================================================
create table if not exists public.blocked_email_domains (
  domain text primary key
);
alter table public.blocked_email_domains enable row level security;   -- 정책 없음 = 브라우저에서 못 봐요 (함수만)
insert into public.blocked_email_domains (domain) values
  ('mailinator.com'), ('10minutemail.com'), ('10minutemail.net'), ('guerrillamail.com'), ('guerrillamail.net'), ('guerrillamail.org'),
  ('sharklasers.com'), ('grr.la'), ('temp-mail.org'), ('temp-mail.io'), ('tempmail.com'), ('tempmail.net'), ('tempmailo.com'),
  ('yopmail.com'), ('yopmail.net'), ('yopmail.fr'), ('trashmail.com'), ('getnada.com'), ('dispostable.com'), ('maildrop.cc'),
  ('throwawaymail.com'), ('fakeinbox.com'), ('mohmal.com'), ('emailondeck.com'), ('mintemail.com'), ('mytemp.email'), ('tempail.com')
on conflict (domain) do nothing;

create or replace function public._email_disposable(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocked_email_domains b
     where lower(split_part(coalesce(p_email, ''), '@', 2)) = b.domain
        or lower(split_part(coalesce(p_email, ''), '@', 2)) like '%.' || b.domain
  );
$$;


-- ================================================================
-- 3) profiles: 본명 · 전화 정규화 · 가입 기록
-- ================================================================
alter table public.profiles
  add column if not exists full_name        text,
  add column if not exists phone_norm       text,
  add column if not exists signup_ip        text,
  add column if not exists signup_device_id text,
  add column if not exists signup_ua        text,
  add column if not exists signup_meta_at   timestamptz;

-- 예전 행 채우기 (전화 정규화 · Tax ID 숫자만)
update public.profiles set phone_norm = public._norm_phone(phone)
 where coalesce(phone_norm, '') is distinct from public._norm_phone(phone);
create index if not exists idx_profiles_phone_norm on public.profiles (phone_norm);
create index if not exists idx_profiles_tax_id on public.profiles (tax_id);


-- ================================================================
-- 4) 설정 (payment_settings)
-- ================================================================
alter table public.payment_settings
  add column if not exists tax_id_policy             text not null default 'block',
  add column if not exists signup_bonus_enabled      boolean not null default false,
  add column if not exists signup_bonus_starts       date,
  add column if not exists signup_bonus_ends         date,
  add column if not exists signup_bonus_valid_days   integer not null default 365,
  add column if not exists signup_bonus_banner       jsonb not null default '{}'::jsonb,
  add column if not exists signup_bonus_grant_mode   text not null default 'approval',
  add column if not exists signup_bonus_require_line boolean not null default true,
  add column if not exists signup_bonus_campaign     text not null default 'New member event';

alter table public.payment_settings drop constraint if exists payment_settings_tax_id_policy_check;
alter table public.payment_settings add constraint payment_settings_tax_id_policy_check check (tax_id_policy in ('block', 'allow'));
alter table public.payment_settings drop constraint if exists payment_settings_grant_mode_check;
alter table public.payment_settings add constraint payment_settings_grant_mode_check check (signup_bonus_grant_mode in ('approval', 'auto'));
alter table public.payment_settings drop constraint if exists payment_settings_bonus_days_check;
alter table public.payment_settings add constraint payment_settings_bonus_days_check check (signup_bonus_valid_days between 1 and 3650);
alter table public.payment_settings drop constraint if exists payment_settings_bonus_banner_check;
alter table public.payment_settings add constraint payment_settings_bonus_banner_check check (jsonb_typeof(signup_bonus_banner) = 'object');
-- 켜려면 크레딧 1 이상 + 시작일 ≤ 종료일
alter table public.payment_settings drop constraint if exists payment_settings_bonus_enabled_check;
alter table public.payment_settings add constraint payment_settings_bonus_enabled_check check (
  not signup_bonus_enabled
  or (signup_bonus_credits >= 1 and signup_bonus_starts is not null and signup_bonus_ends is not null and signup_bonus_starts <= signup_bonus_ends)
);

create or replace function public._tax_id_policy()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select tax_id_policy from public.payment_settings where id = 1), 'block');
$$;


-- ================================================================
-- 5) profiles 트리거: 정규화 · 잠금(본명·Tax ID) · 형식 · 중복 · 일회용 메일
--    (008 의 trg_profile_clinic_lock 다음에 실행돼요 — 트리거는 이름 순서)
-- ================================================================
create or replace function public._trg_profile_identity()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean := coalesce(current_setting('allabut.reg_change', true), '') = '1';
  v_email text;
begin
  -- 정규화
  new.full_name := nullif(trim(regexp_replace(coalesce(new.full_name, ''), '\s+', ' ', 'g')), '');
  new.tax_id := public._norm_tax_id(new.tax_id);

  -- 잠금: 본명 · (올바른) Tax ID 는 처음 채워지면 고객이 못 바꿔요 (관리자 승인 함수만)
  if tg_op = 'UPDATE' and not v_admin then
    if old.full_name is not null and old.full_name <> '' then new.full_name := old.full_name; end if;
    if public._valid_tax_id(old.tax_id) then new.tax_id := old.tax_id; end if;
  end if;

  new.phone_norm := public._norm_phone(new.phone);

  -- 형식 · 중복 (바뀐 값만 검사 → 예전 데이터가 있어도 다른 칸 저장은 돼요)
  if new.tax_id <> '' and (tg_op = 'INSERT' or new.tax_id is distinct from public._norm_tax_id(old.tax_id)) then
    if not public._valid_tax_id(new.tax_id) then raise exception 'TAX_ID_INVALID'; end if;
    if public._tax_id_policy() = 'block'
       and exists (select 1 from public.profiles p where p.tax_id = new.tax_id and p.id <> new.id) then
      raise exception 'TAX_ID_TAKEN';
    end if;
  end if;
  if new.phone_norm <> '' and (tg_op = 'INSERT' or new.phone_norm is distinct from old.phone_norm) then
    if not public._valid_phone(new.phone) then raise exception 'PHONE_INVALID'; end if;
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

-- 필수 정보가 다 있는지
create or replace function public._profile_complete(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_user
       and coalesce(p.full_name, '') <> '' and public._valid_phone(p.phone)
       and coalesce(trim(p.clinic_name), '') <> '' and coalesce(trim(p.address), '') <> ''
       and public._valid_tax_id(p.tax_id)
  );
$$;

-- 주문은 필수 정보가 다 있어야 (create_cnc_order 가 넣는 행을 검사)
create or replace function public._trg_order_profile_complete()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public._profile_complete(new.user_id) then raise exception 'PROFILE_INCOMPLETE'; end if;
  return new;
end $$;
drop trigger if exists trg_order_profile_complete on public.cnc_orders;
create trigger trg_order_profile_complete before insert on public.cnc_orders
  for each row execute function public._trg_order_profile_complete();


-- ================================================================
-- 6) 전화 unique 인덱스 — 기존 데이터가 겹치지 않을 때만 (겹치면 목록만 알려주고 계속)
-- ================================================================
do $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select phone_norm, string_agg(id::text, ', ') as ids, count(*) as cnt
      from public.profiles where coalesce(phone_norm, '') <> ''
     group by phone_norm having count(*) > 1
  loop
    n := n + 1;
    raise notice 'DUPLICATE PHONE % — % accounts: %', r.phone_norm, r.cnt, r.ids;
  end loop;
  if n = 0 then
    execute 'create unique index if not exists profiles_phone_norm_unique on public.profiles (phone_norm) where coalesce(phone_norm, '''') <> ''''';
  else
    raise notice 'profiles_phone_norm_unique NOT created (% duplicate phone numbers). Fix them, then run this file again.', n;
  end if;
end $$;


-- ================================================================
-- 7) 가입 전 확인 (로그인 전에도 호출 가능, 겹치는지 true/false 만 — 다른 사람 정보는 안 보여줘요)
-- ================================================================
create or replace function public.check_signup_available(p_phone text, p_tax_id text, p_email text default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'phone_taken', public._norm_phone(p_phone) <> '' and exists (select 1 from public.profiles where phone_norm = public._norm_phone(p_phone)),
    'tax_id_taken', public._norm_tax_id(p_tax_id) <> '' and public._tax_id_policy() = 'block'
                    and exists (select 1 from public.profiles where tax_id = public._norm_tax_id(p_tax_id)),
    'email_blocked', p_email is not null and public._email_disposable(p_email)
  );
$$;
grant execute on function public.check_signup_available(text, text, text) to anon, authenticated;


-- ================================================================
-- 8) 가입 기록 (IP · 기기 · 브라우저) — 처음 한 번만
-- ================================================================
create or replace function public.record_signup_meta(p_device_id text, p_user_agent text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_h jsonb;
  v_ip text;
begin
  if v_uid is null then raise exception 'NOT_LOGGED_IN'; end if;
  begin
    v_h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then v_h := null;
  end;
  v_ip := coalesce(v_h ->> 'cf-connecting-ip', split_part(coalesce(v_h ->> 'x-forwarded-for', ''), ',', 1), v_h ->> 'x-real-ip');
  v_ip := nullif(trim(coalesce(v_ip, '')), '');
  update public.profiles
     set signup_ip = left(v_ip, 64), signup_device_id = left(nullif(trim(coalesce(p_device_id, '')), ''), 64),
         signup_ua = left(coalesce(p_user_agent, ''), 300), signup_meta_at = now()
   where id = v_uid and signup_meta_at is null;
  update public.signup_bonus_grants g
     set signup_ip = coalesce(g.signup_ip, p.signup_ip), device_id = coalesce(g.device_id, p.signup_device_id)
    from public.profiles p
   where g.user_id = v_uid and p.id = v_uid;
end $$;
grant execute on function public.record_signup_meta(text, text) to authenticated;


-- ================================================================
-- 9) 이벤트 안내 (로그인 전에도) — 진행 중일 때만 내용, 아니면 { active: false }
-- ================================================================
create or replace function public._bonus_window(p_starts date, p_ends date)
returns tstzrange language sql immutable as $$
  select tstzrange(p_starts::timestamp at time zone 'Asia/Bangkok', (p_ends + 1)::timestamp at time zone 'Asia/Bangkok', '[)');
$$;

create or replace function public.get_signup_campaign()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when s.signup_bonus_enabled and s.signup_bonus_credits >= 1 and s.signup_bonus_starts is not null and s.signup_bonus_ends is not null
         and now() <@ public._bonus_window(s.signup_bonus_starts, s.signup_bonus_ends)
    then jsonb_build_object('active', true, 'credits', s.signup_bonus_credits, 'starts', s.signup_bonus_starts, 'ends', s.signup_bonus_ends,
                            'banner', s.signup_bonus_banner, 'valid_days', s.signup_bonus_valid_days, 'require_line', s.signup_bonus_require_line)
    else jsonb_build_object('active', false) end
  from public.payment_settings s where s.id = 1;
$$;
grant execute on function public.get_signup_campaign() to anon, authenticated;


-- ================================================================
-- 10) 신청·지급 기록 (signup_bonus_grants 확장)
-- ================================================================
alter table public.signup_bonus_grants
  add column if not exists status        text not null default 'granted',
  add column if not exists campaign_name text,
  add column if not exists phone_norm    text,
  add column if not exists tax_id        text,
  add column if not exists line_user_id  text,
  add column if not exists signup_ip     text,
  add column if not exists device_id     text,
  add column if not exists reviewed_by   uuid,
  add column if not exists reviewed_at   timestamptz,
  add column if not exists reject_reason text,
  add column if not exists requested_at  timestamptz not null default now();
alter table public.signup_bonus_grants drop constraint if exists signup_bonus_grants_status_check;
alter table public.signup_bonus_grants add constraint signup_bonus_grants_status_check
  check (status in ('pending', 'granted', 'rejected', 'revoked'));
create index if not exists idx_signup_bonus_grants_phone on public.signup_bonus_grants (phone_norm);
create index if not exists idx_signup_bonus_grants_tax on public.signup_bonus_grants (tax_id);
create index if not exists idx_signup_bonus_grants_line on public.signup_bonus_grants (line_user_id);
create index if not exists idx_signup_bonus_grants_status on public.signup_bonus_grants (status, requested_at desc);

-- 실제 지급 (무료 크레딧 묶음) → 묶음 id
create or replace function public._signup_bonus_issue(p_user uuid, p_credits integer, p_campaign text, p_days integer)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lot uuid;
  v_exp timestamptz := now() + make_interval(days => greatest(1, coalesce(p_days, 365)));
  v_name text := coalesce(nullif(trim(p_campaign), ''), 'New member event');
begin
  insert into public.credit_wallets (user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  insert into public.credit_lots (user_id, source, quantity, remaining, unit_price, expires_at, restriction, event_name, granted_by)
  values (p_user, 'free', p_credits, p_credits, 0, v_exp, 'clinic_address_only', v_name, auth.uid())
  returning id into v_lot;
  insert into public.credit_history (user_id, amount, type, description, lot_id)
  values (p_user, p_credits, 'charge',
          'Free credits: ' || v_name || ' (valid until ' || to_char(v_exp at time zone 'Asia/Bangkok', 'YYYY-MM-DD') || ')', v_lot);
  perform public._credit_recalc(p_user);
  return v_lot;
end $$;
revoke all on function public._signup_bonus_issue(uuid, integer, text, integer) from public, anon, authenticated;

-- 신규 가입 이벤트 지급 시도 (조건이 안 맞으면 0 — 나중에 다시 시도돼요)
--   돌려주는 값: 이번에 지급한 크레딧 수 (승인 대기로 신청만 했으면 0)
create or replace function public.grant_signup_bonus(p_user uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  s record;
  p record;
  u record;
  v_lot uuid;
begin
  select * into s from public.payment_settings where id = 1;
  if s is null or not coalesce(s.signup_bonus_enabled, false) or coalesce(s.signup_bonus_credits, 0) < 1
     or s.signup_bonus_starts is null or s.signup_bonus_ends is null then return 0; end if;
  if not (now() <@ public._bonus_window(s.signup_bonus_starts, s.signup_bonus_ends)) then return 0; end if;
  if exists (select 1 from public.signup_bonus_grants where user_id = p_user) then return 0; end if;

  select created_at, email_confirmed_at into u from auth.users where id = p_user;
  if u.created_at is null or not (u.created_at <@ public._bonus_window(s.signup_bonus_starts, s.signup_bonus_ends)) then return 0; end if;
  if u.email_confirmed_at is null then return 0; end if;

  select * into p from public.profiles where id = p_user;
  if p is null or not public._profile_complete(p_user) or p.clinic_locked_at is null then return 0; end if;
  if coalesce(s.signup_bonus_require_line, true) and coalesce(p.line_user_id, '') !~ '^U[0-9a-f]{32}$' then return 0; end if;

  -- 같은 전화 · LINE · Tax ID 로 이미 받았거나 신청했으면 안 줘요 (거절·회수 포함 — 다시 받기 방지)
  if exists (select 1 from public.signup_bonus_grants g
              where (g.phone_norm is not null and g.phone_norm = p.phone_norm)
                 or (g.line_user_id is not null and g.line_user_id = p.line_user_id)
                 or (g.tax_id is not null and g.tax_id = p.tax_id)) then
    return 0;
  end if;

  if coalesce(s.signup_bonus_grant_mode, 'approval') = 'auto' then
    v_lot := public._signup_bonus_issue(p_user, s.signup_bonus_credits, s.signup_bonus_campaign, s.signup_bonus_valid_days);
    insert into public.signup_bonus_grants (user_id, lot_id, credits, status, campaign_name, phone_norm, tax_id, line_user_id, signup_ip, device_id)
    values (p_user, v_lot, s.signup_bonus_credits, 'granted', s.signup_bonus_campaign, p.phone_norm, p.tax_id, nullif(p.line_user_id, ''), p.signup_ip, p.signup_device_id)
    on conflict (user_id) do nothing;
    return s.signup_bonus_credits;
  end if;

  -- 승인 모드: 신청만 (관리자 단톡방에 "approval needed" 카드 — line-notify)
  insert into public.signup_bonus_grants (user_id, lot_id, credits, status, campaign_name, phone_norm, tax_id, line_user_id, signup_ip, device_id)
  values (p_user, null, s.signup_bonus_credits, 'pending', s.signup_bonus_campaign, p.phone_norm, p.tax_id, nullif(p.line_user_id, ''), p.signup_ip, p.signup_device_id)
  on conflict (user_id) do nothing;
  return 0;
end $$;
revoke all on function public.grant_signup_bonus(uuid) from public, anon, authenticated;

-- 프로필이 바뀔 때마다 다시 시도 (LINE 연결 · 정보 입력 · 등록 잠금 등) — 008 의 트리거를 넓혀요
create or replace function public._trg_profile_signup_bonus()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.grant_signup_bonus(new.id);
  return null;
end $$;
drop trigger if exists trg_profile_signup_bonus on public.profiles;
create trigger trg_profile_signup_bonus
  after insert or update of clinic_locked_at, line_user_id, full_name, tax_id, phone, clinic_name, address on public.profiles
  for each row execute function public._trg_profile_signup_bonus();

-- 로그인할 때 다시 시도 (이메일 인증은 auth 쪽이라 프로필 트리거로는 못 알아서) → { status, credits }
create or replace function public.claim_signup_bonus()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_n integer;
  g record;
begin
  if v_uid is null then raise exception 'NOT_LOGGED_IN'; end if;
  v_n := public.grant_signup_bonus(v_uid);
  select status, credits into g from public.signup_bonus_grants where user_id = v_uid;
  return jsonb_build_object('status', coalesce(g.status, 'none'), 'credits', coalesce(g.credits, 0), 'granted_now', v_n);
end $$;
grant execute on function public.claim_signup_bonus() to authenticated;


-- ================================================================
-- 11) 의심 배지 (같은 IP · 같은 기기 · 비슷한 치과명 · 같은 주소 · 같은 이름)
-- ================================================================
create or replace function public._suspicion_flags(p_user uuid)
returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  p record;
  f text[] := '{}';
begin
  select * into p from public.profiles where id = p_user;
  if p is null then return f; end if;
  if coalesce(p.signup_ip, '') <> '' and exists (select 1 from public.profiles o where o.id <> p.id and o.signup_ip = p.signup_ip) then
    f := array_append(f, 'same_ip'); end if;
  if coalesce(p.signup_device_id, '') <> '' and exists (select 1 from public.profiles o where o.id <> p.id and o.signup_device_id = p.signup_device_id) then
    f := array_append(f, 'same_device'); end if;
  if public._norm_clinic(p.clinic_name) <> '' and exists (select 1 from public.profiles o where o.id <> p.id and public._norm_clinic(o.clinic_name) = public._norm_clinic(p.clinic_name)) then
    f := array_append(f, 'similar_clinic'); end if;
  if public._norm_addr(p.address) <> '' and exists (select 1 from public.profiles o where o.id <> p.id
       and (public._norm_addr(o.address) = public._norm_addr(p.address) or coalesce(o.reg_addr_norm, '') = public._norm_addr(p.address))) then
    f := array_append(f, 'same_address'); end if;
  if public._norm_name(p.full_name) <> '' and exists (select 1 from public.profiles o where o.id <> p.id and public._norm_name(o.full_name) = public._norm_name(p.full_name)) then
    f := array_append(f, 'same_name'); end if;
  if coalesce(p.tax_id, '') <> '' and exists (select 1 from public.profiles o where o.id <> p.id and o.tax_id = p.tax_id) then
    f := array_append(f, 'same_tax_id'); end if;
  return f;
end $$;
revoke all on function public._suspicion_flags(uuid) from public, anon, authenticated;
grant execute on function public._suspicion_flags(uuid) to service_role;

create or replace function public.admin_suspicion_flags(p_user uuid)
returns text[]
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  return public._suspicion_flags(p_user);
end $$;
grant execute on function public.admin_suspicion_flags(uuid) to authenticated;


-- ================================================================
-- 12) 관리자: 신청·지급 목록 / 승인 · 거절 / 회수 (manager 이상)
-- ================================================================
create or replace function public.admin_list_signup_bonus(p_status text default 'pending')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', g.user_id, 'status', g.status, 'credits', g.credits, 'campaign_name', g.campaign_name,
      'requested_at', coalesce(g.requested_at, g.granted_at), 'granted_at', g.granted_at, 'reviewed_at', g.reviewed_at,
      'reject_reason', g.reject_reason, 'lot_id', g.lot_id,
      'lot_remaining', (select l.remaining from public.credit_lots l where l.id = g.lot_id),
      'email', (select email from auth.users u where u.id = g.user_id),
      'full_name', p.full_name, 'clinic_name', p.clinic_name, 'phone', p.phone, 'tax_id', p.tax_id,
      'address', coalesce(p.reg_addr, p.address), 'line_linked', coalesce(p.line_user_id, '') ~ '^U[0-9a-f]{32}$',
      'signup_ip', p.signup_ip, 'flags', to_jsonb(public._suspicion_flags(g.user_id)))
      order by coalesce(g.requested_at, g.granted_at) desc)
      from public.signup_bonus_grants g left join public.profiles p on p.id = g.user_id
     where coalesce(p_status, 'all') = 'all' or g.status = p_status
  ), '[]'::jsonb);
end $$;
grant execute on function public.admin_list_signup_bonus(text) to authenticated;

create or replace function public.admin_review_signup_bonus(p_user uuid, p_approve boolean, p_reason text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  g record;
  s record;
  v_lot uuid;
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  select * into g from public.signup_bonus_grants where user_id = p_user for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if g.status <> 'pending' then raise exception 'ALREADY_REVIEWED'; end if;
  if p_approve then
    select * into s from public.payment_settings where id = 1;
    v_lot := public._signup_bonus_issue(p_user, g.credits, coalesce(g.campaign_name, s.signup_bonus_campaign), coalesce(s.signup_bonus_valid_days, 365));
    update public.signup_bonus_grants
       set status = 'granted', lot_id = v_lot, granted_at = now(), reviewed_by = auth.uid(), reviewed_at = now()
     where user_id = p_user;
  else
    if coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
    update public.signup_bonus_grants
       set status = 'rejected', reject_reason = left(trim(p_reason), 300), reviewed_by = auth.uid(), reviewed_at = now()
     where user_id = p_user;
  end if;
  if to_regprocedure('public._audit(text,text,text,jsonb)') is not null then
    perform public._audit(case when p_approve then 'credits_added' else 'settings_changed' end, 'customer', p_user::text,
      jsonb_build_object('signup_bonus', case when p_approve then 'approved' else 'rejected' end, 'credits', g.credits, 'reason', coalesce(p_reason, '')));
  end if;
end $$;
grant execute on function public.admin_review_signup_bonus(uuid, boolean, text) to authenticated;

create or replace function public.admin_revoke_signup_bonus(p_user uuid, p_reason text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  g record;
  v_left integer;
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  select * into g from public.signup_bonus_grants where user_id = p_user for update;
  if not found or g.status <> 'granted' or g.lot_id is null then raise exception 'NOT_FOUND'; end if;
  perform 1 from public.credit_wallets where user_id = p_user for update;
  select remaining into v_left from public.credit_lots where id = g.lot_id for update;
  v_left := coalesce(v_left, 0);
  if v_left > 0 then
    update public.credit_lots set remaining = 0 where id = g.lot_id;
    insert into public.credit_history (user_id, amount, type, description, lot_id)
    values (p_user, -v_left, 'adjust', 'Free credits revoked: ' || left(trim(p_reason), 300), g.lot_id);
  end if;
  update public.signup_bonus_grants
     set status = 'revoked', reject_reason = left(trim(p_reason), 300), reviewed_by = auth.uid(), reviewed_at = now()
   where user_id = p_user;
  return public._credit_recalc(p_user);
end $$;
grant execute on function public.admin_revoke_signup_bonus(uuid, text) to authenticated;


-- ================================================================
-- 13) 등록 정보 변경 요청: 본명 · Tax ID 도 (008 의 4개 인자 함수는 지우고 새로)
-- ================================================================
alter table public.clinic_change_requests
  add column if not exists full_name text,
  add column if not exists tax_id    text;

drop function if exists public.request_clinic_change(text, text, text, text);
create or replace function public.request_clinic_change(
  p_clinic text, p_addr text, p_phone text, p_reason text default '', p_full_name text default null, p_tax_id text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_tax text := nullif(public._norm_tax_id(p_tax_id), '');
begin
  if v_uid is null then raise exception 'NOT_LOGGED_IN'; end if;
  if coalesce(trim(p_clinic), '') = '' or coalesce(trim(p_addr), '') = '' or coalesce(trim(p_phone), '') = '' then
    raise exception 'DELIVERY_REQUIRED';
  end if;
  if not public._valid_phone(p_phone) then raise exception 'PHONE_INVALID'; end if;
  if exists (select 1 from public.profiles where phone_norm = public._norm_phone(p_phone) and id <> v_uid) then raise exception 'PHONE_TAKEN'; end if;
  if v_tax is not null then
    if not public._valid_tax_id(v_tax) then raise exception 'TAX_ID_INVALID'; end if;
    if public._tax_id_policy() = 'block' and exists (select 1 from public.profiles where tax_id = v_tax and id <> v_uid) then raise exception 'TAX_ID_TAKEN'; end if;
  end if;
  update public.clinic_change_requests set status = 'cancelled' where user_id = v_uid and status = 'pending';
  insert into public.clinic_change_requests (user_id, clinic, addr, phone, reason, full_name, tax_id)
  values (v_uid, left(trim(p_clinic), 200), left(trim(p_addr), 500), left(trim(p_phone), 40), left(coalesce(trim(p_reason), ''), 500),
          nullif(left(trim(coalesce(p_full_name, '')), 200), ''), v_tax)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.request_clinic_change(text, text, text, text, text, text) to authenticated;

-- 승인 → 등록 정보 + 프로필(본명 · Tax ID 포함). 전화·Tax ID 가 다른 계정과 겹치면 트리거가 막아요 (PHONE_TAKEN / TAX_ID_TAKEN)
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
           full_name = coalesce(r.full_name, full_name), tax_id = coalesce(r.tax_id, tax_id)
     where id = r.user_id;
    perform set_config('allabut.reg_change', '', true);
  end if;
end $$;
grant execute on function public.admin_review_clinic_change(bigint, boolean, text) to authenticated;


-- ================================================================
-- 14) 겹치는 계정 목록 (Supabase SQL Editor 에 결과 표로 보여요 — 비어 있으면 OK)
-- ================================================================
select 'phone' as kind, phone_norm as value, count(*) as accounts, string_agg(id::text, ', ') as user_ids
  from public.profiles where coalesce(phone_norm, '') <> ''
 group by phone_norm having count(*) > 1
union all
select 'tax_id', tax_id, count(*), string_agg(id::text, ', ')
  from public.profiles where coalesce(tax_id, '') <> ''
 group by tax_id having count(*) > 1;
