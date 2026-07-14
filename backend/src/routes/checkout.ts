// SPDX-License-Identifier: AGPL-3.0-or-later
// AGPL: Strong copyleft license requiring source disclosure for network use. See LICENSE file.
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { Router, Request, Response } from "express";
import crypto from "crypto";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import redisService from "../services/redis.js";
import flutterwaveService from "../services/flutterwave.js";
import stripeService from "../services/stripe.js";
import walrusService from "../services/walrus.js";
import suiService from "../services/sui.js";
import fxService from "../services/fx.js";
import { getEnv } from "../config/env.js";
import logger from "../utils/logger.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { validateWebhookAuth } from "../middleware/webhookAuth.js";
import { CheckoutSession } from "../types/checkout.js";
import { assertTreasurySufficient } from "../utils/treasuryCheck.js";
import { getDefaultCoin, getCoinConfig, getSupportedCoinList, toBaseUnits, fromBaseUnits, getDecimals } from "../config/coins.js";

const router = Router();

// Load FX and Webhook configurations
const SUI_NETWORK = getEnv("SUI_NETWORK", "testnet") as any;
const PACKAGE_ID = getEnv(`PACKAGE_ID_${SUI_NETWORK}`);
const CRYPTO_REGISTRY_ID = getEnv(`CRYPTO_REGISTRY_ID_${SUI_NETWORK}`);
const CRYPTO_REGISTRY_NAME = getEnv("CRYPTO_REGISTRY_NAME", "suioutkit-crypto-settlements");

function normalizeMerchantAddress(address: string) {
  if (!isValidSuiAddress(address)) {
    throw new Error(`Invalid merchant Sui address: ${address}`);
  }

  return normalizeSuiAddress(address);
}

/**
 * Endpoint: POST /v1/checkout/session
 * Initializes a new checkout session.
 */
router.post("/session", rateLimiter, async (req: Request, res: Response) => {
  const { amount, currency, merchantAddress, coinType, metadata } = req.body;

  if (!amount || !currency || !merchantAddress) {
    return res.status(400).json({ error: "Missing required session parameters." });
  }

  try {
    const nonce = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString("hex");

    // Resolve coinType - validate against supported list
    const defaultCoin = getDefaultCoin();
    const requestedCoin = coinType || defaultCoin.type;
    const coinCfg = getCoinConfig(requestedCoin);
    if (!coinCfg) {
      const supported = getSupportedCoinList().map((c) => c.type).join(", ");
      return res.status(400).json({
        error: `Unsupported coin type: ${requestedCoin}. Supported: ${supported}`,
      });
    }
    const targetCoinType = coinCfg.type;
    const normalizedMerchantAddress = normalizeMerchantAddress(merchantAddress);

    // Calculate real-time dynamic exchange rate for checkout preview
    let estimatedRate = 1300;
    try {
      estimatedRate = await fxService.getRateNGNToToken(targetCoinType);
    } catch (e) {
      // Graceful fallback
    }

    const session: CheckoutSession = {
      token,
      nonce,
      amount,
      currency,
      merchantAddress: normalizedMerchantAddress,
      metadata: metadata || {},
      status: "PENDING",
      createdAt: new Date().toISOString(),
      packageId: PACKAGE_ID,
      cryptoRegistryId: CRYPTO_REGISTRY_ID,
      cryptoRegistryName: CRYPTO_REGISTRY_NAME,
      coinType: targetCoinType,
      estimatedRate
    };

    // Cache session in Redis for 24h
    await redisService.setSession(nonce, session);
    // Also index the token to the nonce mapping
    await redisService.setSession(`token:${token}`, { nonce });

    logger.info("CHECKOUT", `Created checkout session. Nonce: ${nonce}, Amount: ${currency} ${amount}`);
    return res.json({ ...session, supportedCoins: getSupportedCoinList() });
  } catch (err: any) {
    logger.error("CHECKOUT", `Session creation failed: ${err.message}`);
    return res.status(400).json({ error: err.message || "Failed to create checkout session." });
  }
});

/**
 * Endpoint: POST /v1/checkout/charge
 * Validates treasury balance with fresh FX rate, then processes the dynamic payment charge.
 */
