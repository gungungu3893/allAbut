// ================================================================
// line-notify — allAbut DB → LINE 알림
// ================================================================
// Supabase Database Webhook 이 cnc_orders(INSERT·UPDATE), credit_history(INSERT) 가 바뀔 때 이 함수를 불러요.
// 들어오는 값: { type: 'INSERT' | 'UPDATE', table, record, old_record }
//
// 보안: Verify JWT 는 끄고 배포해요. 대신 요청 헤더 x-notify-secret 이 NOTIFY_SECRET 과 같아야만 동작 (다르면 401)
// 비밀값은 Deno.env.get() 으로만 읽어요. SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 자동으로 넣어 주는 서버 전용 값.
//
// 관리자(LINE_ADMIN_USER_ID)에게 (영어)
//   - 새 주문(INSERT)            🆕
//   - stage → approved           ✅ 고객이 디자인 승인
//   - stage → design_revision    ✏️ 수정 요청 + 사유
//   - stage → done               📦 고객 수령 완료 (관리자가 직접 "Mark as delivered" 한 경우는 보내지 않음)
//   - stage → cancelled (고객 취소) ❌
// 고객(profiles.line_user_id, 연결 안 했으면 안 보냄)에게 (profiles.lang 언어, 9개 언어)
//   - confirmed / design_ready / milling / shipped / 관리자 취소(환불 + 남은 잔액)
//   - credit_history INSERT: use(주문 접수) / refund(환불) / adjust(조정) / charge(충전) — 모두 남은 잔액 포함
//     (관리자 취소로 생긴 환불은 위 "관리자 취소" 카드에 이미 들어가서 따로 보내지 않아요)
//   - credit_history 'expire': ⌛ 크레딧 만료 / 'charge' 에는 유효기간(만료일) 표시
//   - topup_requests: INSERT → 관리자 💰 / rejected → 고객 (사유) / cancelled → 관리자
//   - { type: 'EXPIRY_REMINDER', user_id, days, lots } (예약 작업) → 고객 ⏰ n개가 d일 후 만료
//   - account_deletion_requests INSERT → 관리자 🗑 계정 삭제 요청 (진행 중 주문 수, 남은 크레딧)
//
// 원칙
//   - UPDATE 인데 stage 가 안 바뀌었으면 아무것도 안 보내요 (중복 알림 방지)
//   - LINE 전송이 실패해도 console.error 로 남기고 200 을 돌려줘요 (DB 작업을 막지 않게)

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';
const LINE_ADMIN_USER_ID = Deno.env.get('LINE_ADMIN_USER_ID') ?? '';
const NOTIFY_SECRET = Deno.env.get('NOTIFY_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// LINE API 주소 (테스트용으로만 바꿔요. 보통은 비워 두면 https://api.line.me)
const LINE_API_BASE = Deno.env.get('LINE_API_BASE') ?? 'https://api.line.me';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const SITE_ORDERS_URL = 'https://gungungu3893.github.io/allAbut/#/orders';
const SITE_ADMIN_URL = 'https://gungungu3893.github.io/allAbut/#/admin/orders';
const SITE_ADMIN_TOPUPS_URL = 'https://gungungu3893.github.io/allAbut/#/admin/topups';
const SITE_ADMIN_CUSTOMERS_URL = 'https://gungungu3893.github.io/allAbut/#/admin/customers';
const SITE_TOPUP_URL = 'https://gungungu3893.github.io/allAbut/#/topup';
const SITE_PROFILE_URL = 'https://gungungu3893.github.io/allAbut/#/profile';

const NAVY = '#001D4A';
const GOLD = '#D4AF37';

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});


// ================================================================
// 고객 메시지 문구 (9개 언어, 없는 언어는 en)
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


// ================================================================
// Flex Message 카드
// ================================================================
type Row = [string, string];

// LINE Flex 의 text 는 빈 글자를 받지 않아요 → '—'
function clean(v: unknown, max = 300): string {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : '—';
}

