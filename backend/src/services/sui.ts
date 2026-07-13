// SPDX-License-Identifier: AGPL-3.0-or-later
// AGPL: Strong copyleft license requiring source disclosure for network use. See LICENSE file.
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import fetch from "node-fetch";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { paymentKit } from "@mysten/payment-kit";
import { getEnv } from "../config/env.js";
import { getDefaultCoin } from "../config/coins.js";

// Contract Object IDs and config loaded safely from environment
const SUI_NETWORK = getEnv("SUI_NETWORK", "testnet") as any;
const SUI_GRPC_ENDPOINT = getEnv(`SUI_GRPC_ENDPOINT_${SUI_NETWORK}`) || getEnv("SUI_GRPC_ENDPOINT", `https://fullnode.${SUI_NETWORK}.sui.io:443`);
const SUI_GRAPHQL_ENDPOINT = getEnv(`SUI_GRAPHQL_ENDPOINT_${SUI_NETWORK}`) || getEnv("SUI_GRAPHQL_ENDPOINT", `https://graphql.${SUI_NETWORK}.sui.io/graphql`);
const SUI_OPERATOR_PRIVATE_KEY = getEnv("SUI_OPERATOR_PRIVATE_KEY");
const PACKAGE_ID = getEnv(`PACKAGE_ID_${SUI_NETWORK}`);
const TREASURY_ID = getEnv(`TREASURY_ID_${SUI_NETWORK}`);
const FIAT_REGISTRY_ID = getEnv(`FIAT_REGISTRY_ID_${SUI_NETWORK}`);
const FIAT_REGISTRY_ADMIN_CAP_ID = getEnv(`FIAT_REGISTRY_ADMIN_CAP_ID_${SUI_NETWORK}`);
const CRYPTO_REGISTRY_ID = getEnv(`CRYPTO_REGISTRY_ID_${SUI_NETWORK}`);
const CRYPTO_REGISTRY_ADMIN_CAP_ID = getEnv(`CRYPTO_REGISTRY_ADMIN_CAP_ID_${SUI_NETWORK}`);
const PAYMENT_KIT_PACKAGE_ID = getEnv(`PAYMENT_KIT_PACKAGE_ID_${SUI_NETWORK}`);

class SuiIntegrationService {
  private client: SuiGrpcClient;
  private paymentClient: any;
  private keypair: Ed25519Keypair;

  constructor() {
    // Initialize high-performance Sui gRPC client
    console.log(`==================================================================`);
    console.log(`==> SuiOutKit Ledger Environment Bootstrap:`);
    console.log(`==> Network: ${SUI_NETWORK}`);
    console.log(`==> Package: ${PACKAGE_ID || "not set"}`);
    console.log(`==> Treasury: ${TREASURY_ID || "not set"}`);
    console.log(`==> Fiat Registry ID: ${FIAT_REGISTRY_ID || "not set"}`);
    console.log(`==> Fiat Admin Cap ID: ${FIAT_REGISTRY_ADMIN_CAP_ID || "not set"}`);
    console.log(`==> Crypto Registry ID: ${CRYPTO_REGISTRY_ID || "not set"}`);
    console.log(`==> Crypto Admin Cap ID: ${CRYPTO_REGISTRY_ADMIN_CAP_ID || "not set"}`);
    console.log(`==================================================================`);

    console.log(`SuiOutKit: Connecting to Sui gRPC Client...`);
    this.client = new SuiGrpcClient({
      network: SUI_NETWORK,
      baseUrl: SUI_GRPC_ENDPOINT
    });
    this.paymentClient = (this.client as any).$extend(paymentKit());

    // Load operator keypair securely
    if (!SUI_OPERATOR_PRIVATE_KEY) {
      throw new Error("Sui Operator Private Key is missing from environment variables.");
    }

    try {
      if (SUI_OPERATOR_PRIVATE_KEY.startsWith("suiprivkey1")) {
        // Bech32 formatted Sui private key: decode then construct keypair
        const { secretKey } = decodeSuiPrivateKey(SUI_OPERATOR_PRIVATE_KEY as string) as any;
        this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
      } else {
        // Hex format private key
        const rawBytes = Buffer.from(SUI_OPERATOR_PRIVATE_KEY.replace(/^0x/, ""), "hex");
        this.keypair = Ed25519Keypair.fromSecretKey(rawBytes);
      }
      console.log(`SuiOutKit: Loaded operator wallet address: ${this.keypair.getPublicKey().toSuiAddress()}`);
    } catch (err: any) {
      throw new Error(`Sui Operator Keypair Parsing Failure: ${err.message}`);
    }
  }

