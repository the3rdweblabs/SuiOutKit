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
| `REDIS_MODE` | `local` (standalone Redis via `ioredis`) or `live` (Upstash REST) |
| `REDIS_URL` | Redis connection string (used when `REDIS_MODE=local`) |
| `REDIS_HOST`, `REDIS_PORT` | Redis host/port override (optional, default `localhost:6379`) |
| `REDIS_PASSWORD` | Redis password / Upstash token |
| `REDIS_TLS_ENABLED` | Set `true` to enable TLS (Upstash) |
| `SESSION_TTL` | Checkout session expiry in seconds (default `1800`) |

### Minimum for local development

For a quick local run you typically need at least:

```text
PORT=5000
REDIS_MODE=local
REDIS_URL=redis://localhost:6379
SUI_NETWORK=testnet
SUPPORTED_COINS='{"SUI":{"type":"0x2::sui::SUI","coingeckoId":"sui","decimals":9}}'
```

Operator-only values (Sui keys, WALRUS keys, provider secrets) are required for a production deployment. See [`backend/.env.example`](/backend/.env.example) for full list and example values.

## Payment providers

Provider keys use a **mode prefix** pattern (like `SUI_NETWORK`). Set `FLW_MODE` or `STRIPE_MODE` to `test` or `live`, then provide suffixed keys. Flat (un-suffixed) vars are supported as a backward-compatible fallback.

### Flutterwave

| Variable | Description |
|----------|-------------|
| `FLW_MODE` | `test` or `live` (default `test`) |
| `FLW_API_BASE` | Flutterwave API base URL |
| `FLW_PUBLIC_KEY_test` / `FLW_PUBLIC_KEY_live` | Flutterwave public key per mode |
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

- Suffixed vars take priority. If `FLW_SECRET_KEY_test` is set and `FLW_MODE=test`, that value is used. If absent, falls back to flat `FLW_SECRET_KEY`.
- Use Stripe test keys for development and `sk_live...` keys in production. Keep secret keys server-side only.
- For Flutterwave, secret keys should start with `FLWSECK` (Test or Live). `FLW_HASH` is used to validate incoming webhooks.

## Sui

| Variable | Description |
|----------|-------------|
| `SUI_GRPC_ENDPOINT` | gRPC endpoint (used by SuiGrpcClient for Payment Kit, settlement, and treasury flows) |
| `SUI_GRAPHQL_ENDPOINT` | GraphQL RPC endpoint (used by indexer for event polling) |
| `SUI_NETWORK` | `testnet` or `mainnet` |
| `PACKAGE_ID` | Published suioutkit Move package |
| `PAYMENT_KIT_PACKAGE_ID_testnet` / `PAYMENT_KIT_PACKAGE_ID_mainnet` | Payment Kit registry package (required for outPay flow) |
| `TREASURY_ID` | Treasury shared object |
| `TREASURY_ADMIN_CAP_ID` | Optional - TreasuryAdminCap object ID (skips wallet scan on treasury scripts) |
| `FIAT_REGISTRY_ID` | Payment Kit registry (fiat) |
| `FIAT_REGISTRY_ADMIN_CAP_ID` | Registry admin cap |
| `FIAT_REGISTRY_NAME` | Registry name string (e.g. `suioutkit-fiat-settlements`) |
| `CRYPTO_REGISTRY_ID` | Registry (crypto flows) |
| `CRYPTO_REGISTRY_NAME` | Registry name string |
| `CRYPTO_REGISTRY_ADMIN_CAP_ID` | Crypto admin cap |
| `SUPPORTED_COINS` | JSON map of settlement coins. Format: `{"SYMBOL":{"type":"<full_coin_type>","coingeckoId":"<coingecko_id>","decimals":<int>}}`. Example: `{"SUI":{"type":"0x2::sui::SUI","coingeckoId":"sui","decimals":9},"USDC":{"type":"0x...::usdc::USDC","coingeckoId":"usd-coin","decimals":6}}` |
| `DEFAULT_COIN` | Symbol of the default settlement coin (default `SUI`) |
| `SETTLEMENT_TOKEN_TYPE` | Legacy - fallback when `SUPPORTED_COINS` is not set. Use `SUPPORTED_COINS` instead. |
| `SUI_OPERATOR_PRIVATE_KEY` | Signs settlement PTBs |
| `DEFAULT_CURRENCY` | Default fiat currency when none specified and geo detection is off (default `USD`) |
| `SUPPORTED_FIAT_CURRENCIES` | Comma-separated fiat codes to accept (empty = all 40+). Example: `NGN,USD,GBP,EUR` |
| `ENABLE_GEO_DETECTION` | Auto-detect user currency from IP (default `false`) |
| `COINGECKO_API_MODE` | FX rate source: `demo` (higher limits, same endpoint), `pro` (paid, highest limits), or empty (free tier) |
| `COINGECKO_API_KEY_DEMO` | CoinGecko Demo API key for `COINGECKO_API_MODE=demo` |
| `COINGECKO_API_KEY_PRO` | CoinGecko Pro API key for `COINGECKO_API_MODE=pro` |
| `FX_CACHE_TTL` | FX price cache duration in ms (default `30000`) |

Notes:

- `SUI_OPERATOR_PRIVATE_KEY` must be kept secret. The backend accepts either bech32 (`suiprivkey1...`) or hex-prefixed (`0x...`) formats; ensure your operator wallet has SUI for gas.
- `PACKAGE_ID`, `TREASURY_ID`, and registry IDs are populated when you deploy the Move package and bootstrap registries - see [`contracts/suioutkit/`](/contracts/suioutkit/) and the Developer Guide for deploy steps.

## Walrus

| Variable | Description |
|----------|-------------|
| `WALRUS_UPLOAD_MODE` | `publisher` or `sdk` |
| `WALRUS_EPOCHS` | Storage epochs |
| `WALRUS_DELETABLE` | Allow blob deletion (default `false`) |
| `WALRUS_PUBLISHER_URL` | Publisher URL (testnet/mainnet) |
| `WALRUS_USE_UPLOAD_RELAY` | Enable upload relay fallback |
| `WALRUS_UPLOAD_RELAY_URL` | Upload relay endpoint |
| `WALRUS_UPLOAD_RELAY_MAX_TIP` | Max tip for relay upload |
| `WALRUS_OPERATOR_PRIVATE_KEY` | Required when `WALRUS_UPLOAD_MODE=sdk` |

Notes:

- `WALRUS_UPLOAD_MODE=publisher` lets you use the public Walrus publisher endpoint (no operator key needed). `sdk` mode requires `WALRUS_OPERATOR_PRIVATE_KEY` and SUI/WAL funds for registering blobs.

## Troubleshooting

| Issue | Check |
|-------|--------|
| Treasury abort code 4 | Fund treasury for the settlement coin type (see `SUPPORTED_COINS`) |
| FX falls back to defaults | CoinGecko unreachable; check `COINGECKO_API_MODE` and API keys |
| Walrus upload fails | Try upload relay or publisher mode |

If you are operating the backend in production, follow the Developer Guide ([`/docs/developer-guide`](/docs/developer-guide.md)) for deployment checklists (keys, secure env, and Sui object IDs). Always rotate and protect private keys.
