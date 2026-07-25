// SPDX-License-Identifier: AGPL-3.0-or-later
// AGPL: Strong copyleft license requiring source disclosure for network use. See LICENSE file.
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { getEnv } from "./env.js";

export interface FiatCurrency {
  code: string;
  symbol: string;
  name: string;
  locale: string;
  decimals: number;
  coingeckoId: string;
  countryCodes: string[];
  minChargeAmount?: number;
}

const FIAT_CURRENCIES: Record<string, FiatCurrency> = {
  NGN: { code: "NGN", symbol: "\u20A6", name: "Nigerian Naira", locale: "en-US", decimals: 2, coingeckoId: "ngn", countryCodes: ["NG"] },
  USD: { code: "USD", symbol: "$", name: "US Dollar", locale: "en-US", decimals: 2, coingeckoId: "usd", countryCodes: ["US"], minChargeAmount: 0.5 },
  GBP: { code: "GBP", symbol: "\u00A3", name: "British Pound", locale: "en-US", decimals: 2, coingeckoId: "gbp", countryCodes: ["GB"], minChargeAmount: 0.5 },
  EUR: { code: "EUR", symbol: "\u20AC", name: "Euro", locale: "en-US", decimals: 2, coingeckoId: "eur", countryCodes: ["DE", "FR", "ES", "IT", "NL", "BE", "AT", "IE", "PT", "FI", "GR", "SK", "LT", "LV", "EE", "SI", "CY", "MT", "LU"], minChargeAmount: 0.5 },
  CAD: { code: "CAD", symbol: "C$", name: "Canadian Dollar", locale: "en-US", decimals: 2, coingeckoId: "cad", countryCodes: ["CA"] },
  AUD: { code: "AUD", symbol: "A$", name: "Australian Dollar", locale: "en-US", decimals: 2, coingeckoId: "aud", countryCodes: ["AU"] },
  JPY: { code: "JPY", symbol: "\u00A5", name: "Japanese Yen", locale: "en-US", decimals: 2, coingeckoId: "jpy", countryCodes: ["JP"] },
  INR: { code: "INR", symbol: "\u20B9", name: "Indian Rupee", locale: "en-US", decimals: 2, coingeckoId: "inr", countryCodes: ["IN"] },
  BRL: { code: "BRL", symbol: "R$", name: "Brazilian Real", locale: "en-US", decimals: 2, coingeckoId: "brl", countryCodes: ["BR"] },
  MXN: { code: "MXN", symbol: "MX$", name: "Mexican Peso", locale: "en-US", decimals: 2, coingeckoId: "mxn", countryCodes: ["MX"] },
  ZAR: { code: "ZAR", symbol: "R", name: "South African Rand", locale: "en-US", decimals: 2, coingeckoId: "zar", countryCodes: ["ZA"] },
  KES: { code: "KES", symbol: "KSh", name: "Kenyan Shilling", locale: "en-US", decimals: 2, coingeckoId: "kes", countryCodes: ["KE"] },
  GHS: { code: "GHS", symbol: "GH\u20B5", name: "Ghanaian Cedi", locale: "en-US", decimals: 2, coingeckoId: "ghs", countryCodes: ["GH"] },
  AED: { code: "AED", symbol: "AED", name: "UAE Dirham", locale: "en-US", decimals: 2, coingeckoId: "aed", countryCodes: ["AE"] },
  SGD: { code: "SGD", symbol: "S$", name: "Singapore Dollar", locale: "en-US", decimals: 2, coingeckoId: "sgd", countryCodes: ["SG"] },
  HKD: { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar", locale: "en-US", decimals: 2, coingeckoId: "hkd", countryCodes: ["HK"] },
  SEK: { code: "SEK", symbol: "kr", name: "Swedish Krona", locale: "en-US", decimals: 2, coingeckoId: "sek", countryCodes: ["SE"] },
  NOK: { code: "NOK", symbol: "kr", name: "Norwegian Krone", locale: "en-US", decimals: 2, coingeckoId: "nok", countryCodes: ["NO"] },
  DKK: { code: "DKK", symbol: "kr", name: "Danish Krone", locale: "en-US", decimals: 2, coingeckoId: "dkk", countryCodes: ["DK"] },
  PLN: { code: "PLN", symbol: "z\u0142", name: "Polish Zloty", locale: "en-US", decimals: 2, coingeckoId: "pln", countryCodes: ["PL"] },
  TRY: { code: "TRY", symbol: "\u20BA", name: "Turkish Lira", locale: "en-US", decimals: 2, coingeckoId: "try", countryCodes: ["TR"] },
  ARS: { code: "ARS", symbol: "AR$", name: "Argentine Peso", locale: "en-US", decimals: 2, coingeckoId: "ars", countryCodes: ["AR"] },
  CLP: { code: "CLP", symbol: "CL$", name: "Chilean Peso", locale: "en-US", decimals: 2, coingeckoId: "clp", countryCodes: ["CL"] },
  PHP: { code: "PHP", symbol: "\u20B1", name: "Philippine Peso", locale: "en-US", decimals: 2, coingeckoId: "php", countryCodes: ["PH"] },
  THB: { code: "THB", symbol: "\u0E3F", name: "Thai Baht", locale: "en-US", decimals: 2, coingeckoId: "thb", countryCodes: ["TH"] },
  IDR: { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah", locale: "en-US", decimals: 2, coingeckoId: "idr", countryCodes: ["ID"] },
  MYR: { code: "MYR", symbol: "RM", name: "Malaysian Ringgit", locale: "en-US", decimals: 2, coingeckoId: "myr", countryCodes: ["MY"] },
  VND: { code: "VND", symbol: "\u20AB", name: "Vietnamese Dong", locale: "en-US", decimals: 2, coingeckoId: "vnd", countryCodes: ["VN"] },
  PKR: { code: "PKR", symbol: "Rs", name: "Pakistani Rupee", locale: "en-US", decimals: 2, coingeckoId: "pkr", countryCodes: ["PK"] },
  BDT: { code: "BDT", symbol: "\u09F3", name: "Bangladeshi Taka", locale: "en-US", decimals: 2, coingeckoId: "bdt", countryCodes: ["BD"] },
  EGP: { code: "EGP", symbol: "E\u00A3", name: "Egyptian Pound", locale: "en-US", decimals: 2, coingeckoId: "egp", countryCodes: ["EG"] },
  NZD: { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar", locale: "en-US", decimals: 2, coingeckoId: "nzd", countryCodes: ["NZ"] },
  RUB: { code: "RUB", symbol: "\u20BD", name: "Russian Ruble", locale: "en-US", decimals: 2, coingeckoId: "rub", countryCodes: ["RU"] },
  SAR: { code: "SAR", symbol: "SAR", name: "Saudi Riyal", locale: "en-US", decimals: 2, coingeckoId: "sar", countryCodes: ["SA"] },
  CNY: { code: "CNY", symbol: "\u00A5", name: "Chinese Yuan", locale: "en-US", decimals: 2, coingeckoId: "cny", countryCodes: ["CN"] },
  TWD: { code: "TWD", symbol: "NT$", name: "New Taiwan Dollar", locale: "en-US", decimals: 2, coingeckoId: "twd", countryCodes: ["TW"] },
  KRW: { code: "KRW", symbol: "\u20A9", name: "South Korean Won", locale: "en-US", decimals: 2, coingeckoId: "krw", countryCodes: ["KR"] },
  UAH: { code: "UAH", symbol: "\u20B4", name: "Ukrainian Hryvnia", locale: "en-US", decimals: 2, coingeckoId: "uah", countryCodes: ["UA"] },
  LKR: { code: "LKR", symbol: "Rs", name: "Sri Lankan Rupee", locale: "en-US", decimals: 2, coingeckoId: "lkr", countryCodes: ["LK"] },
  MMK: { code: "MMK", symbol: "K", name: "Myanmar Kyat", locale: "en-US", decimals: 2, coingeckoId: "mmk", countryCodes: ["MM"] },
};

const countryToCurrencyMap: Record<string, string> = {};
for (const [code, currency] of Object.entries(FIAT_CURRENCIES)) {
  for (const cc of currency.countryCodes) {
    if (!countryToCurrencyMap[cc]) {
      countryToCurrencyMap[cc] = code;
    }
  }
}

let allowedFiatSet: Set<string> | null = null;

function getAllowedFiat(): Set<string> {
  if (!allowedFiatSet) {
    const raw = getEnv("SUPPORTED_FIAT_CURRENCIES", "");
    if (raw) {
      const codes = raw.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
      allowedFiatSet = new Set(codes.filter((c) => FIAT_CURRENCIES[c]));
    } else {
      allowedFiatSet = new Set(Object.keys(FIAT_CURRENCIES));
    }
  }
  return allowedFiatSet;
}

export function getFiatCurrency(code: string): FiatCurrency | undefined {
  return FIAT_CURRENCIES[code.toUpperCase()];
}

export function isFiatCurrency(code: string): boolean {
  return code.toUpperCase() in FIAT_CURRENCIES && getAllowedFiat().has(code.toUpperCase());
}

export function getDefaultCurrency(): string {
  return getEnv("DEFAULT_CURRENCY", "USD").toUpperCase();
}

export function getDefaultRate(currency: string): number {
  const defaults: Record<string, number> = {
    NGN: 1550, USD: 1, GBP: 0.79, EUR: 0.92, CAD: 1.36, AUD: 1.53,
    JPY: 149, INR: 83, BRL: 4.97, MXN: 17.15, ZAR: 18.6, KES: 153,
    GHS: 15, AED: 3.67, SGD: 1.34, HKD: 7.82, SEK: 10.4, NOK: 10.6,
    DKK: 6.87, PLN: 4.03, TRY: 27.5, ARS: 350, CLP: 880, PHP: 56,
    THB: 35.8, IDR: 15450, MYR: 4.7, VND: 24300, PKR: 286, BDT: 110,
    EGP: 30.9, NZD: 1.64, RUB: 91, SAR: 3.75, CNY: 7.24, TWD: 31.5,
    KRW: 1320, UAH: 37.5, LKR: 310, MMK: 2100,
  };
  return defaults[currency.toUpperCase()] || 1;
}

export function getFiatCurrencyList(): FiatCurrency[] {
  return Object.values(FIAT_CURRENCIES).filter((c) => getAllowedFiat().has(c.code));
}

export function resolveCurrencyFromCountry(countryCode: string): string {
  return countryToCurrencyMap[countryCode.toUpperCase()] || getDefaultCurrency();
}

export function getCoingeckoVsCurrencies(): string[] {
  const allowed = getAllowedFiat();
  const ids: string[] = [];
  for (const [code, currency] of Object.entries(FIAT_CURRENCIES)) {
    if (allowed.has(code)) {
      ids.push(currency.coingeckoId);
    }
  }
  return ids;
}
