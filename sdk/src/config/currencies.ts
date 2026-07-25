// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

export interface FiatCurrencyConfig {
  code: string;
  symbol: string;
  locale: string;
  decimals: number;
}

const FIAT_CURRENCIES: Record<string, FiatCurrencyConfig> = {
  NGN: { code: "NGN", symbol: "\u20A6", locale: "en-US", decimals: 2 },
  USD: { code: "USD", symbol: "$", locale: "en-US", decimals: 2 },
  GBP: { code: "GBP", symbol: "\u00A3", locale: "en-US", decimals: 2 },
  EUR: { code: "EUR", symbol: "\u20AC", locale: "en-US", decimals: 2 },
  CAD: { code: "CAD", symbol: "C$", locale: "en-US", decimals: 2 },
  AUD: { code: "AUD", symbol: "A$", locale: "en-US", decimals: 2 },
  JPY: { code: "JPY", symbol: "\u00A5", locale: "en-US", decimals: 2 },
  INR: { code: "INR", symbol: "\u20B9", locale: "en-US", decimals: 2 },
  BRL: { code: "BRL", symbol: "R$", locale: "en-US", decimals: 2 },
  MXN: { code: "MXN", symbol: "MX$", locale: "en-US", decimals: 2 },
  ZAR: { code: "ZAR", symbol: "R", locale: "en-US", decimals: 2 },
  KES: { code: "KES", symbol: "KSh", locale: "en-US", decimals: 2 },
  GHS: { code: "GHS", symbol: "GH\u20B5", locale: "en-US", decimals: 2 },
  AED: { code: "AED", symbol: "AED", locale: "en-US", decimals: 2 },
  SGD: { code: "SGD", symbol: "S$", locale: "en-US", decimals: 2 },
  HKD: { code: "HKD", symbol: "HK$", locale: "en-US", decimals: 2 },
  SEK: { code: "SEK", symbol: "kr", locale: "en-US", decimals: 2 },
  NOK: { code: "NOK", symbol: "kr", locale: "en-US", decimals: 2 },
  DKK: { code: "DKK", symbol: "kr", locale: "en-US", decimals: 2 },
  PLN: { code: "PLN", symbol: "z\u0142", locale: "en-US", decimals: 2 },
  TRY: { code: "TRY", symbol: "\u20BA", locale: "en-US", decimals: 2 },
  ARS: { code: "ARS", symbol: "AR$", locale: "en-US", decimals: 2 },
  CLP: { code: "CLP", symbol: "CL$", locale: "en-US", decimals: 2 },
  PHP: { code: "PHP", symbol: "\u20B1", locale: "en-US", decimals: 2 },
  THB: { code: "THB", symbol: "\u0E3F", locale: "en-US", decimals: 2 },
  IDR: { code: "IDR", symbol: "Rp", locale: "en-US", decimals: 2 },
  MYR: { code: "MYR", symbol: "RM", locale: "en-US", decimals: 2 },
  VND: { code: "VND", symbol: "\u20AB", locale: "en-US", decimals: 2 },
  PKR: { code: "PKR", symbol: "Rs", locale: "en-US", decimals: 2 },
  BDT: { code: "BDT", symbol: "\u09F3", locale: "en-US", decimals: 2 },
  EGP: { code: "EGP", symbol: "E\u00A3", locale: "en-US", decimals: 2 },
  NZD: { code: "NZD", symbol: "NZ$", locale: "en-US", decimals: 2 },
  RUB: { code: "RUB", symbol: "\u20BD", locale: "en-US", decimals: 2 },
  SAR: { code: "SAR", symbol: "SAR", locale: "en-US", decimals: 2 },
  CNY: { code: "CNY", symbol: "\u00A5", locale: "en-US", decimals: 2 },
  TWD: { code: "TWD", symbol: "NT$", locale: "en-US", decimals: 2 },
  KRW: { code: "KRW", symbol: "\u20A9", locale: "en-US", decimals: 2 },
  UAH: { code: "UAH", symbol: "\u20B4", locale: "en-US", decimals: 2 },
  LKR: { code: "LKR", symbol: "Rs", locale: "en-US", decimals: 2 },
  MMK: { code: "MMK", symbol: "K", locale: "en-US", decimals: 2 },
};

export function getCurrencyConfig(code: string): FiatCurrencyConfig | undefined {
  return FIAT_CURRENCIES[code.toUpperCase()];
}

export function getCurrencySymbol(code: string): string {
  return FIAT_CURRENCIES[code.toUpperCase()]?.symbol || code.toUpperCase();
}