router.post("/charge", async (req: Request, res: Response) => {
  const { token, method, phoneNumber } = req.body;

  if (!token || !method) {
    return res.status(400).json({ error: "Missing token or charge method." });
  }

  // Resolve nonce from token
  const mapping = await redisService.getSession(`token:${token}`);
  if (!mapping) {
    logger.warn("CHECKOUT", `Invalid checkout session token verification request: ${token}`);
    return res.status(404).json({ error: "Invalid checkout session token." });
  }

  const session = await redisService.getSession(mapping.nonce);
  if (!session) {
    return res.status(404).json({ error: "Checkout session expired or not found." });
  }

  try {
    session.merchantAddress = normalizeMerchantAddress(session.merchantAddress);
  } catch (err: any) {
    logger.error("CHECKOUT", `Crypto intent rejected for nonce ${session.nonce}: ${err.message}`);
    return res.status(400).json({ error: err.message || "Invalid merchant address." });
  }

  try {
    // STEP 1: Fetch FRESH FX rate (skip cache for accuracy at payment confirmation)
    const sessionCoinType = session.coinType || getDefaultCoin().type;
    let currentRate = 1300;
    try {
      currentRate = await fxService.getRateNGNToToken(sessionCoinType, true); // skipCache=true
      logger.info("CHECKOUT", `Fresh FX rate fetched for ${method} charge on nonce ${session.nonce}: ₦${currentRate} per token`);
    } catch (e: any) {
      logger.warn("CHECKOUT", `Failed to fetch fresh FX rate, using session estimated rate: ${e.message}`);
      currentRate = session.estimatedRate || 1300;
    }

    // STEP 2: Calculate settlement amount with fresh rate
    const decimals = getDecimals(sessionCoinType);
    const settlementAmount = Math.floor((session.amount / currentRate) * 10 ** decimals);
    logger.info("CHECKOUT", `Calculated settlement: ₦${session.amount} @ ₦${currentRate}/token = ${settlementAmount / 10 ** decimals} token(s) for nonce ${session.nonce}`);

    // STEP 3: Pre‑flight treasury balance verification
    if (!(await assertTreasurySufficient(settlementAmount, sessionCoinType, session.nonce, res))) {
      return; // response already sent by helper
    }

    // STEP 4: Update session with validated fresh rate & settlement amount
    await redisService.updateSessionStatus(session.nonce, "PENDING", {
      validatedRate: currentRate,
      settlementAmount,
      chargeMethod: method,
      chargeApproved: true
    });

    // STEP 5: Proceed with bank charge or OPay based on method
    if (method === "bank_transfer") {
      // Idempotency guard: if a virtual account was already allocated for this session,
      // return it instead of creating a duplicate charge (which Flutterwave rejects on re-used tx_ref).
      if (session.virtualAccount && session.flwTransactionId) {
        logger.info("CHECKOUT", `Reusing existing virtual account for session ${session.nonce}: ${session.virtualAccount.bankName} ${session.virtualAccount.accountNumber}`);
        return res.json({ status: "success", virtualAccount: session.virtualAccount, validatedRate: currentRate });
      }

      // Allocate virtual account via Flutterwave V3
      const va = await flutterwaveService.chargeBankTransfer({
        txRef: session.nonce,
        amount: session.amount,
        email: `payer-${session.nonce.substring(0, 8)}@suioutkit.com`,
        phoneNumber
      });

      // Save billing details in Redis session
      await redisService.updateSessionStatus(session.nonce, "PENDING", {
        method: "bank_transfer",
        virtualAccount: va,
        flwTransactionId: va.transactionId
      });

      // Start background polling to verify transaction (backup for webhooks)
      logger.info("CHECKOUT", `Bank transfer charge result for ${session.nonce}: transactionId=${va.transactionId ?? "null"}`);
      startTransactionPolling(session.nonce, currentRate, sessionCoinType, va.transactionId, session.nonce).catch((err: any) => {
        logger.warn("CHECKOUT", `Transaction polling failed for ${session.nonce}: ${err.message}`);
      });

      logger.info("CHECKOUT", `Allocated dynamic virtual account for session ${session.nonce}: ${va.bankName} ${va.accountNumber} | Rate: ₦${currentRate}`);
      return res.json({ status: "success", virtualAccount: va, validatedRate: currentRate });
    } else if (method === "opay") {
      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required for OPay payments." });
      }

      // Idempotency guard: if OPay charge was already initiated, return existing state
      if (session.method === "opay" && session.flwTransactionId) {
        logger.info("CHECKOUT", `Reusing existing OPay charge for session ${session.nonce}`);
        return res.json({ status: "success", opayAuthorizationUrl: session.authorizationUrl, validatedRate: currentRate });
      }

      const publicUrl = getEnv("PUBLIC_URL", "http://localhost:5000");
      const opayRedirectUrl = `${publicUrl}/v1/checkout/opay/callback`;

      const { authorizationUrl, transactionId } = await flutterwaveService.chargeOPay({
        txRef: session.nonce,
        amount: session.amount,
        email: `payer-${session.nonce.substring(0, 8)}@suioutkit.com`,
        phoneNumber,
        redirectUrl: opayRedirectUrl
      });

      await redisService.updateSessionStatus(session.nonce, "PENDING", {
        method: "opay",
        phoneNumber,
        flwTransactionId: transactionId
      });

      // Start background polling to verify OPay transaction (backup for webhooks)
      startTransactionPolling(session.nonce, currentRate, sessionCoinType, transactionId, session.nonce).catch((err: any) => {
        logger.warn("CHECKOUT", `OPay transaction polling failed for ${session.nonce}: ${err.message}`);
      });

      logger.info("CHECKOUT", `Dispatched OPay redirect charge to ${phoneNumber} for session ${session.nonce} | Rate: ₦${currentRate}`);
      return res.json({ status: "success", opayAuthorizationUrl: authorizationUrl, validatedRate: currentRate });
    } else if (method === "stripe") {
          if (session.currency === "NGN") {
            let usdToNgnRate = 1300;
            try {
              usdToNgnRate = await fxService.getUSDToNGNRate(true);
            } catch (e: any) {
              logger.warn("CHECKOUT", `Stripe minimum preflight using fallback FX rate: ${e.message}`);
            }

            const minimumNgnAmount = Math.ceil(0.5 * usdToNgnRate);
            if (session.amount < minimumNgnAmount) {
              return res.status(400).json({
                status: "error",
                message: `Card payments need at least ₦${minimumNgnAmount.toLocaleString()} right now. Please use bank transfer for smaller amounts.`
              });
            }
          }

      const clientSecret = await stripeService.createPaymentIntent(
        session.amount,
        session.currency,
        session.nonce,
        { merchantAddress: session.merchantAddress }
      );

      await redisService.updateSessionStatus(session.nonce, "PENDING", {
        method: "stripe",
        clientSecret
      });

      const stripePublicKey = process.env.STRIPE_PUBLIC_KEY || "pk_test_TYooMQauvdEDq54NiTphI7jx";

      logger.info("CHECKOUT", `Created Stripe PaymentIntent for session ${session.nonce} | Rate: ₦${currentRate}`);
      return res.json({ status: "success", clientSecret, stripePublicKey, validatedRate: currentRate });
    } else {
      return res.status(400).json({ error: "Unsupported charge method." });
    }
  } catch (err: any) {
    const providerCode = err.code || "UNKNOWN";
    const providerHttpStatus = err.providerHttpStatus ?? "n/a";
    const responseStatus = providerCode.startsWith("FLW_") ? 502 : 500;

    logger.error(
      "CHECKOUT",
      `Failed to register payment charge. code=${providerCode}, providerHttpStatus=${providerHttpStatus}, message=${err.message}`
    );

    return res.status(responseStatus).json({
      status: "error",
      message: err.message || "Unable to initialize payment charge."
    });
  }
});

