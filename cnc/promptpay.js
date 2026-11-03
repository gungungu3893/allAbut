// ===== PromptPay QR 페이로드 만들기 (EMVCo 규격) =====
// 태국 은행 앱으로 스캔하면 받는 사람(PromptPay ID)과 금액이 자동으로 들어가는 QR 의 "글자"를 만들어요.
// QR 그림은 이 글자를 QR 라이브러리(qrcodejs)에 넣어서 그려요.
//
// 사용법: promptPayPayload('0812345678', 21935) → '00020101021229370016A000000677010111011300668123456785802TH...6304XXXX'
//
// 구조 (태그 2자리 + 길이 2자리 + 값)
//   00 = 01               (형식 버전)
//   01 = 12               (금액이 있는 1회용 QR) / 11 (금액 없음)
//   29 = 가맹점 정보        00: A000000677010111 (PromptPay)
//                          01: 휴대폰 0066 + 앞자리 0 뺀 번호 (13자리)  / 02: 사업자·주민번호 13자리 / 03: e-Wallet 15자리
//   58 = TH               (국가)
//   53 = 764              (통화: 태국 바트)
//   54 = 금액              (예: 21935.00)
// (순서는 널리 쓰이는 promptpay-qr 라이브러리와 같게 맞췄어요 — 결과 글자가 똑같아요)
//   63 = CRC16            (앞의 모든 글자 + "6304" 로 계산한 확인값, 16진수 4자리)

function ppField(tag, value) {
  var v = String(value);
  return tag + (v.length < 10 ? '0' : '') + v.length + v;
}

// CRC16-CCITT (다항식 0x1021, 시작값 0xFFFF)
function ppCrc16(text) {
  var crc = 0xFFFF;
  for (var i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (var b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return ('0000' + crc.toString(16).toUpperCase()).slice(-4);
}

// PromptPay ID 종류 판별: { tag: '01'|'02'|'03', value } 또는 null(잘못된 ID)
function ppTarget(id) {
  var digits = String(id || '').replace(/\D/g, '');
  if (digits.length === 13) return { tag: '02', value: digits };            // 사업자·주민번호
  if (digits.length === 15) return { tag: '03', value: digits };            // e-Wallet
  if (digits.length === 10 && digits.charAt(0) === '0') {                   // 휴대폰 08x-xxx-xxxx
    return { tag: '01', value: ('0000000000000' + ('66' + digits.slice(1))).slice(-13) };
  }
  if (digits.length === 11 && digits.slice(0, 2) === '66') {                // 66 8x xxx xxxx
    return { tag: '01', value: ('0000000000000' + digits).slice(-13) };
  }
  return null;
}

function isValidPromptPayId(id) {
  return !!ppTarget(id);
}

// amount: 바트 (숫자). 없거나 0 이면 금액 없는 QR
function promptPayPayload(id, amount) {
  var target = ppTarget(id);
  if (!target) return '';
  var hasAmount = amount != null && Number(amount) > 0;
  var merchant = ppField('00', 'A000000677010111') + ppField(target.tag, target.value);
  var data =
    ppField('00', '01') +
    ppField('01', hasAmount ? '12' : '11') +
    ppField('29', merchant) +
    ppField('58', 'TH') +
    ppField('53', '764') +
    (hasAmount ? ppField('54', Number(amount).toFixed(2)) : '') +
    '6304';
  return data + ppCrc16(data);
}