  /**
   * Constructs and signs a Programmable Transaction Block (PTB) to execute `checkout::settle_fiat<T>`
   * on-chain, automatically releasing funds from the Treasury dynamic vault to the merchant wallet.
   */
  public async executeSettleFiat(
    amount: number,
    merchantAddress: string,
    nonce: string,
    walrusBlobId: string,
    tokenType: string = getDefaultCoin().type
  ): Promise<{ txDigest: string; status: string }> {
    if (!PACKAGE_ID || !TREASURY_ID || !FIAT_REGISTRY_ID) {
      throw new Error("Sui Integration: PACKAGE_ID, TREASURY_ID, or FIAT_REGISTRY_ID is missing from environment variables.");
    }

    try {
      const tx = new Transaction();

      // Build checkout::settle_fiat<T> call. The contract releases funds from
      // Treasury to the merchant, then returns a non-droppable receipt object.
      const [receipt] = tx.moveCall({
        target: `${PACKAGE_ID}::checkout::settle_fiat`,
        typeArguments: [tokenType],
        arguments: [
          tx.object(TREASURY_ID),
          tx.object(FIAT_REGISTRY_ID),
          tx.pure.u64(amount),
          tx.pure.address(merchantAddress),
          tx.pure.string(nonce),
          tx.pure.string(walrusBlobId),
          tx.object("0x6") // Standard Clock shared object
        ]
      });

      // Transfer only the receipt object. The token payout already happens
      // inside checkout::settle_fiat via Payment Kit.
      tx.transferObjects([receipt], merchantAddress);

      // Derive gas budget via dry-run for accurate cost estimation
      tx.setSender(this.keypair.getPublicKey().toSuiAddress());
      let gasBudget = 80_000_000; // safe fallback
      try {
        const simulation = await (this.client as any).core.simulateTransaction({
          transaction: tx,
          include: { effects: true },
        });
        const simResult = simulation?.Transaction || simulation;
        const gasUsed = simResult?.effects?.gasUsed;
        if (gasUsed) {
          const computedCost = BigInt(gasUsed.computationCost || 0);
          const storageCost = BigInt(gasUsed.storageCost || 0);
          const storageRebate = BigInt(gasUsed.storageRebate || 0);
          const estimated = computedCost + storageCost - storageRebate;
          gasBudget = Number((estimated * BigInt(130)) / BigInt(100));
          if (gasBudget < 50_000_000) gasBudget = 50_000_000;
        }
      } catch (e) {
        console.warn(`SuiOutKit: Gas estimation failed, using fallback: ${(e as Error).message}`);
      }
      tx.setGasBudget(gasBudget);

      console.log(`SuiOutKit: Firing settle_fiat<${tokenType}> transaction block on-chain (gas budget: ${gasBudget})...`);
      const response: any = await (this.client as any).signAndExecuteTransaction({
        signer: this.keypair,
        transaction: tx,
        include: {
          effects: true,
          events: true
        }
      });

      const txResult = response?.Transaction || response?.FailedTransaction || response;
      const txDigest = txResult?.digest || response?.digest;
      const execStatus = txResult?.status?.success ? "success" : undefined;

      if (execStatus === "success" && txDigest) {
        console.log(`SuiOutKit: Settle Fiat Tx succeeded. Digest: ${txDigest}`);
        try {
          await (this.client as any).waitForTransaction?.({ digest: txDigest, include: { effects: true, events: true } });
        } catch (_) {
          // non-critical; fullnode will eventually index it
        }
        return {
          txDigest,
          status: "success"
        };
      }

      // Fallback: if status wasn't success but we have a digest, verify on-chain
      if (txDigest) {
        try {
          await (this.client as any).waitForTransaction?.({ digest: txDigest, include: { effects: true, events: true } });
        } catch (_) {
          // Ignore wait failures and fall back to direct verification below.
        }

        const recovered = await this.verifyFiatSettlementTx(txDigest, nonce, merchantAddress, amount, tokenType);
        if (recovered.verified) {
          console.warn(
            `SuiOutKit: PTB reported failure but settlement event was found on-chain for nonce ${nonce}. Treating as success.`
          );
          return {
            txDigest,
            status: "success"
          };
        }
      }

      const failureMessage =
        response?.effects?.status?.error ||
        "Transaction block failed execution on-chain.";

      throw new Error(typeof failureMessage === "string" ? failureMessage : JSON.stringify(failureMessage));
    } catch (err: any) {
      // Idempotency: if the payment record already exists, treat as success.
      if (err.message && err.message.includes('EPaymentAlreadyExists')) {
        console.warn('Duplicate payment detected – treating settlement as already completed.');
        // Return a synthetic success response (digest not needed for already processed).
        return { txDigest: 'duplicate-idempotent', status: 'success' };
      }
      console.error('Sui settle_fiat PTB error:', err.message);
      throw new Error(`Sui Transaction Error: ${err.message}`);
    }
  }

