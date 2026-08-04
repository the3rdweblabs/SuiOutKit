---
title: Coin Configuration
description: Configuring settlement tokens - coin types, CoinGecko IDs, decimals, categories, and network-specific setup.
---

SuiOutKit supports multiple Sui-based tokens for settlement. This page covers the full configuration reference, supported coins, and how to add custom tokens.

## Configuration format

Coins are configured as a JSON map in environment variables. Each entry maps a symbol to its metadata:

```json
{
  "SUI": {
    "type": "0x2::sui::SUI",
    "coingeckoId": "sui",
    "decimals": 9,
    "category": "native"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Full coin type on Sui (e.g. `0x2::sui::SUI`) |
| `coingeckoId` | `string` | CoinGecko slug for FX pricing |
| `decimals` | `number` | Token decimals (used for display and amount calculations) |
| `category` | `string` | One of: `native`, `stablecoin`, `utility`, `defi` |

## Environment variables

| Variable | When loaded |
|----------|-------------|
| `SUPPORTED_COINS_TESTNET` | `SUI_NETWORK=testnet` |
| `SUPPORTED_COINS_MAINNET` | `SUI_NETWORK=mainnet` |
| `SUPPORTED_COINS` | Fallback when network-specific var is not set |
| `DEFAULT_COIN` | Default settlement coin symbol (default `SUI`) |

The backend selects the config based on `SUI_NETWORK`. If `SUPPORTED_COINS_TESTNET` is set and `SUI_NETWORK=testnet`, that config is used. Otherwise falls back to `SUPPORTED_COINS`, then to a single-SUI default.

## Supported coins

### Testnet

| Symbol | Type | CoinGecko ID | Decimals | Category |
|--------|------|-------------|----------|----------|
| SUI | `0x2::sui::SUI` | `sui` | 9 | native |
| USDC | `0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC` | `usd-coin` | 6 | stablecoin |
| DEEP | `0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP` | `deepbook` | 6 | utility |
| WAL | `0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL` | `walrus-2` | 9 | utility |

### Mainnet

| Symbol | Type | CoinGecko ID | Decimals | Category |
|--------|------|-------------|----------|----------|
| SUI | `0x2::sui::SUI` | `sui` | 9 | native |
| USDC | `0xdba33f...::usdc::USDC` | `usd-coin` | 6 | stablecoin |
| USDT | `0x375f8...::usdt::USDT` | `tether` | 6 | stablecoin |
| USDSui | `0x44f88...::usdsui::USDSUI` | `usdsui` | 6 | stablecoin |
| eSUID | `0x41d5a...::sui_usde::SUI_USDE` | `esui-dollar` | 6 | stablecoin |
| WAL | `0x356a1...::wal::WAL` | `walrus-2` | 9 | utility |
| DEEP | `0xdeeb3...::deep::DEEP` | `deepbook` | 6 | utility |
| CETUS | `0x06863...::cetus::CETUS` | `cetus-protocol` | 9 | defi |
| SuiNS | `0x51454...::ns::NS` | `suins-token` | 6 | utility |

## Coin categories

| Category | Description | Examples |
|----------|-------------|----------|
| `native` | Blockchain gas token, most widely accepted | SUI |
| `stablecoin` | Price-pegged tokens (USD-pegged) | USDC, USDT, USDSui, eSUID |
| `utility` | Protocol-specific utility tokens | WAL, DEEP, SuiNS |
| `defi` | DeFi protocol governance/utility tokens | CETUS |

Categories help the modal organize the token selector and help merchants filter which tokens to accept.

## CoinGecko IDs

CoinGecko IDs are the URL slugs used on coingecko.com. They are **not** the token name or symbol.

### Finding the correct slug

1. Go to [coingecko.com](https://www.coingecko.com/).
2. Search for the token.
3. The slug is in the URL: `coingecko.com/en/coins/<slug>`

Examples:
- Sui → `coingecko.com/en/coins/sui` → slug: `sui`
- Walrus → `coingecko.com/en/coins/walrus-2` → slug: `walrus-2`
- Cetus → `coingecko.com/en/coins/cetus-protocol` → slug: `cetus-protocol`
- Sui Name Service → `coingecko.com/en/coins/suins-token` → slug: `suins-token`

### Common mistakes

| Token | Wrong ID | Correct ID |
|-------|----------|------------|
| WAL | `walrus` | `walrus-2` |
| CETUS | `cetus` | `cetus-protocol` |
| SuiNS | `suins` | `suins-token` |
| eSUID | `ethena-usde` | `esui-dollar` |
| USDSui | `sui-usds` | `usdsui` |

Wrong IDs cause CoinGecko to return empty prices. The FX service falls back to USD conversion, but rates may be inaccurate.

## Adding a custom token

### Step-by-step

1. **Get the coin type** from SuiScan or the Sui explorer:
   - Search for the token contract
   - Copy the full type (e.g. `0xabc123...::module::TOKEN`)

2. **Get the CoinGecko slug**:
   - Search on coingecko.com
   - Copy the slug from the URL

3. **Determine decimals**:
   - Check the coin's `decimals` field on-chain or in the contract
   - Common: 9 for SUI-like tokens, 6 for USDC-like tokens

4. **Choose a category**:
   - `native` for gas tokens
   - `stablecoin` for price-pegged tokens
   - `utility` for protocol tokens
   - `defi` for DeFi tokens

5. **Add to environment**:

```env
SUPPORTED_COINS_TESTNET='{"SUI":{...},"USDC":{...},"NEWTOKEN":{"type":"0xabc...::module::TOKEN","coingeckoId":"coingecko-slug","decimals":9,"category":"utility"}}'
```

6. **Restart the backend** to load the new config.

7. **Deposit to treasury**:

```bash
cd backend
npm run treasury:deposit <AMOUNT> <TOKEN>

