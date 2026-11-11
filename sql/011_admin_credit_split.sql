-- ================================================================
-- allAbut — 011: 관리자용 크레딧 잔액 나누기 (충전 / 무료)
-- ================================================================
-- 고객 목록 · 고객 상세에서 잔액을 "충전(돈 주고 산 것) / 무료" 로 나눠 보여 주려고 만든 함수예요.
-- 나누는 규칙은 get_my_credit_summary() (sql/009) 와 똑같아요 — 새 규칙 없음:
--   paid = 만료 안 된 묶음 remaining 중 restriction 없음 + 무료 출처(_is_free_source) 아님
--   free = 나머지 (등록 주소 전용 무료 + 제한 없는 무료)
-- 실행 순서: 005 · 008 · 009 다음. 두 번 실행해도 안전 (create or replace 만).
-- 보호: has_admin_role('manager') — 아니면 NOT_ADMIN

create or replace function public.admin_credit_split(p_users uuid[] default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_admin_role('manager') then raise exception 'NOT_ADMIN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', s.user_id,
      'paid', s.paid, 'free', s.free,
      'paid_next_expiry', s.paid_next, 'free_next_expiry', s.free_next))
    from (
      select l.user_id,
        coalesce(sum(l.remaining) filter (where l.restriction is null and not public._is_free_source(l.source)), 0) as paid,
        coalesce(sum(l.remaining) filter (where not (l.restriction is null and not public._is_free_source(l.source))), 0) as free,
        min(l.expires_at) filter (where l.restriction is null and not public._is_free_source(l.source)) as paid_next,
        min(l.expires_at) filter (where not (l.restriction is null and not public._is_free_source(l.source))) as free_next
      from public.credit_lots l
      where l.remaining > 0 and l.expires_at > now()
        and (p_users is null or l.user_id = any (p_users))
      group by l.user_id
    ) s
  ), '[]'::jsonb);
end $$;

revoke all on function public.admin_credit_split(uuid[]) from public, anon;
grant execute on function public.admin_credit_split(uuid[]) to authenticated;
