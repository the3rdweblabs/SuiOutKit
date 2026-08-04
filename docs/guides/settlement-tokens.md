---
title: Settlement Tokens
description: Configuring which tokens merchants receive, network-aware coin setup, and per-checkout overrides.
---

SuiOutKit supports multi-token settlement - merchants choose which Sui-based token they receive when a checkout completes. Configure tokens globally via environment variables, or override per checkout.

## How it works

1. The backend loads settlement coins from `SUPPORTED_COINS` (or network-specific `SUPPORTED_COINS_TESTNET` / `SUPPORTED_COINS_MAINNET`).
2. When a session is created, the backend resolves the requested `settlementToken` to the full coin type.
3. At charge time, the treasury is checked for sufficient balance of that coin.
4. On settlement, the operator's treasury releases the tokens to the merchant.

The merchant's `merchantAddress` receives the settlement tokens directly on-chain.

## Operator Configuration

### Environment variables

Set `SUPPORTED_COINS_<NETWORK>` for network-aware configuration. The backend selects which config to load based on `SUI_NETWORK`.

```env
SUI_NETWORK=testnet

# Testnet: SUI, USDC, DEEP, WAL
SUPPORTED_COINS_TESTNET='{"SUI":{"type":"0x2::sui::SUI","coingeckoId":"sui","decimals":9,"category":"native"},"USDC":{"type":"0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC","coingeckoId":"usd-coin","decimals":6,"category":"stablecoin"},"DEEP":{"type":"0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP","coingeckoId":"deepbook","decimals":6,"category":"utility"},"WAL":{"type":"0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL","coingeckoId":"walrus-2","decimals":9,"category":"utility"}}'

DEFAULT_COIN=SUI
```

Fallback chain: `SUPPORTED_COINS_TESTNET` → `SUPPORTED_COINS` → single-SUI default.

### Config format

Each entry in the JSON map has four fields:

| Field | Description |
|-------|-------------|
| `type` | Full coin type on Sui (e.g. `0x2::sui::SUI`) |
| `coingeckoId` | CoinGecko slug for FX pricing |
| `decimals` | Token decimals (9 for SUI/WAL, 6 for USDC/DEEP) |
| `category` | One of: `native`, `stablecoin`, `utility`, `defi` |

## Coin categories

| Category | Tokens | When to use |
|----------|--------|-------------|
| `native` | SUI | Gas token, most widely accepted |
| `stablecoin` | USDC, USDT, USDSui, eSUID | Price-stable settlement, preferred for non-crypto merchants |
| `utility` | WAL, DEEP, SuiNS | Protocol-specific tokens, ecosystem incentives |
| `defi` | CETUS | DeFi protocol tokens |

Categories are used for display and filtering in the modal. The modal groups coins by category so customers can quickly find the token they want.

## Per-checkout override

Merchants can override the default settlement token when calling `initCheckout`:

### Single token

```ts
const session = await sdk.initCheckout({
  amount: 29.99,
  currency: "USD",
  settlementToken: "USDC",
});
```

### Multiple options

Let the customer choose from several tokens:

```ts
const session = await sdk.initCheckout({
  amount: 1500,
  currency: "NGN",
  settlementToken: ["SUI", "USDC", "DEEP"],
});
```

The modal shows a token selector when multiple options are provided. The customer picks one before proceeding.

### Per-currency defaults

Merchants can set different settlement tokens per currency by always passing `settlementToken` in the SDK call:

```ts
// USD merchant - always USDC
const session = await sdk.initCheckout({
  amount: 50,
  currency: "USD",
  settlementToken: "USDC",
});

// NGN merchant - accepts SUI or USDC
const session = await sdk.initCheckout({
  amount: 5000,
  currency: "NGN",
  settlementToken: ["SUI", "USDC"],
});

// EUR merchant - accepts USDC or USDT
const session = await sdk.initCheckout({
  amount: 25,
  currency: "EUR",
  settlementToken: ["USDC", "USDT"],
});
```

When `settlementToken` is omitted, the backend uses `DEFAULT_COIN` (default: `SUI`).

## How the backend resolves tokens

1. The SDK sends `settlementToken` as a string or array.
2. The backend normalizes it to `string[]` via `normalizeSettlementTokens()`.
3. For each token symbol, the backend calls `getCoinConfig()` to resolve the full coin type from `SUPPORTED_COINS`.
4. If the symbol is not found, the backend returns a `400` error listing supported tokens.
5. The first resolved token is used for the treasury check and settlement.

## Adding a new token

To add a new settlement token (e.g. a new mainnet token):

1. **Find the coin type** on SuiScan or the Sui explorer for the token you want to add.
2. **Find the CoinGecko slug** by searching [CoinGecko](https://www.coingecko.com/). The slug is the URL-friendly name (e.g. `walrus-2` for WAL).
3. **Add to config** in `backend/.env`:

```env
SUPPORTED_COINS_MAINNET='{"SUI":{...},"USDC":{...},"NEWTOKEN":{"type":"0x...::module::TOKEN","coingeckoId":"coingecko-slug","decimals":9,"category":"utility"}}'
```

4. **Deposit to treasury** using the treasury CLI:

```bash
cd backend
npm run treasury:deposit <AMOUNT> <NEWTOKEN>
```

5. **Test** by creating a session with `settlementToken: "NEWTOKEN"` and verifying the `estimatedRate` is correct.

## Treasury requirements

Each settlement token needs its own treasury balance. The backend checks treasury coverage per token at charge time. If you accept SUI and USDC, you need sufficient SUI and USDC in the treasury.

See [Treasury Management](/docs/guides/treasury) for deposit and monitoring procedures.

## Response fields

The session response includes settlement token details:

```json
{
  "settlementToken": ["USDC"],
  "coinType": "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
  "supportedCoins": [
    { "symbol": "SUI", "type": "0x2::sui::SUI", "decimals": 9, "category": "native" },
    { "symbol": "USDC", "type": "0xa1ec...::usdc::USDC", "decimals": 6, "category": "stablecoin" },
    { "symbol": "DEEP", "type": "0x36db...::deep::DEEP", "decimals": 6, "category": "utility" }
  ],
  "estimatedRate": 1368.01
}
```

- `settlementToken`: Normalized to `string[]` from the input.
- `coinType`: The resolved full type for the first settlement token (used for treasury check).
- `supportedCoins`: All coins configured on the backend, with `category` per entry.

## See also

- [Coin Configuration](/docs/guides/coin-configuration) - detailed config reference for all supported coins
- [Treasury Management](/docs/guides/treasury) - deposit, monitor, and manage treasury balances
- [Currencies](/docs/guides/currencies) - fiat currency support and FX rates
- [FX Rates](/docs/guides/fx-rates) - how token prices are calculated
