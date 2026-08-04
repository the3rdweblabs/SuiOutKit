---
title: Currencies
description: Supported fiat currencies, formatting, geo detection, and CoinGecko FX configuration.
---

SuiOutKit supports **40 fiat currencies** with locale-aware formatting, IP-based geolocation for automatic currency detection, and CoinGecko-powered FX rates.

## Supported currencies

| Code | Currency | Symbol | Decimals |
|------|----------|--------|----------|
| NGN | Nigerian Naira | ₦ | 2 |
| USD | US Dollar | $ | 2 |
| GBP | British Pound | £ | 2 |
| EUR | Euro | € | 2 |
| CAD | Canadian Dollar | C$ | 2 |
| AUD | Australian Dollar | A$ | 2 |
| JPY | Japanese Yen | ¥ | 2 |
| INR | Indian Rupee | ₹ | 2 |
| BRL | Brazilian Real | R$ | 2 |
| MXN | Mexican Peso | MX$ | 2 |
| ZAR | South African Rand | R | 2 |
| KES | Kenyan Shilling | KSh | 2 |
| GHS | Ghanaian Cedi | GH₵ | 2 |
| AED | UAE Dirham | AED | 2 |
| SGD | Singapore Dollar | S$ | 2 |
| HKD | Hong Kong Dollar | HK$ | 2 |
| SEK | Swedish Krona | kr | 2 |
| NOK | Norwegian Krone | kr | 2 |
| DKK | Danish Krone | kr | 2 |
| PLN | Polish Zloty | zł | 2 |
| TRY | Turkish Lira | ₺ | 2 |
| ARS | Argentine Peso | AR$ | 2 |
| CLP | Chilean Peso | CL$ | 2 |
| PHP | Philippine Peso | ₱ | 2 |
| THB | Thai Baht | ฿ | 2 |
| IDR | Indonesian Rupiah | Rp | 2 |
| MYR | Malaysian Ringgit | RM | 2 |
| VND | Vietnamese Dong | ₫ | 2 |
| PKR | Pakistani Rupee | Rs | 2 |
| BDT | Bangladeshi Taka | ৳ | 2 |
| EGP | Egyptian Pound | E£ | 2 |
| NZD | New Zealand Dollar | NZ$ | 2 |
| RUB | Russian Ruble | ₽ | 2 |
| SAR | Saudi Riyal | SAR | 2 |
| CNY | Chinese Yuan | ¥ | 2 |
| TWD | New Taiwan Dollar | NT$ | 2 |
| KRW | South Korean Won | ₩ | 2 |
| UAH | Ukrainian Hryvnia | ₴ | 2 |
| LKR | Sri Lankan Rupee | Rs | 2 |
| MMK | Myanmar Kyat | K | 2 |

All currencies are supported by default. Operators can restrict the list via the `SUPPORTED_FIAT_CURRENCIES` env var.

## Merchant integration

### Checkout with any currency

```ts
import { SuiOutKit } from "suioutkit";

const sdk = new SuiOutKit({ merchantAddress: "0xYOUR_ADDRESS" });

// EUR checkout
const session = await sdk.initCheckout({
  amount: 29.99,
  currency: "EUR",
});
sdk.openModal(session);

// ZAR checkout
const session = await sdk.initCheckout({
  amount: 500,
  currency: "ZAR",
});
sdk.openModal(session);
```

The modal automatically displays the correct symbol and formatting (e.g. `€29.99`, `R500.00`, `₦1,500.00`).

### Button binding

```ts
sdk.wrapButton("#pay-btn", {
  amount: 9.99,
  currency: "USD",
});
```

The button label updates to show the formatted amount (e.g. `Pay $9.99`).

### Currency resolution

When a session is created, the backend resolves the final currency and returns it as `resolvedCurrency` on the session object:

```ts
const session = await sdk.initCheckout({ amount: 10, currency: "USD" });
console.log(session.resolvedCurrency); // "USD"
console.log(session.currencySymbol);   // "$"
```

If the operator has IP geolocation enabled and no currency is specified, the backend auto-detects from the user's IP address.

### Formatting helpers

```ts
import { formatCurrency } from "suioutkit";

formatCurrency(29.99, "EUR");  // "€29.99"
formatCurrency(500, "ZAR");    // "R500.00"
formatCurrency(1500, "NGN");   // "₦1,500.00"
formatCurrency(1400, "JPY");   // "¥1,400.00"
```

