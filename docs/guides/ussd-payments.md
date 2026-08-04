---
title: USSD Payments
description: Accepting USSD bank payments from Nigerian customers via Flutterwave.
---

USSD (Unstructured Supplementary Service Data) lets customers pay by dialing a bank code on their phone. It's a widely used payment method in Nigeria for customers who prefer not to use card or bank transfer.

## How it works

1. Customer selects USSD in the checkout modal.
2. Modal displays a bank selection grid.
3. Customer selects their bank.
4. The backend charges Flutterwave, which returns the USSD code to dial (e.g. `*329*...#`).
5. Customer dials the code on their phone and follows the bank's prompts.
6. Flutterwave confirms the payment via webhook (or background tx_ref polling).
7. Backend settles and shows success.

The entire flow happens on the customer's phone - no app installation required.

## Supported banks

The modal's bank grid uses Flutterwave bank codes. Each bank also has a USSD shortcode (the `*xxx#` code customers normally dial for USSD banking) shown for reference:

| Bank | Flutterwave Code | USSD Code | Icon |
|------|------------------|-----------|------|
| Access Bank | `044` | `*901#` | `access.png` |
| FCMB | `214` | `*329#` | `fcmb.png` |
| First Bank | `011` | `*894#` | `firstbank.png` |
| GTBank | `058` | `*737#` | `gtb.png` |
| Sterling Bank | `232` | `*822#` | `sterling.png` |
| UBA | `033` | `*919#` | `uba.png` |
| Union Bank | `032` | `*826#` | `union.png` |
| VFD MFB | `090110` | `*5037#` | `vfd.png` |
| Wema Bank | `035` | `*945#` | `wema.png` |
| Zenith Bank | `057` | `*966#` | `zenith.png` |

The bank icons are served from the API host (`GET /assets/banks/<icon>.png`), which is mounted from the backend's static assets directory. The exact USSD code to dial is returned by Flutterwave at charge time and may differ from the shortcode above (e.g. `*329*10*08#`).

## Operator requirements

- **Flutterwave keys**: Set `FLW_SECRET_KEY_test` and `FLW_SECRET_KEY_live` in the backend environment.
- **Currency**: USSD is only available for NGN (Nigerian Naira) payments.
- **Flutterwave account**: A Flutterwave merchant account with USSD enabled.

Merchants integrating via `npm install suioutkit` do not need to configure anything - the hosted API handles provider setup. This section is for operators running the self-hosted backend.

## Customer UX

### 1. Bank selection

The modal displays available banks. The customer selects their bank.

### 2. USSD code display

After selecting a bank, the backend charges Flutterwave and the modal shows:

- The full USSD code to dial (returned by Flutterwave)
- Instructions to dial the code and follow the prompts
- The amount to authorize
- An optional payment code to enter if prompted

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