/**
 * Endpoint: GET /v1/checkout/status/:nonce
 * SDK polling endpoint to check order completion state.
 */
router.get("/status/:nonce", async (req: Request, res: Response) => {
  const nonce = req.params.nonce as string;
  const session = await redisService.getSession(nonce);

  if (!session) {
    return res.status(404).json({ status: "EXPIRED", message: "Session expired." });
  }

  return res.json({
    status: session.status,
    txDigest: session.txDigest,
    walrusBlobId: session.walrusBlobId,
    error: session.error
  });
});

/**
 * Endpoint: POST /v1/checkout/crypto/intent
 * Prepares crypto payment intent for wallet connect or outPay QR.
 */
router.post("/crypto/intent", async (req: Request, res: Response) => {
  const { token, method, coinType: reqCoinType } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Missing token." });
  }

  const mapping = await redisService.getSession(`token:${token}`);
  if (!mapping) {
    logger.warn("CHECKOUT", `Invalid crypto intent token: ${token}`);
    return res.status(404).json({ error: "Invalid checkout session token." });
  }

  const session = await redisService.getSession(mapping.nonce);
  if (!session) {
    return res.status(404).json({ error: "Checkout session expired or not found." });
  }

  try {
    const sessionCoinType = reqCoinType || session.coinType || getDefaultCoin().type;
    let rate = 1;
    if (session.currency === "NGN") {
      try {
        rate = await fxService.getRateNGNToToken(sessionCoinType, true);
      } catch (e: any) {
        logger.warn("CHECKOUT", `Crypto intent FX fetch failed, using estimated rate: ${e.message}`);
        rate = session.estimatedRate || 1300;
      }
    }

    const decimals = getDecimals(sessionCoinType);
    const amountBaseUnits = Math.floor(
      session.currency === "NGN"
        ? (session.amount / rate) * 10 ** decimals
        : session.amount * 10 ** decimals
    );

    const invoiceMetadata = {
      nonce: session.nonce,
      amountNaira: session.currency === "NGN" ? session.amount : 0,
      exchangeRate: rate,
      amountSettled: amountBaseUnits / 10 ** decimals,
      settlementToken: sessionCoinType,
      merchantAddress: session.merchantAddress,
      fiatMethod: method || "sui_wallet",
      timestamp: new Date().toISOString()
    };

    const preparedInvoice = await walrusService.prepareInvoice(invoiceMetadata);

    await redisService.updateSessionStatus(session.nonce, "PENDING", {
      cryptoAmountBaseUnits: amountBaseUnits,
      cryptoRate: rate,
      cryptoMethod: method || "sui_wallet",
      cryptoWalrusBlobId: preparedInvoice.blobId,
      cryptoWalrusInvoice: invoiceMetadata,
      cryptoWalrusPreparedAt: new Date().toISOString(),
    });

    return res.json({
      nonce: session.nonce,
      receiverAddress: session.merchantAddress,
      amountBaseUnits,
      coinType: sessionCoinType,
      packageId: PACKAGE_ID,
      registryName: session.cryptoRegistryName || CRYPTO_REGISTRY_NAME,
      walrusBlobId: preparedInvoice.blobId,
      rate
    });
  } catch (err: any) {
    logger.error("CHECKOUT", `Crypto intent failed for nonce ${session.nonce}: ${err.message}`);
    return res.status(500).json({ error: err.message || "Failed to prepare crypto intent." });
  }
});

