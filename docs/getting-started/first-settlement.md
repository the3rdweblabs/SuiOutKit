---
title: First Settlement
description: Go from zero to a working checkout - install the SDK, integrate, and see a payment complete.
---

This walkthrough takes you from an empty project to a working checkout using the hosted SuiOutKit API. No backend to run, no infrastructure to manage - just the SDK.

## Prerequisites

- Node.js 18+
- A merchant Sui address (to receive settlement)
- A frontend project (React, Vue, vanilla JS, anything that runs in the browser)

## Step 1: Install the SDK

```bash
npm install suioutkit
```

## Step 2: Create a checkout

```tsx
import { SuiOutKit } from "suioutkit";

const sdk = new SuiOutKit({
  merchantAddress: "0xYOUR_MERCHANT_SUI_ADDRESS",
});

async function handlePay() {
  const session = await sdk.initCheckout({
    amount: 29.99,
    currency: "USD",
  });
  sdk.openModal(session);
}
```

That's it. The SDK talks to the hosted API at `https://api.suioutkit.xyz` by default.

## Step 3: Add a button

```tsx
export function PayButton() {
  async function handlePay() {
    const session = await sdk.initCheckout({
      amount: 29.99,
      currency: "USD",
      metadata: { orderId: "ORDER-123" },
    });
    sdk.openModal(session, {
      onClose: () => console.log("Modal closed"),
      onPaymentComplete: (result) => {
        console.log("Paid!", result.txDigest);
      },
    });
  }

  return <button onClick={handlePay}>Pay $29.99</button>;
}
```

## Step 4: See it work

Open your page. Click the button. The checkout modal opens with payment options:

- **Bank transfer** - virtual account details in the modal
- **OPay** - push to their phone
- **USSD** - dial a bank code (NGN customers)
- **Card** - Stripe in the modal
- **Sui wallet / outPay** - crypto in the same UI

The customer picks a method, pays, and the modal shows the result.

## What happens behind the scenes

1. `initCheckout` creates a session on the hosted API (currency, amount, FX rate).
2. `openModal` renders the checkout UI with available payment methods.
3. The customer pays via their chosen method.
4. The hosted backend handles the payment provider, settlement on Sui, and receipt storage.
5. `onPaymentComplete` fires with the on-chain transaction digest.

You don't handle webhooks, providers, settlement, or treasury. The hosted API does all of it.

## Try different currencies

```ts
// Nigerian Naira
const session = await sdk.initCheckout({
  amount: 1500,
  currency: "NGN",
});

// Euro
const session = await sdk.initCheckout({
  amount: 29.99,
  currency: "EUR",
});

// South African Rand
const session = await sdk.initCheckout({
  amount: 500,
  currency: "ZAR",
});
```

40 currencies supported. The modal formats amounts with the correct symbol and separators.

## Choose a settlement token

```ts
// Settle in USDC instead of SUI
const session = await sdk.initCheckout({
  amount: 29.99,
  currency: "USD",
  settlementToken: "USDC",
});

// Let the customer choose
const session = await sdk.initCheckout({
  amount: 1500,
  currency: "NGN",
  settlementToken: ["SUI", "USDC"],
});
```

See [Settlement Tokens](/docs/guides/settlement-tokens) for multi-token configuration.

## One-line button binding

```ts
sdk.wrapButton("#pay-btn", {
  amount: 29.99,
  currency: "USD",
});
```

Updates the button label (e.g. `Pay $29.99`) and opens the modal on click.

## Local development

For local backend development, switch the mode:

```ts
const sdk = new SuiOutKit({
  merchantAddress: "0xYOUR_MERCHANT_SUI_ADDRESS",
  mode: "local",  // http://localhost:5000, testnet
});
```

See [Installation](/docs/getting-started/installation) for mode options.

## Next steps

- [How It Works](/docs/getting-started/how-it-works) - flow overview
- [SDK Reference](/docs/guides/sdk) - full API reference
- [Currencies](/docs/guides/currencies) - supported currencies and formatting
- [Settlement Tokens](/docs/guides/settlement-tokens) - choosing settlement coins
