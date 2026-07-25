---
title: FX Rates
description: How SuiOutKit fetches live token prices from CoinGecko, converts fiat-to-fiat, and handles fallbacks.
---

SuiOutKit fetches live exchange rates from CoinGecko to calculate how many tokens a customer needs to pay a given fiat amount. The FX service powers the `estimatedRate` in session responses and the settlement amount at charge time.

## Architecture

```mermaid
CoinGecko API → Coin Price Cache → getRate()
                    ↓
            Fiat-to-Fiat Rate → USD conversion fallback
                    ↓
            Hardcoded Defaults (last resort)
```

1. The FX service requests prices from CoinGecko for the configured coin and fiat currencies.
2. Prices are cached in memory for `FX_CACHE_TTL` milliseconds (default 30s).
3. If CoinGecko is unreachable or returns empty prices, the service falls back to cached rates, then to USD conversion, then to hardcoded defaults.

## CoinGecko API modes

Three tiers are available, each falling back to the next on failure:

| Mode | Endpoint | Key required | Rate limits |
|------|----------|-------------|-------------|
| Free | `api.coingecko.com` | No | ~10-30 calls/min |
| Demo | `api.coingecko.com` | `COINGECKO_API_KEY_DEMO` | Higher limits |
| Pro | `pro-api.coingecko.com` | `COINGECKO_API_KEY_PRO` | Highest limits |

```env
# Free (default)
COINGECKO_API_MODE=

# Demo
COINGECKO_API_MODE=demo
COINGECKO_API_KEY_DEMO=your_demo_key

# Pro
COINGECKO_API_MODE=pro
COINGECKO_API_KEY_PRO=your_pro_key
```

Each mode falls back to free if it fails. If free also fails, the service uses cached rates or hardcoded defaults.

## CoinGecko ID mapping

Each settlement token has a `coingeckoId` that maps to its CoinGecko slug. Wrong IDs cause empty prices and fallback behavior.

| Token | CoinGecko ID | CoinGecko Name |
|-------|-------------|----------------|
| SUI | `sui` | Sui |
| USDC | `usd-coin` | USD Coin |
| USDT | `tether` | Tether |
| DEEP | `deepbook` | DeepBook |
| WAL | `walrus-2` | Walrus |
| CETUS | `cetus-protocol` | Cetus Protocol |
| SuiNS | `suins-token` | Sui Name Service |
| eSUID | `esui-dollar` | eSUI Dollar |
| USDSui | `usdsui` | USDSui |

**Important:** CoinGecko IDs are URL slugs, not token names. Verify by checking the token's page on [coingecko.com](https://www.coingecko.com/) - the slug is in the URL (e.g. `coingecko.com/en/coins/walrus-2`).

### Verifying IDs

If a token shows wrong amounts, check the CoinGecko ID:

1. Search for the token on CoinGecko.
2. Copy the slug from the URL.
3. Update `coingeckoId` in `SUPPORTED_COINS`.
4. Restart the backend.

## USD fallback

When CoinGecko does not return a price for a specific fiat currency (common for smaller-cap tokens and non-USD fiats), the FX service converts via USD:

1. Get the coin's USD price from CoinGecko (always requested).
2. Convert USD to the target fiat using the live USD/fiat rate.
3. Return the converted rate.

Example: DEEP at $0.017, customer currency NGN at 1,550 NGN/USD:
- CoinGecko returns `usd: 0.017` for DEEP (no NGN price)
- FX service converts: `0.017 * 1550 = 26.35 NGN per DEEP`
- 1000 NGN ÷ 26.35 = ~38 DEEP

This fallback ensures all tokens show reasonable amounts for any supported fiat currency.

## Fiat-to-fiat conversion

The FX service derives fiat-to-fiat rates (e.g. USD→NGN) by fetching SUI prices in both currencies from CoinGecko and computing the ratio:

```mermaid
USD→NGN rate = SUI price in NGN / SUI price in USD
```

This gives a live market-derived cross rate without needing a separate forex API. If CoinGecko is unavailable, hardcoded defaults are used:

| Currency | Default rate (vs USD) |
|----------|----------------------|
| NGN | 1,550 |
| GHS | 15 |
| KES | 153 |
| Other | Derived from CoinGecko or 1:1 |

## How rates are used

### Session creation

The `estimatedRate` in the session response is the fiat-to-token rate at session creation time. This is a preview - the actual rate is fetched again at charge time.

```json
{
  "amount": 1000,
  "currency": "NGN",
  "coinType": "0x36db...::deep::DEEP",
  "estimatedRate": 23.77
}
```

Customer pays `₦1000 ÷ 23.77 = ~42 DEEP`.

### Charge time

At charge time, the backend fetches a fresh rate and recalculates the settlement amount. This ensures the merchant receives the correct value even if rates moved since session creation.

### Treasury check

The backend checks if the treasury holds enough of the settlement token to cover the recalculated amount. If not, the charge returns `409 Treasury insufficient`.

## Cache TTL

Control how long prices are cached in memory:

```env
FX_CACHE_TTL=30000  # 30 seconds (default)
```

Lower values = more frequent API calls but fresher rates. Higher values = fewer API calls but potentially stale rates.

CoinGecko free tier has ~30 calls/min. With 30s cache and multiple tokens, you may hit limits. Use demo or pro keys for higher throughput.

## Debugging

### Backend logs

The FX service logs diagnostic messages:

```
[FX SERVICE]: Fetched prices for sui in 40 currencies
[FX SERVICE]: deepbook/ngn converted from USD: 0.017 * 1550 = 26.35
[FX SERVICE]: CoinGecko returned empty prices for cetus-protocol, response: {...}
[FX SERVICE WARNING]: CoinGecko Demo failed for walrus-2: rate limit exceeded, trying free API
[FX SERVICE WARNING]: CoinGecko fetch failed for deepbook, using defaults: timeout
```

Look for `[FX SERVICE]` in backend logs when debugging rate issues.

### Common issues

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Rate shows 1 (hardcoded default) | CoinGecko unreachable | Check network, API keys |
| Wrong token amount (0.something) | Wrong CoinGecko ID | Verify slug on coingecko.com |
| Rate stale / not updating | Cache TTL too high | Lower `FX_CACHE_TTL` |
| 429 rate limit errors | Too many API calls | Use demo/pro keys or increase cache |
| Some currencies missing | CoinGecko doesn't support that fiat for that coin | USD fallback handles this automatically |

## Cache behavior

- Cache is per-coin, stored in memory on the backend process.
- Cache is cleared on backend restart.
- `skipCache: true` bypasses cache (used internally for fresh rate at charge time).
- Multiple backend instances have independent caches.

## See also

- [Currencies](/docs/guides/currencies) - supported fiat currencies and formatting
- [Coin Configuration](/docs/guides/coin-configuration) - CoinGecko ID configuration per token
- [Settlement Tokens](/docs/guides/settlement-tokens) - configuring settlement coins
- [Environment](/docs/guides/environment) - FX env vars
