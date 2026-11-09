-- ================================================================
-- allAbut 007 — 회사소개 페이지(#/about)에 쓰는 회사 정보 칸 추가
-- ================================================================
-- 실행: Supabase 대시보드 → SQL Editor → New query → 이 파일 전체를 붙여넣고 Run
--       (003_legal.sql · 005_team.sql 다음에 실행. 두 번 실행해도 오류 없이 같은 결과)
--
-- company_settings 에 추가하는 칸
--   implant_brands  text   : 호환 임플란트 시스템 (쉼표로 구분, 예: "Osstem, Straumann, Nobel Biocare")
--   lead_time       jsonb  : 제작 기간   — 언어별 { "en": "5 business days", "th": "...", "ko": "..." }
--   delivery        jsonb  : 배송 안내   — 언어별 (위와 같은 모양)
--   remake_policy   jsonb  : 재제작 정책 — 언어별 (위와 같은 모양)
--   founded_year    int    : 설립 연도 (기본 2026)
--
-- 언어별 칸 규칙: 화면에서 지금 언어 값이 없으면 "en" 값을 보여줘요. 값이 하나도 없으면 그 줄은 숨겨요.
--
-- 보안 규칙(RLS)은 바꾸지 않아요 — 003 의 "누구나 읽기(anon 포함)" + 005 의 "owner 만 수정" 그대로.
-- 새 칸도 같은 행에 있어서 그 규칙을 그대로 따라요. 수정 기록(작업 기록 admin_audit_log)도 005 트리거가 그대로 남겨요.


-- 1) 칸 추가 (이미 있으면 건너뛰어요)
alter table public.company_settings
  add column if not exists implant_brands text  not null default '',
  add column if not exists lead_time      jsonb not null default '{}'::jsonb,
  add column if not exists delivery       jsonb not null default '{}'::jsonb,
  add column if not exists remake_policy  jsonb not null default '{}'::jsonb,
  add column if not exists founded_year   integer default 2026;

-- 2) 값 모양 검사 (언어별 칸은 { } 객체만, 설립 연도는 1900 ~ 2100)
--    다시 실행해도 되게, 지우고 다시 만들어요
alter table public.company_settings drop constraint if exists company_settings_lead_time_obj;
alter table public.company_settings drop constraint if exists company_settings_delivery_obj;
alter table public.company_settings drop constraint if exists company_settings_remake_obj;
alter table public.company_settings drop constraint if exists company_settings_founded_year_range;
alter table public.company_settings add constraint company_settings_lead_time_obj    check (jsonb_typeof(lead_time) = 'object');
alter table public.company_settings add constraint company_settings_delivery_obj     check (jsonb_typeof(delivery) = 'object');
alter table public.company_settings add constraint company_settings_remake_obj       check (jsonb_typeof(remake_policy) = 'object');
alter table public.company_settings add constraint company_settings_founded_year_range check (founded_year is null or founded_year between 1900 and 2100);

-- 3) 회사 정보 행이 없으면 만들어요 (003 에서 이미 만들었으면 그대로)
insert into public.company_settings (id) values (1) on conflict (id) do nothing;

-- 4) 읽기 권한 다시 확인 (로그인 전 #/about 에서도 읽어야 해요)
grant select on public.company_settings to anon, authenticated;
grant update on public.company_settings to authenticated;

-- (확인용) 아래를 실행하면 새 칸이 보여요
-- select implant_brands, lead_time, delivery, remake_policy, founded_year from public.company_settings;
