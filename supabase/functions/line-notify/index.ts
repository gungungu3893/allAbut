// ================================================================
// line-notify — allAbut DB → LINE 알림 (영수증 스타일 카드)
// ================================================================
// Supabase Database Webhook 이 cnc_orders(INSERT·UPDATE), credit_history(INSERT), topup_requests(INSERT·UPDATE),
// account_deletion_requests(INSERT) 가 바뀔 때, 그리고 만료 예정 예약 작업(EXPIRY_REMINDER)이 이 함수를 불러요.
// 들어오는 값: { type: 'INSERT' | 'UPDATE', table, record, old_record }
//
// 보안: Verify JWT 는 끄고 배포해요. 대신 요청 헤더 x-notify-secret 이 NOTIFY_SECRET 과 같아야만 동작 (다르면 401)
// 비밀값은 Deno.env.get() 으로만 읽어요. SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 자동으로 넣어 주는 서버 전용 값.
// 버튼 링크·로고 이미지의 사이트 주소: Secrets 의 SITE_URL (없으면 https://allabut.com)
// 버튼 링크는 전부 siteLink() → {SITE_URL}/?openExternalBrowser=1#/… (휴대폰 기본 브라우저로 열림, 주문 카드는 그 주문으로 바로)
//
// ── 카드 모양: 모든 알림이 buildReceiptCard() 하나를 써요 (LINE MAN 영수증 같은 흰 카드) ──
//   1) 상단 가운데: 로고 아이콘(SITE_URL/assets/brand/line-icon.png) → 제목(종류별 색 글씨) → "allAbut · Order notice"
//      → (고객 알림 사본이면 "COPY OF CUSTOMER NOTICE") → 문서번호(주문·충전 요청 번호) → 날짜·시간(방콕) → 구분선
//   2) 섹션(있는 것만): Clinic(치과명 + 주소·전화) / Case(환자·납기) / Teeth("#36  Osstem  A2", 최대 6줄 + "+n more") / 이벤트별 상세
//   3) 합계(영수증의 Total 처럼): 작은 줄들 + 마지막 줄 크게 — 주문·크레딧은 "Credit balance 97", 충전은 "Total ฿21,935.00"
//   4) 하단: 테두리만 있는 버튼 1개 + 구분선 아래 "This is an automatic notification from allAbut." + 회사명 · Tax ID · allabut.com
//   altText(알림 미리보기) = "제목 · 문서번호" (사본은 앞에 "COPY · ")
//
// 관리자 알림 받는 곳 (sql/005_team.sql)
//   - admin_notify_targets 중 active 이고 그 카테고리를 고른 곳 전부 (LINE 그룹·사용자)
//       orders  : 주문 관련 / topups : 충전·환불 / account : 계정 삭제 요청 / customer_copy : 고객 알림 사본 (sql/006)
//   - 알림 대상이 하나도 없으면 예전처럼 LINE_ADMIN_USER_ID 로 (안전장치)
//   - 직원이 처리한 일(확인·디자인 업로드·가공·발송·완료 처리·관리자 취소·충전 승인/거절)은
//     연결된 그룹에만 "Confirmed by Ken" 카드 (LINE_ADMIN_USER_ID 로는 보내지 않아요)
//   - 고객 알림 사본: 고객에게 가는 알림은 고객 LINE 연결 여부와 상관없이 관리자에게도 사본 카드
//     (COPY OF CUSTOMER NOTICE 라벨, 고객 이메일, 처리자, LINE 미연결이면 빨간 글씨 + 전화번호)
//     사본에 처리자 이름이 들어가는 일은, 사본을 받는 그룹에 "Confirmed by Ken" 카드를 따로 보내지 않아요 (중복 방지)
//
// 관리자에게 (영어): 새 주문 / 고객 디자인 승인 / 수정 요청(사유) / 고객 수령 / 고객 취소 / 충전 요청 / 충전 취소 / 계정 삭제 요청
// 고객에게 (profiles.lang, 9개 언어, LINE 연결했을 때만): 확인 / 디자인 확인 요청 / 가공 / 발송 / 관리자 취소(환불 + 잔액)
//   / 크레딧 use·refund·adjust·charge·expire / 충전 거절 / 만료 예정
//
// 원칙
//   - UPDATE 인데 stage(또는 status) 가 안 바뀌었으면 아무것도 안 보내요 (중복 알림 방지)
//   - LINE 전송이 실패해도 console.error 로 남기고 200 을 돌려줘요 (DB 작업을 막지 않게)
//   - LINE Flex 의 text 는 빈 글자를 못 받아요 → 값이 빈 줄은 아예 빼요

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';
const LINE_ADMIN_USER_ID = Deno.env.get('LINE_ADMIN_USER_ID') ?? '';
const NOTIFY_SECRET = Deno.env.get('NOTIFY_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// LINE API 주소 (테스트용으로만 바꿔요. 보통은 비워 두면 https://api.line.me)
const LINE_API_BASE = Deno.env.get('LINE_API_BASE') ?? 'https://api.line.me';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// 사이트 주소: Supabase Secrets 에 SITE_URL 이 있으면 그것, 없으면 정식 도메인 (끝의 / 는 떼요)
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://allabut.com').replace(/\/+$/, '');
const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');

// 사이트로 가는 모든 링크는 이 함수로 만들어요 → LINE 안의 작은 브라우저 대신 휴대폰 기본 브라우저로 열려요
//   siteLink('/orders')               → https://allabut.com/?openExternalBrowser=1#/orders
//   siteLink('/orders?id=CA2611…')    → https://allabut.com/?openExternalBrowser=1#/orders?id=CA2611…
//   쿼리(openExternalBrowser)는 반드시 # 앞, 페이지 안의 값(주문번호)은 # 뒤에 둬요. 사이트가 열리면 주소창에서 openExternalBrowser 를 지워요
//   (LINE 친구추가 주소 line.me 는 이 함수를 쓰지 않아요)
function siteLink(path: string): string {
  let p = String(path || '/').trim().replace(/^#/, '');
  if (!p.startsWith('/')) p = '/' + p;
  return SITE_URL + '/?openExternalBrowser=1#' + p;
}
// 특정 주문으로 바로 가는 링크 (고객: 내 주문에서 그 주문 펼침 / 관리자: 주문 상세 창 열림)
function orderLink(orderId: unknown): string {
  return orderId ? siteLink('/orders?id=' + encodeURIComponent(String(orderId))) : siteLink('/orders');
}
function adminOrderLink(orderId: unknown): string {
  return orderId ? siteLink('/admin/orders?order=' + encodeURIComponent(String(orderId))) : siteLink('/admin/orders');
}
const SITE_ORDERS_URL = siteLink('/orders');
const SITE_ADMIN_URL = siteLink('/admin/orders');
const SITE_ADMIN_TOPUPS_URL = siteLink('/admin/topups');
const SITE_ADMIN_CUSTOMERS_URL = siteLink('/admin/customers');
const SITE_TOPUP_URL = siteLink('/topup');
const SITE_PROFILE_URL = siteLink('/profile');
// 카드 맨 위 로고 (사이트에 올라가 있는 공개 이미지, 192×192 PNG — assets/brand/line-icon.png)
const LOGO_URL = SITE_URL + '/assets/brand/line-icon.png';

// 영수증 카드 색
const INK = '#111827';     // 진한 글씨
const GRAY = '#6B7280';    // 회색 글씨
const LINE_GRAY = '#E5E7EB'; // 구분선
const NAVY = '#001D4A';    // 고객 알림 제목
const RED = '#B91C1C';     // 고객 취소·거절 제목, LINE 미연결 경고

// ================================================================
// 관리자 알림 종류별 제목 · 색 (색을 바꿀 때는 여기만 고치면 돼요)
// ================================================================
//   제목 글씨에만 색을 써요 (헤더를 색으로 채우지 않아요)
//   파랑 = 새 주문·주문 접수 / 초록 = 고객 승인·수령 / 주황 = 수정 요청 / 빨강 = 취소·계정 삭제
//   골드 = 충전 요청·충전 / 보라 = 환불·조정 / 회색 = 만료·만료 예정·충전 거절·충전 취소
//   청록 = 직원 처리 진행(확인·디자인 업로드·가공·발송·완료 처리)
//   ⚠️ 관리자 화면 범례 cnc/cnc-team.js 의 ADMIN_NOTICE_LEGEND 색과 같게 맞춰 주세요
const ADMIN_NOTICE_STYLES = {
  new_order:        { color: '#1D4ED8', icon: '🆕', label: 'NEW ORDER',        title: 'New order' },
  credits_used:     { color: '#1D4ED8', icon: '📝', label: 'ORDER RECEIVED',   title: 'Order received' },
  approved:         { color: '#15803D', icon: '✅', label: 'DESIGN APPROVED',  title: 'Design approved' },
  received:         { color: '#15803D', icon: '📦', label: 'RECEIVED',         title: 'Order received by customer' },
  revision:         { color: '#EA580C', icon: '✏️', label: 'REVISION REQUEST', title: 'Revision request' },
  cancelled:        { color: '#B91C1C', icon: '❌', label: 'ORDER CANCELLED',  title: 'Order cancelled' },
  account_deletion: { color: '#B91C1C', icon: '🗑', label: 'ACCOUNT DELETION', title: 'Account deletion request' },
  topup_request:    { color: '#B8860B', icon: '💰', label: 'TOP-UP REQUEST',   title: 'Top-up request' },
  topup_approved:   { color: '#B8860B', icon: '💰', label: 'TOP-UP APPROVED',  title: 'Top-up approved' },
  charge:           { color: '#B8860B', icon: '💳', label: 'CREDITS ADDED',    title: 'Credits added' },
  refund:           { color: '#7C3AED', icon: '↩️', label: 'REFUND',           title: 'Credits refunded' },
  adjust:           { color: '#7C3AED', icon: '➖', label: 'CREDIT ADJUSTED',  title: 'Credits adjusted' },
  expire:           { color: '#4B5563', icon: '⌛', label: 'CREDITS EXPIRED',  title: 'Credits expired' },
  expiry_reminder:  { color: '#4B5563', icon: '⏰', label: 'EXPIRY REMINDER',  title: 'Credits expiring soon' },
  topup_rejected:   { color: '#4B5563', icon: '🚫', label: 'TOP-UP REJECTED',  title: 'Top-up rejected' },
  topup_cancelled:  { color: '#4B5563', icon: '🚫', label: 'TOP-UP CANCELLED', title: 'Top-up cancelled' },
  order_confirmed:  { color: '#0E7490', icon: '✔', label: 'ORDER CONFIRMED',   title: 'Order confirmed' },
  design_uploaded:  { color: '#0E7490', icon: '🎨', label: 'DESIGN UPLOADED',  title: 'Design ready for review' },
  milling:          { color: '#0E7490', icon: '⚙️', label: 'MILLING STARTED',  title: 'Milling started' },
  shipped:          { color: '#0E7490', icon: '🚚', label: 'SHIPPED',          title: 'Order shipped' },
  marked_done:      { color: '#0E7490', icon: '📦', label: 'MARKED DELIVERED', title: 'Marked as delivered' },
};
type NoticeType = keyof typeof ADMIN_NOTICE_STYLES;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});