/**
 * Endpoint: POST /v1/checkout/crypto/confirm
 * Confirms a direct crypto payment and stores Walrus receipt.
 */
router.post("/crypto/confirm", async (req: Request, res: Response) => {
  const { nonce, txDigest, method } = req.body;

  if (!nonce || !txDigest) {
    return res.status(400).json({ error: "Missing nonce or txDigest." });
  }

  const session = await redisService.getSession(nonce);
  if (!session) {
    return res.status(404).json({ error: "Checkout session expired or not found." });
  }

  let merchantAddress: string;
  try {
    merchantAddress = normalizeMerchantAddress(session.merchantAddress);
  } catch (err: any) {
    logger.error("CHECKOUT", `Crypto confirm rejected for nonce ${nonce}: ${err.message}`);
    return res.status(400).json({ error: err.message || "Invalid merchant address." });
  }

  if (session.status === "SETTLED") {
    return res.json({ status: "success", txDigest: session.txDigest, walrusBlobId: session.walrusBlobId });
  }

  try {
    const sessionCoinType = session.coinType || getDefaultCoin().type;
    const amountBaseUnits = session.cryptoAmountBaseUnits || 0;
    const verification = await suiService.verifyCryptoPaymentTx(txDigest, nonce);

    if (!verification.verified) {
      return res.status(409).json({ error: "Unable to verify crypto payment on-chain." });
    }

    const confirmedTxDigest = txDigest;

    const amountTokens = amountBaseUnits / 10 ** getDecimals(sessionCoinType);
    const invoiceMetadata = session.cryptoWalrusInvoice || {
      nonce: session.nonce,
      amountNaira: session.currency === "NGN" ? session.amount : 0,
      exchangeRate: session.cryptoRate || 0,
      amountSettled: amountTokens,
      settlementToken: sessionCoinType,
      merchantAddress: session.merchantAddress,
      fiatMethod: method || session.cryptoMethod || "sui_wallet",
      timestamp: new Date().toISOString()
    };

    let walrusBlobId = session.cryptoWalrusBlobId || session.walrusBlobId;
    let walrusAlreadyStored = !!session.cryptoWalrusUploadedAt;

    if (!walrusBlobId) {
      // Prepare blob ID without storing first (SDK mode) or store now (publisher mode)
      const resolved = await walrusService.resolveBlobId(invoiceMetadata);
      walrusBlobId = resolved.blobId;
      walrusAlreadyStored = resolved.alreadyStored;
    }

    // On-chain payment is already verified - commit Walrus blob if not yet stored
    if (!walrusAlreadyStored && walrusBlobId) {
      try {
        await walrusService.uploadInvoice(invoiceMetadata);
      } catch (walrusErr: any) {
        logger.error("CHECKOUT", `Walrus post-verification commit failed for ${nonce}: ${walrusErr.message}`);
        // Non-fatal: blob ID is deterministic; can be uploaded later
      }
    }

    await redisService.updateSessionStatus(session.nonce, "SETTLED", {
      txDigest: confirmedTxDigest,
      walrusBlobId,
      cryptoWalrusUploadedAt: new Date().toISOString(),
      cryptoConfirmedAt: new Date().toISOString()
    });

    return res.json({ status: "success", txDigest: confirmedTxDigest, walrusBlobId });
  } catch (err: any) {
    logger.error("CHECKOUT", `Crypto confirm failed for nonce ${nonce}: ${err.message}`);
    return res.status(500).json({ error: err.message || "Failed to confirm crypto payment." });
  }
});

/**
 * Endpoint: GET /v1/checkout/validate/:nonce
 * Pre-flight validation: checks if treasury has sufficient balance for the requested payment.
 * SDK calls this before showing "Confirm Payment" button.
 */