function flexCard(opts: { title: string; body?: string; rows: Row[]; buttonLabel: string; url: string; altText: string }) {
  const contents: any[] = [
    { type: 'text', text: clean(opts.title, 120), weight: 'bold', size: 'lg', color: NAVY, wrap: true },
  ];
  if (opts.body) contents.push({ type: 'text', text: clean(opts.body, 1000), size: 'md', color: '#333333', wrap: true, margin: 'md' });
  if (opts.rows.length) {
    contents.push({ type: 'separator', margin: 'lg' });
    contents.push({
      type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
      contents: opts.rows.map(([label, value]) => ({
        type: 'box', layout: 'baseline', spacing: 'sm',
        contents: [
          { type: 'text', text: clean(label, 40), size: 'sm', color: '#6B7280', flex: 2, wrap: true },
          { type: 'text', text: clean(value), size: 'sm', color: NAVY, weight: 'bold', flex: 4, wrap: true },
        ],
      })),
    });
  }
  return {
    type: 'flex',
    altText: clean(opts.altText, 380),
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: NAVY, paddingAll: '14px',
        contents: [{ type: 'text', text: 'allAbut', color: GOLD, weight: 'bold', size: 'xl' }],
      },
      body: { type: 'box', layout: 'vertical', contents },
      footer: {
        type: 'box', layout: 'vertical',
        contents: [{ type: 'button', style: 'primary', color: NAVY, height: 'sm', action: { type: 'uri', label: clean(opts.buttonLabel, 40), uri: opts.url } }],
      },
    },
  };
}

