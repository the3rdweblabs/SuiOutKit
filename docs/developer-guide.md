---
title: Developer Guide
description: Platform architecture, API contract, environment variables, and CI for contributors and operators.
---

This guide explains how the SuiOutKit platform is structured and how the SDK communicates with the backend during checkout and settlement.

**Merchants** use the hosted API - currently `https://api.staging.suioutkit.xyz` (testnet), with `https://api.suioutkit.xyz` (mainnet) planned for production go-live. Routes under `/v1/` (SDK `mode: "live"` default). See [Hosted API](/docs/hosted-api) for the deploy checklist and route map.

## Overview
SuiOutKit is a settlement system for payment methods that eventually resolve into Sui-based settlement. Developers integrate the browser SDK published as [`suioutkit`](https://www.npmjs.com/package/suioutkit), while the backend handles payment provider calls, treasury validation, receipt storage, and on-chain settlement.

The architecture is intentionally split:

- **SDK**: browser-side checkout and merchant integration
- **Backend**: payment orchestration, FX validation, treasury checks, Walrus uploads, and Sui settlement
- **Contracts**: Move package that enforces treasury release and receipt minting

## Repository Layout
- [`sdk/`](/sdk/) - NPM package for merchants
- [`backend/`](/backend/) - Express + TypeScript backend
- [`contracts/`](/contracts/) - Move contracts and tests
- [`demo/demo.html`](/demo/demo.html), [`demo/demo-e2e.html`](/demo/demo-e2e.html), [`demo/demo(multi-currency).html`](/demo/demo(multi-currency).html) - browser demos

## Checkout Flow
### 1. Create Session

The merchant site initializes a checkout session through the SDK.

```ts
const session = await sdk.initCheckout({
  amount: 29.99,
  currency: "USD",
  coinType: "0x2::sui::SUI", // optional: override settlement coin
  settlementToken: "USDC",   // optional: single token or ["SUI","USDC"]
  metadata: { orderId: "ORDER-123" }
});
```

The SDK sends the request to:

- `POST /v1/checkout/session`

The backend returns a session object containing a nonce, token, estimated FX rate, settlement coin type, supported coins list, and status.

### 2. User Confirms Payment
When the user clicks the payment action, the SDK calls:

- `POST /v1/checkout/charge`

The backend does the following:

1. Loads the session from Redis.
2. Fetches a fresh FX rate.
3. Calculates the settlement amount.
4. Checks treasury balance on-chain.
5. If the treasury is insufficient, returns `409` and blocks the payment.
6. If the treasury is sufficient, it starts the payment method flow.

### 3. Payment Provider Webhook
After the payment provider confirms success, it sends a webhook to the backend:

- `POST /v1/checkout/webhook`

The backend validates the webhook, then executes the Sui settlement PTB. Once the PTB confirms, the backend enqueues the pre-signed receipt payload to the Walrus upload queue; a background worker uploads the blob without blocking the response.

### 4. Settlement Status
The SDK or merchant UI can poll:

- `GET /v1/checkout/status/:nonce`

This is how the frontend learns whether a session is pending, processing, or settled.

## SDK API
### `SuiOutKit`
Main class exported from the package.

```ts
import { SuiOutKit } from "suioutkit";
```

Methods:

- `initCheckout(options)` - creates a session (accepts `amount`, `currency`, `metadata?`, `coinType?`)
- `openModal(session, options?)` - opens the checkout UI (accepts `SuiOutKitModalOptions` with `onClose`, `onPaymentComplete`, `redirectUrl`, `autoCloseOnSuccess`)
- `wrapButton(selector, options)` - binds checkout to a button (accepts `amount`, `currency`, `coinType?`, `metadata?`)

### Helper Exports
The package also exposes small helpers for custom integrations:

- `request(url, opts)` - fetch helper with timeout and JSON parsing
- `formatCurrency(amount, currency)` - format any fiat amount with correct symbol (e.g. `formatCurrency(29.99, "USD")` → `$29.99`)
- `toTokenUnits(baseUnits, decimals)` - convert from base units to token value
- `formatToken(amount, decimals, digits)` - format token amounts for display
- `createPolling(fn, intervalMs)` - lightweight polling helper

## Backend API Contract
These routes are required by the SDK and should remain stable.

### `POST /v1/checkout/session`
Creates a checkout session.

Request body:

```json
{
  "amount": 29.99,
  "currency": "USD",
  "merchantAddress": "0x...",
  "coinType": "0x2::sui::SUI",
  "settlementToken": "USDC",
  "metadata": {}
}
```

`settlementToken` accepts a string or array. The backend resolves the symbol to the full coin type and returns `supportedCoins` with `category` per entry.

### `POST /v1/checkout/charge`
Starts a payment provider flow.

Request body:

```json
{
  "token": "checkout-session-token",
  "method": "bank_transfer",
  "phoneNumber": "+234...",
  "accountBank": "044"
}
```

`phoneNumber` is required for `opay`; `accountBank` is required for `ussd`. Responses vary by method: `bank_transfer` returns `{status, virtualAccount, validatedRate}`, `opay` returns `{status, opayAuthorizationUrl, validatedRate}`, `ussd` returns `{status, ussdCode, paymentCode, validatedRate}`, and `stripe` returns `{status, clientSecret, stripePublicKey, validatedRate}`.

### `GET /v1/checkout/status/:nonce`
Returns settlement state and on-chain receipt data.

### `GET /v1/checkout/validate/:nonce`
Fetches a fresh FX rate for the session and returns `{coinType, exchangeRate, settlementAmount, message}` so the UI can display the current settlement estimate before the user proceeds.

## Environment Variables
The backend uses the following variables from [`backend/.env`](/backend/.env):

- `PORT`
- `PUBLIC_URL` - public base URL for OPay callback redirect (default `http://localhost:5000`)
- `REDIS_MODE` - `local`, `demo`, or `live` (Upstash/REST)
- `REDIS_URL` - connection string (used in `local`/`demo` mode)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS_ENABLED` - Redis config for `local` mode
- `SESSION_TTL` - checkout session expiry in seconds (default `86400`)
- `STRIPE_MODE` - `test` or `live` (default `test`)
- `STRIPE_PUBLIC_KEY_test` / `STRIPE_PUBLIC_KEY_live` - Stripe publishable key per mode (falls back to flat `STRIPE_PUBLIC_KEY`)
- `STRIPE_SECRET_KEY_test` / `STRIPE_SECRET_KEY_live` - Stripe secret per mode
- `STRIPE_WEBHOOK_SECRET_test` / `STRIPE_WEBHOOK_SECRET_live` - Stripe webhook signing secret per mode
- `FLW_API_BASE` - Flutterwave API base URL
- `FLW_MODE` - `test` or `live` (default `test`)
- `FLW_SECRET_KEY_test` / `FLW_SECRET_KEY_live` - Flutterwave secret per mode
- `FLW_HASH_test` / `FLW_HASH_live` - Webhook verification hash per mode
- `WALRUS_UPLOAD_MODE`
- `WALRUS_EPOCHS`
- `WALRUS_DELETABLE`
- `WALRUS_USE_UPLOAD_RELAY`
- `WALRUS_UPLOAD_RELAY_URL_testnet` / `WALRUS_UPLOAD_RELAY_URL_mainnet`
- `WALRUS_UPLOAD_RELAY_MAX_TIP`
- `WALRUS_PUBLISHER_URL_testnet` - publisher is testnet-only; mainnet uses SDK mode
- `WALRUS_OPERATOR_PRIVATE_KEY` - required in all modes (receipt signing + blob ID encoding)
- `SUI_GRPC_ENDPOINT_testnet` / `SUI_GRPC_ENDPOINT_mainnet`
- `SUI_GRAPHQL_ENDPOINT_testnet` / `SUI_GRAPHQL_ENDPOINT_mainnet`
- `SUI_NETWORK`
- `PACKAGE_ID_testnet` / `PACKAGE_ID_mainnet`
- `PAYMENT_KIT_PACKAGE_ID_testnet` / `PAYMENT_KIT_PACKAGE_ID_mainnet` - Payment Kit registry package (outPay flow)
- `TREASURY_ID_testnet` / `TREASURY_ID_mainnet`
- `TREASURY_ADMIN_CAP_ID_testnet` / `TREASURY_ADMIN_CAP_ID_mainnet` - optional TreasuryAdminCap override
- `SUPPORTED_COINS` - JSON map of settlement coins (primary config, replaces `SETTLEMENT_TOKEN_TYPE`)
- `SUPPORTED_COINS_TESTNET` - Network-specific override loaded when `SUI_NETWORK=testnet`. Falls back to `SUPPORTED_COINS`.
- `SUPPORTED_COINS_MAINNET` - Network-specific override loaded when `SUI_NETWORK=mainnet`. Falls back to `SUPPORTED_COINS`.
- `DEFAULT_COIN` - default settlement coin symbol (default `SUI`)
- `SETTLEMENT_TOKEN_TYPE` - legacy fallback when `SUPPORTED_COINS` is not set
- `FIAT_REGISTRY_ID_testnet` / `FIAT_REGISTRY_ID_mainnet`
- `FIAT_REGISTRY_NAME` - registry name string (e.g. `suioutkit-fiat-settlements`)
- `FIAT_REGISTRY_ADMIN_CAP_ID_testnet` / `FIAT_REGISTRY_ADMIN_CAP_ID_mainnet`
- `CRYPTO_REGISTRY_ID_testnet` / `CRYPTO_REGISTRY_ID_mainnet`
- `CRYPTO_REGISTRY_NAME`
- `CRYPTO_REGISTRY_ADMIN_CAP_ID_testnet` / `CRYPTO_REGISTRY_ADMIN_CAP_ID_mainnet`
- `SUI_OPERATOR_PRIVATE_KEY`
- `DEFAULT_CURRENCY` - default fiat currency when none specified (default `USD`)
- `SUPPORTED_FIAT_CURRENCIES` - comma-separated list of allowed fiat codes (empty = all 40)
- `ENABLE_GEO_DETECTION` - IP-based currency auto-detection (default `false`)
- `COINGECKO_API_MODE` - `demo`, `pro`, or empty (free tier)
- `COINGECKO_API_KEY_DEMO` - CoinGecko Demo API key (higher rate limits)
- `COINGECKO_API_KEY_PRO` - CoinGecko Pro API key (paid tier)
- `FX_CACHE_TTL` - FX price cache TTL in ms (default `30000`)

## Treasury and FX Policy
A payment confirmation is only allowed if the backend can validate two things:

1. The current FX rate is available.
2. The treasury holds enough of the settlement token to cover the payment amount.

The backend fetches a fresh rate at charge time so the amount used for settlement is the current value, not a stale cached estimate.

### Treasury CLI

The `treasury.ts` script provides commands for managing the on-chain treasury:

```bash
cd backend
npm run treasury:balance          # check treasury balance on-chain
npm run treasury:wallet           # check operator wallet balances (all coins)
npm run treasury:deposit <AMOUNT> <TOKEN>          # deposit tokens into treasury (auto-merges fragmented coins)
npm run treasury:withdraw <AMOUNT> <TOKEN>         # withdraw tokens from treasury
```

The `wallet` command uses `getBalance()` to show accurate total balances across all coin types. The `deposit` command auto-merges fragmented coin objects when a single coin has insufficient balance.

### Coin categories

Each settlement coin has a `category` field: `native` (SUI), `stablecoin` (USDC, USDT, USDSui, eSUID), `utility` (WAL, DEEP, SuiNS), or `defi` (CETUS). The backend uses this for display and filtering.

## On-Chain Flow
The Move contract provides two settlement paths:

- `checkout::settle_fiat<T>` - used for fiat payment completion after treasury release
- `checkout::mint_suioutkit_receipt` - used for wallet/native settlement flows where the payment receipt is already available in the same PTB

The treasury release is atomic. If the treasury balance is insufficient, the transaction aborts and no partial settlement is finalized.

## Security Notes
- Never expose operator private keys in the browser.
- Treat the backend as the source of truth for settlement state.
- Keep webhook verification enabled in production.
- Restrict CORS to trusted merchant origins in production.
- Bind merchant identity server-side instead of trusting only a client-supplied address.

## Development Commands
Backend:

```bash
cd backend
npm install
cp .env.example .env
npm run build
npm start
```

SDK:

```bash
cd sdk
npm install
npm run build
```

Contracts:

```bash
cd contracts/suioutkit
sui move test
```

## Troubleshooting
### Treasury aborts with code 4
The treasury does not hold enough of the requested coin type. Verify the operator deposit and the settlement amount derived from the current FX rate.

### FX falls back to defaults
The FX service failed to fetch the current rate from CoinGecko. Check network availability, API key configuration (`COINGECKO_API_MODE`), and backend logs. The service falls back to cached rates, then to hardcoded defaults.

### Walrus upload fails
Try enabling the upload relay or switching to SDK mode. In `publisher` mode, mainnet has no public publisher - use `WALRUS_UPLOAD_MODE=sdk`. Uploads run via the Redis queue worker (`walrus-queue.ts`), which retries up to 3 times; check backend logs for `WALRUS-QUEUE` entries.

## CI, Docker Compose & Testing
CI goals:

- Build and typecheck the backend and SDK.
- Optionally run Move tests when the `sui` toolchain is available on the runner.

The repository includes a GitHub Actions workflow at [`.github/workflows/ci.yml`](/.github/workflows/ci.yml) that:

- Checks out the repo.
- Sets up Node.js and installs dependencies for `backend` and `sdk`.
- Builds the backend and SDK (runs `tsc` via `npm run build`).
- Runs Move tests with `sui move test` only if `sui` is present on the runner (non-fatal if absent).

## Security & CI
- See the repository `SECURITY.md` for vulnerability reporting, disclosure guidance, and the preferred private contact. The `SECURITY.md` includes a placeholder contact: `security@suioutkit.xyz` - replace this with your real security alias.
- This repository includes CI and security checks:
  - Primary CI: [`.github/workflows/ci.yml`](/.github/workflows/ci.yml) - builds, typechecks, and optionally runs Move tests.
  - Security scans: [`.github/workflows/security.yml`](/.github/workflows/security.yml) - `npm audit` across `backend`, `sdk`, and `website`.
  - Dependabot: [`.github/dependabot.yml`](/.github/dependabot.yml) - scheduled dependency update PRs for npm packages and GitHub Actions.

Ensure the security contact is a monitored mailbox or team alias so vulnerability reports are acknowledged promptly.

## License
[GPL-3.0](../LICENSE)

## Authors
- [@The3rdWebLabs](https://github.com/the3rdweblabs)
- [@CYBWithFlourish](https://github.com/CYBWithFlourish/)