router.get("/validate/:nonce", async (req: Request, res: Response) => {
  const nonce = req.params.nonce as string;

  try {
    const session = await redisService.getSession(nonce);
    if (!session) {
      return res.status(404).json({ error: "Checkout session expired or not found." });
    }

    const coinType = session.coinType || getDefaultCoin().type;
    let estimatedRate = session.estimatedRate || 1300;
    try {
      estimatedRate = await fxService.getRateNGNToToken(coinType);
    } catch (e) {
      // Fallback to cached rate
    }

    const settlementAmount = Math.floor((session.amount / estimatedRate) * 10 ** getDecimals(coinType));

    logger.info(
      "CHECKOUT",
      `Validate request for nonce ${nonce}: required settlement amount=${settlementAmount}, rate=${estimatedRate}`
    );

    return res.json({
      coinType,
      exchangeRate: estimatedRate,
      settlementAmount,
      message: "Settlement amount calculated. Confirm at /charge endpoint."
    });
  } catch (err: any) {
    logger.error("CHECKOUT", `Validation check failed for nonce ${nonce}: ${err.message}`);
    return res.status(500).json({
      error: err.message || "Failed to validate treasury balance.",
      sufficient: false
    });
  }
});

/**
 * Endpoint: POST /v1/checkout/webhook
 * Dynamic bank transfer credit webhook receiver (PCI-DSS safe).
 * Validated by validateWebhookAuth middleware interceptor.
 */
