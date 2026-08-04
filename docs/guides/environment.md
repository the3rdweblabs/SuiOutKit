---
title: Environment
description: Backend environment variables (SuiOutKit operators only).
---

<div class="caution"><strong>Not required for SDK integration.</strong> This page is for teams operating or running the SuiOutKit backend. Merchants only need `merchantAddress` in the SDK - see <a href="/docs/getting-started/installation">Installation</a>.</div>

Configure these values in `backend/.env` (see [`backend/.env.example`](/backend/.env.example)). The table below separates core operator values from optional provider and storage settings. Keep operator private keys and provider secrets out of client-side code.

## Core

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port (default `5000`) |
| `PUBLIC_URL` | Public-facing base URL used for OPay callback redirect (`/v1/checkout/opay/callback`). Defaults to `http://localhost:5000`. Set to your production host (e.g. `https://api.suioutkit.xyz`). |
| `REDIS_MODE` | `local` (standalone Redis via `ioredis`), `demo` (hosted single-URL, e.g. Railway/Upstash), or `live` (Upstash REST) |
| `REDIS_URL` | Redis connection string (used when `REDIS_MODE=local` or `demo`) |
| `REDIS_HOST`, `REDIS_PORT` | Redis host/port override (optional, default `localhost:6379`) |
| `REDIS_PASSWORD` | Redis password / Upstash token |
| `REDIS_TLS_ENABLED` | Set `true` to enable TLS (Upstash) |
| `SESSION_TTL` | Checkout session expiry in seconds (default `86400` / 24h) |

### Minimum for local development

For a quick local run you typically need at least:

```text
PORT=5000
REDIS_MODE=local
REDIS_URL=redis://localhost:6379
SUI_NETWORK=testnet
SUPPORTED_COINS='{"SUI":{"type":"0x2::sui::SUI","coingeckoId":"sui","decimals":9,"category":"native"}}'
```

Operator-only values (Sui keys, WALRUS keys, provider secrets) are required for a production deployment. See [`backend/.env.example`](/backend/.env.example) for full list and example values.

## Payment providers

Provider keys use a **mode prefix** pattern (like `SUI_NETWORK`). Set `FLW_MODE` or `STRIPE_MODE` to `test` or `live`, then provide suffixed keys. Flat (un-suffixed) vars are supported as a backward-compatible fallback.

### Flutterwave

| Variable | Description |
|----------|-------------|
| `FLW_MODE` | `test` or `live` (default `test`) |
| `FLW_API_BASE` | Flutterwave API base URL |
| `FLW_SECRET_KEY_test` / `FLW_SECRET_KEY_live` | Flutterwave secret per mode |
| `FLW_HASH_test` / `FLW_HASH_live` | Webhook verification hash per mode |

### Stripe

| Variable | Description |
|----------|-------------|
| `STRIPE_MODE` | `test` or `live` (default `test`) |
| `STRIPE_PUBLIC_KEY_test` / `STRIPE_PUBLIC_KEY_live` | Stripe publishable key per mode |
| `STRIPE_SECRET_KEY_test` / `STRIPE_SECRET_KEY_live` | Stripe secret per mode |
| `STRIPE_WEBHOOK_SECRET_test` / `STRIPE_WEBHOOK_SECRET_live` | Stripe webhook signing secret per mode |

Notes:

- Suffixed vars take priority. If `FLW_SECRET_KEY_test` is set and `FLW_MODE=test`, that value is used. If absent, falls back to flat `FLW_SECRET_KEY`. The same applies to Stripe: `STRIPE_PUBLIC_KEY_${STRIPE_MODE}`, `STRIPE_SECRET_KEY_${STRIPE_MODE}`, and `STRIPE_WEBHOOK_SECRET_${STRIPE_MODE}` take priority, with flat fallbacks.
- Use Stripe test keys for development and `sk_live...` keys in production. Keep secret keys server-side only.
- For Flutterwave, secret keys should start with `FLWSECK` (Test or Live). `FLW_HASH` is used to validate incoming webhooks.