`formatCurrency` uses `Intl.NumberFormat` for locale-aware number separators, always showing the currency's configured decimals (2 for all supported currencies), and prepends the currency symbol. The deprecated `formatNgn` still works but redirects to `formatCurrency`.

## Settlement tokens

Each checkout can specify which settlement token the merchant receives. Tokens are configured on the backend via `SUPPORTED_COINS` and can be overridden per checkout via `settlementToken`.

### Per-checkout override

```ts
const session = await sdk.initCheckout({
  amount: 29.99,
  currency: "USD",
  settlementToken: "USDC",       // single token
});

// or choose from multiple options
const session = await sdk.initCheckout({
  amount: 1500,
  currency: "NGN",
  settlementToken: ["SUI", "USDC"],  // customer picks
});
```

The backend resolves the symbol to the full coin type from its config. When `settlementToken` is omitted, the backend uses `DEFAULT_COIN`.

### Per-currency defaults

Merchants can set default settlement tokens per currency by passing them in `initCheckout`. For example, USD/EUR/GBP merchants may prefer USDC, while NGN merchants may accept SUI or USDC:

```ts
// USD merchant — always settles in USDC
const session = await sdk.initCheckout({
  amount: 50,
  currency: "USD",
  settlementToken: "USDC",
});

// NGN merchant — offers SUI or USDC
const session = await sdk.initCheckout({
  amount: 5000,
  currency: "NGN",
  settlementToken: ["SUI", "USDC"],
});
```

### Backend coin categories

Each settlement coin has a `category` field: `native` (SUI), `stablecoin` (USDC, USDT, USDSui, eSUID), `utility` (WAL, DEEP, SuiNS), or `defi` (CETUS). The session response includes `category` on each entry in `supportedCoins`.

### CoinGecko IDs

CoinGecko prices power the FX rate for each settlement token. The backend maps each coin's `coingeckoId` to its CoinGecko slug. If a CoinGecko ID is wrong, the API returns empty prices and the FX service falls back to USD conversion or hardcoded defaults. See the [Environment](/docs/guides/environment) page for the full list of supported CoinGecko IDs.

## Operator configuration

### Restricting currencies

Limit which fiat currencies are accepted:

```env
SUPPORTED_FIAT_CURRENCIES=NGN,USD,GBP,EUR,ZAR
```

Leave empty to support all 40 currencies (default).

### Default currency

Set the fallback currency when none is specified and geo detection is disabled:

```env
DEFAULT_CURRENCY=USD
```

### IP geolocation

Auto-detect the user's currency from their IP address:

```env
ENABLE_GEO_DETECTION=true
```

Uses `ip-api.com` with a 3-second timeout and in-memory cache (5-minute TTL). Opt-in only.

### CoinGecko FX rates

FX rates are fetched from CoinGecko. Three modes are available:

```env
# Free API (no key needed, ~10-30 calls/min)
COINGECKO_API_MODE=

# Demo API (higher rate limits, same endpoint)
COINGECKO_API_MODE=demo
COINGECKO_API_KEY_DEMO=your_demo_key

# Pro API (highest limits, paid endpoint)
COINGECKO_API_MODE=pro
COINGECKO_API_KEY_PRO=your_pro_key
```

Each mode falls back to the free API if it fails, then to cached rates, then to hardcoded defaults.

### Cache TTL

Control how long CoinGecko prices are cached in memory (default 30 seconds):

```env
FX_CACHE_TTL=30000
```

## Backend flow

1. Session creation receives `currency` (optional) and `amount`
2. If `ENABLE_GEO_DETECTION=true` and no currency is set, the backend resolves currency from the user's IP
3. The FX service fetches live rates from CoinGecko for the resolved currency
4. The session is stored with `resolvedCurrency` and `currencySymbol`
5. At charge time, the backend re-validates the FX rate and checks treasury coverage
6. The success panel uses `formatCurrency(amount, resolvedCurrency)` for display

## See also

- [SDK Reference](/docs/guides/sdk) - `initCheckout`, `openModal`, helpers
- [Environment](/docs/guides/environment) - operator env vars
- [Backend API](/docs/guides/backend-api) - session and charge routes
