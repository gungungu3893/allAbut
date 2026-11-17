-- ================================================================
-- allAbut — 022: 전화번호 국가번호 칸 (태국 치과가 해외 번호를 쓸 때)
-- ================================================================
-- 화면이 전화번호를 "국가번호 + 뒷번호" 두 칸으로 받아요 (ui/layout.js uiPhoneField).
-- 저장할 때는 "+국가번호 뒷번호" 를 합쳐서 예전처럼 정규화해요:
--   태국 치과 + 태국 번호 (+66 / 0066 / 66 / 0…)  → 0 으로 시작하는 국내 형식  예: 0812345678   (지금과 같아요)
--   태국 치과 + 해외 번호 (+82 …)                → '+' + 숫자 국제 형식       예: +821012345678 (← 022 에서 바뀌는 부분)
--   해외 치과                                    → '+' + 숫자 국제 형식 (지금과 같아요, +66 도 그대로)
-- 예전에는 태국 치과의 "+82 10…" 이 '+' 없이 "8210…" 으로 저장돼서, 같은 번호를 쓰는 해외 치과("+8210…")와 중복 검사가 안 됐어요.
--
-- 바꾸는 함수 (021 정의에서 태국 줄만 고쳐요): _norm_phone(p, country) · _valid_phone(p, country)
--   예전 1인자 함수 _norm_phone(p) · _valid_phone(p) (010, 태국 국내 형식)는 그대로 둬요.
-- 브라우저 쪽 같은 규칙: cnc/cnc-identity.js 의 cncNormPhone(v, country) · cncValidPhone(v, country) — 한쪽을 바꾸면 다른 쪽도
-- 마지막에 profiles.phone_norm 을 새 규칙으로 다시 계산해요 (중복이 생기는 줄은 건너뛰고 notice 로 알려줘요).
--
-- 실행 순서: 021 다음. 두 번 실행해도 안전. 기존 SQL 파일은 고치지 않아요.
-- ⚠️ 021 을 다시 실행하면 022 도 다시 (021 이 국가번호를 모르는 예전 모양으로 되돌려서)


-- ================================================================
-- 1) 정규화
-- ================================================================
create or replace function public._norm_phone(p text, p_country text)
returns text language sql immutable as $$
  select case
    when public._norm_country(p_country) = 'TH' then
      case
        -- + 또는 00 으로 시작하는 국제 형식 입력
        when (t like '+%' or t like '00%') and dd <> '' then
          case when dd ~ '^66' then public._norm_phone(dd)   -- 태국 번호 → 0 으로 시작하는 국내 형식
               else '+' || dd end                            -- 해외 번호 → 국제 형식 그대로
        else public._norm_phone(p)                            -- 국내 형식 입력 (예전 그대로)
      end
    else case when d = '' then '' else '+' || case when t like '00%' then substr(d, 3) else d end end
  end
  from (
    select t, d, case when t like '00%' then substr(d, 3) else d end as dd
      from (select trim(coalesce(p, '')) as t, regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) a
  ) x;
$$;


-- ================================================================
-- 2) 형식 검사
-- ================================================================
create or replace function public._valid_phone(p text, p_country text)
returns boolean language sql immutable as $$
  select case
    when public._norm_country(p_country) = 'TH' then
      case when n like '+%' then n ~ '^\+[0-9]{8,15}$'      -- 태국 치과의 해외 번호
           else n ~ '^[0-9]{9,15}$' end                      -- 태국 번호 (010 과 같은 길이 규칙)
    else (trim(coalesce(p, '')) like '+%' or trim(coalesce(p, '')) like '00%')
         and n ~ '^\+[0-9]{8,15}$'
  end
  from (select public._norm_phone(p, p_country) as n) x;
$$;


-- ================================================================
-- 3) 이미 저장된 phone_norm 을 새 규칙으로 (바뀌는 줄만, 한 줄씩)
--    트리거(_trg_profile_identity)가 같은 값으로 다시 계산하고 중복을 검사해요 → 겹치면 그 줄은 건너뛰고 notice
--    phone 칸은 건드리지 않아서 신규 가입 이벤트 트리거(trg_profile_signup_bonus)는 돌지 않아요
-- ================================================================
do $$
declare
  r record;
  v_done integer := 0;
  v_skip integer := 0;
begin
  for r in
    select id, phone, country, phone_norm
      from public.profiles
     where coalesce(phone_norm, '') is distinct from public._norm_phone(phone, country)
  loop
    begin
      update public.profiles set phone_norm = public._norm_phone(r.phone, r.country) where id = r.id;
      v_done := v_done + 1;
    exception when others then
      v_skip := v_skip + 1;
      raise notice '022: phone_norm not updated for profile % (%): %', r.id, r.phone, sqlerrm;
    end;
  end loop;
  raise notice '022: phone_norm updated % rows, skipped % rows', v_done, v_skip;
end $$;
