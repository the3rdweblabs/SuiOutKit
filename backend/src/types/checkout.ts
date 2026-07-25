// SPDX-License-Identifier: AGPL-3.0-or-later
// AGPL: Strong copyleft license requiring source disclosure for network use. See LICENSE file.
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

export type SessionStatus = "PENDING" | "PROCESSING" | "SETTLED" | "EXPIRED";

export interface VirtualAccountDetails {
  accountNumber: string;
  bankName: string;
  amount: number;
  expirySeconds: number;
}

export interface CheckoutSession {
  token: string;
  nonce: string;
  amount: number;
  currency: string;
  resolvedCurrency: string;
  currencySymbol: string;
  merchantAddress: string;
  metadata: Record<string, any>;
  status: SessionStatus;
  createdAt: string;
  packageId: string;
  cryptoRegistryId: string;
  cryptoRegistryName?: string;
  coinType: string;
  estimatedRate?: number;
  validatedRate?: number;
  settlementAmount?: number;
  chargeMethod?: "bank_transfer" | "opay" | "ussd" | "stripe";
  chargeApproved?: boolean;
  cryptoAmountBaseUnits?: number;
  cryptoRate?: number;
  cryptoMethod?: "sui_wallet" | "outpay";
  cryptoConfirmedAt?: string;
  cryptoWalrusPreparedAt?: string;
  cryptoWalrusUploadedAt?: string;
  cryptoWalrusBlobId?: string;
  cryptoWalrusInvoice?: {
    nonce: string;
    amountFiat: number;
    fiatCurrency: string;
    amountNaira: number;
    exchangeRate: number;
    amountSettled: number;
    settlementToken: string;
    merchantAddress: string;
    fiatMethod: string;
    timestamp: string;
  };
  method?: "bank_transfer" | "opay" | "ussd" | "stripe";
  virtualAccount?: VirtualAccountDetails;
  phoneNumber?: string;
  ussdCode?: string;
  paymentCode?: string | null;
  accountBank?: string;
  clientSecret?: string;
  txDigest?: string;
  walrusBlobId?: string;
  error?: string;
  localAmount?: number;
  localCurrency?: string;
  settlementToken?: string | string[];
}

export interface CreateChargeParams {
  txRef: string;
  amount: number;
  currency: string;
  email: string;
  phoneNumber?: string;
}
