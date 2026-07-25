// SPDX-License-Identifier: AGPL-3.0-or-later
// AGPL: Strong copyleft license requiring source disclosure for network use. See LICENSE file.
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { getEnv } from "../config/env.js";
import { getDefaultCoin, getSupportedCoinList, getCoinConfig, getDecimals } from "../config/coins.js";

// Load configuration
const SUI_NETWORK = getEnv("SUI_NETWORK", "testnet") as any;
const SUI_GRPC_ENDPOINT = getEnv(`SUI_GRPC_ENDPOINT_${SUI_NETWORK}`) || getEnv("SUI_GRPC_ENDPOINT", `https://fullnode.${SUI_NETWORK}.sui.io:443`);
const PACKAGE_ID = getEnv(`PACKAGE_ID_${SUI_NETWORK}`);
const TREASURY_ID = getEnv(`TREASURY_ID_${SUI_NETWORK}`);
const SUI_OPERATOR_PRIVATE_KEY = getEnv("SUI_OPERATOR_PRIVATE_KEY");

const TREASURY_ADMIN_CAP_ID = getEnv(`TREASURY_ADMIN_CAP_ID_${SUI_NETWORK}`, "");

async function findCoin(client: SuiGrpcClient, address: string, coinType: string, amount: bigint): Promise<string> {
  const result = await client.listCoins({
    owner: address,
    coinType,
    limit: 10000,
  });
  const coins = result.objects || [];
  if (coins.length === 0) {
    throw new Error(`No ${coinType} coins found in operator wallet.`);
  }
  
  // Try to find a single coin with enough balance
  const singleCoin = coins.find((c: any) => BigInt(c.balance) >= amount);
  if (singleCoin) {
    console.log(`Using coin ${singleCoin.objectId} with balance ${singleCoin.balance}`);
    return singleCoin.objectId;
  }
  
  // No single coin has enough - need to merge multiple coins
  // Sort by balance descending and merge until we have enough
  const sorted = coins.sort((a: any, b: any) => Number(BigInt(b.balance) - BigInt(a.balance)));
  let totalBalance = 0n;
  const selectedCoins: string[] = [];
  for (const coin of sorted) {
    selectedCoins.push(coin.objectId);
    totalBalance += BigInt(coin.balance);
    if (totalBalance >= amount) break;
  }
  
  if (totalBalance < amount) {
    throw new Error(`Insufficient ${coinType} balance. Have ${totalBalance}, need ${amount}`);
  }
  
  console.log(`Merging ${selectedCoins.length} coins (total: ${totalBalance}) for deposit`);
  
  // We'll return the first coin ID and handle merging in the caller
  return JSON.stringify({ merge: selectedCoins, firstCoin: selectedCoins[0] });
}

