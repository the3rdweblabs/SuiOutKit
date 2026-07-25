---
title: USSD Payments
description: Accepting USSD bank payments from Nigerian customers via Flutterwave.
---

USSD (Unstructured Supplementary Service Data) lets customers pay by dialing a bank code on their phone. It's a widely used payment method in Nigeria for customers who prefer not to use card or bank transfer.

## How it works

1. Customer selects USSD in the checkout modal.
2. Modal displays a bank selection and the USSD code to dial.
3. Customer dials the code on their phone (e.g. `*329*...#`).
4. Customer follows the bank's prompts to authorize the payment.
5. Flutterwave confirms the payment via webhook.
6. Backend settles and shows success.

The entire flow happens on the customer's phone - no app installation required.

## Supported banks

| Bank | USSD Code | Icon |
|------|-----------|------|
| Access Bank | `*901#` | `access.png` |
| FCMB | `*389*214#` | `fcmb.png` |
| First Bank | `*894#` | `firstbank.png` |
| GTBank | `*737#` | `gtb.png` |
| Sterling Bank | `*822#` | `sterling.png` |
| UBA | `*919#` | `uba.png` |
| Union Bank | `*826#` | `union.png` |
| VFD Bank | `*5037#` | `vfd.png` |
| Wema Bank | `*945#` | `wema.png` |
| Zenith Bank | `*966#` | `zenith.png` |

Bank icons are served from `sdk/assets/banks/` and displayed in the modal.

## Operator requirements

- **Flutterwave keys**: Set `FLW_SECRET_KEY_test` and `FLW_SECRET_KEY_live` in the backend environment.
- **Currency**: USSD is only available for NGN (Nigerian Naira) payments.
- **Flutterwave account**: A Flutterwave merchant account with USSD enabled.

Merchants integrating via `npm install suioutkit` do not need to configure anything - the hosted API handles provider setup. This section is for operators running the self-hosted backend.

## Customer UX

### 1. Bank selection

The modal displays available banks with their USSD codes. The customer selects their bank.

### 2. USSD code display

After selecting a bank, the modal shows:

- The full USSD code to dial
- Instructions to dial the code and follow the prompts
- The amount to authorize

### 3. Phone authorization

The customer:
1. Opens their phone dialer
2. Dials the displayed code
3. Follows the bank's voice/text prompts
4. Enters their PIN to authorize

### 4. Confirmation

Once the bank confirms, Flutterwave sends a webhook. The modal shows the payment as confirmed and proceeds to settlement.

## Limitations

- **NGN only**: USSD is only available for Nigerian Naira payments.
- **Amount limits**: Each bank has its own USSD transaction limits (typically ₦100,000 - ₦500,000 per transaction).
- **Phone required**: Customer must have a phone with USSD capability (any phone, not just smartphones).
- **Bank-specific**: Not all banks support USSD payments through Flutterwave/provider.

## Testing

In test mode, Flutterwave simulates the USSD flow without requiring an actual bank call. The modal shows the same UX but the payment is confirmed immediately via simulated webhook.

```env
FLW_MODE=test
```

## See also

- [Cross-Region Payments](/docs/guides/cross-region) - accepting NGN from non-NGN customers
- [Backend API](/docs/guides/backend-api) - charge endpoint with `ussd` method
- [Environment](/docs/guides/environment) - Flutterwave key configuration