// ================================================================
// 고객 메시지 문구 (9개 언어, 없는 언어는 en) — 관리자·사본 카드는 en 을 써요
// ================================================================
type Texts = {
  open: string; order: string; patient: string; deadline: string; carrier: string; tracking: string;
  credits: string; refunded: string; reason: string;
  confirmed_title: string; confirmed_body: string;
  design_title: string; design_body: string;
  milling_title: string; milling_body: string;
  shipped_title: string; shipped_body: string;
  cancel_title: string; cancel_body: string;
  charge_title: string; charge_body: string;
  balance: string; used: string; amount: string;
  use_title: string; use_body: string;
  refund_title: string; refund_body: string;
  adjust_title: string; adjust_body: string;
  valid_until: string; request: string; total: string;
  expire_title: string; expire_body: string;
  reminder_title: string; reminder_body: string;
  topup_rejected_title: string; topup_rejected_body: string;
};

const T: Record<string, Texts> = {
  en: {
    open: 'Open allAbut', order: 'Order', patient: 'Patient', deadline: 'Deadline', carrier: 'Carrier', tracking: 'Tracking no.',
    credits: 'Credits', refunded: 'Refunded', reason: 'Reason',
    confirmed_title: '📋 Order confirmed', confirmed_body: 'We have confirmed your order and started the design.',
    design_title: '🎨 Please review your design', design_body: 'Your design is ready. Please open the website and press "Approve design" or "Request changes".',
    milling_title: '⚙️ Milling started', milling_body: 'Your abutments are now being milled. The order can no longer be cancelled.',
    shipped_title: '🚚 Your order has shipped', shipped_body: 'Please press "Received" on the website when the parcel arrives.',
    cancel_title: '❌ Order cancelled by allAbut', cancel_body: 'Your order was cancelled and the credits were returned to your balance.',
    charge_title: '💳 Credits added', charge_body: '{n} credits have been added to your balance.',
    balance: 'Balance', used: 'Credits used', amount: 'Amount',
    use_title: '📝 Order received', use_body: 'We received your order and used credits for it. You can follow the progress on the website.',
    refund_title: '↩️ Credits refunded', refund_body: '{n} credits have been returned to your balance.',
    adjust_title: '➖ Credits adjusted', adjust_body: 'Your credit balance has been adjusted by allAbut.',
    valid_until: 'Valid until', request: 'Request', total: 'Total',
    expire_title: '⌛ Credits expired', expire_body: '{n} credits have expired (12 months after top-up).',
    reminder_title: '⏰ {n} credits expire in {d} days', reminder_body: 'Please use them before {date}. Unused credits expire automatically.',
    topup_rejected_title: '⚠️ Top-up not approved', topup_rejected_body: 'We could not confirm your payment. Please check the reason below and submit again.',
  },
  ko: {
    open: 'allAbut 열기', order: '주문번호', patient: '환자', deadline: '납기', carrier: '택배사', tracking: '송장번호',
    credits: '크레딧', refunded: '환불', reason: '사유',
    confirmed_title: '📋 주문이 확인되었어요', confirmed_body: '주문을 확인하고 디자인을 시작했어요.',
    design_title: '🎨 디자인을 확인해 주세요', design_body: '디자인이 준비되었어요. 웹사이트에서 "디자인 승인" 또는 "수정 요청"을 눌러 주세요.',
    milling_title: '⚙️ 가공을 시작했어요', milling_body: '지대주 가공을 시작했어요. 이제 주문을 취소할 수 없어요.',
    shipped_title: '🚚 배송을 시작했어요', shipped_body: '택배를 받으시면 웹사이트에서 "수령 확인"을 눌러 주세요.',
    cancel_title: '❌ allAbut에서 주문을 취소했어요', cancel_body: '주문이 취소되고 크레딧이 환불되었어요.',
    charge_title: '💳 크레딧이 충전되었어요', charge_body: '크레딧 {n}개가 충전되었어요.',
    balance: '남은 잔액', used: '사용 크레딧', amount: '수량',
    use_title: '📝 주문 접수 완료', use_body: '주문이 접수되어 크레딧을 사용했어요. 주문 진행 상황은 웹사이트에서 확인할 수 있어요.',
    refund_title: '↩️ 크레딧 환불', refund_body: '크레딧 {n}개가 환불되었어요.',
    adjust_title: '➖ 크레딧 조정', adjust_body: 'allAbut에서 크레딧 잔액을 조정했어요.',
    valid_until: '유효기간', request: '요청번호', total: '총액',
    expire_title: '⌛ 크레딧이 만료되었어요', expire_body: '크레딧 {n}개가 만료되었어요 (충전 후 12개월).',
    reminder_title: '⏰ 크레딧 {n}개가 {d}일 후 만료돼요', reminder_body: '{date} 전에 사용해 주세요. 사용하지 않은 크레딧은 자동으로 소멸돼요.',
    topup_rejected_title: '⚠️ 충전이 승인되지 않았어요', topup_rejected_body: '입금을 확인하지 못했어요. 아래 사유를 확인하고 다시 신청해 주세요.',
  },
  th: {
    open: 'เปิด allAbut', order: 'คำสั่งงาน', patient: 'ผู้ป่วย', deadline: 'กำหนดส่ง', carrier: 'บริษัทขนส่ง', tracking: 'เลขพัสดุ',
    credits: 'เครดิต', refunded: 'คืนเครดิต', reason: 'เหตุผล',
    confirmed_title: '📋 ยืนยันคำสั่งงานแล้ว', confirmed_body: 'เราได้ยืนยันคำสั่งงานและเริ่มออกแบบแล้ว',
    design_title: '🎨 กรุณาตรวจแบบ', design_body: 'แบบพร้อมแล้ว กรุณาเปิดเว็บไซต์แล้วกด "อนุมัติแบบ" หรือ "ขอแก้ไข"',
    milling_title: '⚙️ เริ่มมิลลิ่งแล้ว', milling_body: 'เริ่มผลิต Abutment แล้ว ไม่สามารถยกเลิกคำสั่งงานได้อีก',
    shipped_title: '🚚 จัดส่งแล้ว', shipped_body: 'เมื่อได้รับพัสดุ กรุณากด "ได้รับแล้ว" บนเว็บไซต์',
    cancel_title: '❌ allAbut ยกเลิกคำสั่งงาน', cancel_body: 'คำสั่งงานถูกยกเลิกและคืนเครดิตเข้าบัญชีแล้ว',
    charge_title: '💳 เติมเครดิตแล้ว', charge_body: 'เติมเครดิต {n} เครดิตเข้าบัญชีแล้ว',
    balance: 'ยอดคงเหลือ', used: 'เครดิตที่ใช้', amount: 'จำนวน',
    use_title: '📝 ได้รับคำสั่งงานแล้ว', use_body: 'เราได้รับคำสั่งงานและหักเครดิตแล้ว สามารถติดตามความคืบหน้าได้บนเว็บไซต์',
    refund_title: '↩️ คืนเครดิตแล้ว', refund_body: 'คืนเครดิต {n} เครดิตเข้าบัญชีแล้ว',
    adjust_title: '➖ ปรับเครดิต', adjust_body: 'allAbut ได้ปรับยอดเครดิตของคุณ',
    valid_until: 'ใช้ได้ถึง', request: 'คำขอ', total: 'ยอดรวม',
    expire_title: '⌛ เครดิตหมดอายุ', expire_body: 'เครดิต {n} เครดิตหมดอายุแล้ว (12 เดือนหลังเติม)',
    reminder_title: '⏰ เครดิต {n} เครดิตจะหมดอายุใน {d} วัน', reminder_body: 'กรุณาใช้ก่อนวันที่ {date} เครดิตที่ไม่ได้ใช้จะหมดอายุอัตโนมัติ',
    topup_rejected_title: '⚠️ ไม่อนุมัติการเติมเครดิต', topup_rejected_body: 'เราไม่สามารถยืนยันการชำระเงินได้ กรุณาตรวจสอบเหตุผลด้านล่างแล้วส่งใหม่อีกครั้ง',
  },
  zh: {
    open: '打开 allAbut', order: '订单号', patient: '患者', deadline: '交期', carrier: '快递公司', tracking: '运单号',
    credits: '积分', refunded: '已退还', reason: '原因',
    confirmed_title: '📋 订单已确认', confirmed_body: '我们已确认您的订单并开始设计。',
    design_title: '🎨 请审核设计', design_body: '设计已完成。请打开网站点击“批准设计”或“要求修改”。',
    milling_title: '⚙️ 已开始加工', milling_body: '基台已开始 CNC 加工，订单无法再取消。',
    shipped_title: '🚚 订单已发货', shipped_body: '收到包裹后，请在网站上点击“已收货”。',
    cancel_title: '❌ allAbut 已取消订单', cancel_body: '您的订单已取消，积分已退还。',
    charge_title: '💳 积分已充值', charge_body: '已为您充值 {n} 积分。',
    balance: '剩余积分', used: '使用积分', amount: '数量',
    use_title: '📝 订单已受理', use_body: '我们已收到您的订单并扣除积分。您可以在网站上查看订单进度。',
    refund_title: '↩️ 积分已退还', refund_body: '已退还 {n} 积分到您的账户。',
    adjust_title: '➖ 积分已调整', adjust_body: 'allAbut 已调整您的积分余额。',
    valid_until: '有效期至', request: '申请号', total: '总额',
    expire_title: '⌛ 积分已过期', expire_body: '{n} 积分已过期（充值后 12 个月）。',
    reminder_title: '⏰ {n} 积分将在 {d} 天后过期', reminder_body: '请在 {date} 前使用。未使用的积分将自动失效。',
    topup_rejected_title: '⚠️ 充值未通过', topup_rejected_body: '我们无法确认您的付款。请查看以下原因后重新提交。',
  },
  vi: {
    open: 'Mở allAbut', order: 'Đơn hàng', patient: 'Bệnh nhân', deadline: 'Hạn giao', carrier: 'Đơn vị vận chuyển', tracking: 'Mã vận đơn',
    credits: 'Tín dụng', refunded: 'Đã hoàn', reason: 'Lý do',
    confirmed_title: '📋 Đơn hàng đã được xác nhận', confirmed_body: 'Chúng tôi đã xác nhận đơn hàng và bắt đầu thiết kế.',
    design_title: '🎨 Vui lòng duyệt thiết kế', design_body: 'Thiết kế đã sẵn sàng. Vui lòng mở trang web và nhấn "Phê duyệt thiết kế" hoặc "Yêu cầu chỉnh sửa".',
    milling_title: '⚙️ Đã bắt đầu phay', milling_body: 'Abutment đang được phay. Đơn hàng không thể hủy nữa.',
    shipped_title: '🚚 Đơn hàng đã được gửi', shipped_body: 'Khi nhận được hàng, vui lòng nhấn "Đã nhận" trên trang web.',
    cancel_title: '❌ allAbut đã hủy đơn hàng', cancel_body: 'Đơn hàng đã bị hủy và tín dụng đã được hoàn lại.',
    charge_title: '💳 Đã nạp tín dụng', charge_body: 'Đã nạp {n} tín dụng vào tài khoản của bạn.',
    balance: 'Số dư', used: 'Tín dụng đã dùng', amount: 'Số lượng',
    use_title: '📝 Đã nhận đơn hàng', use_body: 'Chúng tôi đã nhận đơn hàng và trừ tín dụng. Bạn có thể theo dõi tiến độ trên trang web.',
    refund_title: '↩️ Đã hoàn tín dụng', refund_body: 'Đã hoàn {n} tín dụng vào tài khoản của bạn.',
    adjust_title: '➖ Điều chỉnh tín dụng', adjust_body: 'allAbut đã điều chỉnh số dư tín dụng của bạn.',
    valid_until: 'Hiệu lực đến', request: 'Yêu cầu', total: 'Tổng cộng',
    expire_title: '⌛ Tín dụng đã hết hạn', expire_body: '{n} tín dụng đã hết hạn (12 tháng sau khi nạp).',
    reminder_title: '⏰ {n} tín dụng sẽ hết hạn sau {d} ngày', reminder_body: 'Vui lòng sử dụng trước {date}. Tín dụng chưa dùng sẽ tự động hết hạn.',
    topup_rejected_title: '⚠️ Yêu cầu nạp không được duyệt', topup_rejected_body: 'Chúng tôi không xác nhận được thanh toán. Vui lòng xem lý do bên dưới và gửi lại.',
  },
  es: {
    open: 'Abrir allAbut', order: 'Pedido', patient: 'Paciente', deadline: 'Fecha límite', carrier: 'Transportista', tracking: 'N.º de seguimiento',
    credits: 'Créditos', refunded: 'Reembolsados', reason: 'Motivo',
    confirmed_title: '📋 Pedido confirmado', confirmed_body: 'Hemos confirmado su pedido y comenzado el diseño.',
    design_title: '🎨 Revise su diseño', design_body: 'Su diseño está listo. Abra el sitio web y pulse "Aprobar diseño" o "Solicitar cambios".',
    milling_title: '⚙️ Fresado iniciado', milling_body: 'Sus pilares se están fresando. El pedido ya no se puede cancelar.',
    shipped_title: '🚚 Su pedido ha sido enviado', shipped_body: 'Cuando reciba el paquete, pulse "Recibido" en el sitio web.',
    cancel_title: '❌ Pedido cancelado por allAbut', cancel_body: 'Su pedido fue cancelado y los créditos se devolvieron a su saldo.',
    charge_title: '💳 Créditos añadidos', charge_body: 'Se han añadido {n} créditos a su saldo.',
    balance: 'Saldo', used: 'Créditos usados', amount: 'Cantidad',
    use_title: '📝 Pedido recibido', use_body: 'Recibimos su pedido y se descontaron los créditos. Puede seguir el progreso en el sitio web.',
    refund_title: '↩️ Créditos reembolsados', refund_body: 'Se devolvieron {n} créditos a su saldo.',
    adjust_title: '➖ Créditos ajustados', adjust_body: 'allAbut ajustó su saldo de créditos.',
    valid_until: 'Válido hasta', request: 'Solicitud', total: 'Total',
    expire_title: '⌛ Créditos vencidos', expire_body: '{n} créditos han vencido (12 meses después de la recarga).',
    reminder_title: '⏰ {n} créditos vencen en {d} días', reminder_body: 'Úselos antes del {date}. Los créditos no usados vencen automáticamente.',
    topup_rejected_title: '⚠️ Recarga no aprobada', topup_rejected_body: 'No pudimos confirmar su pago. Revise el motivo y envíelo de nuevo.',
  },
  tr: {
    open: 'allAbut\'u aç', order: 'Sipariş', patient: 'Hasta', deadline: 'Teslim tarihi', carrier: 'Kargo firması', tracking: 'Takip no.',
    credits: 'Kredi', refunded: 'İade edildi', reason: 'Neden',
    confirmed_title: '📋 Sipariş onaylandı', confirmed_body: 'Siparişinizi onayladık ve tasarıma başladık.',
    design_title: '🎨 Lütfen tasarımı inceleyin', design_body: 'Tasarımınız hazır. Lütfen web sitesini açıp "Tasarımı onayla" veya "Değişiklik iste" düğmesine basın.',
    milling_title: '⚙️ Frezeleme başladı', milling_body: 'Abutment\'larınız frezeleniyor. Sipariş artık iptal edilemez.',
    shipped_title: '🚚 Siparişiniz kargoya verildi', shipped_body: 'Paket elinize ulaşınca web sitesinde "Teslim aldım" düğmesine basın.',
    cancel_title: '❌ Sipariş allAbut tarafından iptal edildi', cancel_body: 'Siparişiniz iptal edildi ve krediler bakiyenize iade edildi.',
    charge_title: '💳 Kredi yüklendi', charge_body: 'Bakiyenize {n} kredi yüklendi.',
    balance: 'Kalan bakiye', used: 'Kullanılan kredi', amount: 'Miktar',
    use_title: '📝 Sipariş alındı', use_body: 'Siparişinizi aldık ve krediler düşüldü. Siparişin durumunu web sitesinden takip edebilirsiniz.',
    refund_title: '↩️ Kredi iade edildi', refund_body: 'Bakiyenize {n} kredi iade edildi.',
    adjust_title: '➖ Kredi düzeltmesi', adjust_body: 'allAbut kredi bakiyenizi düzeltti.',
    valid_until: 'Geçerlilik', request: 'Talep', total: 'Toplam',
    expire_title: '⌛ Kredilerin süresi doldu', expire_body: '{n} kredinin süresi doldu (yüklemeden 12 ay sonra).',
    reminder_title: '⏰ {n} kredinin süresi {d} gün içinde dolacak', reminder_body: 'Lütfen bu tarihten önce kullanın: {date}. Kullanılmayan krediler otomatik olarak silinir.',
    topup_rejected_title: '⚠️ Kredi yükleme onaylanmadı', topup_rejected_body: 'Ödemenizi doğrulayamadık. Lütfen aşağıdaki nedeni kontrol edip tekrar gönderin.',
  },
  ar: {
    open: 'فتح allAbut', order: 'الطلب', patient: 'المريض', deadline: 'موعد التسليم', carrier: 'شركة الشحن', tracking: 'رقم التتبع',
    credits: 'الرصيد', refunded: 'المسترد', reason: 'السبب',
    confirmed_title: '📋 تم تأكيد الطلب', confirmed_body: 'أكدنا طلبك وبدأنا التصميم.',
    design_title: '🎨 يرجى مراجعة التصميم', design_body: 'التصميم جاهز. يرجى فتح الموقع والضغط على "الموافقة على التصميم" أو "طلب تعديلات".',
    milling_title: '⚙️ بدأ التفريز', milling_body: 'بدأ تفريز الدعامات. لم يعد بالإمكان إلغاء الطلب.',
    shipped_title: '🚚 تم شحن طلبك', shipped_body: 'عند وصول الطرد، يرجى الضغط على "تم الاستلام" في الموقع.',
    cancel_title: '❌ ألغت allAbut الطلب', cancel_body: 'تم إلغاء طلبك وإعادة الرصيد إلى حسابك.',
    charge_title: '💳 تمت إضافة رصيد', charge_body: 'تمت إضافة {n} رصيد إلى حسابك.',
    balance: 'الرصيد المتبقي', used: 'الرصيد المستخدم', amount: 'الكمية',
    use_title: '📝 تم استلام الطلب', use_body: 'استلمنا طلبك وتم خصم الرصيد. يمكنك متابعة تقدم الطلب على الموقع.',
    refund_title: '↩️ تم استرداد الرصيد', refund_body: 'تمت إعادة {n} رصيد إلى حسابك.',
    adjust_title: '➖ تعديل الرصيد', adjust_body: 'قامت allAbut بتعديل رصيدك.',
    valid_until: 'صالح حتى', request: 'الطلب', total: 'الإجمالي',
    expire_title: '⌛ انتهت صلاحية الرصيد', expire_body: 'انتهت صلاحية {n} رصيد (بعد 12 شهرًا من الشحن).',
    reminder_title: '⏰ ستنتهي صلاحية {n} رصيد خلال {d} يوم', reminder_body: 'يرجى استخدامه قبل {date}. ينتهي الرصيد غير المستخدم تلقائيًا.',
    topup_rejected_title: '⚠️ لم تتم الموافقة على الشحن', topup_rejected_body: 'لم نتمكن من تأكيد الدفع. يرجى مراجعة السبب أدناه والإرسال مرة أخرى.',
  },
  fa: {
    open: 'باز کردن allAbut', order: 'سفارش', patient: 'بیمار', deadline: 'مهلت تحویل', carrier: 'شرکت حمل', tracking: 'کد رهگیری',
    credits: 'اعتبار', refunded: 'بازگردانده شد', reason: 'دلیل',
    confirmed_title: '📋 سفارش تأیید شد', confirmed_body: 'سفارش شما را تأیید کردیم و طراحی را شروع کردیم.',
    design_title: '🎨 لطفاً طراحی را بررسی کنید', design_body: 'طراحی آماده است. لطفاً سایت را باز کنید و «تأیید طراحی» یا «درخواست اصلاح» را بزنید.',
    milling_title: '⚙️ فرزکاری شروع شد', milling_body: 'فرزکاری اباتمنت‌ها شروع شد. دیگر امکان لغو سفارش وجود ندارد.',
    shipped_title: '🚚 سفارش شما ارسال شد', shipped_body: 'وقتی بسته رسید، لطفاً در سایت «دریافت شد» را بزنید.',
    cancel_title: '❌ allAbut سفارش را لغو کرد', cancel_body: 'سفارش شما لغو شد و اعتبار به حساب شما بازگردانده شد.',
    charge_title: '💳 اعتبار افزوده شد', charge_body: '{n} اعتبار به حساب شما افزوده شد.',
    balance: 'اعتبار باقی‌مانده', used: 'اعتبار مصرف‌شده', amount: 'مقدار',
    use_title: '📝 سفارش دریافت شد', use_body: 'سفارش شما دریافت شد و اعتبار کسر شد. پیشرفت سفارش را می‌توانید در سایت ببینید.',
    refund_title: '↩️ اعتبار بازگردانده شد', refund_body: '{n} اعتبار به حساب شما بازگردانده شد.',
    adjust_title: '➖ اصلاح اعتبار', adjust_body: 'allAbut اعتبار حساب شما را اصلاح کرد.',
    valid_until: 'معتبر تا', request: 'درخواست', total: 'مبلغ کل',
    expire_title: '⌛ اعتبار منقضی شد', expire_body: '{n} اعتبار منقضی شد (12 ماه پس از شارژ).',
    reminder_title: '⏰ {n} اعتبار تا {d} روز دیگر منقضی می‌شود', reminder_body: 'لطفاً پیش از {date} استفاده کنید. اعتبار استفاده‌نشده خودکار حذف می‌شود.',
    topup_rejected_title: '⚠️ شارژ تأیید نشد', topup_rejected_body: 'پرداخت شما تأیید نشد. لطفاً دلیل زیر را بررسی و دوباره ارسال کنید.',
  },
};