router.post("/webhook", validateWebhookAuth, async (req: Request, res: Response) => {
  const payload = req.body;
  const { tx_ref, amount, currency, status } = payload.data || payload;

  if (status !== "successful") {
    logger.info("WEBHOOK", `Transaction ${tx_ref} not completed yet. Status: ${status}`);
    return res.sendStatus(200); // Acknowledge to prevent retries
  }

  // Load session from Redis cache
  const session = await redisService.getSession(tx_ref);
  if (!session) {
    logger.warn("WEBHOOK", `Received successful webhook for expired or unknown session: ${tx_ref}`);
    return res.sendStatus(200);
  }

  if (session.status === "SETTLED") {
    logger.info("WEBHOOK", `Webhook duplicate ignore for settled transaction: ${tx_ref}`);
    return res.sendStatus(200);
  }

  if (!session.chargeApproved) {
    logger.warn("WEBHOOK", `Ignoring webhook for unapproved charge: ${tx_ref}`);
    return res.sendStatus(200);
  }

  try {
    logger.info("WEBHOOK", `Processing bank credit alert. Nonce: ${tx_ref}, Amount: ₦${amount}`);

    // Update status to PROCESSING to prevent concurrent webhook execution collisions
    await redisService.updateSessionStatus(session.nonce, "PROCESSING");

    // 1. Use validated rate from /charge endpoint (stored in session during payment confirmation)
    // If not present (legacy sessions), fall back to fresh fetch with safe default
    let currentRate = session.validatedRate || 1300;
    const sessionCoinType = session.coinType || getDefaultCoin().type;

    if (!session.validatedRate) {
      try {
        currentRate = await fxService.getRateNGNToToken(sessionCoinType);
        logger.warn("WEBHOOK", `Using fallback fresh FX rate (no validated rate in session): ₦${currentRate}`);
      } catch (e: any) {
        logger.warn("WEBHOOK", `Failed to fetch FX rate, using default 1300: ${e.message}`);
        currentRate = 1300;
      }
    } else {
      logger.info("WEBHOOK", `Using pre-validated FX rate from /charge: ₦${currentRate}`);
    }

    const decimals = getDecimals(sessionCoinType);
    const settlementAmount = Math.floor((amount / currentRate) * 10 ** decimals);
    let walrusBlobId: string;
    let walrusAlreadyStored = false;
    logger.info("WEBHOOK", `Settlement calculation: ₦${amount} @ ₦${currentRate}/token = ${settlementAmount / 10 ** decimals} token(s)`);

    // 2. Resolve Walrus blob ID (prepare in SDK mode, upload in publisher mode) with Redis lock
    const lockKey = `uploadLock:${session.nonce}`;
    let lockOwner: string | null = null;
    try {
      lockOwner = await redisService.acquireLock(lockKey, 30);
      if (!lockOwner) {
        console.warn(`Upload lock not acquired for ${session.nonce}; assuming another worker is handling it.`);
        if (session.walrusBlobId) {
          walrusBlobId = session.walrusBlobId;
          walrusAlreadyStored = true;
        } else {
          await new Promise(res => setTimeout(res, 2000));
          const refreshed = await redisService.getSession(session.nonce);
          walrusBlobId = refreshed?.walrusBlobId;
          walrusAlreadyStored = !!walrusBlobId;
          if (!walrusBlobId) {
            throw new Error("Could not resolve Walrus blob ID after waiting for lock.");
          }
        }
      } else {
        if (session.walrusBlobId) {
          walrusBlobId = session.walrusBlobId;
          walrusAlreadyStored = true;
          console.log('Reusing existing Walrus blob ID:', walrusBlobId);
        } else {
          const invoiceMetadata = {
            nonce: session.nonce,
            amountNaira: amount,
            exchangeRate: currentRate,
            amountSettled: settlementAmount / 10 ** decimals,
            settlementToken: sessionCoinType,
            merchantAddress: session.merchantAddress,
            fiatMethod: session.method || "bank_transfer",
            timestamp: new Date().toISOString()
          };
          // In SDK mode: prepareInvoice computes blobId without storing.
          // In publisher mode: resolveBlobId uploads to get blobId.
          const resolved = await walrusService.resolveBlobId(invoiceMetadata);
          walrusBlobId = resolved.blobId;
          walrusAlreadyStored = resolved.alreadyStored;
        }
      }
    } finally {
      if (lockOwner) {
        await redisService.releaseLock(lockKey, lockOwner);
      }
    }

    // 3. Execute settle_fiat PTB on Sui via gRPC operator signer
    const onChainResult = await suiService.executeSettleFiat(
      settlementAmount,
      session.merchantAddress,
      session.nonce,
      walrusBlobId,
      sessionCoinType
    );

    // 4. If SDK mode and blob was only prepared (not stored), commit it now after successful PTB
    if (!walrusAlreadyStored && walrusBlobId) {
      try {
        const invoiceMetadata = {
          nonce: session.nonce,
          amountNaira: amount,
          exchangeRate: currentRate,
          amountSettled: settlementAmount / 10 ** decimals,
          settlementToken: sessionCoinType,
          merchantAddress: session.merchantAddress,
          fiatMethod: session.method || "bank_transfer",
          timestamp: new Date().toISOString()
        };
        await walrusService.uploadInvoice(invoiceMetadata);
        logger.success("WEBHOOK", `Walrus receipt committed after successful PTB: ${walrusBlobId}`);
      } catch (walrusErr: any) {
        logger.error("WEBHOOK", `Walrus post-PTB commit failed for ${session.nonce}: ${walrusErr.message}. Blob ID was already in receipt.`);
        // Non-fatal: the blob ID was baked into the on-chain receipt.
        // The merchant can retrieve the off-chain data from the on-chain event.
      }
    }

    // 5. Update session inside Redis as fully SETTLED
    await redisService.updateSessionStatus(session.nonce, "SETTLED", {
      txDigest: onChainResult.txDigest,
      walrusBlobId
    });

    logger.success("WEBHOOK", `Fully settled transaction ${session.nonce}. Merchant ${session.merchantAddress} paid.`);
    return res.sendStatus(200);
  } catch (err: any) {
    logger.error("WEBHOOK", `Webhook Processing Failure: ${err.message}`, err.stack);
    await redisService.updateSessionStatus(session.nonce, "PENDING", { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint: POST /v1/checkout/stripe-webhook
 * Stripe webhook receiver.
 */
router.post("/stripe-webhook", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;
  let event;

  try {
    event = stripeService.constructEvent((req as any).rawBody, sig);
  } catch (err: any) {
    logger.error("STRIPE-WEBHOOK", `Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== "payment_intent.succeeded") {
    return res.json({ received: true });
  }

  const paymentIntent = event.data.object as any;
  const nonce = paymentIntent.metadata.nonce;
  const amount = paymentIntent.amount;

  if (!nonce) {
    logger.warn("STRIPE-WEBHOOK", `Missing nonce in PaymentIntent metadata: ${paymentIntent.id}`);
    return res.json({ received: true });
  }

  const session = await redisService.getSession(nonce);
  if (!session) {
    logger.warn("STRIPE-WEBHOOK", `Received successful webhook for expired or unknown session: ${nonce}`);
    return res.json({ received: true });
  }

  if (session.status === "SETTLED") {
    logger.info("STRIPE-WEBHOOK", `Webhook duplicate ignore for settled transaction: ${nonce}`);
    return res.json({ received: true });
  }

  try {
    logger.info("STRIPE-WEBHOOK", `Processing Stripe credit alert. Nonce: ${nonce}, Amount: ${paymentIntent.currency} ${amount}`);

    await redisService.updateSessionStatus(session.nonce, "PROCESSING");

    let currentRate = session.validatedRate || 1300;
    const sessionCoinType = session.coinType || getDefaultCoin().type;
    const decimals = getDecimals(sessionCoinType);

    const settlementAmount = Math.floor((session.amount / currentRate) * 10 ** decimals);
    logger.info("STRIPE-WEBHOOK", `Settlement calculation: ${session.amount} @ ${currentRate}/token = ${settlementAmount / 10 ** decimals} token(s)`);

    const invoiceMetadata = {
      nonce: session.nonce,
      amountNaira: session.amount,
      exchangeRate: currentRate,
      amountSettled: settlementAmount / 10 ** decimals,
      settlementToken: sessionCoinType,
      merchantAddress: session.merchantAddress,
      fiatMethod: "stripe",
      timestamp: new Date().toISOString()
    };

    // Resolve Walrus blob ID (prepare-then-upload-after-PTB in SDK mode) with idempotency lock
    const lockKey = `uploadLock:stripe:${session.nonce}`;
    let lockOwner: string | null = null;
    let walrusBlobId: string;
    let walrusAlreadyStored = false;
    try {
      lockOwner = await redisService.acquireLock(lockKey, 30);
      if (!lockOwner) {
        console.warn(`Stripe upload lock not acquired for ${session.nonce}; assuming another worker is handling it.`);
        if (session.walrusBlobId) {
          walrusBlobId = session.walrusBlobId;
          walrusAlreadyStored = true;
        } else {
          await new Promise(res => setTimeout(res, 2000));
          const refreshed = await redisService.getSession(session.nonce);
          walrusBlobId = refreshed?.walrusBlobId;
          walrusAlreadyStored = !!walrusBlobId;
          if (!walrusBlobId) throw new Error("Could not resolve Walrus blob ID after waiting for lock.");
        }
      } else {
        if (session.walrusBlobId) {
          walrusBlobId = session.walrusBlobId;
          walrusAlreadyStored = true;
          console.log('Reusing existing Walrus blob ID:', walrusBlobId);
        } else {
          const resolved = await walrusService.resolveBlobId(invoiceMetadata);
          walrusBlobId = resolved.blobId;
          walrusAlreadyStored = resolved.alreadyStored;
        }
      }
    } finally {
      if (lockOwner) {
        await redisService.releaseLock(lockKey, lockOwner);
      }
    }

    const onChainResult = await suiService.executeSettleFiat(
      settlementAmount,
      session.merchantAddress,
      session.nonce,
      walrusBlobId,
      sessionCoinType
    );

    // Commit Walrus blob after successful PTB (SDK mode only)
    if (!walrusAlreadyStored && walrusBlobId) {
      try {
        await walrusService.uploadInvoice(invoiceMetadata);
        logger.success("STRIPE-WEBHOOK", `Walrus receipt committed after successful PTB: ${walrusBlobId}`);
      } catch (walrusErr: any) {
        logger.error("STRIPE-WEBHOOK", `Walrus post-PTB commit failed for ${nonce}: ${walrusErr.message}`);
      }
    }

    await redisService.updateSessionStatus(session.nonce, "SETTLED", {
      txDigest: onChainResult.txDigest,
      walrusBlobId
    });

    logger.success("STRIPE-WEBHOOK", `Fully settled transaction ${session.nonce}. Merchant ${session.merchantAddress} paid.`);
    return res.json({ received: true });
  } catch (err: any) {
    logger.error("STRIPE-WEBHOOK", `Webhook Processing Failure: ${err.message}`, err.stack);
    await redisService.updateSessionStatus(session.nonce, "PENDING", { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint: GET /v1/checkout/opay/callback
 * OPay redirect callback after user authorizes payment.
 * Displays a simple confirmation page while the actual settlement happens via Flutterwave webhook.
 */
router.get("/opay/callback", (req: Request, res: Response) => {
  const txRef = req.query.tx_ref as string;
  const status = req.query.status as string;
  const isSuccess = status === "successful";

  // Post status back to parent window (SDK modal) and auto-close
  res.send(`
    <!DOCTYPE html>
    <html><head><title>OPay ${isSuccess ? "Authorized" : "Status"}</title></head>
    <body style="font-family:system-ui;text-align:center;padding:60px 20px;">
      <h1>${isSuccess ? "Payment Authorized" : "Payment " + (status || "Unknown")}</h1>
      <p>${isSuccess ? "Your OPay payment has been authorized successfully." : "Your OPay payment status: " + (status || "unknown") + "."}</p>
      <p style="color:#666;">Reference: ${txRef || "N/A"}</p>
      <p style="color:#888; font-size:13px;">This window will close automatically.</p>
      <script>
        (function() {
          try {
            if (window.opener) {
              window.opener.postMessage({ type: "suioutkit_opay_complete", txRef: "${txRef || ""}", status: "${status || ""}" }, "*");
            }
          } catch(e) {}
          setTimeout(function() { window.close(); }, 1500);
        })();
      </script>
    </body></html>
  `);
});

/**
 * Background polling to verify transactions.
 * Backup for webhooks - polls Flutterwave verify endpoint until transaction completes or times out.
 * Uses transactionId if available, falls back to tx_ref query.
 */
async function startTransactionPolling(nonce: string, rate: number, coinType: string, transactionId?: number | null, txRef?: string) {
  const POLL_INTERVAL = 10_000; // 10 seconds
  const MAX_POLLS = 180; // 30 minutes
  const MAX_WAIT = POLL_INTERVAL * MAX_POLLS;

  logger.info("POLL", `Starting transaction polling for nonce ${nonce}, txId=${transactionId ?? "null"}, txRef=${txRef ?? "null"}`);

  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

    // Check if session was already processed (by webhook or previous poll)
    const session = await redisService.getSession(nonce);
    if (!session || session.status === "SETTLED" || session.status === "PROCESSING") {
      logger.info("POLL", `Session ${nonce} already ${session?.status || "expired"}, stopping poll.`);
      return;
    }

    try {
      let tx: { status: string; id: number; tx_ref: string; amount: number; currency: string } | null = null;

      if (transactionId) {
        tx = await flutterwaveService.verifyTransaction(transactionId);
      } else if (txRef) {
        tx = await flutterwaveService.verifyTransactionByTxRef(txRef);
      }

      if (!tx) {
        logger.info("POLL", `No transaction found yet for nonce ${nonce} (txId=${transactionId ?? "null"}, txRef=${txRef ?? "null"}), waiting...`);
        continue;
      }

      logger.info("POLL", `Transaction ${tx.id} (${tx.tx_ref}) status: ${tx.status}`);

      if (tx.status === "successful") {
        await processSettlement(nonce, tx.amount, rate, coinType);
        return;
      }

      if (tx.status === "failed") {
        logger.warn("POLL", `Transaction ${tx.id} failed for nonce ${nonce}`);
        await redisService.updateSessionStatus(nonce, "EXPIRED", { error: "Payment failed" });
        return;
      }
    } catch (err: any) {
      logger.warn("POLL", `Verify call failed for nonce ${nonce}: ${err.message}`);
    }
  }

  logger.warn("POLL", `Polling timed out for nonce ${nonce} after ${MAX_WAIT / 1000}s`);
}

/**
 * Process settlement after payment confirmation (shared by webhook and polling).
 */
async function processSettlement(nonce: string, paidAmount: number, rate: number, coinType: string) {
  const session = await redisService.getSession(nonce);
  if (!session || session.status === "SETTLED" || session.status === "PROCESSING") return;

  await redisService.updateSessionStatus(nonce, "PROCESSING");

  const decimals = getDecimals(coinType);
  const settlementAmount = Math.floor((paidAmount / rate) * 10 ** decimals);
  logger.info("SETTLE", `Processing settlement for ${nonce}: ₦${paidAmount} @ ₦${rate}/token = ${settlementAmount / 10 ** decimals} tokens`);

  // Walrus blob resolution
  const lockKey = `uploadLock:${nonce}`;
  let walrusBlobId: string;
  let walrusAlreadyStored = false;

  const lockOwner = await redisService.acquireLock(lockKey, 30);
  try {
    if (!lockOwner) {
      await new Promise((r) => setTimeout(r, 2000));
      const refreshed = await redisService.getSession(nonce);
      walrusBlobId = refreshed?.walrusBlobId;
      walrusAlreadyStored = !!walrusBlobId;
      if (!walrusBlobId) throw new Error("Could not resolve Walrus blob ID after waiting for lock.");
    } else {
      if (session.walrusBlobId) {
        walrusBlobId = session.walrusBlobId;
        walrusAlreadyStored = true;
      } else {
        const invoiceMetadata = {
          nonce: session.nonce,
          amountNaira: paidAmount,
          exchangeRate: rate,
          amountSettled: settlementAmount / 10 ** decimals,
          settlementToken: coinType,
          merchantAddress: session.merchantAddress,
          fiatMethod: session.method || "bank_transfer",
          timestamp: new Date().toISOString()
        };
        const resolved = await walrusService.resolveBlobId(invoiceMetadata);
        walrusBlobId = resolved.blobId;
        walrusAlreadyStored = resolved.alreadyStored;
      }
    }
  } finally {
    if (lockOwner) await redisService.releaseLock(lockKey, lockOwner);
  }

  // Sui settlement
  const onChainResult = await suiService.executeSettleFiat(
    settlementAmount,
    session.merchantAddress,
    session.nonce,
    walrusBlobId,
    coinType
  );

  // Commit blob if SDK mode
  if (!walrusAlreadyStored && walrusBlobId) {
    try {
      const invoiceMetadata = {
        nonce: session.nonce,
        amountNaira: paidAmount,
        exchangeRate: rate,
        amountSettled: settlementAmount / 10 ** decimals,
        settlementToken: coinType,
        merchantAddress: session.merchantAddress,
        fiatMethod: session.method || "bank_transfer",
        timestamp: new Date().toISOString()
      };
      await walrusService.uploadInvoice(invoiceMetadata);
    } catch (e: any) {
      logger.warn("SETTLE", `Walrus post-PTB commit failed: ${e.message}`);
    }
  }

  await redisService.updateSessionStatus(nonce, "SETTLED", {
    txDigest: onChainResult.txDigest,
    walrusBlobId
  });
  logger.success("SETTLE", `Settlement complete for ${nonce}: txDigest=${onChainResult.txDigest}`);
}

export default router;
