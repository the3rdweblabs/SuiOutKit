---
title: Treasury Management
description: Depositing, monitoring, and managing on-chain treasury balances for settlement.
---

The treasury is an on-chain shared object that holds settlement tokens. When a checkout succeeds, the backend executes a PTB that releases tokens from the treasury to the merchant. Operators must maintain sufficient balances per token to cover expected settlement volumes.

## Architecture

```
Operator Wallet → Treasury (on-chain) → Merchant Address
                     ↑
              Backend checks balance
              before each charge
```

- **Operator wallet**: Holds tokens before deposit. Signs settlement PTBs.
- **Treasury**: On-chain shared object. Tokens are deposited here for settlement.
- **Merchant address**: Receives tokens on successful settlement.

The backend checks treasury balance at charge time. If insufficient, the charge returns `409 Treasury insufficient` and the payment is blocked.

## Treasury CLI

The treasury management script is at `backend/src/scripts/treasury.ts`. All commands run from the `backend/` directory.

### Check treasury balance

```bash
cd backend
npm run treasury:balance
```

Shows the on-chain balance for each configured settlement coin in the treasury object.

### Check operator wallet

```bash
npm run treasury:wallet
```

Shows the operator wallet's total balance for each coin type. Uses `getBalance()` for accurate totals across all coin objects (including fragmented coins).

### Deposit tokens

```bash
npm run treasury:deposit <AMOUNT> <TOKEN>
```

Deposits tokens from the operator wallet into the treasury. The deposit amount is a required positional argument. The command:

1. Queries the operator wallet for the configured coin type.
2. If a single coin object has insufficient balance, auto-merges fragmented coins.
3. Transfers the merged coin to the treasury.
4. Reports the transaction digest.

### Withdraw tokens

```bash
npm run treasury:withdraw <AMOUNT> <TOKEN>
```

Withdraws tokens from the treasury back to the operator wallet. Use this for rebalancing or emergency recovery.

### Coin merging

When the operator wallet has multiple small coin objects (from receiving many small payments), the deposit command auto-merges them into a single coin before transferring to the treasury. This avoids the issue where no single coin has enough balance for the deposit.

Example scenario:
- Operator wallet has 5 USDC coins: 10, 20, 15, 5, 50 USDC
- Treasury deposit needs 80 USDC
- Auto-merge combines 50 + 20 + 15 = 85 USDC → deposits 80 to treasury

## Multi-token treasury

Each settlement token requires its own treasury balance. If you accept SUI, USDC, and DEEP, you need all three deposited in the treasury.

```bash
# Deposit SUI for gas and settlement
npm run treasury:deposit 10 SUI

# Deposit USDC for stablecoin settlements
npm run treasury:deposit 10 USDC

# Deposit DEEP for utility token settlements
npm run treasury:deposit 100 DEEP
```

The treasury CLI reads `SUPPORTED_COINS` to know which tokens to manage. When using network-specific config (`SUPPORTED_COINS_TESTNET` / `SUPPORTED_COINS_MAINNET`), the CLI uses the active `SUI_NETWORK`.

## Monitoring

### SuiScan links

The CLI prints a SuiScan link for the operator account (`npm run treasury:wallet`) and for the treasury object (`npm run treasury:balance`):

- Testnet: `https://suiscan.xyz/testnet/account/<address>` / `https://suiscan.xyz/testnet/object/<treasuryId>`
- Mainnet: `https://suiscan.xyz/mainnet/account/<address>` / `https://suiscan.xyz/mainnet/object/<treasuryId>`

Deposit and withdraw commands print only the transaction digest - no link.

### Balance alerts

Monitor treasury balances by periodically checking:

```bash
npm run treasury:balance
```

Set up monitoring to alert when balances fall below your threshold for each token. The backend blocks charges when the treasury cannot cover the settlement amount.

### Operator wallet monitoring

Check the operator wallet's gas and token balances:

```bash
npm run treasury:wallet
```

Ensure the operator wallet has sufficient SUI for gas fees on settlement PTBs.

## Environment variables

| Variable | Description |
|----------|-------------|
| `SUI_OPERATOR_PRIVATE_KEY` | Signs all treasury and settlement transactions (required) |
| `PACKAGE_ID_<NETWORK>` | Published suioutkit Move package (required - e.g. `PACKAGE_ID_testnet`) |
| `SUPPORTED_COINS_<NETWORK>` | JSON map of coins the treasury manages |
| `DEFAULT_COIN` | Default coin for deposits when not specified |
| `TREASURY_ID_<NETWORK>` | On-chain treasury object ID (required) |
| `TREASURY_ADMIN_CAP_ID_<NETWORK>` | Optional - skips the wallet scan for the admin cap (e.g. `TREASURY_ADMIN_CAP_ID_testnet`) |
| `SUI_GRPC_ENDPOINT_<NETWORK>` | gRPC endpoint used for on-chain queries |
| `SUI_NETWORK` | `testnet` or `mainnet` - determines which treasury and coins to use |

## Common issues

### Treasury abort code 4

The treasury does not have enough of the requested coin type. Fix:

1. Check treasury balance: `npm run treasury:balance`
2. Check operator wallet: `npm run treasury:wallet`
3. Deposit the needed coin: `npm run treasury:deposit <AMOUNT> <TOKEN>`

### Insufficient gas for settlement

The operator wallet needs SUI for gas fees. The settlement PTB transfers tokens and mints a receipt - both cost gas.

```bash
npm run treasury:wallet  # check SUI balance
# If low, fund the operator wallet with SUI from a faucet (testnet) or exchange (mainnet)
```

### Wrong coin type

If the treasury has the wrong coin deposited, the settlement will fail. Ensure `SUPPORTED_COINS` coin types match the actual tokens in the treasury.

### Fragmented coins

If the operator wallet has many small coin objects, the deposit command auto-merges them. If merging fails, try depositing a smaller amount first.

## Security

- `SUI_OPERATOR_PRIVATE_KEY` must be kept secret. It controls treasury deposits and withdrawals.
- The treasury shared object can only receive deposits and release funds via the operator's signed PTBs.
- Monitor operator wallet activity for unauthorized transactions.
- In production, use a dedicated operator wallet separate from personal wallets.

## See also

- [Settlement Tokens](/docs/guides/settlement-tokens) - configuring which tokens are settled
- [Coin Configuration](/docs/guides/coin-configuration) - detailed coin config reference
- [Environment](/docs/guides/environment) - all operator env vars
- [Developer Guide](/docs/developer-guide) - treasury and FX policy
