---
title: Changelog
description: Release history and notable changes for SuiOutKit.
---

All notable changes to SuiOutKit are documented here. This format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.4.1] - 2026-07-28

### Fixed

- Walrus upload race condition: `verifyCryptoPaymentTx` and `verifyFiatSettlementTx` switched from `getTransaction` to `waitForTransaction` to eliminate the fullnode indexing race.
- Deterministic blob IDs: `prepareInvoice()` signs the invoice once and returns the `signedPayload`, stored in Redis as `cryptoWalrusSignedPayload` and reused during upload so the blob ID is always deterministic.
- Non-blocking receipt pipeline: `prepareInvoice()` is now encode-only in both SDK and publisher modes (~1s). Receipt uploads run after PTB confirmation via a Redis-backed queue (`walrus-queue.ts`) and never block the checkout response.
- OPay waiting panel text now updates to "Payment received. Settling on-chain..." once the backend detects payment progress (postMessage handler + polling fallback for any non-`PENDING`/`EXPIRED` status).

### Changed

- SDK payment status steps reordered: Payment received → Webhook confirmed → Settled on-chain → Receipt uploaded.
- Removed dead `BANK_CONFIRMED` badge state from SDK status types and badge UI.
- `WALRUS_OPERATOR_PRIVATE_KEY` now required in all upload modes (needed by `prepareInvoice()` encoding).

## [1.0.0] - 2026-07-25

### Added

#### Multi-currency checkout (40+ fiat currencies)
- Support for 40+ fiat currencies with locale-aware formatting.
- IP-based geolocation for automatic currency detection (`ENABLE_GEO_DETECTION`).
- Currency resolution at session creation with `resolvedCurrency` and `currencySymbol`.
- `formatCurrency()` helper uses `Intl.NumberFormat` for correct symbol and separator display.

#### Settlement tokens
- `settlementToken` option on `initCheckout()` - accepts a string or array of strings.
- Per-currency settlement token defaults (e.g. USDC for USD merchants, SUI or USDC for NGN).
- Network-aware coin configuration: `SUPPORTED_COINS_TESTNET` / `SUPPORTED_COINS_MAINNET`.
- `CoinCategory` field on each coin: `native`, `stablecoin`, `utility`, `defi`.
- Token selector in the modal when multiple settlement tokens are offered.

#### Cross-region payments
- USD-settled merchants can accept NGN from Nigerian customers via Flutterwave local rails.
- "Pay in NGN →" label in the modal for cross-region payment methods.
- Cross-region support for GHS and KES customer currencies.

#### USSD payments
- USSD bank payment method via Flutterwave (NGN only).
- 10 Nigerian bank icons in `sdk/assets/banks/`: Access, FCMB, First Bank, GTBank, Sterling, UBA, Union, VFD, Wema, Zenith.
- Bank selection and USSD code display in the checkout modal.

#### Treasury management
- Treasury CLI commands: `balance`, `wallet`, `deposit`, `withdraw`.
- `wallet` command uses `getBalance()` for accurate total balances across all coin objects.
- Auto-merging of fragmented coin objects during deposit.
- Network-aware suiscan links in CLI output.

#### UI/UX redesign
- Blue accent color (`#4E75F8`) replacing gold across all modals and demos.
- Compact QR panel for outPay (220px frame, reduced padding).
- Bold typography: title uppercase 20px/700, amounts 42px/700 (36px mobile).
- Visibility audit: all text bumped to meet WCAG AA contrast ratios.
- "outPay Mobile" renamed to "outPay" with dynamic token name in QR subtitle.
- Demo pages restyled: dark blue-gray background (`#1e293b`), blue buttons.

#### CoinGecko FX
- USD fallback conversion for coins with limited fiat price support.
- FX service always requests USD from CoinGecko, converts to target fiat via live cross-rate.
- Debug logging for empty CoinGecko responses and fallback conversions.

#### Demo files
- `demo/demo.html` - NGN checkout (single currency)
- `demo/demo(local).html` - NGN checkout (local backend)
- `demo/demo(multi-currency).html` - 40+ currencies with per-currency settlement tokens
- `demo/demo(multi-currency(local)).html` - multi-currency (local backend)

#### Initial SuiOutKit features
- Initial release with SUI-only settlement.
- Flutterwave bank transfer and OPay payment methods.
- Stripe card payments.
- Sui wallet and outPay crypto payments.
- On-chain settlement via Payment Kit PTBs.
- `SuiOutKitReceipt` minting on settlement.
- Walrus invoice storage.
- Redis session store.
- Checkout modal with payment method selection.
- SSE payment status streaming.
- Developer documentation and API reference.

### Fixed

- CoinGecko IDs corrected for: WAL (`walrus-2`), CETUS (`cetus-protocol`), SuiNS (`suins-token`), eSUID (`esui-dollar`), USDSui (`usdsui`).
- All fiat currencies standardized to `decimals: 2` for consistent display.
- `formatCurrency()` uses currency's `decimals` setting from config.

### Changed

- `settlementToken` on SDK config type changed from `string` to `string | string[]`.
- Backend normalizes `settlementToken` to `string[]` via `normalizeSettlementTokens()`.
- `getCoinConfig()` resolves symbol to full coin type before treasury check.
- `roundToCurrencyDecimals()` uses currency's `decimals` setting.
- Treasury CLI outputs JSON for single-coin insufficient scenarios (deposit logic auto-merges).

### Dependencies

- `node-fetch` removed from backend FX service (uses Node built-in `fetch`).

---

For the full commit history, see the [GitHub repository](https://github.com/the3rdweblabs/suioutkit/commits/main).