  private async verifyFiatSettlementTx(
    txDigest: string,
    expectedNonce: string,
    expectedMerchant: string,
    expectedAmount: number,
    tokenType: string
  ): Promise<{ verified: boolean; eventType?: string }> {
    try {
      const txBlock = await (this.client as any).getTransaction({
        digest: txDigest,
        include: { events: true },
      });

      const txResult = txBlock?.Transaction || txBlock;
      const events = txResult?.events || [];
      for (const evt of events) {
        const evtType = evt.eventType || "";
        const parsed = evt.json || {};
        const nonce = parsed.nonce || parsed.nonce_str || parsed.nonceString;
        const merchant = parsed.merchant || parsed.merchantAddress;
        const amount = Number(parsed.amount ?? parsed.amountNaira ?? parsed.amountSettled ?? 0);
        const method = parsed.method || "";

        if (
          evtType.includes("PaymentSettled") &&
          nonce === expectedNonce &&
          merchant === expectedMerchant &&
          (amount === expectedAmount || amount === Math.floor(expectedAmount))
        ) {
          return { verified: true, eventType: evtType };
        }

        if (
          method === "fiat_bank_transfer" &&
          nonce === expectedNonce &&
          merchant === expectedMerchant &&
          evtType.includes("PaymentSettled")
        ) {
          return { verified: true, eventType: evtType };
        }

        if (
          evtType.startsWith("0x") &&
          evtType.includes("PaymentSettled") &&
          nonce === expectedNonce &&
          tokenType
        ) {
          return { verified: true, eventType: evtType };
        }
      }

      return { verified: false };
    } catch (err: any) {
      console.warn(`SuiOutKit: Fiat settlement verification fallback failed for ${txDigest}: ${err.message}`);
      return { verified: false };
    }
  }