## Sui

| Variable | Description |
|----------|-------------|
| `SUI_GRPC_ENDPOINT_testnet` / `SUI_GRPC_ENDPOINT_mainnet` | gRPC endpoint per network (used by SuiGrpcClient for Payment Kit, settlement, and treasury flows). Flat `SUI_GRPC_ENDPOINT` accepted as fallback. |
| `SUI_GRAPHQL_ENDPOINT_testnet` / `SUI_GRAPHQL_ENDPOINT_mainnet` | GraphQL RPC endpoint per network (used by indexer for event polling). Flat `SUI_GRAPHQL_ENDPOINT` accepted as fallback. |
| `SUI_NETWORK` | `testnet` or `mainnet` |
| `PACKAGE_ID_testnet` / `PACKAGE_ID_mainnet` | Published suioutkit Move package (network-suffixed) |
| `PAYMENT_KIT_PACKAGE_ID_testnet` / `PAYMENT_KIT_PACKAGE_ID_mainnet` | Payment Kit registry package (required for outPay flow) |
| `TREASURY_ID_testnet` / `TREASURY_ID_mainnet` | Treasury shared object (network-suffixed) |
| `TREASURY_ADMIN_CAP_ID_testnet` / `TREASURY_ADMIN_CAP_ID_mainnet` | Optional - TreasuryAdminCap object ID (skips wallet scan on treasury scripts) |
| `FIAT_REGISTRY_ID_testnet` / `FIAT_REGISTRY_ID_mainnet` | Payment Kit registry (fiat) |
| `FIAT_REGISTRY_ADMIN_CAP_ID_testnet` / `FIAT_REGISTRY_ADMIN_CAP_ID_mainnet` | Registry admin cap |
| `FIAT_REGISTRY_NAME` | Registry name string (e.g. `suioutkit-fiat-settlements`) |
| `CRYPTO_REGISTRY_ID_testnet` / `CRYPTO_REGISTRY_ID_mainnet` | Registry (crypto flows) |
| `CRYPTO_REGISTRY_NAME` | Registry name string |
| `CRYPTO_REGISTRY_ADMIN_CAP_ID_testnet` / `CRYPTO_REGISTRY_ADMIN_CAP_ID_mainnet` | Crypto admin cap |
| `SUPPORTED_COINS` | JSON map of settlement coins. Format: `{"SYMBOL":{"type":"<full_coin_type>","coingeckoId":"<coingecko_id>","decimals":<int>,"category":"<cat>"}}`. Categories: `native`, `stablecoin`, `utility`, `defi`. Example: `{"SUI":{"type":"0x2::sui::SUI","coingeckoId":"sui","decimals":9,"category":"native"},"USDC":{"type":"0x...::usdc::USDC","coingeckoId":"usd-coin","decimals":6,"category":"stablecoin"}}` |
| `SUPPORTED_COINS_TESTNET` | Network-specific override — loaded when `SUI_NETWORK=testnet`. Falls back to `SUPPORTED_COINS` if not set. |
| `SUPPORTED_COINS_MAINNET` | Network-specific override — loaded when `SUI_NETWORK=mainnet`. Falls back to `SUPPORTED_COINS` if not set. |
| `DEFAULT_COIN` | Symbol of the default settlement coin (default `SUI`) |
| `SETTLEMENT_TOKEN_TYPE` | Legacy - fallback when `SUPPORTED_COINS` is not set. Use `SUPPORTED_COINS` instead. |
| `SUI_OPERATOR_PRIVATE_KEY` | Signs settlement PTBs |
| `DEFAULT_CURRENCY` | Default fiat currency when none specified and geo detection is off (default `USD`) |
| `SUPPORTED_FIAT_CURRENCIES` | Comma-separated fiat codes to accept (empty = all 40). Example: `NGN,USD,GBP,EUR` |
| `ENABLE_GEO_DETECTION` | Auto-detect user currency from IP (default `false`) |
| `COINGECKO_API_MODE` | FX rate source: `demo` (higher limits, same endpoint), `pro` (paid, highest limits), or empty (free tier) |
| `COINGECKO_API_KEY_DEMO` | CoinGecko Demo API key for `COINGECKO_API_MODE=demo` |
| `COINGECKO_API_KEY_PRO` | CoinGecko Pro API key for `COINGECKO_API_MODE=pro` |
| `FX_CACHE_TTL` | FX price cache duration in ms (default `30000`) |

