---
title: Cross-Region Payments
description: Accepting local payment methods when the merchant's settlement currency differs from the customer's.
---

Cross-region payments let a merchant settled in one currency accept payments from customers in a different currency using local payment rails. For example, a USD-settled merchant can accept NGN from a Nigerian customer - the customer is charged in NGN, and settlement uses the merchant's USD amount.

This feature is relevant for **operators running the SuiOutKit backend** (self-hosted or hosted). Merchants integrating the SDK do not need to configure anything - cross-region works automatically based on the backend's provider setup.

## How it works

1. Merchant creates a session with their currency (e.g. `currency: "USD"`).
2. Customer's IP resolves to a different currency (e.g. NGN via geo detection), or the merchant's UI passes the customer's currency explicitly.
3. The backend detects the currency mismatch and enables cross-region payment methods supported by the configured providers.
4. The modal shows a "Pay in {local currency} →" label for local payment rails.
5. The customer is charged in their local currency. The merchant is settled in their configured currency.
6. The FX conversion between customer and merchant currencies happens at the payment provider level - the SuiOutKit backend does not handle this conversion.

The merchant never touches the customer's local currency. They receive their settlement token (SUI, USDC, etc.) worth their configured currency amount.

## Supported corridors

Corridors depend on which payment providers the operator has configured and which regions those providers support. SuiOutKit is designed to be provider-agnostic - as new providers and regions are added, cross-region support expands automatically.

| Merchant currency | Customer currency | Local methods (provider-dependent) |
|-------------------|-------------------|-----------------------------------|
| USD | NGN | Bank transfer, OPay, USSD |
| USD | GHS | Bank transfer |
| Any | Any | Card payments, Crypto (Sui wallet, outPay) |

Card and crypto methods are always available regardless of currency mismatch. Cross-region only applies to provider-powered local methods.

> **Expanding corridors:** More providers and regional payment methods are being added as SuiOutKit scales. If your region or preferred provider isn't listed yet, the card and crypto paths still work for any currency pair. Check the [changelog](/docs/changelog) for new provider integrations.

## Operator setup

Cross-region works automatically when:

1. The operator has configured payment providers that support local collections in the customer's currency.
2. The backend has the necessary provider keys for the customer's region (e.g. `FLW_SECRET_KEY_*` for Flutterwave, or equivalent for other providers).
3. The customer's currency is supported by the configured provider for local collections.

No per-merchant configuration is needed. The merchant's `merchantAddress` receives settlement in their configured currency. The settlement token is determined by `settlementToken` or `DEFAULT_COIN`.

### Provider requirements

| Provider | Cross-region support | Configuration |
|----------|---------------------|---------------|
| Flutterwave | NGN (bank transfer, OPay, USSD) and GHS (bank transfer) local collections | `FLW_SECRET_KEY_*` |
| Stripe | Card payments (merchant's currency) | `STRIPE_SECRET_KEY_*` |
| Other providers | Depends on provider capabilities | Provider-specific env vars |

The operator should configure providers that support the regions their merchants operate in. When multiple providers are available, the backend presents all applicable payment methods to the customer.

## Customer experience

When a cross-region payment is available, the modal shows:

- **"Pay in {local currency} →"** - indicates the customer can pay using their local currency via a provider-powered method
- **"Pay in {merchant currency}"** - card payment in the merchant's currency
- **Crypto options** - Sui wallet, outPay (always available)

The customer sees the amount in their local currency. The merchant sees the amount in their settlement currency.

### Example flow

1. Merchant session: `$29.99 USD`
2. Customer in Nigeria sees: `₦46,484.50` (at 1,550 NGN/USD)
3. Customer picks "Pay in NGN →" → bank transfer
4. Modal shows NGN virtual account details
5. Customer transfers ₦46,484.50 to the virtual account
6. Provider confirms → webhook → settlement in USD → merchant receives USDC worth ~$29.99

## Currency detection

The backend can auto-detect the customer's currency from their IP address when `ENABLE_GEO_DETECTION=true`. If the detected currency differs from the merchant's, cross-region is enabled automatically.

Without geo detection, the merchant's UI can pass the customer's currency explicitly:

```ts
const session = await sdk.initCheckout({
  amount: 29.99,
  currency: "USD",
});
```

The merchant's UI can prompt for the customer's currency and handle the display. The backend resolves the final currency and payment methods based on the configured providers.

## Settlement amounts

Cross-region does not change how settlement works:

- The merchant is always settled in their configured currency.
- The `estimatedRate` in the session reflects the fiat-to-token rate for the merchant's currency.
- The treasury check uses the merchant's currency amount.
- On-chain settlement transfers the token amount to the merchant.

The FX conversion between customer and merchant currencies happens at the payment provider level, not in the SuiOutKit backend.

## Payment methods by region

Availability depends on the operator's provider configuration:

| Method | NGN customer | GHS customer | Other |
|--------|-------------|-------------|-------|
| Bank transfer | ✅ (local bank) | ✅ (local bank) | ❌ |
| OPay | ✅ (NGN only) | ❌ | ❌ |
| USSD | ✅ (NGN only) | ❌ | ❌ |
| Card | ✅ (merchant currency) | ✅ (merchant currency) | ✅ (merchant currency) |
| Sui wallet | ✅ | ✅ | ✅ |
| outPay | ✅ | ✅ | ✅ |

## Limitations

- Cross-region only works with provider-powered local methods (bank transfer, OPay, USSD).
- Bank transfer is available for NGN and GHS customers only; OPay and USSD are NGN-only. Other customer currencies rely on card and crypto paths for now.
- Card payments are always in the merchant's currency - no cross-region conversion.
- The operator must have provider keys configured for the customer's region.
- FX rates at the provider level may differ from CoinGecko rates used for settlement estimation.
- Not all providers support all corridors - check your provider's documentation for supported regions.

## See also

- [USSD Payments](/docs/guides/ussd-payments) - USSD-specific flow for NGN customers
- [Settlement Tokens](/docs/guides/settlement-tokens) - configuring which tokens merchants receive
- [Currencies](/docs/guides/currencies) - supported fiat currencies and formatting
- [Environment](/docs/guides/environment) - provider key configuration
- [Treasury Management](/docs/guides/treasury) - depositing tokens for settlement
