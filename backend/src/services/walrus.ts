// SPDX-License-Identifier: AGPL-3.0-or-later
// AGPL: Strong copyleft license requiring source disclosure for network use. See LICENSE file.
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import fetch from "node-fetch";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { walrus } from "@mysten/walrus";
import type { WalrusClient } from "@mysten/walrus";
import { getEnv } from "../config/env.js";

export interface WalrusInvoiceData {
  nonce: string;
  amountNaira: number;
  exchangeRate: number;
  amountSettled: number;
  settlementToken: string;
  merchantAddress: string;
  fiatMethod: string;
  timestamp: string;
}

const SUI_NETWORK = getEnv("SUI_NETWORK", "testnet") as "mainnet" | "testnet";
const WALRUS_PUBLISHER_URL = getEnv(`WALRUS_PUBLISHER_URL_${SUI_NETWORK}`) || getEnv("WALRUS_PUBLISHER_URL", `https://publisher.walrus-${SUI_NETWORK}.walrus.space`);
const WALRUS_UPLOAD_RELAY_URL = getEnv(`WALRUS_UPLOAD_RELAY_URL_${SUI_NETWORK}`) || getEnv("WALRUS_UPLOAD_RELAY_URL", `https://upload-relay.${SUI_NETWORK}.walrus.space`);
const WALRUS_OPERATOR_PRIVATE_KEY = getEnv("WALRUS_OPERATOR_PRIVATE_KEY");
const WALRUS_UPLOAD_MODE = getEnv("WALRUS_UPLOAD_MODE", "publisher");
const WALRUS_EPOCHS = parsePositiveInteger(getEnv("WALRUS_EPOCHS", "5"), 5);
const WALRUS_DELETABLE = getEnv("WALRUS_DELETABLE", "false").toLowerCase() === "true";
const WALRUS_USE_UPLOAD_RELAY = getEnv("WALRUS_USE_UPLOAD_RELAY", "false").toLowerCase() === "true";
const WALRUS_UPLOAD_RELAY_MAX_TIP = parsePositiveInteger(getEnv("WALRUS_UPLOAD_RELAY_MAX_TIP", "1000"), 1000);
const SUI_GRPC_ENDPOINT = getEnv(`SUI_GRPC_ENDPOINT_${SUI_NETWORK}`) || getEnv("SUI_GRPC_ENDPOINT", `https://fullnode.${SUI_NETWORK}.sui.io:443`);

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

class WalrusService {
  private keypair: Ed25519Keypair | null = null;
  private walrusClient: { walrus: WalrusClient } | null = null;
  private signerAddress: string | null = null;

  constructor() {
    if (WALRUS_OPERATOR_PRIVATE_KEY) {
      try {
        if (WALRUS_OPERATOR_PRIVATE_KEY.startsWith("suiprivkey1")) {
          const { secretKey } = decodeSuiPrivateKey(WALRUS_OPERATOR_PRIVATE_KEY as string) as any;
          this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
        } else {
          const rawBytes = Buffer.from(WALRUS_OPERATOR_PRIVATE_KEY.replace(/^0x/, ""), "hex");
          this.keypair = Ed25519Keypair.fromSecretKey(rawBytes);
        }
        this.signerAddress = this.keypair.getPublicKey().toSuiAddress();
        console.log(`SuiOutKit Walrus: Loaded cryptographic receipt signer address: ${this.signerAddress}`);
      } catch (err: any) {
        console.error("SuiOutKit Walrus: Failed to parse receipt signer key:", err.message);
      }
    }

    console.log(
      `SuiOutKit Walrus: Upload mode=${WALRUS_UPLOAD_MODE}, epochs=${WALRUS_EPOCHS}, deletable=${WALRUS_DELETABLE}`
    );

    if (this.keypair) {
      const uploadRelay = WALRUS_USE_UPLOAD_RELAY
        ? {
          host: WALRUS_UPLOAD_RELAY_URL,
          sendTip: { max: WALRUS_UPLOAD_RELAY_MAX_TIP }
        }
        : undefined;

      this.walrusClient = new SuiGrpcClient({
        network: SUI_NETWORK,
        baseUrl: SUI_GRPC_ENDPOINT
      }).$extend(walrus({
        uploadRelay,
        storageNodeClientOptions: { timeout: 60_000 }
      }));
    }
  }