Notes:

- `SUI_OPERATOR_PRIVATE_KEY` must be kept secret. The backend accepts either bech32 (`suiprivkey1...`) or hex-prefixed (`0x...`) formats; ensure your operator wallet has SUI for gas.
- `PACKAGE_ID_<NETWORK>`, `TREASURY_ID_<NETWORK>`, and registry IDs are populated when you deploy the Move package and bootstrap registries - see [`contracts/suioutkit/`](/contracts/suioutkit/) and the Developer Guide for deploy steps. Only the network-suffixed forms are read; there is no flat fallback.

## Walrus

| Variable | Description |
|----------|-------------|
| `WALRUS_UPLOAD_MODE` | `publisher` or `sdk` |
| `WALRUS_EPOCHS` | Storage epochs |
| `WALRUS_DELETABLE` | Allow blob deletion (default `false`) |
| `WALRUS_PUBLISHER_URL_testnet` | Publisher URL (testnet only). No public publisher exists on mainnet - use `WALRUS_UPLOAD_MODE=sdk` there. Flat `WALRUS_PUBLISHER_URL` accepted as fallback. |
| `WALRUS_USE_UPLOAD_RELAY` | Enable upload relay fallback |
| `WALRUS_UPLOAD_RELAY_URL_testnet` / `WALRUS_UPLOAD_RELAY_URL_mainnet` | Upload relay endpoint per network |
| `WALRUS_UPLOAD_RELAY_MAX_TIP` | Max tip for relay upload |
| `WALRUS_OPERATOR_PRIVATE_KEY` | Required in **all** modes - signs the receipt and is used by the SDK encoding client during `prepareInvoice()` |

Notes:

- `WALRUS_OPERATOR_PRIVATE_KEY` is required regardless of mode. `prepareInvoice()` always runs the local erasure-encoding client to compute the blob ID up front, so the signer key must be present in both `publisher` and `sdk` modes.
- `WALRUS_UPLOAD_MODE=publisher` uploads blobs via a single HTTP PUT to the public Walrus publisher endpoint (no per-blob storage fund, but WAL/SUI fees still apply for blob registration). `sdk` mode uploads via the Walrus TypeScript SDK and requires SUI/WAL funds for registering blobs.

### Receipt upload queue

Receipt uploads never block the checkout response. After the settlement PTB confirms, the backend enqueues the pre-signed invoice payload to a Redis list (`suioutkit:walrus-uploads`). A background worker (started on server boot) polls the queue every 5 seconds, calls `uploadInvoice()` with the pre-signed payload, and retries up to 3 times before giving up. The worker shuts down gracefully on `SIGTERM`/`SIGINT`. See `backend/src/services/walrus-queue.ts`.

## Troubleshooting

| Issue | Check |
|-------|--------|
| Treasury abort code 4 | Fund treasury for the settlement coin type (see `SUPPORTED_COINS`) |
| Wrong CoinGecko IDs | Verify `coingeckoId` values match CoinGecko slugs (e.g. WAL→`walrus-2`, CETUS→`cetus-protocol`, SuiNS→`suins-token`). Wrong IDs cause empty prices and fallback to SUI default rate. |
| FX falls back to defaults | CoinGecko unreachable; check `COINGECKO_API_MODE` and API keys |
| Walrus upload fails | Try upload relay or publisher mode |

If you are operating the backend in production, follow the Developer Guide ([`/docs/developer-guide`](/docs/developer-guide.md)) for deployment checklists (keys, secure env, and Sui object IDs). Always rotate and protect private keys.