async function push(to: string, message: unknown): Promise<void> {
  if (!/^U[0-9a-f]{32}$/.test(to)) return;
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


// ================================================================
// 도구
// ================================================================
function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function lastEntry(history: unknown): any {
  return Array.isArray(history) && history.length ? history[history.length - 1] : null;
}

// 관리자 취소인지: 마지막 이력이 admin_cancelled 인지 (마지막 두 줄 안의 취소 기록이 관리자 것이면 관리자 취소로 봐요)
function isAdminCancel(history: unknown): boolean {
  if (!Array.isArray(history) || !history.length) return false;
  const tail = history.slice(-2);
  return tail.some((h: any) => h && (h.action === 'admin_cancelled' || (h.by === 'admin' && /cancel/.test(String(h.action || '')))));
}

// 가장 최근 수정 요청 사유
function lastRevisionNote(history: unknown): string {
  if (!Array.isArray(history)) return '';
  for (let i = history.length - 1; i >= 0; i--) {
    const h: any = history[i];
    if (h && h.action === 'rejected') return String(h.note || '');
  }
  const last = lastEntry(history);
  return last ? String(last.note || '') : '';
}

async function getProfile(userId: string): Promise<{ line_user_id: string | null; lang: string | null; clinic_name?: string | null; nickname?: string | null } | null> {
  if (!userId) return null;
  const { data, error } = await db.from('profiles').select('line_user_id, lang, clinic_name, nickname').eq('id', userId).maybeSingle();
  if (error) { console.error('profile read failed', error); return null; }
  return data;
}


// ================================================================
// 관리자 알림 (영어)
// ================================================================
async function notifyAdmin(title: string, o: any, extraRows: Row[] = []): Promise<void> {
  if (!LINE_ADMIN_USER_ID) return;
  const rows: Row[] = [
    ['Order', o.id],
    ['Clinic', o.clinic],
    ['Patient', o.patient],
    ['Teeth', String(o.teeth_count ?? '')],
    ['Deadline', o.deadline],
    ...extraRows,
  ];
  await push(LINE_ADMIN_USER_ID, flexCard({
    title, rows, buttonLabel: 'Open admin', url: SITE_ADMIN_URL,
    altText: title + ' · ' + o.id + ' · ' + (o.clinic || ''),
  }));
}


// ================================================================
// 고객 알림 (고객 언어)
// ================================================================
async function notifyCustomer(o: any, kind: 'confirmed' | 'design' | 'milling' | 'shipped' | 'cancel'): Promise<void> {
  const p = await getProfile(o.user_id);
  if (!p || !p.line_user_id) return;   // LINE 연결 안 했으면 안 보내요
  const x = texts(p.lang);
  const rows: Row[] = [[x.order, o.id], [x.patient, o.patient]];
  let title = '', body = '';

  if (kind === 'confirmed') { title = x.confirmed_title; body = x.confirmed_body; rows.push([x.deadline, o.deadline]); }
  if (kind === 'design') { title = x.design_title; body = x.design_body; }
  if (kind === 'milling') { title = x.milling_title; body = x.milling_body; rows.push([x.deadline, o.deadline]); }
  if (kind === 'shipped') {
    title = x.shipped_title; body = x.shipped_body;
    rows.push([x.carrier, o.carrier], [x.tracking, o.tracking_number]);
  }
  if (kind === 'cancel') {
    title = x.cancel_title; body = x.cancel_body;
    rows.push([x.refunded, String(o.credits_used ?? 0) + ' ' + x.credits]);
    const last = lastEntry(o.review_history);
    const reason = last && last.action === 'admin_cancelled' ? last.note
      : ((o.review_history || []).slice().reverse().find((h: any) => h && h.action === 'admin_cancelled') || {}).note;
    if (reason) rows.push([x.reason, reason]);
    rows.push([x.balance, balanceText(x, await getBalance(o.user_id))]);
  }

  await push(p.line_user_id, flexCard({
    title, body, rows, buttonLabel: x.open, url: SITE_ORDERS_URL,
    altText: title + ' · ' + o.id,
  }));
}

// 남은 잔액 (credit_wallets, 서버 관리 키로 읽기). 못 읽으면 null
async function getBalance(userId: string): Promise<number | null> {
  if (!userId) return null;
  const { data, error } = await db.from('credit_wallets').select('balance').eq('user_id', userId).maybeSingle();
  if (error) { console.error('balance read failed', error); return null; }
  return data ? Number(data.balance ?? 0) : 0;
}

function balanceText(x: Texts, balance: number | null): string {
  return balance == null ? '—' : String(balance) + ' ' + x.credits;
}

// 관리자 취소로 생긴 환불인지 (그때는 "관리자 취소" 카드에 환불·잔액이 이미 들어가서 따로 보내지 않아요)
async function isAdminCancelRefund(orderId: string): Promise<boolean> {
  if (!orderId) return false;
  const { data, error } = await db.from('cnc_orders').select('stage, review_history').eq('id', orderId).maybeSingle();
  if (error || !data) return false;
  return data.stage === 'cancelled' && isAdminCancel(data.review_history);
}

// credit_history INSERT → 고객 알림 (type 별)
//   use    📝 주문 접수 완료 (주문번호, 사용 크레딧, 남은 잔액)
//   refund ↩️ 크레딧 환불 (주문번호, 환불 수량, 남은 잔액) — 관리자 취소로 생긴 환불은 제외 (중복 방지)
//   adjust ➖ 크레딧 조정 (수량 부호 포함, 사유, 남은 잔액)
//   charge 💳 크레딧 충전 (수량, 남은 잔액)
async function notifyCredit(h: any): Promise<void> {
  const type = String(h.type || '');
  const amount = Number(h.amount || 0);
  if (!['use', 'refund', 'adjust', 'charge', 'expire'].includes(type)) return;
  if (type === 'expire' && amount >= 0) return;
  if (type === 'charge' && amount <= 0) return;

  const p = await getProfile(h.user_id);
  if (!p || !p.line_user_id) return;   // LINE 연결 안 했으면 안 보내요
  if (type === 'refund' && await isAdminCancelRefund(h.order_id)) return;

  const x = texts(p.lang);
  const balance = await getBalance(h.user_id);
  const abs = Math.abs(amount);
  const desc = String(h.description || '').trim();
  let title = '', body = '';
  const rows: Row[] = [];

  if (type === 'use') {
    title = x.use_title; body = x.use_body;
    rows.push([x.order, h.order_id], [x.used, String(abs) + ' ' + x.credits]);
  } else if (type === 'refund') {
    title = x.refund_title; body = x.refund_body.replace('{n}', String(abs));
    rows.push([x.order, h.order_id], [x.refunded, String(abs) + ' ' + x.credits]);
  } else if (type === 'adjust') {
    title = x.adjust_title; body = x.adjust_body;
    rows.push([x.amount, (amount > 0 ? '+' : '') + String(amount) + ' ' + x.credits], [x.reason, desc]);
  } else if (type === 'expire') {
    title = x.expire_title; body = x.expire_body.replace('{n}', String(abs));
    rows.push([x.credits, '-' + abs]);
    if (h.order_id) rows.push([x.order, h.order_id]);
  } else {
    title = x.charge_title; body = x.charge_body.replace('{n}', String(abs)) + (desc ? '\n' + desc : '');
    rows.push([x.credits, '+' + abs]);
    const exp = await getLotExpiry(h.lot_id);
    if (exp) rows.push([x.valid_until, exp]);
  }
  rows.push([x.balance, balanceText(x, balance)]);

  const alt = title + (h.order_id ? ' · ' + h.order_id : '') + ' · ' + x.balance + ': ' + balanceText(x, balance);
  await push(p.line_user_id, flexCard({
    title, body, rows, buttonLabel: x.open, url: SITE_ORDERS_URL, altText: alt,
  }));
}


// 날짜 'YYYY-MM-DD' (방콕 시간)
function ymd(v: unknown): string {
  const d = new Date(String(v ?? ''));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

// 금액: 21935 → "21,935.00 THB"
function thb(v: unknown): string {
  const n = Number(v ?? 0);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' THB';
}

// 크레딧 묶음 만료일
async function getLotExpiry(lotId: unknown): Promise<string> {
  if (!lotId) return '';
  const { data, error } = await db.from('credit_lots').select('expires_at').eq('id', String(lotId)).maybeSingle();
  if (error || !data) return '';
  return ymd(data.expires_at);
}

// 충전 요청 (topup_requests)
//   INSERT                → 관리자: 💰 충전 요청
//   UPDATE → rejected     → 고객: 충전 거절 + 사유
//   UPDATE → cancelled    → 관리자: 짧게
//   (승인은 credit_history 'charge' 로 고객에게 충전 알림이 가요)
async function handleTopup(type: string, rec: any, old: any): Promise<void> {
  if (type === 'INSERT') {
    if (!LINE_ADMIN_USER_ID) return;
    const p = await getProfile(rec.user_id);
    const who = (p && (p.clinic_name || p.nickname)) || String(rec.user_id || '').slice(0, 8);
    const title = '💰 Top-up request';
    await push(LINE_ADMIN_USER_ID, flexCard({
      title, body: 'Please check the payment slip and approve or reject.',
      rows: [['Request', rec.id], ['Customer', who], ['Package', String(rec.credits) + ' credits'], ['Total', thb(rec.total)]],
      buttonLabel: 'Open admin', url: SITE_ADMIN_TOPUPS_URL,
      altText: title + ' · ' + rec.id + ' · ' + who + ' · ' + thb(rec.total),
    }));
    return;
  }
  if (type !== 'UPDATE') return;
  if (!rec.status || old?.status === rec.status) return;   // 상태가 안 바뀌었으면 보내지 않아요

  if (rec.status === 'rejected') {
    const p = await getProfile(rec.user_id);
    if (!p || !p.line_user_id) return;
    const x = texts(p.lang);
    await push(p.line_user_id, flexCard({
      title: x.topup_rejected_title, body: x.topup_rejected_body,
      rows: [[x.request, rec.id], [x.credits, String(rec.credits)], [x.total, thb(rec.total)], [x.reason, rec.reject_reason]],
      buttonLabel: x.open, url: SITE_TOPUP_URL,
      altText: x.topup_rejected_title + ' · ' + rec.id,
    }));
    return;
  }
  if (rec.status === 'cancelled' && LINE_ADMIN_USER_ID) {
    const title = '↩️ Top-up request cancelled by customer';
    await push(LINE_ADMIN_USER_ID, flexCard({
      title, rows: [['Request', rec.id], ['Package', String(rec.credits) + ' credits'], ['Total', thb(rec.total)]],
      buttonLabel: 'Open admin', url: SITE_ADMIN_TOPUPS_URL, altText: title + ' · ' + rec.id,
    }));
  }
}

// 만료 예정 알림 (예약 작업이 보내요): { type: 'EXPIRY_REMINDER', user_id, days, lots: [{ id, remaining, expires_at }] }
async function handleReminder(payload: any): Promise<void> {
  const lots = Array.isArray(payload.lots) ? payload.lots : [];
  const n = lots.reduce((sum: number, l: any) => sum + Number(l?.remaining || 0), 0);
  if (!payload.user_id || n <= 0) return;
  const p = await getProfile(payload.user_id);
  if (!p || !p.line_user_id) return;
  const x = texts(p.lang);
  const first = lots.map((l: any) => String(l?.expires_at || '')).filter(Boolean).sort()[0];
  const date = ymd(first);
  const days = first ? Math.max(1, Math.ceil((new Date(first).getTime() - Date.now()) / 86400000)) : Number(payload.days || 0);
  const title = x.reminder_title.replace('{n}', String(n)).replace('{d}', String(days));
  const balance = await getBalance(payload.user_id);
  await push(p.line_user_id, flexCard({
    title, body: x.reminder_body.replace('{date}', date),
    rows: [[x.credits, String(n)], [x.valid_until, date], [x.balance, balanceText(x, balance)]],
    buttonLabel: x.open, url: SITE_PROFILE_URL,
    altText: title,
  }));
}


// 계정 삭제 요청 (account_deletion_requests INSERT) → 관리자 (영어)
async function handleDeletionRequest(rec: any): Promise<void> {
  if (!LINE_ADMIN_USER_ID) return;
  const p = await getProfile(rec.user_id);
  const who = (p && (p.clinic_name || p.nickname)) || String(rec.user_id || '').slice(0, 8);
  const balance = await getBalance(rec.user_id);
  const { count } = await db.from('cnc_orders').select('id', { count: 'exact', head: true })
    .eq('user_id', rec.user_id).not('stage', 'in', '(done,cancelled)');
  const title = '🗑 Account deletion request';
  await push(LINE_ADMIN_USER_ID, flexCard({
    title,
    body: 'Check open orders, remaining credits and tax records before deleting the account (Admin → Customers).',
    rows: [['Customer', who], ['Open orders', String(count ?? 0)], ['Credits', String(balance ?? 0)], ['Reason', rec.reason]],
    buttonLabel: 'Open admin', url: SITE_ADMIN_CUSTOMERS_URL,
    altText: title + ' · ' + who,
  }));
}


// ================================================================
// 이벤트 → 알림
// ================================================================
async function handle(payload: any): Promise<void> {
  const { type, table, record, old_record } = payload ?? {};

  // 만료 예정 알림 (DB 예약 작업 → pg_net)
  if (type === 'EXPIRY_REMINDER') {
    await handleReminder(payload);
    return;
  }
  if (!record) return;

  // 충전 요청
  if (table === 'topup_requests') {
    await handleTopup(type, record, old_record);
    return;
  }

  // 계정 삭제 요청 → 관리자
  if (table === 'account_deletion_requests') {
    if (type === 'INSERT') await handleDeletionRequest(record);
    return;
  }

  // 크레딧 사용 · 환불 · 조정 · 충전 → 고객
  if (table === 'credit_history') {
    if (type === 'INSERT') await notifyCredit(record);
    return;
  }

  if (table !== 'cnc_orders') return;

  // 새 주문 → 관리자만 (고객에게는 credit_history 'use' 로 "주문 접수 완료"를 보내요 — 중복 방지)
  if (type === 'INSERT') {
    await notifyAdmin('🆕 New order', record);
    return;
  }

  if (type !== 'UPDATE') return;
  const from = old_record?.stage;
  const to = record.stage;
  if (!to || from === to) return;   // 단계가 안 바뀌었으면 보내지 않아요

  switch (to) {
    // 관리자에게
    case 'approved':
      await notifyAdmin('✅ Customer approved the design', record);
      break;
    case 'design_revision':
      await notifyAdmin('✏️ Customer requested design changes', record, [['Request', lastRevisionNote(record.review_history)]]);
      break;
    case 'done': {
      const last = lastEntry(record.review_history);
      if (last && last.action === 'marked_done') break;   // 관리자가 직접 완료 처리한 경우는 알리지 않아요
      await notifyAdmin('📦 Customer received the order', record);
      break;
    }
    case 'cancelled':
      if (isAdminCancel(record.review_history)) await notifyCustomer(record, 'cancel');
      else await notifyAdmin('❌ Customer cancelled the order', record, [['Refunded', String(record.credits_used ?? 0) + ' credits']]);
      break;

    // 고객에게
    case 'confirmed':
      await notifyCustomer(record, 'confirmed');
      break;
    case 'design_ready':
      await notifyCustomer(record, 'design');
      break;
    case 'milling':
      await notifyCustomer(record, 'milling');
      break;
    case 'shipped':
      await notifyCustomer(record, 'shipped');
      break;
  }
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
