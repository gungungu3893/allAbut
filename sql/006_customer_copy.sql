-- ================================================================
-- allAbut 006 — 관리자 LINE 그룹에 "고객 알림 사본" 카테고리 추가
-- ================================================================
-- 실행: Supabase → SQL Editor → 이 파일 전체 붙여넣고 Run (005 다음. 두 번 실행해도 같은 결과)
--
-- 하는 일
--   1) 지금 연결된(켜져 있는) 모든 관리자 알림 그룹에 'customer_copy' 추가
--      → 고객에게 가는 LINE 알림의 사본("📋 Customer notice copy")을 그 그룹에서도 받아요
--   2) 앞으로 새로 연결되는 그룹의 기본 카테고리에도 'customer_copy' 포함
--   (원하지 않는 그룹은 Admin → Settings → LINE groups 에서 "고객 알림 사본" 체크를 끄면 돼요)

-- 1) 켜져 있는 그룹에 추가 (이미 있으면 그대로)
update public.admin_notify_targets
   set categories = array_append(categories, 'customer_copy')
 where active
   and not ('customer_copy' = any (categories));

-- 2) 새 그룹 기본값
alter table public.admin_notify_targets
  alter column categories set default '{orders,topups,account,customer_copy}';