function texts(lang: unknown): Texts {
  return (typeof lang === 'string' && T[lang]) ? T[lang] : T.en;
}

// 영수증 카드 문구 (9개 언어, 없는 언어는 en)
type ReceiptTexts = {
  notice_order: string; notice_credit: string; notice_topup: string;
  sec_clinic: string; sec_case: string; sec_teeth: string; sec_details: string; sec_shipping: string;
  more: string; credit_balance: string; subtotal: string; vat: string; paid: string;
  view_order: string; view_credits: string; view_topup: string; auto_note: string;
  added: string; adjusted: string; expired: string; package: string; unit_price: string;
};
const R: Record<string, ReceiptTexts> = {
  en: {
    notice_order: 'Order notice', notice_credit: 'Credit notice', notice_topup: 'Top-up notice',
    sec_clinic: 'Clinic', sec_case: 'Case', sec_teeth: 'Teeth', sec_details: 'Details', sec_shipping: 'Shipping',
    more: '+{n} more', credit_balance: 'Credit balance', subtotal: 'Subtotal', vat: 'VAT {r}%', paid: 'Paid',
    view_order: 'View order', view_credits: 'View credits', view_topup: 'View top-up', auto_note: 'This is an automatic notification from allAbut.',
    added: 'Credits added', adjusted: 'Adjusted', expired: 'Expired', package: 'Package', unit_price: 'Unit price',
  },
  ko: {
    notice_order: '주문 알림', notice_credit: '크레딧 알림', notice_topup: '충전 알림',
    sec_clinic: '치과', sec_case: '케이스', sec_teeth: '치아', sec_details: '상세', sec_shipping: '배송',
    more: '+{n}개 더', credit_balance: '크레딧 잔액', subtotal: '공급가액', vat: 'VAT {r}%', paid: '결제 금액',
    view_order: '주문 보기', view_credits: '크레딧 보기', view_topup: '충전 내역 보기', auto_note: 'allAbut 자동 알림입니다.',
    added: '충전 크레딧', adjusted: '조정', expired: '만료', package: '패키지', unit_price: '단가',
  },
  th: {
    notice_order: 'แจ้งเตือนคำสั่งงาน', notice_credit: 'แจ้งเตือนเครดิต', notice_topup: 'แจ้งเตือนการเติมเครดิต',
    sec_clinic: 'คลินิก', sec_case: 'เคส', sec_teeth: 'ซี่ฟัน', sec_details: 'รายละเอียด', sec_shipping: 'การจัดส่ง',
    more: '+อีก {n} รายการ', credit_balance: 'เครดิตคงเหลือ', subtotal: 'ยอดก่อน VAT', vat: 'VAT {r}%', paid: 'ยอดชำระ',
    view_order: 'ดูคำสั่งงาน', view_credits: 'ดูเครดิต', view_topup: 'ดูการเติมเครดิต', auto_note: 'นี่คือการแจ้งเตือนอัตโนมัติจาก allAbut',
    added: 'เครดิตที่เติม', adjusted: 'ปรับปรุง', expired: 'หมดอายุ', package: 'แพ็กเกจ', unit_price: 'ราคาต่อหน่วย',
  },
  zh: {
    notice_order: '订单通知', notice_credit: '积分通知', notice_topup: '充值通知',
    sec_clinic: '诊所', sec_case: '病例', sec_teeth: '牙位', sec_details: '详情', sec_shipping: '配送',
    more: '另有 {n} 项', credit_balance: '积分余额', subtotal: '小计', vat: '增值税 {r}%', paid: '已付金额',
    view_order: '查看订单', view_credits: '查看积分', view_topup: '查看充值', auto_note: '这是 allAbut 的自动通知。',
    added: '充值积分', adjusted: '调整', expired: '过期', package: '套餐', unit_price: '单价',
  },
  vi: {
    notice_order: 'Thông báo đơn hàng', notice_credit: 'Thông báo tín dụng', notice_topup: 'Thông báo nạp tín dụng',
    sec_clinic: 'Phòng khám', sec_case: 'Ca', sec_teeth: 'Răng', sec_details: 'Chi tiết', sec_shipping: 'Giao hàng',
    more: '+{n} mục khác', credit_balance: 'Số dư tín dụng', subtotal: 'Tạm tính', vat: 'VAT {r}%', paid: 'Đã thanh toán',
    view_order: 'Xem đơn hàng', view_credits: 'Xem tín dụng', view_topup: 'Xem yêu cầu nạp', auto_note: 'Đây là thông báo tự động từ allAbut.',
    added: 'Tín dụng đã nạp', adjusted: 'Điều chỉnh', expired: 'Hết hạn', package: 'Gói', unit_price: 'Đơn giá',
  },
  es: {
    notice_order: 'Aviso de pedido', notice_credit: 'Aviso de créditos', notice_topup: 'Aviso de recarga',
    sec_clinic: 'Clínica', sec_case: 'Caso', sec_teeth: 'Dientes', sec_details: 'Detalles', sec_shipping: 'Envío',
    more: '+{n} más', credit_balance: 'Saldo de créditos', subtotal: 'Subtotal', vat: 'IVA {r}%', paid: 'Pagado',
    view_order: 'Ver pedido', view_credits: 'Ver créditos', view_topup: 'Ver recarga', auto_note: 'Esta es una notificación automática de allAbut.',
    added: 'Créditos añadidos', adjusted: 'Ajuste', expired: 'Vencidos', package: 'Paquete', unit_price: 'Precio unitario',
  },
  tr: {
    notice_order: 'Sipariş bildirimi', notice_credit: 'Kredi bildirimi', notice_topup: 'Yükleme bildirimi',
    sec_clinic: 'Klinik', sec_case: 'Vaka', sec_teeth: 'Dişler', sec_details: 'Ayrıntılar', sec_shipping: 'Kargo',
    more: '+{n} daha', credit_balance: 'Kredi bakiyesi', subtotal: 'Ara toplam', vat: 'KDV %{r}', paid: 'Ödenen',
    view_order: 'Siparişi görüntüle', view_credits: 'Kredileri görüntüle', view_topup: 'Yüklemeyi görüntüle', auto_note: 'Bu, allAbut\'tan otomatik bir bildirimdir.',
    added: 'Yüklenen kredi', adjusted: 'Düzeltme', expired: 'Süresi doldu', package: 'Paket', unit_price: 'Birim fiyat',
  },
  ar: {
    notice_order: 'إشعار طلب', notice_credit: 'إشعار رصيد', notice_topup: 'إشعار شحن الرصيد',
    sec_clinic: 'العيادة', sec_case: 'الحالة', sec_teeth: 'الأسنان', sec_details: 'التفاصيل', sec_shipping: 'الشحن',
    more: '+{n} أخرى', credit_balance: 'الرصيد المتبقي', subtotal: 'المجموع الفرعي', vat: 'ضريبة القيمة المضافة {r}%', paid: 'المدفوع',
    view_order: 'عرض الطلب', view_credits: 'عرض الرصيد', view_topup: 'عرض الشحن', auto_note: 'هذا إشعار تلقائي من allAbut.',
    added: 'الرصيد المضاف', adjusted: 'تعديل', expired: 'منتهي', package: 'الباقة', unit_price: 'سعر الوحدة',
  },
  fa: {
    notice_order: 'اعلان سفارش', notice_credit: 'اعلان اعتبار', notice_topup: 'اعلان شارژ',
    sec_clinic: 'کلینیک', sec_case: 'کیس', sec_teeth: 'دندان‌ها', sec_details: 'جزئیات', sec_shipping: 'ارسال',
    more: '+{n} مورد دیگر', credit_balance: 'موجودی اعتبار', subtotal: 'جمع جزء', vat: 'مالیات {r}%', paid: 'پرداخت‌شده',
    view_order: 'مشاهده سفارش', view_credits: 'مشاهده اعتبار', view_topup: 'مشاهده شارژ', auto_note: 'این یک اعلان خودکار از allAbut است.',
    added: 'اعتبار افزوده', adjusted: 'اصلاح', expired: 'منقضی', package: 'بسته', unit_price: 'قیمت واحد',
  },
};