i.e.
npm run treasury:deposit 10 SUI
```

8. **Test**:

```bash
curl -s http://localhost:5000/v1/checkout/session \
  -H "Content-Type: application/json" \
  -d '{"amount":1000,"currency":"NGN","merchantAddress":"0x...","settlementToken":"NEWTOKEN"}'
```

Verify `estimatedRate` is reasonable.

## Removing a token

Remove the entry from `SUPPORTED_COINS_<NETWORK>` and restart the backend. Any sessions using that token will fail with `400 Unsupported coin type`.

Withdraw any remaining balance from the treasury before removing:

```bash
npm run treasury:withdraw <AMOUNT> <TOKEN>

i.e.
npm run treasury:withdraw 10 SUI
```

## `DEFAULT_COIN`

The `DEFAULT_COIN` symbol determines which token is used when `settlementToken` is not provided in the session request.

```env
DEFAULT_COIN=SUI
```

The symbol must match a key in `SUPPORTED_COINS`. If not found, the backend falls back to SUI.

## Migration from legacy config

If you're using the old `SETTLEMENT_TOKEN_TYPE` format:

```env
# Old format (legacy)
SETTLEMENT_TOKEN_TYPE=0x2::sui::SUI
```

Migrate to `SUPPORTED_COINS`:

```env
# New format
SUPPORTED_COINS='{"SUI":{"type":"0x2::sui::SUI","coingeckoId":"sui","decimals":9,"category":"native"}}'
DEFAULT_COIN=SUI
```

`SETTLEMENT_TOKEN_TYPE` is still supported as a last-resort fallback but should not be used for new deployments.

## Response format

The session response includes coin details:

```json
{
  "supportedCoins": [
    {
      "symbol": "SUI",
      "type": "0x2::sui::SUI",
      "decimals": 9,
      "category": "native"
    },
    {
      "symbol": "USDC",
      "type": "0xa1ec...::usdc::USDC",
      "decimals": 6,
      "category": "stablecoin"
    }
  ]
}
```

## See also

- [Settlement Tokens](/docs/guides/settlement-tokens) - per-checkout overrides and multi-token setup
- [FX Rates](/docs/guides/fx-rates) - how CoinGecko IDs affect pricing
- [Treasury Management](/docs/guides/treasury) - depositing tokens for settlement
- [Environment](/docs/guides/environment) - all env vars
