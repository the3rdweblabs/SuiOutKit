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
    limit: 50,
  });
  const coins = result.objects || [];
  if (coins.length === 0) {
    throw new Error(`No ${coinType} coins found in operator wallet.`);
  }
  const coin = coins.find((c: any) => BigInt(c.balance) >= amount) || coins[0];
  console.log(`Using coin ${coin.objectId} with balance ${coin.balance}`);
  return coin.objectId;
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

  if (!["deposit", "withdraw", "balance"].includes(command)) {
    console.error("Usage: node dist/scripts/treasury.js <deposit|withdraw|balance> [amount] [coin_type]");
    process.exit(1);
  }

  if (!SUI_OPERATOR_PRIVATE_KEY || !PACKAGE_ID || !TREASURY_ID) {
    console.error("Missing required environment variables.");
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

  if (command === "balance") {
    const coins = getSupportedCoinList();
    const SUISCAN_BASE = "https://suiscan.xyz/testnet/object";
    console.log(`🔎 Treasury inspection link: ${SUISCAN_BASE}/${TREASURY_ID}`);
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
      const sourceCoinId = await findCoin(client, adminAddress, tokenType, BigInt(amountBaseUnits));
      [coinToDeposit] = tx.splitCoins(tx.object(sourceCoinId), [tx.pure.u64(amountBaseUnits)]);
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