function rtexts(lang: unknown): ReceiptTexts {
  return (typeof lang === 'string' && R[lang]) ? R[lang] : R.en;
}

// 관리자·사본 카드용 영어 문구 묶음
const EN = { x: T.en, r: R.en };
type Lang = { x: Texts; r: ReceiptTexts };
function langOf(lang: unknown): Lang { return { x: texts(lang), r: rtexts(lang) }; }


// ================================================================
// 도구
// ================================================================
type Row = [string, string];

// 글자 정리 (빈 값이면 빈 글자)
function str(v: unknown, max = 300): string {
  return String(v ?? '').trim().slice(0, max);
}

// 문구 앞의 이모지·기호 떼기 ("📋 Order confirmed" → "Order confirmed") — 영수증 제목은 글자만
function plainTitle(s: string): string {
  return String(s || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

// 값이 있는 줄만
function rowsOf(rows: Row[]): Row[] {
  return rows.filter((r) => str(r[0]) && str(r[1]));
}

function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 날짜 'YYYY-MM-DD' (방콕 시간)
function ymd(v: unknown): string {
  const d = new Date(String(v ?? ''));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

// 영수증 날짜·시간 (방콕): "10 NOV 2026 / 08:59 AM"
function stamp(v?: unknown): string {
  let d = v ? new Date(String(v)) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  }).formatToParts(d)) p[x.type] = x.value;
  return `${p.day} ${String(p.month).toUpperCase()} ${p.year} / ${p.hour}:${p.minute} ${String(p.dayPeriod || '').toUpperCase()}`;
}

