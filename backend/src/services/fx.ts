// SPDX-License-Identifier: AGPL-3.0-or-later
// AGPL: Strong copyleft license requiring source disclosure for network use. See LICENSE file.
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { getCoinConfig } from "../config/coins.js";
import { getFiatCurrency, getDefaultRate, getCoingeckoVsCurrencies } from "../config/currencies.js";
import { getEnv } from "../config/env.js";

interface CoinPriceEntry {
  prices: Record<string, number>;
  timestamp: number;
}

class FXService {
  private coinPriceCache: Record<string, CoinPriceEntry> = {};
  private CACHE_DURATION_MS: number;

  constructor() {
    this.CACHE_DURATION_MS = parseInt(getEnv("FX_CACHE_TTL", "30000"), 10) || 30000;
  }

  private getCoinGeckoId(coinType: string): string {
    const cfg = getCoinConfig(coinType);
    return cfg?.coingeckoId || "sui";
  }

  private isCacheValid(entry: CoinPriceEntry | undefined): boolean {
    return !!entry && Date.now() - entry.timestamp < this.CACHE_DURATION_MS;
  }

  async getCoinPrices(
    coinType: string,
    currencies: string[],
    skipCache: boolean = false
  ): Promise<Record<string, number>> {
    const coinId = this.getCoinGeckoId(coinType);

    if (!skipCache && this.isCacheValid(this.coinPriceCache[coinId])) {
      const cached = this.coinPriceCache[coinId].prices;
      const result: Record<string, number> = {};
      for (const c of currencies) {
        const cfg = getFiatCurrency(c);
        if (cfg && cached[cfg.coingeckoId] !== undefined) {
          result[c] = cached[cfg.coingeckoId];
        }
      }
      if (Object.keys(result).length === currencies.length) {
        return result;
      }
    }

    const apiMode = getEnv("COINGECKO_API_MODE", "").toLowerCase();
    const apiKeyDemo = getEnv("COINGECKO_API_KEY_DEMO", "");
    const apiKeyPro = getEnv("COINGECKO_API_KEY_PRO", "");
    const vsCurrencies = getCoingeckoVsCurrencies();

    // Always include USD as fallback for conversion
    if (!vsCurrencies.includes("usd")) {
      vsCurrencies.push("usd");
    }

    const tryFetch = async (baseUrl: string, keyParam: string) => {
      const url = `${baseUrl}/simple/price?ids=${coinId}&vs_currencies=${vsCurrencies.join(",")}${keyParam}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`CoinGecko status ${res.status}`);
      return res.json();
    };

    let data: any;
    try {
      if (apiMode === "pro" && apiKeyPro) {
        try {
          data = await tryFetch("https://pro-api.coingecko.com/api/v3", `&x_cg_pro_api_key=${apiKeyPro}`);
        } catch (proErr: any) {
          console.warn(`[FX SERVICE WARNING]: CoinGecko Pro failed for ${coinId}: ${proErr.message}, trying free API`);
          data = await tryFetch("https://api.coingecko.com/api/v3", "");
        }
      } else if (apiMode === "demo" && apiKeyDemo) {
        try {
          data = await tryFetch("https://api.coingecko.com/api/v3", `&x_cg_demo_api_key=${apiKeyDemo}`);
        } catch (demoErr: any) {
          console.warn(`[FX SERVICE WARNING]: CoinGecko Demo failed for ${coinId}:`, demoErr.message || demoErr.code || demoErr, "- trying free API");
          data = await tryFetch("https://api.coingecko.com/api/v3", "");
        }
      } else {
        data = await tryFetch("https://api.coingecko.com/api/v3", "");
      }
    } catch (err: any) {
      console.warn(`[FX SERVICE WARNING]: CoinGecko fetch failed for ${coinId}, using defaults:`, err.message);
    }

    if (data) {
      const allPrices = data[coinId];
      if (allPrices && Object.keys(allPrices).length > 0) {
        this.coinPriceCache[coinId] = { prices: allPrices, timestamp: Date.now() };
        console.log(`[FX SERVICE]: Fetched prices for ${coinId} in ${Object.keys(allPrices).length} currencies`);
      } else {
        console.warn(`[FX SERVICE]: CoinGecko returned empty prices for ${coinId}, response:`, JSON.stringify(data).substring(0, 200));
      }

      const result: Record<string, number> = {};
      const usdPrice = allPrices?.usd;

      for (const c of currencies) {
        const cfg = getFiatCurrency(c);
        if (cfg && allPrices?.[cfg.coingeckoId] !== undefined) {
          result[c] = allPrices[cfg.coingeckoId];
        } else if (usdPrice && usdPrice > 0) {
          // Fallback: convert from USD via fiat-to-fiat rate
          const fiatRate = await this.getFiatToFiatRate("USD", c, true);
          result[c] = usdPrice * fiatRate;
          console.log(`[FX SERVICE]: ${coinId}/${c} converted from USD: ${usdPrice} * ${fiatRate} = ${result[c]}`);
        } else {
          result[c] = getDefaultRate(c);
        }
      }
      return result;
    }

    const result: Record<string, number> = {};
    for (const c of currencies) {
      const cached = this.coinPriceCache[coinId]?.prices;
      if (cached?.[getFiatCurrency(c)?.coingeckoId || ""] !== undefined) {
        result[c] = cached[getFiatCurrency(c)!.coingeckoId];
      } else {
        result[c] = getDefaultRate(c);
      }
    }
    return result;
  }

  async getRate(currency: string, coinType: string, skipCache: boolean = false): Promise<number> {
    const cfg = getFiatCurrency(currency);
    if (!cfg) {
      console.warn(`[FX SERVICE]: Unknown currency ${currency}, falling back to USD`);
      const prices = await this.getCoinPrices(coinType, ["USD"], skipCache);
      return prices["USD"] || getDefaultRate("USD");
    }

    const prices = await this.getCoinPrices(coinType, [currency], skipCache);
    const rate = prices[currency];

    if (rate && rate > 0) {
      return rate;
    }

    // Fallback: get USD price and convert
    const usdPrices = await this.getCoinPrices(coinType, ["USD"], skipCache);
    const usdRate = usdPrices["USD"];
    if (usdRate && usdRate > 0) {
      const fiatRate = await this.getFiatToFiatRate("USD", currency, skipCache);
      const convertedRate = usdRate * fiatRate;
      console.log(`[FX SERVICE]: ${currency}/${coinType} fallback via USD: ${usdRate} * ${fiatRate} = ${convertedRate}`);
      return convertedRate;
    }

    console.warn(`[FX SERVICE]: No rate for ${currency}/${coinType}, using default`);
    return getDefaultRate(currency);
  }

  async getRates(currencies: string[], coinType: string, skipCache: boolean = false): Promise<Record<string, number>> {
    return this.getCoinPrices(coinType, currencies, skipCache);
  }

  async getRateNGNToToken(coinType: string, skipCache: boolean = false): Promise<number> {
    return this.getRate("NGN", coinType, skipCache);
  }

  async getUSDToNGNRate(skipCache: boolean = false): Promise<number> {
    return this.getFiatToFiatRate("USD", "NGN", skipCache);
  }

  async getFiatToFiatRate(from: string, to: string, skipCache: boolean = false): Promise<number> {
    if (from === to) return 1;

    const fromCfg = getFiatCurrency(from);
    const toCfg = getFiatCurrency(to);
    if (!fromCfg || !toCfg) {
      console.warn(`[FX SERVICE]: Unknown fiat pair ${from}/${to}, falling back to 1`);
      return 1;
    }

    try {
      const defaultCoin = "0x2::sui::SUI";
      const prices = await this.getCoinPrices(defaultCoin, [from, to], skipCache);

      const fromPrice = prices[from];
      const toPrice = prices[to];

      if (fromPrice && toPrice && fromPrice > 0) {
        const rate = toPrice / fromPrice;
        console.log(`[FX SERVICE]: Fiat-to-fiat rate ${from}/${to}: ${rate} (via CoinGecko)`);
        return rate;
      }
    } catch (e: any) {
      console.warn(`[FX SERVICE]: CoinGecko fiat-to-fiat failed, using defaults: ${e.message}`);
    }

    const defaultFrom = getDefaultRate(from);
    const defaultTo = getDefaultRate(to);
    if (defaultFrom > 0) {
      return defaultTo / defaultFrom;
    }

    return 1;
  }
}

export const fxService = new FXService();
export default fxService;