  /**
   * Pre-flight check: Query Treasury balance directly via gRPC simulation.
   * Called before showing payment interface to verify settlement will succeed.
   */
  public async checkTreasuryBalance(amount: number, tokenType: string = getDefaultCoin().type): Promise<{ available: number; required: number; sufficient: boolean }> {
    if (!TREASURY_ID) {
      throw new Error("Sui Integration: TREASURY_ID is missing from environment variables.");
    }
    if (!PACKAGE_ID) {
      throw new Error("Sui Integration: PACKAGE_ID is missing from environment variables.");
    }
    try {
      console.log(`SuiOutKit: Querying treasury balance on-chain for ${tokenType} with required ${amount}...`);
      // Build a simulation transaction that calls treasury::balance
      const inspectTx = new Transaction();
      inspectTx.moveCall({
        target: `${PACKAGE_ID}::treasury::balance`,
        typeArguments: [tokenType],
        arguments: [inspectTx.object(TREASURY_ID)]
      });
      inspectTx.setSender(this.keypair.getPublicKey().toSuiAddress());
      const simulation = await this.client.simulateTransaction({
        transaction: inspectTx,
        include: { commandResults: true, effects: true },
        checksEnabled: false,
      });
      const simResult = simulation.Transaction || simulation.FailedTransaction;
      if (simulation.$kind === "FailedTransaction" || simResult?.effects?.status?.success === false) {
        console.warn(`SuiOutKit: Simulation error querying treasury: ${simResult?.effects?.status?.error || "unknown"}`);
        return { available: 0, required: amount, sufficient: false };
      }
      let availableBalance = 0;
      const commandResults = simulation.commandResults;
      if (commandResults && commandResults.length > 0 && commandResults[0].returnValues?.length > 0) {
        const bcs = commandResults[0].returnValues[0].bcs;
        let balance = 0n;
        for (let i = 0; i < bcs.length; i++) {
          balance += BigInt(bcs[i]) << BigInt(8 * i);
        }
        availableBalance = Number(balance);
      }
      const sufficient = availableBalance >= amount;
      console.log(`SuiOutKit: Treasury balance query completed. Available: ${availableBalance}, Required: ${amount}, Sufficient: ${sufficient}`);
      return { available: availableBalance, required: amount, sufficient };
    } catch (err: any) {
      console.error("Treasury balance check failure:", err.message);
      throw new Error(`Sui Treasury Balance Check Error: ${err.message}`);
    }
  }

  public async verifyCryptoPaymentTx(txDigest: string, expectedNonce: string): Promise<{ verified: boolean; eventType?: string }> {
    if (!PACKAGE_ID) {
      throw new Error("Sui Integration: PACKAGE_ID is missing from environment variables.");
    }

    try {
      const txBlock = await (this.client as any).getTransaction({
        digest: txDigest,
        include: { events: true },
      });

      const txResult = txBlock?.Transaction || txBlock;
      const events = txResult?.events || [];
      for (const evt of events) {
        const evtType = evt.eventType || "";
        const parsed = evt.json || {};
        const nonce = parsed.nonce || parsed.nonce_str || parsed.nonceString;

        if (nonce === expectedNonce) {
          return { verified: true, eventType: evtType };
        }

        if (evtType.startsWith(`${PACKAGE_ID}::events::PaymentSettled`) && parsed.nonce === expectedNonce) {
          return { verified: true, eventType: evtType };
        }

        if (evtType.includes("payment_kit") && nonce === expectedNonce) {
          return { verified: true, eventType: evtType };
        }
      }

      return { verified: false };
    } catch (err: any) {
      throw new Error(`Sui Verification Error: ${err.message}`);
    }
  }

  public async verifyCryptoPaymentRecord(options: {
    nonce: string;
    amount: number | bigint;
    receiver: string;
    coinType: string;
    registryId?: string;
    registryName?: string;
  }): Promise<{ verified: boolean; record?: { key: string; paymentTransactionDigest: string | null; epochAtTimeOfRecord: string } }> {
    try {
      const record = await this.paymentClient.paymentKit.getPaymentRecord({
        nonce: options.nonce,
        amount: options.amount,
        receiver: options.receiver,
        coinType: options.coinType,
        ...(options.registryId ? { registryId: options.registryId } : {}),
        ...(options.registryName ? { registryName: options.registryName } : {})
      });

      if (!record) {
        return { verified: false };
      }

      return {
        verified: true,
        record: {
          key: record.key,
          paymentTransactionDigest: record.paymentTransactionDigest,
          epochAtTimeOfRecord: record.epochAtTimeOfRecord
        }
      };
    } catch (err: any) {
      throw new Error(`Payment record verification failure: ${err.message}`);
    }
  }