async function getTreasuryAdminCap(client: SuiGrpcClient, address: string): Promise<string> {
  if (TREASURY_ADMIN_CAP_ID) return TREASURY_ADMIN_CAP_ID;

  console.log(`Scanning wallet ${address} for TreasuryAdminCap...`);
  const result = await client.listOwnedObjects({
    owner: address,
    type: `${PACKAGE_ID}::treasury::TreasuryAdminCap`,
    limit: 1,
  });
  const data = result.objects || [];
  if (data.length === 0) {
    throw new Error("Could not find a TreasuryAdminCap in your wallet. Are you the admin?");
  }
  const capId = data[0].objectId;
  console.log(`Found TreasuryAdminCap: ${capId}`);
  return capId;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const amountStr = args[1];
  const rawTokenType = args[2];
  const cfg = rawTokenType ? getCoinConfig(rawTokenType) : undefined;
  const tokenType = cfg?.type || rawTokenType || getDefaultCoin().type;

  if (!["deposit", "withdraw", "balance", "wallet"].includes(command)) {
    console.error("Usage: node dist/scripts/treasury.js <deposit|withdraw|balance|wallet> [amount] [coin_type]");
    console.error("  balance  - check treasury contract balances");
    console.error("  wallet   - check operator wallet balances");
    console.error("  deposit  - deposit tokens into treasury");
    console.error("  withdraw - withdraw tokens from treasury");
    console.error("  coin_type can be symbol (SUI, USDC) or full type (0x2::sui::SUI)");
    process.exit(1);
  }

  if (!SUI_OPERATOR_PRIVATE_KEY || !PACKAGE_ID || !TREASURY_ID) {
    console.error("Missing required environment variables.");
    process.exit(1);
  }

  console.log(`Network: ${SUI_NETWORK}`);
  console.log(`Treasury ID: ${TREASURY_ID}`);
  
  const coins = getSupportedCoinList();
  console.log(`Supported coins: ${coins.map(c => c.symbol).join(", ")}`);
  
  if (command !== "balance" && command !== "wallet" && !cfg && rawTokenType) {
    console.error(`Unknown coin: ${rawTokenType}. Available: ${coins.map(c => c.symbol).join(", ")}`);
    process.exit(1);
  }

  // Initialize gRPC client and keypair
  const client = new SuiGrpcClient({
    network: SUI_NETWORK,
    baseUrl: SUI_GRPC_ENDPOINT,
  });
  let keypair: Ed25519Keypair;
  if (SUI_OPERATOR_PRIVATE_KEY.startsWith("suiprivkey1")) {
    const { secretKey } = decodeSuiPrivateKey(SUI_OPERATOR_PRIVATE_KEY) as any;
    keypair = Ed25519Keypair.fromSecretKey(secretKey);
  } else {
    const rawBytes = Buffer.from(SUI_OPERATOR_PRIVATE_KEY.replace(/^0x/, ""), "hex");
    keypair = Ed25519Keypair.fromSecretKey(rawBytes);
  }
  const adminAddress = keypair.getPublicKey().toSuiAddress();
  console.log(`Operator Address: ${adminAddress}`);

  if (command === "wallet") {
    console.log(`\nOperator Wallet Balances (${SUI_NETWORK}):\n`);
    for (const coin of coins) {
      try {
        const result = await client.getBalance({
          owner: adminAddress,
          coinType: coin.type,
        });
        const totalBalance = BigInt(result.balance?.balance || "0");
        const displayBalance = Number(totalBalance) / 10 ** coin.decimals;
        console.log(`  ${coin.symbol.padEnd(8)} ${displayBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).padStart(20)}`);
      } catch (e: any) {
        console.log(`  ${coin.symbol.padEnd(8)} ${"error".padStart(20)} (${e.message})`);
      }
    }
    console.log(`\nSuiscan: https://suiscan.xyz/${SUI_NETWORK}/account/${adminAddress}`);
    return;
  }

  if (command === "balance") {
    const coins = getSupportedCoinList();
    const SUISCAN_BASE = `https://suiscan.xyz/${SUI_NETWORK}/object`;
    console.log(`\nTreasury Contract Balances (${SUI_NETWORK}):\n`);
    console.log(`  Treasury: ${SUISCAN_BASE}/${TREASURY_ID}\n`);
    for (const coin of coins) {
      const inspectTx = new Transaction();
      inspectTx.moveCall({
        target: `${PACKAGE_ID}::treasury::balance`,
        typeArguments: [coin.type],
        arguments: [inspectTx.object(TREASURY_ID)]
      });
      inspectTx.setSender(adminAddress);
      const simulation = await client.simulateTransaction({
        transaction: inspectTx,
        include: { commandResults: true, effects: true },
        checksEnabled: false,
      });
      const simResult = simulation.Transaction || simulation.FailedTransaction;
      if (simulation.$kind === "FailedTransaction" || simResult?.effects?.status?.success === false) {
        console.error(`Failed to inspect balance for ${coin.symbol}: ${simResult?.effects?.status?.error || "unknown"}`);
        continue;
      }
      const commandResults = simulation.commandResults;
      if (commandResults && commandResults.length > 0 && commandResults[0].returnValues?.length > 0) {
        const bcs = commandResults[0].returnValues[0].bcs;
        let balance: bigint = 0n;
        for (let i = 0; i < bcs.length; i++) {
          balance += BigInt(bcs[i]) << BigInt(8 * i);
        }
        console.log(`  ${coin.symbol}: ${Number(balance) / 10 ** coin.decimals} (raw: ${balance})`);
      } else {
        console.log(`  ${coin.symbol}: 0 (raw: 0)`);
      }
    }
    return;
  }

  if (!amountStr || isNaN(parseFloat(amountStr))) {
    console.error("Please provide a valid amount.");
    process.exit(1);
  }
  const decimals = getDecimals(tokenType);
  const amountBaseUnits = Math.floor(parseFloat(amountStr) * 10 ** decimals);
  const capId = await getTreasuryAdminCap(client, adminAddress);

  const tx = new Transaction();
  tx.setGasBudget(50_000_000);
  tx.setSender(adminAddress);

  if (command === "deposit") {
    console.log(`Depositing ${amountStr} ${tokenType} into Treasury...`);
    let coinToDeposit;
    const cfg = getCoinConfig(tokenType);
    if (!cfg) {
      console.error(`Unsupported coin type: ${tokenType}`);
      process.exit(1);
    }
    if (tokenType === "0x2::sui::SUI") {
      [coinToDeposit] = tx.splitCoins(tx.gas, [tx.pure.u64(amountBaseUnits)]);
    } else {
      const coinResult = await findCoin(client, adminAddress, tokenType, BigInt(amountBaseUnits));
      if (coinResult.startsWith("{")) {
        // Need to merge multiple coins
        const { merge, firstCoin } = JSON.parse(coinResult);
        if (merge.length > 1) {
          console.log(`Merging ${merge.length} coins before deposit...`);
          tx.mergeCoins(tx.object(firstCoin), merge.slice(1).map((id: string) => tx.object(id)));
        }
        [coinToDeposit] = tx.splitCoins(tx.object(firstCoin), [tx.pure.u64(amountBaseUnits)]);
      } else {
        [coinToDeposit] = tx.splitCoins(tx.object(coinResult), [tx.pure.u64(amountBaseUnits)]);
      }
    }
    tx.moveCall({
      target: `${PACKAGE_ID}::treasury::deposit`,
      typeArguments: [tokenType],
      arguments: [tx.object(TREASURY_ID), coinToDeposit, tx.object(capId)]
    });
  } else if (command === "withdraw") {
    console.log(`Withdrawing ${amountStr} ${tokenType} from Treasury...`);
    const [withdrawnCoin] = tx.moveCall({
      target: `${PACKAGE_ID}::treasury::withdraw`,
      typeArguments: [tokenType],
      arguments: [tx.object(TREASURY_ID), tx.pure.u64(amountBaseUnits), tx.object(capId)]
    });
    tx.transferObjects([withdrawnCoin], tx.pure.address(adminAddress));
  }

  console.log("Signing and executing transaction...");
  try {
    // Dry-run via gRPC simulation
    const dryRun = await client.simulateTransaction({
      transaction: tx,
      include: { effects: true },
    });
    const dryResult = dryRun.Transaction || dryRun.FailedTransaction;
    if (dryResult?.effects?.status?.success === false) {
      console.error("❌ Dry run failed:", dryResult.effects?.status?.error);
      return;
    }
    // Execute via gRPC
    const response = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      include: { effects: true },
    });
    const txResult = response.Transaction || response.FailedTransaction;
    if (txResult?.effects?.status?.success) {
      console.log(`✅ Success! Tx Digest: ${txResult.digest}`);
    } else {
      console.error("❌ Transaction failed:", txResult?.effects?.status?.error || response);
    }
  } catch (err: any) {
    console.error("❌ Execution error:", err.message);
  }
}

main().catch(console.error);
