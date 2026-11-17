// allAbut — Credit & Refund Policy (English, governing version)
// {{PRICE_TABLE}} = 판매 중인 패키지 가격표 (상품 종류마다 표 하나), {{REFUND_EXAMPLE}} = 환불 계산 예시 (어버트먼트 패키지 기준, credit_packages 에서 자동)
// {single_price} = 어버트먼트 1개 패키지 단가, {vat} = VAT %, {email} = 문의 이메일
// 내용은 지금 사이트 기능에 맞춰 써요: 상품 두 종류(크레딧 따로) · 12개월 · 먼저 만료되는 것부터 · 무료 크레딧(등록 주소 전용 · 현금 환불 불가 · 회수) ·
// 14일 현금 환불(1개 가격 = 같은 종류의 1크레딧 가격) · 세금계산서는 자동 발행 기능 없음(문의).
window.LEGAL_DOCS = window.LEGAL_DOCS || {};
LEGAL_DOCS['credit.en'] = {
  title: 'Credit & Refund Policy',
  intro: 'This policy explains how allAbut credits are priced, used, expire and are refunded. It forms part of our Terms of Service.',
  sections: [
    {
      title: 'Credits and prices',
      body: [
        'Orders are paid with credits. There are two kinds of credits, one for each product:',
        [
          'custom abutment credits — 1 credit = 1 tooth with a custom abutment;',
          'crown set credits — 1 credit = 1 tooth with a custom abutment and a zirconia crown.'
        ],
        'The two kinds are separate. Credits of one kind cannot be used for the other product, converted into the other kind, or transferred to another account.',
        'Credits are sold in packages for each kind. Prices are per credit in Thai Baht and exclude VAT ({vat}%), which is added at payment. Packages currently on sale:',
        '{{PRICE_TABLE}}',
        'Prices may change. A price change does not affect credits you have already bought.'
      ]
    },
    {
      title: 'Buying credits',
      body: [
        'Choose the credit kind and a package on the Top up page, pay the total shown by PromptPay QR or bank transfer, and upload the payment slip. Credits of the kind you chose are added after we confirm the payment. If we cannot confirm the payment, we will tell you why.'
      ]
    },
    {
      title: 'Validity and expiry',
      body: [
        [
          'Each top-up (a "credit lot") is valid for 12 months from the date it is added to your account. Free credits are valid for the period stated when they are given.',
          'When you place an order, credits of the needed kind that expire first are used first.',
          'We send a LINE reminder 30 days and 7 days before credits expire (if you have connected LINE). You can also see expiry dates in Profile.',
          'Unused credits expire automatically at the end of their validity and cannot be restored or refunded.',
          'While the Service is in a test service period (shown by a "TEST" badge), credits added during that period may be reset when the official service starts, as described in the Terms of Service.'
        ]
      ]
    },
    {
      title: 'Free credits',
      body: [
        'We may give free credits, for example in a sign-up promotion or as an event or goodwill gift. Free credits:',
        [
          'cannot be refunded in cash;',
          'can be used only for orders shipped to your registered clinic address, unless we state otherwise when we give them — to use them, turn on "Order with free credits" when you place an order;',
          'are of one credit kind (custom abutment or crown set) and can be used only for that product;',
          'are valid for the period stated when they are given;',
          'may have promotion conditions, for example one grant per clinic, phone number, LINE account or Tax ID, a required LINE connection, or approval by allAbut.'
        ],
        'If an account was created or used fraudulently, or the conditions of a promotion are not met, we may refuse or revoke unused free credits.'
      ]
    },
    {
      title: 'Order cancellations',
      body: [
        'If an order is cancelled before milling starts, the credits used are returned to the same credit lots and keep their original kind, conditions and expiry dates. Credits from a lot that has already expired cannot be returned.',
        'Once milling has started, an order cannot be cancelled.'
      ]
    },
    {
      title: 'Cash refunds',
      body: [
        'You can request a cash refund of purchased credits within 14 days of the top-up date:',
        [
          'If none of the credits in that top-up have been used, we refund the full amount you paid, including VAT.',
          'If some credits in that top-up have been used, we recalculate the used credits at the single-credit price of the same credit kind (for custom abutment credits, {single_price} per credit plus VAT) and refund the balance.'
        ],
        'Example (custom abutment credits):',
        '{{REFUND_EXAMPLE}}',
        'The following cannot be refunded:',
        [
          'expired credits;',
          'free credits, including bonus, promotional or event credits;',
          'credits carried over from an earlier balance;',
          'credits from a top-up made more than 14 days ago.'
        ]
      ]
    },
    {
      title: 'Defective products',
      body: [
        'If a product has a manufacturing defect, we will remake it free of charge or return the credits used for it, as described in our Terms of Service. Please tell us without undue delay, and in any case within 14 days after you receive the order.'
      ]
    },
    {
      title: 'How refunds are paid',
      body: [
        [
          'Refunds are paid by bank transfer to an account in the name of the clinic or person who made the payment, within 14 business days after we approve the refund.',
          'Refund amounts are calculated on the amount paid including VAT.',
          'Tax invoices are not issued automatically on the Service. If you need a tax invoice for a top-up, please contact us. If we issued a tax invoice for a top-up, we will issue a credit note when we refund it.'
        ],
        'To request a refund, contact us at {email}.'
      ]
    },
    {
      title: 'Changes to this Policy',
      body: [
        'We may update this policy. Changes do not reduce the validity or refund rights of credits bought before the change.'
      ]
    }
  ]
};
