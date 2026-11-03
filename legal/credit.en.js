// allAbut — Credit & Refund Policy (English, governing version)
// {{PRICE_TABLE}} = 판매 중인 패키지 가격표, {{REFUND_EXAMPLE}} = 환불 계산 예시 (credit_packages 에서 자동으로 만들어요)
// {single_price} = 1개 패키지 단가, {vat} = VAT %
window.LEGAL_DOCS = window.LEGAL_DOCS || {};
LEGAL_DOCS['credit.en'] = {
  title: 'Credit & Refund Policy',
  intro: 'This policy explains how allAbut credits are priced, used, expire and are refunded. It forms part of our Terms of Service.',
  sections: [
    {
      title: 'Credits and prices',
      body: [
        'Orders are paid with credits. 1 credit = 1 tooth (one custom abutment).',
        'Credits are sold in packages. Prices are per credit in Thai Baht and exclude VAT ({vat}%), which is added at payment:',
        '{{PRICE_TABLE}}',
        'Prices may change. A price change does not affect credits you have already bought.'
      ]
    },
    {
      title: 'Buying credits',
      body: [
        'You pay by PromptPay QR or bank transfer and upload the payment slip. Credits are added after we confirm the payment. If we cannot confirm the payment, we will tell you why.'
      ]
    },
    {
      title: 'Validity and expiry',
      body: [
        [
          'Each top-up (a "credit lot") is valid for 12 months from the date it is added to your account.',
          'When you place an order, credits that expire first are used first.',
          'We send a LINE reminder 30 days and 7 days before credits expire (if you have connected LINE). You can also see expiry dates in Profile.',
          'Unused credits expire automatically at the end of their validity and cannot be restored or refunded.'
        ]
      ]
    },
    {
      title: 'Order cancellations',
      body: [
        'If an order is cancelled before milling starts, the credits used are returned to the same credit lots and keep their original expiry dates. Credits from a lot that has already expired cannot be returned.',
        'Once milling has started, an order cannot be cancelled.'
      ]
    },
    {
      title: 'Cash refunds',
      body: [
        'You can request a cash refund of purchased credits within 14 days of the top-up date:',
        [
          'If none of the credits in that top-up have been used, we refund the full amount you paid, including VAT.',
          'If some credits in that top-up have been used, we recalculate the used credits at the single-credit price ({single_price} per credit plus VAT) and refund the balance.'
        ],
        'Example:',
        '{{REFUND_EXAMPLE}}',
        'The following cannot be refunded:',
        [
          'expired credits;',
          'bonus, promotional or event credits, and credits given free of charge;',
          'credits from a top-up made more than 14 days ago.'
        ]
      ]
    },
    {
      title: 'Defective products',
      body: [
        'If an abutment has a manufacturing defect, we will remake it free of charge or return the credits used for it, as described in our Terms of Service. Claims must be made within 14 days after you receive the order.'
      ]
    },
    {
      title: 'How refunds are paid',
      body: [
        [
          'Refunds are paid by bank transfer to an account in the name of the clinic or person who made the payment, within 14 business days after we approve the refund.',
          'Refund amounts are calculated on the amount paid including VAT.',
          'We issue a credit note (reduction of the tax invoice) for refunds where a tax invoice was issued.'
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
