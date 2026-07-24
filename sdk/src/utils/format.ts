// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { getCurrencyConfig } from "../config/currencies.js";

/** Format a fiat amount with proper currency symbol and locale formatting. */
export function formatCurrency(amount: number, currency: string): string {
  const cfg = getCurrencyConfig(currency);
  if (!cfg) {
    return `${currency} ${amount.toLocaleString()}`;
  }
  try {
    const formatted = new Intl.NumberFormat(cfg.locale, {
      minimumFractionDigits: cfg.decimals,
      maximumFractionDigits: cfg.decimals,
    }).format(amount);
    return `${cfg.symbol}${formatted}`;
  } catch (_) {
    return `${cfg.symbol}${Math.round(amount).toLocaleString()}`;
  }
}

/** Format a Naira amount (deprecated — use formatCurrency instead). */
export function formatNgn(amount: number): string {
  return formatCurrency(amount, "NGN");
}

/** Convert base integer units into token float given decimals. */
export function toTokenUnits(baseUnits: number, decimals = 9): number {
  return baseUnits / Math.pow(10, decimals);
}

/** Format token amounts with fixed decimals and trimming. */
export function formatToken(amount: number, decimals = 9, digits = 6): string {
  const value = Number(amount);
  if (!isFinite(value)) return "0";
  return value.toFixed(digits).replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, "");
}

export default { formatCurrency, formatNgn, toTokenUnits, formatToken };