  /**
   * Starts a high-speed gRPC-style background listener for on-chain checkout events.
   * Uses GraphQL RPC for indexed, filterable event polling.
   */
  public startIndexer(onEventReceived: (event: any) => void) {
    if (!PACKAGE_ID) {
      throw new Error("Sui Indexer: PACKAGE_ID is missing from environment variables.");
    }

    console.log(`SuiOutKit Indexer: Polling events via GraphQL RPC...`);

    const pollEvents = (eventType: string, label: string) => {
      let cursor: string | null = null;

      // Init: fetch the latest event to establish a starting cursor via GraphQL
      (async () => {
        try {
          const initRes = await fetch(SUI_GRAPHQL_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: `query Events($type: String!) {
                events(filter: { type: $type }, first: 1) {
                  nodes {
                    transaction { digest }
                    sequenceNumber
                    contents { json type { repr } }
                  }
                  pageInfo { hasNextPage endCursor }
                }
              }`,
              variables: { type: eventType },
            }),
          });
          const initData: any = await initRes.json();
          if (initData.data?.events?.pageInfo?.endCursor) {
            cursor = initData.data.events.pageInfo.endCursor;
          }
        } catch (_) {
          // init failure is non-fatal — first data tick will have cursor=null
        }
      })();

      setInterval(async () => {
        try {
          const response = await fetch(SUI_GRAPHQL_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: `query Events($type: String!, $after: String) {
                events(filter: { type: $type }, first: 50, after: $after) {
                  nodes {
                    transaction { digest }
                    sequenceNumber
                    contents { json type { repr } }
                  }
                  pageInfo { hasNextPage endCursor }
                }
              }`,
              variables: { type: eventType, after: cursor },
            }),
          });

          const data: any = await response.json();
          const events = data.data?.events;
          if (!events?.nodes) {
            if (data.errors) {
              console.warn(`SuiOutKit Indexer (${label}) GraphQL Error:`, data.errors[0]?.message || "Unknown error");
            }
            return;
          }

          for (const evt of events.nodes) {
            const txDigest = evt.transaction?.digest || "";
            const eventSeq = String(evt.sequenceNumber ?? "");

            // Normalize event shape to match the indexer consumer in index.ts
            onEventReceived({
              id: { txDigest, eventSeq },
              parsedJson: typeof evt.contents?.json === "string" ? JSON.parse(evt.contents.json) : evt.contents?.json,
              type: evt.contents?.type?.repr || "",
            });

            // Track cursor for next poll
            if (events.pageInfo?.endCursor) {
              cursor = events.pageInfo.endCursor;
            }
          }
        } catch (e: any) {
          console.warn(`SuiOutKit Indexer (${label}) Polling Error:`, e?.message || e);
        }
      }, 3000);
    };

    // Listen for PaymentSettled from suioutkit (sui_wallet flow calls mint_suioutkit_receipt)
    pollEvents(
      `${PACKAGE_ID}::events::PaymentSettled`,
      "PaymentSettled"
    );

    // Listen for PaymentReceipt from Payment Kit (outPay flow only calls processRegistryPayment)
    if (PAYMENT_KIT_PACKAGE_ID) {
      pollEvents(
        `${PAYMENT_KIT_PACKAGE_ID}::payment_kit::PaymentReceipt`,
        "PaymentReceipt"
      );
    }
  }


}

export const suiService = new SuiIntegrationService();
export default suiService;