  /**
   * Computes the blob ID for invoice data via local erasure encoding (~1s).
   * Signs the invoice once and returns the signed payload string so the same
   * bytes are used during upload (deterministic blob ID).
   */
  public async prepareInvoice(invoiceData: WalrusInvoiceData): Promise<{ blobId: string; signedPayload: string }> {
    if (!this.keypair || !this.signerAddress || !this.walrusClient) {
      throw new Error("Walrus preparation requires a valid WALRUS_OPERATOR_PRIVATE_KEY and SDK encoding client.");
    }

    const signedPayload = await this.createPayloadString(invoiceData);
    const blob = new TextEncoder().encode(signedPayload);
    const flow = this.walrusClient.walrus.writeBlobFlow({ blob });

    console.log(`SuiOutKit Walrus: Encoding receipt blob for owner ${this.signerAddress}...`);
    const encoded = await flow.encode();

    return { blobId: encoded.blobId, signedPayload };
  }

  /**
   * Resolves a blob ID for invoice data (encode-only, ~1s).
   */
  public async resolveBlobId(invoiceData: WalrusInvoiceData): Promise<{ blobId: string; signedPayload: string }> {
    return this.prepareInvoice(invoiceData);
  }

  /**
   * Uploads a receipt to Walrus decentralized storage.
   * If precomputedPayload is provided, uses it directly (deterministic blob ID).
   * Otherwise signs the invoice fresh (legacy path).
   */
  public async uploadInvoice(invoiceData: WalrusInvoiceData, precomputedPayload?: string): Promise<string> {
    const payloadString = precomputedPayload || await this.createPayloadString(invoiceData);

    if (WALRUS_UPLOAD_MODE === "sdk") {
      return this.uploadWithSdk(payloadString);
    }

    if (WALRUS_UPLOAD_MODE !== "publisher") {
      throw new Error(`Walrus Storage Error: Unsupported WALRUS_UPLOAD_MODE "${WALRUS_UPLOAD_MODE}". Use "publisher" or "sdk".`);
    }

    return this.uploadWithPublisher(payloadString);
  }

  private async createPayloadString(invoiceData: WalrusInvoiceData): Promise<string> {
    let finalPayload: any = { ...invoiceData };

    // Cryptographically sign the receipt to make it tamper-proof and verifiable by anyone
    if (this.keypair) {
      try {
        const rawBytes = new TextEncoder().encode(JSON.stringify(invoiceData));
        const signResult = await this.keypair.signPersonalMessage(rawBytes);
        finalPayload.gatewaySignature = signResult.signature;
        finalPayload.signerAddress = this.keypair.getPublicKey().toSuiAddress();
        console.log("SuiOutKit Walrus: Generated cryptographic invoice signature.");
      } catch (err: any) {
        console.warn("SuiOutKit Walrus: Failed to sign invoice, uploading unsigned copy:", err.message);
      }
    }

    return JSON.stringify(finalPayload, null, 2);
  }

  private async uploadWithSdk(payloadString: string): Promise<string> {
    if (!this.keypair || !this.signerAddress || !this.walrusClient) {
      throw new Error(
        "Walrus SDK Storage Error: WALRUS_UPLOAD_MODE=sdk requires a valid WALRUS_OPERATOR_PRIVATE_KEY."
      );
    }

    try {
      const blob = new TextEncoder().encode(payloadString);

      console.log(`SuiOutKit Walrus: SDK storing receipt blob for owner ${this.signerAddress}...`);
      const { blobId } = await this.walrusClient.walrus.writeBlob({
        blob,
        epochs: WALRUS_EPOCHS,
        deletable: WALRUS_DELETABLE,
        signer: this.keypair,
      });

      console.log(`SuiOutKit Walrus: SDK stored receipt. Blob ID: ${blobId}`);
      return blobId;
    } catch (err: any) {
      console.error("Walrus SDK upload failure:", err.message);
      throw new Error(`Walrus SDK Storage Error: ${err.message}`);
    }
  }

  private async uploadWithPublisher(payloadString: string): Promise<string> {
    try {
      console.log(`SuiOutKit Walrus: Archiving receipt to ${WALRUS_PUBLISHER_URL}/v1/blobs...`);

      const response = await fetch(`${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=${WALRUS_EPOCHS}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payloadString
      });

      if (response.ok) {
        const result: any = await response.json();
        const blobId = result.newlyCreated?.blobObject?.blobId || result.alreadyCertified?.blobId || result.blobId;
        if (blobId) {
          console.log(`SuiOutKit Walrus: Successfully stored receipt. Blob ID: ${blobId}`);
          return blobId;
        }
      }

      throw new Error(`Walrus returned HTTP status ${response.status}`);
    } catch (err: any) {
      console.error("Walrus upload failure:", err.message);
      throw new Error(`Walrus Storage Error: ${err.message}`);
    }
  }
}

export const walrusService = new WalrusService();
export default walrusService;