// 금액: 21935 → "฿21,935.00"
function baht(v: unknown): string {
  const n = Number(v ?? 0);
  return '฿' + (isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// VAT 비율 (vat_amount / subtotal) → 7
function vatRate(subtotal: unknown, vat: unknown): number {
  const s = Number(subtotal || 0), v = Number(vat || 0);
  return s > 0 ? Math.round((v / s) * 100) : 7;
}

function signed(n: number): string {
  return (n > 0 ? '+' : '') + String(n);
}

function lastEntry(history: unknown): any {
  return Array.isArray(history) && history.length ? history[history.length - 1] : null;
}

// 관리자 취소인지: 마지막 두 줄 안에 관리자 취소 기록이 있으면
function isAdminCancel(history: unknown): boolean {
  if (!Array.isArray(history) || !history.length) return false;
  const tail = history.slice(-2);
  return tail.some((h: any) => h && (h.action === 'admin_cancelled' || (h.by === 'admin' && /cancel/.test(String(h.action || '')))));
}

// 관리자 취소 사유
function adminCancelReason(history: unknown): string {
  if (!Array.isArray(history)) return '';
  const h = history.slice().reverse().find((e: any) => e && e.action === 'admin_cancelled');
  return h ? str(h.note) : '';
}

// 가장 최근 수정 요청 사유
function lastRevisionNote(history: unknown): string {
  if (!Array.isArray(history)) return '';
  for (let i = history.length - 1; i >= 0; i--) {
    const h: any = history[i];
    if (h && h.action === 'rejected') return str(h.note);
  }
  const last = lastEntry(history);
  return last ? str(last.note) : '';
}

// 주문의 치아 목록 [{ tooth, brand, color }] (cases[0].teeth)
function orderTeeth(o: any): { tooth: string; brand: string; shade: string }[] {
  const c = Array.isArray(o?.cases) ? o.cases[0] : null;
  const list = c && Array.isArray(c.teeth) ? c.teeth : [];
  return list.map((t: any) => ({
    tooth: str(t?.tooth ?? t?.number, 4),
    brand: str(t?.brand, 40),
    shade: str(t?.color ?? t?.shade, 12),
  })).filter((t: any) => t.tooth);
}


// ================================================================
// 영수증 카드 (모든 알림이 이것 하나를 써요)
// ================================================================
type ClinicInfo = {
  name: string;                 // 굵게
  lines?: string[];             // 주소·전화·이메일 (회색 작은 글씨)
  warning?: string[];           // 빨간 작은 글씨 (사본: 고객 LINE 미연결)
  info?: string;                // 회색 작은 글씨 한 줄 (사본: 고객 LINE 으로 보냄)
};
type Section = {
  title?: string;
  clinic?: ClinicInfo;
  rows?: Row[];                 // 라벨 왼쪽 회색 / 값 오른쪽 진한 글씨
  teeth?: { tooth: string; brand: string; shade: string }[];
  moreTpl?: string;             // "+{n} more"
  text?: string;                // 긴 글 (예: 수정 요청 사유)
};
type ReceiptOpts = {
  title: string;                // 알림 종류 이름 (색 글씨)
  color: string;
  subtitle: string;             // "allAbut · Order notice"
  copyLabel?: string;           // "COPY OF CUSTOMER NOTICE"
  docNo?: string;               // 주문번호 · 충전 요청 번호
  when?: unknown;               // 날짜·시간 (없으면 지금)
  message?: string;             // 짧은 안내 글
  sections: Section[];
  totals?: { rows?: Row[]; final?: Row };
  button: { label: string; url: string };
  autoNote: string;             // "This is an automatic notification from allAbut."
  company: string;              // "allAbut Co., Ltd. · Tax ID 0105… · allabut.com"
  altPrefix?: string;           // altText 앞 (사본: "COPY · ")
};

function textNode(text: string, o: Record<string, unknown> = {}) {
  return { type: 'text', text: str(text, 1000) || '—', wrap: true, ...o };
}

// 라벨 ─ 값 한 줄 (값은 오른쪽 정렬)
function kvRow(label: string, value: string, o: { big?: boolean; color?: string } = {}) {
  return {
    type: 'box', layout: 'horizontal', spacing: 'md', margin: o.big ? 'md' : 'sm',
    contents: [
      textNode(label, { size: o.big ? 'md' : 'sm', color: o.big ? INK : GRAY, weight: o.big ? 'bold' : 'regular', flex: o.big ? 1 : 5, gravity: 'center' }),
      // 마지막 큰 줄(합계·잔액)의 값은 글자 너비만큼 (flex 0) → 금액이 두 줄로 꺾이지 않아요
      o.big
        ? { type: 'text', text: str(value, 40) || '—', size: 'xl', color: o.color || INK, weight: 'bold', align: 'end', flex: 0, gravity: 'center' }
        : textNode(value, { size: 'sm', color: o.color || INK, weight: 'bold', align: 'end', flex: 5, gravity: 'center' }),
    ],
  };
}

function sectionNodes(s: Section): any[] {
  const out: any[] = [];
  const body: any[] = [];
  if (s.clinic) {
    body.push(textNode(s.clinic.name, { size: 'sm', weight: 'bold', color: INK }));
    for (const l of (s.clinic.lines || []).filter((x) => str(x))) body.push(textNode(l, { size: 'xs', color: GRAY, margin: 'xs' }));
    for (const w of (s.clinic.warning || []).filter((x) => str(x))) body.push(textNode(w, { size: 'xs', color: RED, weight: 'bold', margin: 'sm' }));
    if (s.clinic.info) body.push(textNode(s.clinic.info, { size: 'xs', color: GRAY, margin: 'sm' }));
  }
  for (const [k, v] of rowsOf(s.rows || [])) body.push(kvRow(k, v));
  if (s.teeth && s.teeth.length) {
    const shown = s.teeth.slice(0, 6);
    for (const t of shown) {
      body.push({
        type: 'box', layout: 'horizontal', spacing: 'md', margin: 'sm',
        contents: [
          textNode('#' + t.tooth, { size: 'sm', weight: 'bold', color: INK, flex: 2 }),
          textNode(t.brand || '—', { size: 'sm', color: INK, flex: 6 }),
          textNode(t.shade || '—', { size: 'sm', color: INK, weight: 'bold', align: 'end', flex: 2 }),
        ],
      });
    }
    if (s.teeth.length > shown.length) {
      body.push(textNode((s.moreTpl || '+{n} more').replace('{n}', String(s.teeth.length - shown.length)), { size: 'xs', color: GRAY, margin: 'sm' }));
    }
  }
  if (s.text) body.push(textNode(s.text, { size: 'sm', color: INK, margin: 'sm' }));
  if (!body.length) return out;
  if (s.title) out.push(textNode(s.title, { size: 'sm', weight: 'bold', color: INK, margin: 'lg' }));
  out.push({ type: 'box', layout: 'vertical', margin: s.title ? 'sm' : 'lg', contents: body });
  return out;
}

function buildReceiptCard(o: ReceiptOpts) {
  const top: any[] = [
    { type: 'image', url: LOGO_URL, size: '48px', aspectRatio: '1:1', aspectMode: 'cover', align: 'center' },
    textNode(o.title, { size: 'lg', weight: 'bold', color: o.color, align: 'center', margin: 'md' }),
    textNode(o.subtitle, { size: 'xs', color: GRAY, align: 'center', margin: 'xs' }),
  ];
  if (o.copyLabel) top.push(textNode(o.copyLabel, { size: 'xxs', color: GRAY, weight: 'bold', align: 'center', margin: 'lg' }));
  if (o.docNo) top.push(textNode(o.docNo, { size: 'md', weight: 'bold', color: INK, align: 'center', margin: o.copyLabel ? 'xs' : 'lg' }));
  top.push(textNode(stamp(o.when), { size: 'xs', color: GRAY, align: 'center', margin: 'xs' }));

  const body: any[] = [...top, { type: 'separator', margin: 'lg', color: LINE_GRAY }];
  if (o.message) body.push(textNode(o.message, { size: 'sm', color: INK, margin: 'lg' }));
  for (const s of o.sections) body.push(...sectionNodes(s));

  const tRows = rowsOf(o.totals?.rows || []);
  const final = o.totals?.final && str(o.totals.final[1]) ? o.totals.final : null;
  if (tRows.length || final) {
    body.push({ type: 'separator', margin: 'lg', color: LINE_GRAY });
    for (const [k, v] of tRows) body.push(kvRow(k, v));
    if (final) {
      if (tRows.length) body.push({ type: 'separator', margin: 'md', color: LINE_GRAY });
      body.push(kvRow(final[0], final[1], { big: true }));
    }
  }

  const footer = {
    type: 'box', layout: 'vertical', paddingTop: '0px',
    contents: [
      // 테두리만 있는 버튼 (Flex 기본 버튼은 테두리 모양이 없어서 상자 + 동작으로 만들어요)
      {
        type: 'box', layout: 'vertical', borderWidth: '1px', borderColor: '#D1D5DB', cornerRadius: '8px', paddingAll: '12px',
        action: { type: 'uri', label: str(o.button.label, 40) || 'Open', uri: o.button.url },
        contents: [textNode(o.button.label, { size: 'sm', weight: 'bold', color: INK, align: 'center' })],
      },
      { type: 'separator', margin: 'lg', color: LINE_GRAY },
      textNode(o.autoNote, { size: 'xxs', color: GRAY, align: 'center', margin: 'md' }),
      textNode(o.company, { size: 'xxs', color: GRAY, align: 'center', margin: 'xs' }),
    ],
  };

  const alt = (o.altPrefix || '') + o.title + (o.docNo ? ' · ' + o.docNo : '');
  return {
    type: 'flex',
    altText: str(alt, 380) || 'allAbut',
    contents: {
      type: 'bubble', size: 'mega',
      styles: { body: { backgroundColor: '#FFFFFF' }, footer: { backgroundColor: '#FFFFFF' } },
      body: { type: 'box', layout: 'vertical', paddingAll: '20px', contents: body },
      footer,
    },
  };
}


// ================================================================
// DB 읽기
// ================================================================
type Profile = { line_user_id: string | null; lang: string | null; clinic_name?: string | null; nickname?: string | null; phone?: string | null; address?: string | null };

async function getProfile(userId: string): Promise<Profile | null> {
  if (!userId) return null;
  const { data, error } = await db.from('profiles').select('line_user_id, lang, clinic_name, nickname, phone, address').eq('id', userId).maybeSingle();
  if (error) { console.error('profile read failed', error); return null; }
  return data;
}

// LINE 사용자 id 모양이면 연결된 것
function isLinkedProfile(p: Profile | null): boolean {
  return !!(p && typeof p.line_user_id === 'string' && /^U[0-9a-f]{32}$/.test(p.line_user_id));
}

function profileName(p: Profile | null, userId: string): string {
  return str((p && (p.clinic_name || p.nickname)) || '') || String(userId || '').slice(0, 8);
}

// 남은 잔액 (credit_wallets). 못 읽으면 null
async function getBalance(userId: string): Promise<number | null> {
  if (!userId) return null;
  const { data, error } = await db.from('credit_wallets').select('balance').eq('user_id', userId).maybeSingle();
  if (error) { console.error('balance read failed', error); return null; }
  return data ? Number(data.balance ?? 0) : 0;
}

async function getOrder(orderId: unknown): Promise<any | null> {
  if (!orderId) return null;
  const { data, error } = await db.from('cnc_orders').select('*').eq('id', String(orderId)).maybeSingle();
  if (error) { console.error('order read failed', error); return null; }
  return data;
}

// 회사 정보 (카드 맨 아래 줄) — 5분 동안 기억
let _company: { at: number; line: string } | null = null;
async function companyLine(): Promise<string> {
  if (_company && Date.now() - _company.at < 5 * 60 * 1000) return _company.line;
  let name = '', tax = '';
  try {
    const { data, error } = await db.from('company_settings').select('company_name, tax_id').eq('id', 1).maybeSingle();
    if (!error && data) { name = str(data.company_name, 120); tax = str(data.tax_id, 40); }
  } catch (err) {
    console.error('company read failed', err);
  }
  const line = [name || 'allAbut', tax ? 'Tax ID ' + tax : '', SITE_HOST].filter(Boolean).join(' · ');
  _company = { at: Date.now(), line };
  return line;
}

// 고객 이메일 (auth.users, 서버 관리 키). 못 읽으면 빈 글자
async function customerEmail(userId: string): Promise<string> {
  if (!userId) return '';
  try {
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (error) { console.error('email read failed', error.message || error); return ''; }
    return String(data?.user?.email || '');
  } catch (err) {
    console.error('email read error', err);
    return '';
  }
}

// 처리자 이름 (팀 이름 → 닉네임). 모르면 빈 글자
async function memberName(userId: unknown): Promise<string> {
  if (!userId || typeof userId !== 'string') return '';
  const a = await db.from('admins').select('display_name').eq('user_id', userId).maybeSingle();
  const name = str(a.data?.display_name);
  if (name) return name;
  const p = await getProfile(userId);
  return str(p?.nickname);
}

// 크레딧 묶음 만료일
async function getLotExpiry(lotId: unknown): Promise<string> {
  if (!lotId) return '';
  const { data, error } = await db.from('credit_lots').select('expires_at').eq('id', String(lotId)).maybeSingle();
  if (error || !data) return '';
  return ymd(data.expires_at);
}

// 충전 묶음이면 그 충전 요청 (보너스 지급이면 null)
async function lotTopup(lotId: unknown): Promise<any | null> {
  if (!lotId) return null;
  const { data } = await db.from('credit_lots').select('topup_id, source').eq('id', String(lotId)).maybeSingle();
  if (!data || !data.topup_id) return null;
  const t = await db.from('topup_requests').select('*').eq('id', String(data.topup_id)).maybeSingle();
  return t.data ? t.data : { id: String(data.topup_id), reviewed_by: null };
}

// 관리자 취소로 생긴 환불인지 (그때는 "관리자 취소" 카드에 이미 들어가서 따로 보내지 않아요)
async function isAdminCancelRefund(orderId: string): Promise<boolean> {
  const o = await getOrder(orderId);
  return !!o && o.stage === 'cancelled' && isAdminCancel(o.review_history);
}


// ================================================================
// LINE 보내기 · 관리자 알림 대상
// ================================================================
async function push(to: string, message: unknown): Promise<void> {
  if (!/^[UCR][0-9a-f]{32}$/.test(to)) return;   // 사용자(U) · 그룹(C) · 여러 명 채팅(R)
  try {
    const res = await fetch(LINE_API_BASE + '/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN },
      body: JSON.stringify({ to, messages: [message] }),
    });
    if (!res.ok) console.error('LINE push failed', res.status, await res.text());
  } catch (err) {
    console.error('LINE push error', err);
  }
}

type Category = 'orders' | 'topups' | 'account' | 'customer_copy';

// 이 카테고리 관리자 알림을 받을 곳 (LINE id 목록)
//   teamOnly = true  → 연결된 그룹·대상에만 (안전장치 LINE_ADMIN_USER_ID 로는 안 보냄)
async function adminTargets(cat: Category, teamOnly = false): Promise<string[]> {
  const fallback = teamOnly || !LINE_ADMIN_USER_ID ? [] : [LINE_ADMIN_USER_ID];
  const { data, error } = await db.from('admin_notify_targets').select('line_id, categories').eq('active', true);
  if (error) {
    console.error('notify targets read failed', error.message || error);   // 005 를 아직 실행 안 했으면 표가 없어요 → 예전처럼
    return fallback;
  }
  const rows: any[] = data ?? [];
  if (!rows.length) return fallback;
  return rows
    .filter((r) => Array.isArray(r.categories) && r.categories.includes(cat))
    .map((r) => String(r.line_id || ''))
    .filter(Boolean);
}

async function pushAdmins(cat: Category, message: unknown, teamOnly = false, except: string[] = []): Promise<void> {
  const targets = await adminTargets(cat, teamOnly);
  for (const to of targets) {
    if (except.includes(to)) continue;   // 이미 사본으로 같은 일을 받은 곳은 빼요
    await push(to, message);
  }
}


// ================================================================
// 카드 내용 만들기 (주문 · 크레딧 · 충전) — 관리자·사본은 EN, 고객은 고객 언어
// ================================================================
// 사본 정보 (관리자에게 가는 고객 알림 사본)
type CopyInfo = { name: string; email: string; linked: boolean; phone: string; actor: string };

// 공통 꼬리 (자동 알림 문구 + 회사 줄)
async function footerOf(L: Lang) {
  return { autoNote: L.r.auto_note, company: await companyLine() };
}

// Clinic 섹션: 주문이면 주문의 치과·주소·전화, 아니면 프로필. 사본이면 이메일 + LINE 연결 상태
function clinicSection(L: Lang, name: string, lines: string[], copy?: CopyInfo): Section {
  const c: ClinicInfo = { name: name || '—', lines: [...lines] };
  if (copy) {
    if (copy.email) c.lines!.push(copy.email);
    if (!copy.linked) c.warning = ['Customer LINE not connected — please contact directly' + (copy.phone ? ' · ' + copy.phone : '')];
    else c.info = 'Sent to customer LINE';
  }
  return { title: L.r.sec_clinic, clinic: c };
}

// 주문 영수증
//   details: 이벤트별 정보 (송장·수정 요청 사유·취소 사유·처리자)
//   refunded: 취소 → 환불 줄
async function orderReceipt(L: Lang, o: any, opt: {
  title: string; color: string; message?: string; details?: Section; refunded?: boolean; balance?: number | null;
  copy?: CopyInfo; button: { label: string; url: string }; when?: unknown;
}) {
  const sections: Section[] = [
    clinicSection(L, str(o.clinic) || (opt.copy ? opt.copy.name : ''), [str(o.addr), str(o.phone)], opt.copy),
    { title: L.r.sec_case, rows: [[L.x.patient, str(o.patient, 60)], [L.x.deadline, str(o.deadline, 20)]] },
    { title: L.r.sec_teeth, teeth: orderTeeth(o), moreTpl: L.r.more },
  ];
  if (opt.details) sections.push(opt.details);
  const used = Number(o.credits_used ?? o.teeth_count ?? 0);
  const tRows: Row[] = [[L.x.used, String(used)]];
  if (opt.refunded) tRows.push([L.x.refunded, '+' + used]);
  return buildReceiptCard({
    title: opt.title, color: opt.color, subtitle: 'allAbut · ' + L.r.notice_order,
    copyLabel: opt.copy ? 'COPY OF CUSTOMER NOTICE' : undefined, altPrefix: opt.copy ? 'COPY · ' : '',
    docNo: str(o.id, 40), when: opt.when, message: opt.message, sections,
    totals: { rows: tRows, final: [L.r.credit_balance, opt.balance == null ? '' : String(opt.balance)] },
    button: opt.button, ...(await footerOf(L)),
  });
}

// 충전 요청 영수증 (패키지 · 공급가액 · VAT · 합계)
async function topupReceipt(L: Lang, rec: any, p: Profile | null, opt: {
  title: string; color: string; message?: string; details?: Row[]; copy?: CopyInfo; button: { label: string; url: string }; when?: unknown;
}) {
  const sections: Section[] = [
    clinicSection(L, profileName(p, rec.user_id), [str(p?.address), str(p?.phone)], opt.copy),
    {
      title: L.r.sec_details,
      rows: [[L.r.package, String(rec.credits ?? '') + ' ' + (L.x === T.en ? 'credits' : L.x.credits)], [L.r.unit_price, rec.unit_price != null ? baht(rec.unit_price) : ''], ...(opt.details || [])],
    },
  ];
  const tRows: Row[] = [];
  if (rec.subtotal != null) tRows.push([L.r.subtotal, baht(rec.subtotal)]);
  if (rec.vat_amount != null) tRows.push([L.r.vat.replace('{r}', String(vatRate(rec.subtotal, rec.vat_amount))), baht(rec.vat_amount)]);
  return buildReceiptCard({
    title: opt.title, color: opt.color, subtitle: 'allAbut · ' + L.r.notice_topup,
    copyLabel: opt.copy ? 'COPY OF CUSTOMER NOTICE' : undefined, altPrefix: opt.copy ? 'COPY · ' : '',
    docNo: str(rec.id, 40), when: opt.when, message: opt.message, sections,
    totals: { rows: tRows, final: [L.x.total, baht(rec.total)] },
    button: opt.button, ...(await footerOf(L)),
  });
}

// 크레딧 영수증 (use · refund · adjust · charge · expire · 만료 예정)
async function creditReceipt(L: Lang, opt: {
  title: string; color: string; message?: string; docNo?: string; userId: string; p: Profile | null; order?: any | null;
  details?: Row[]; amounts: Row[]; balance: number | null; copy?: CopyInfo; button: { label: string; url: string }; when?: unknown;
}) {
  const o = opt.order;
  const sections: Section[] = [
    o ? clinicSection(L, str(o.clinic) || profileName(opt.p, opt.userId), [str(o.addr), str(o.phone)], opt.copy)
      : clinicSection(L, profileName(opt.p, opt.userId), [str(opt.p?.address), str(opt.p?.phone)], opt.copy),
  ];
  if (o) {
    sections.push({ title: L.r.sec_case, rows: [[L.x.patient, str(o.patient, 60)], [L.x.deadline, str(o.deadline, 20)]] });
    sections.push({ title: L.r.sec_teeth, teeth: orderTeeth(o), moreTpl: L.r.more });
  }
  if (opt.details && rowsOf(opt.details).length) sections.push({ title: L.r.sec_details, rows: opt.details });
  return buildReceiptCard({
    title: opt.title, color: opt.color, subtitle: 'allAbut · ' + L.r.notice_credit,
    copyLabel: opt.copy ? 'COPY OF CUSTOMER NOTICE' : undefined, altPrefix: opt.copy ? 'COPY · ' : '',
    docNo: opt.docNo, when: opt.when, message: opt.message, sections,
    totals: { rows: opt.amounts, final: [L.r.credit_balance, opt.balance == null ? '' : String(opt.balance)] },
    button: opt.button, ...(await footerOf(L)),
  });
}

// 고객 카드 제목 색: 네이비, 취소·거절만 빨강
function customerColor(kind: string): string {
  return kind === 'cancel' || kind === 'topup_rejected' ? RED : NAVY;
}


// ================================================================
// 고객 알림 사본 보내기 (관리자용, 영어) → 사본을 받은 곳 목록
// ================================================================
//   build: CopyInfo 를 받아 카드를 만드는 함수 (주문·크레딧·충전 영수증을 그대로 재사용)
async function sendCustomerCopy(userId: string, p: Profile | null, actor: string, build: (c: CopyInfo) => Promise<unknown>): Promise<string[]> {
  const targets = await adminTargets('customer_copy');
  if (!targets.length) return [];
  const copy: CopyInfo = {
    name: profileName(p, userId), email: await customerEmail(userId), linked: isLinkedProfile(p),
    phone: str(p?.phone), actor,
  };
  const message = await build(copy);
  for (const to of targets) await push(to, message);
  return targets;
}

// 사본 상세 줄에 처리자 추가
function withActor(rows: Row[], actor: string): Row[] {
  return actor ? [...rows, ['Handled by', actor]] : rows;
}


// ================================================================
// 주문 → 관리자 (영어)
// ================================================================
async function notifyAdmin(type: NoticeType, o: any, opt: { message?: string; details?: Section; refunded?: boolean } = {}): Promise<void> {
  const st = ADMIN_NOTICE_STYLES[type];
  const balance = await getBalance(o.user_id);
  await pushAdmins('orders', await orderReceipt(EN, o, {
    title: st.title, color: st.color, message: opt.message, details: opt.details, refunded: opt.refunded, balance,
    button: { label: 'Open admin', url: adminOrderLink(o.id) }, when: type === 'new_order' ? o.created_at : undefined,
  }));
}

// 직원이 처리한 주문 일 → 연결된 그룹에만 (예: "Confirmed by Ken")
const TEAM_ACTION_TITLES: Record<string, string> = {
  confirmed: 'Confirmed by {name}',
  design_ready: 'Design uploaded by {name}',
  milling: 'Milling started by {name}',
  shipped: 'Shipped by {name}',
  done: 'Marked as delivered by {name}',
  cancelled: 'Cancelled & refunded by {name}',
};
const TEAM_ACTION_TYPES: Record<string, NoticeType> = {
  confirmed: 'order_confirmed', design_ready: 'design_uploaded', milling: 'milling',
  shipped: 'shipped', done: 'marked_done', cancelled: 'cancelled',
};

// 이번 변경에서 관리자가 새로 붙인 기록의 처리자 이름 (없으면 빈 글자)
function newAdminActorName(record: any, old: any): string {
  const now = Array.isArray(record?.review_history) ? record.review_history : [];
  const before = Array.isArray(old?.review_history) ? old.review_history.length : now.length;
  for (let i = now.length - 1; i >= before; i--) {
    const h: any = now[i];
    if (h && h.by === 'admin' && h.by_name) return String(h.by_name);
  }
  return '';
}

async function notifyTeamAction(record: any, old: any, except: string[] = []): Promise<void> {
  const tpl = TEAM_ACTION_TITLES[record.stage];
  const name = newAdminActorName(record, old);
  if (!tpl || !name) return;
  const title = tpl.replace('{name}', str(name, 60));
  const last = lastEntry(record.review_history);
  const rows: Row[] = [];
  if (record.stage === 'shipped') rows.push([EN.x.carrier, str(record.carrier)], [EN.x.tracking, str(record.tracking_number)]);
  if (last && last.note) rows.push(['Note', str(last.note)]);
  const balance = await getBalance(record.user_id);
  await pushAdmins('orders', await orderReceipt(EN, record, {
    title, color: ADMIN_NOTICE_STYLES[TEAM_ACTION_TYPES[record.stage]].color,
    details: rows.length ? { title: record.stage === 'shipped' ? EN.r.sec_shipping : EN.r.sec_details, rows } : undefined,
    refunded: record.stage === 'cancelled', balance,
    button: { label: 'Open admin', url: adminOrderLink(record.id) },
  }), true, except);
}


// ================================================================
// 주문 → 고객 (고객 언어) + 관리자 사본
// ================================================================
type OrderKind = 'confirmed' | 'design' | 'milling' | 'shipped' | 'cancel';
const COPY_ORDER_TYPES: Record<OrderKind, NoticeType> = {
  confirmed: 'order_confirmed', design: 'design_uploaded', milling: 'milling', shipped: 'shipped', cancel: 'cancelled',
};
const ORDER_TEXT_KEYS: Record<OrderKind, [keyof Texts, keyof Texts]> = {
  confirmed: ['confirmed_title', 'confirmed_body'], design: ['design_title', 'design_body'], milling: ['milling_title', 'milling_body'],
  shipped: ['shipped_title', 'shipped_body'], cancel: ['cancel_title', 'cancel_body'],
};

// 이벤트별 상세 섹션 (송장 / 취소 사유)
function orderDetails(L: Lang, o: any, kind: OrderKind, extra: Row[] = []): Section | undefined {
  if (kind === 'shipped') return { title: L.r.sec_shipping, rows: [[L.x.carrier, str(o.carrier)], [L.x.tracking, str(o.tracking_number)], ...extra] };
  const rows: Row[] = [];
  if (kind === 'cancel') rows.push([L.x.reason, adminCancelReason(o.review_history)]);
  rows.push(...extra);
  return rowsOf(rows).length ? { title: L.r.sec_details, rows } : undefined;
}

// 주문 단계 알림 → 고객(연결돼 있으면) + 관리자 사본. 사본을 받은 곳 목록을 돌려줘요
async function notifyCustomer(o: any, kind: OrderKind, actor = ''): Promise<string[]> {
  const p = await getProfile(o.user_id);
  const balance = await getBalance(o.user_id);
  const [tk, bk] = ORDER_TEXT_KEYS[kind];

  // 고객 (고객 언어) — LINE 연결했을 때만
  if (isLinkedProfile(p) && p) {
    const L = langOf(p.lang);
    await push(p.line_user_id as string, await orderReceipt(L, o, {
      title: plainTitle(L.x[tk]), color: customerColor(kind), message: L.x[bk],
      details: orderDetails(L, o, kind), refunded: kind === 'cancel', balance,
      button: { label: L.r.view_order, url: orderLink(o.id) },
    }));
  }

  // 관리자 사본 (영어)
  const st = ADMIN_NOTICE_STYLES[COPY_ORDER_TYPES[kind]];
  return await sendCustomerCopy(o.user_id, p, actor, async (copy) => orderReceipt(EN, o, {
    title: st.title, color: st.color, details: orderDetails(EN, o, kind, withActor([], copy.actor)),
    refunded: kind === 'cancel', balance, copy,
    button: { label: 'Open admin', url: adminOrderLink(o.id) },
  }));
}


// ================================================================
// 크레딧 이력 (credit_history INSERT) → 고객 + 관리자 사본
// ================================================================
//   use    주문 접수 (주문 영수증 모양: 치과·케이스·치아 + 사용 크레딧 + 잔액)
//   refund 환불 (관리자 취소로 생긴 환불은 제외 — "관리자 취소" 카드에 이미 들어가요)
//   adjust 조정 / charge 충전 (충전 요청이면 결제 금액·처리자) / expire 만료
const CREDIT_TYPES: Record<string, NoticeType> = {
  use: 'credits_used', refund: 'refund', adjust: 'adjust', charge: 'charge', expire: 'expire',
};

async function notifyCredit(h: any): Promise<void> {
  const type = String(h.type || '');
  const amount = Number(h.amount || 0);
  if (!CREDIT_TYPES[type]) return;
  if (type === 'expire' && amount >= 0) return;
  if (type === 'charge' && amount <= 0) return;
  if (type === 'refund' && await isAdminCancelRefund(h.order_id)) return;

  const p = await getProfile(h.user_id);
  const balance = await getBalance(h.user_id);
  const abs = Math.abs(amount);
  const desc = str(h.description, 300);
  const exp = type === 'charge' ? await getLotExpiry(h.lot_id) : '';
  const order = (type === 'use' || type === 'refund') && h.order_id ? await getOrder(h.order_id) : null;
  const topup = type === 'charge' ? await lotTopup(h.lot_id) : null;
  const docNo = str(h.order_id) || (topup ? str(topup.id) : '');

  // 금액 줄 (언어별 라벨)
  const amounts = (L: Lang): Row[] => {
    if (type === 'use') return [[L.x.used, String(abs)]];
    if (type === 'refund') return [[L.x.refunded, '+' + abs]];
    if (type === 'adjust') return [[L.r.adjusted, signed(amount)]];
    if (type === 'expire') return [[L.r.expired, '-' + abs]];
    const rows: Row[] = [[L.r.added, '+' + abs]];
    if (topup && topup.total != null) rows.push([L.r.paid, baht(topup.total)]);
    return rows;
  };
  const details = (L: Lang, admin: boolean): Row[] => {
    const rows: Row[] = [];
    if (type === 'charge' && exp) rows.push([L.x.valid_until, exp]);
    // 충전 요청으로 생긴 충전은 메모가 "Top-up TP…" 라서 문서번호와 겹쳐요 → 빼요
    if (type === 'adjust' || type === 'expire' || (type === 'charge' && !topup)) rows.push([admin ? 'Note' : L.x.reason, desc]);
    if (admin && type === 'charge' && !topup) rows.push(['Type', 'Bonus (added by admin)']);
    return rows;
  };

  // 고객 (고객 언어) — LINE 연결했을 때만
  if (isLinkedProfile(p) && p) {
    const L = langOf(p.lang);
    const t: Record<string, [string, string]> = {
      use: [L.x.use_title, L.x.use_body],
      refund: [L.x.refund_title, L.x.refund_body.replace('{n}', String(abs))],
      adjust: [L.x.adjust_title, L.x.adjust_body],
      expire: [L.x.expire_title, L.x.expire_body.replace('{n}', String(abs))],
      charge: [L.x.charge_title, L.x.charge_body.replace('{n}', String(abs))],
    };
    await push(p.line_user_id as string, await creditReceipt(L, {
      title: plainTitle(t[type][0]), color: NAVY, message: t[type][1], docNo, userId: h.user_id, p, order,
      details: details(L, false), amounts: amounts(L), balance, when: h.created_at,
      button: h.order_id ? { label: L.r.view_order, url: orderLink(h.order_id) } : { label: L.r.view_credits, url: SITE_PROFILE_URL },
    }));
  }

  // 관리자 사본 (영어)
  const st = ADMIN_NOTICE_STYLES[CREDIT_TYPES[type]];
  let actor = '';
  let url = SITE_ADMIN_CUSTOMERS_URL;
  if (topup) { actor = await memberName(topup.reviewed_by); url = SITE_ADMIN_TOPUPS_URL; }
  if (h.order_id) url = adminOrderLink(h.order_id);
  await sendCustomerCopy(h.user_id, p, actor, async (copy) => creditReceipt(EN, {
    title: st.title, color: st.color, docNo, userId: h.user_id, p, order,
    details: withActor(details(EN, true), copy.actor), amounts: amounts(EN), balance, copy, when: h.created_at,
    button: { label: 'Open admin', url },
  }));
}


// ================================================================
// 충전 요청 (topup_requests)
// ================================================================
//   INSERT             → 관리자: 충전 요청
//   approved/rejected  → 직원이 처리했으면 연결된 그룹에 "Top-up approved by Ken"
//   rejected           → 고객: 충전 거절 + 사유 (+ 관리자 사본)
//   cancelled          → 관리자
//   (승인은 credit_history 'charge' 로 고객에게 충전 알림이 가요)
async function handleTopup(type: string, rec: any, old: any): Promise<void> {
  if (type === 'INSERT') {
    const p = await getProfile(rec.user_id);
    const st = ADMIN_NOTICE_STYLES.topup_request;
    await pushAdmins('topups', await topupReceipt(EN, rec, p, {
      title: st.title, color: st.color, message: 'Please check the payment slip and approve or reject.',
      button: { label: 'Open admin', url: SITE_ADMIN_TOPUPS_URL }, when: rec.created_at,
    }));
    return;
  }
  if (type !== 'UPDATE') return;
  if (!rec.status || old?.status === rec.status) return;   // 상태가 안 바뀌었으면 보내지 않아요
  const p = await getProfile(rec.user_id);

  // 직원이 승인·거절 → 연결된 그룹에만 (사본을 받는 그룹은 빼요 — 사본에 처리자 이름이 들어가서)
  if (rec.status === 'approved' || rec.status === 'rejected') {
    const name = await memberName(rec.reviewed_by);
    if (name) {
      const st = ADMIN_NOTICE_STYLES[rec.status === 'approved' ? 'topup_approved' : 'topup_rejected'];
      const title = (rec.status === 'approved' ? 'Top-up approved by ' : 'Top-up rejected by ') + str(name, 60);
      const copyTargets = await adminTargets('customer_copy', true);
      await pushAdmins('topups', await topupReceipt(EN, rec, p, {
        title, color: st.color, details: rec.status === 'rejected' ? [[EN.x.reason, str(rec.reject_reason)]] : [],
        button: { label: 'Open admin', url: SITE_ADMIN_TOPUPS_URL }, when: rec.reviewed_at,
      }), true, copyTargets);
    }
  }

  if (rec.status === 'rejected') {
    if (isLinkedProfile(p) && p) {
      const L = langOf(p.lang);
      await push(p.line_user_id as string, await topupReceipt(L, rec, p, {
        title: plainTitle(L.x.topup_rejected_title), color: customerColor('topup_rejected'), message: L.x.topup_rejected_body,
        details: [[L.x.reason, str(rec.reject_reason)]],
        button: { label: L.r.view_topup, url: SITE_TOPUP_URL }, when: rec.reviewed_at,
      }));
    }
    const st = ADMIN_NOTICE_STYLES.topup_rejected;
    await sendCustomerCopy(rec.user_id, p, await memberName(rec.reviewed_by), async (copy) => topupReceipt(EN, rec, p, {
      title: st.title, color: st.color, details: withActor([[EN.x.reason, str(rec.reject_reason)]], copy.actor), copy,
      button: { label: 'Open admin', url: SITE_ADMIN_TOPUPS_URL }, when: rec.reviewed_at,
    }));
    return;
  }
  if (rec.status === 'cancelled') {
    const st = ADMIN_NOTICE_STYLES.topup_cancelled;
    await pushAdmins('topups', await topupReceipt(EN, rec, p, {
      title: st.title, color: st.color, message: 'The customer cancelled this top-up request.',
      button: { label: 'Open admin', url: SITE_ADMIN_TOPUPS_URL },
    }));
  }
}


// ================================================================
// 만료 예정 (예약 작업): { type: 'EXPIRY_REMINDER', user_id, days, lots: [{ id, remaining, expires_at }] }
// ================================================================
async function handleReminder(payload: any): Promise<void> {
  const lots = Array.isArray(payload.lots) ? payload.lots : [];
  const n = lots.reduce((sum: number, l: any) => sum + Number(l?.remaining || 0), 0);
  if (!payload.user_id || n <= 0) return;
  const p = await getProfile(payload.user_id);
  const first = lots.map((l: any) => String(l?.expires_at || '')).filter(Boolean).sort()[0];
  const date = ymd(first);
  const days = first ? Math.max(1, Math.ceil((new Date(first).getTime() - Date.now()) / 86400000)) : Number(payload.days || 0);
  const balance = await getBalance(payload.user_id);
  if (isLinkedProfile(p) && p) {
    const L = langOf(p.lang);
    await push(p.line_user_id as string, await creditReceipt(L, {
      title: plainTitle(L.x.reminder_title.replace('{n}', String(n)).replace('{d}', String(days))), color: NAVY,
      message: L.x.reminder_body.replace('{date}', date), userId: payload.user_id, p,
      details: [[L.x.credits, String(n)], [L.x.valid_until, date]], amounts: [], balance,
      button: { label: L.r.view_credits, url: SITE_PROFILE_URL },
    }));
  }
  const st = ADMIN_NOTICE_STYLES.expiry_reminder;
  await sendCustomerCopy(payload.user_id, p, '', async (copy) => creditReceipt(EN, {
    title: n + ' credits expire in ' + days + ' days', color: st.color, userId: payload.user_id, p,
    details: [['Credits', String(n)], ['Valid until', date]], amounts: [], balance, copy,
    button: { label: 'Open admin', url: SITE_ADMIN_CUSTOMERS_URL },
  }));
}


// ================================================================
// 계정 삭제 요청 (account_deletion_requests INSERT) → 관리자 (영어)
// ================================================================
async function handleDeletionRequest(rec: any): Promise<void> {
  const p = await getProfile(rec.user_id);
  const balance = await getBalance(rec.user_id);
  const email = await customerEmail(rec.user_id);
  const { count } = await db.from('cnc_orders').select('id', { count: 'exact', head: true })
    .eq('user_id', rec.user_id).not('stage', 'in', '(done,cancelled)');
  const st = ADMIN_NOTICE_STYLES.account_deletion;
  await pushAdmins('account', buildReceiptCard({
    title: st.title, color: st.color, subtitle: 'allAbut · Account notice', docNo: profileName(p, rec.user_id), when: rec.created_at,
    message: 'Check open orders, remaining credits and tax records before deleting the account (Admin → Customers).',
    sections: [
      { title: 'Clinic', clinic: { name: profileName(p, rec.user_id), lines: [email, str(p?.address), str(p?.phone)] } },
      { title: 'Details', rows: [['Open orders', String(count ?? 0)], ['Reason', str(rec.reason)]] },
    ],
    totals: { final: ['Credit balance', String(balance ?? 0)] },
    button: { label: 'Open admin', url: SITE_ADMIN_CUSTOMERS_URL },
    autoNote: R.en.auto_note, company: await companyLine(),
  }));
}


// ================================================================
// 이벤트 → 알림
// ================================================================
async function handle(payload: any): Promise<void> {
  const { type, table, record, old_record } = payload ?? {};

  if (type === 'EXPIRY_REMINDER') { await handleReminder(payload); return; }
  if (!record) return;

  if (table === 'topup_requests') { await handleTopup(type, record, old_record); return; }
  if (table === 'account_deletion_requests') { if (type === 'INSERT') await handleDeletionRequest(record); return; }
  if (table === 'credit_history') { if (type === 'INSERT') await notifyCredit(record); return; }
  if (table !== 'cnc_orders') return;

  // 새 주문 → 관리자만 (고객에게는 credit_history 'use' 로 "주문 접수"를 보내요 — 중복 방지)
  if (type === 'INSERT') {
    await notifyAdmin('new_order', record);
    return;
  }

  if (type !== 'UPDATE') return;
  const from = old_record?.stage;
  const to = record.stage;
  if (!to || from === to) return;   // 단계가 안 바뀌었으면 보내지 않아요

  const actor = newAdminActorName(record, old_record);   // 이번 변경을 한 직원 이름 (사본에 넣어요)
  let copied: string[] = [];   // 사본을 받은 곳 → 그곳에는 "… by 이름" 카드를 따로 안 보내요

  switch (to) {
    // 관리자에게
    case 'approved':
      await notifyAdmin('approved', record, { message: 'Customer approved the design. You can start milling.' });
      break;
    case 'design_revision':
      await notifyAdmin('revision', record, {
        message: 'Customer requested design changes.',
        details: { title: 'Change request', text: lastRevisionNote(record.review_history) || '—' },
      });
      break;
    case 'done': {
      const last = lastEntry(record.review_history);
      if (last && last.action === 'marked_done') break;   // 관리자가 직접 완료 처리한 경우는 알리지 않아요
      await notifyAdmin('received', record, { message: 'Customer confirmed receipt of the order.' });
      break;
    }
    case 'cancelled':
      if (isAdminCancel(record.review_history)) copied = await notifyCustomer(record, 'cancel', actor);
      else await notifyAdmin('cancelled', record, { message: 'Customer cancelled the order. Credits were returned.', refunded: true });
      break;

    // 고객에게 (+ 관리자 사본)
    case 'confirmed': copied = await notifyCustomer(record, 'confirmed', actor); break;
    case 'design_ready': copied = await notifyCustomer(record, 'design', actor); break;
    case 'milling': copied = await notifyCustomer(record, 'milling', actor); break;
    case 'shipped': copied = await notifyCustomer(record, 'shipped', actor); break;
  }

  // 직원이 처리한 일 → 연결된 그룹에 "… by 이름" (사본을 이미 받은 그룹은 빼요)
  await notifyTeamAction(record, old_record, copied);
}


// ================================================================
// 입구
// ================================================================
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });
  if (!safeEqual(req.headers.get('x-notify-secret') ?? '', NOTIFY_SECRET)) {
    return new Response('unauthorized', { status: 401 });
  }
  try {
    const payload = await req.json();
    await handle(payload);
  } catch (err) {
    console.error('line-notify failed', err);   // 실패해도 200 (DB 작업을 막지 않게)
  }
  return new Response('ok', { status: 200 });
});
