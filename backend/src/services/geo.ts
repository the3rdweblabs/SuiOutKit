// SPDX-License-Identifier: AGPL-3.0-or-later
// AGPL: Strong copyleft license requiring source disclosure for network use. See LICENSE file.
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import fetch from "node-fetch";
import { getEnv } from "../config/env.js";
import { resolveCurrencyFromCountry } from "../config/currencies.js";

interface GeoCacheEntry {
  country: string;
  currency: string;
  timestamp: number;
}

class GeoService {
  private cache: Record<string, GeoCacheEntry> = {};
  private CACHE_DURATION_MS = 300000;
  private enabled: boolean;

  constructor() {
    this.enabled = getEnv("ENABLE_GEO_DETECTION", "false").toLowerCase() === "true";
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async detectCurrency(ip: string): Promise<string | null> {
    if (!this.enabled || !ip || ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
      return null;
    }

    const cached = this.cache[ip];
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
      return cached.currency;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const data: any = await res.json();
      const countryCode = data.countryCode as string | undefined;
      if (!countryCode) return null;

      const currency = resolveCurrencyFromCountry(countryCode);
      this.cache[ip] = { country: countryCode, currency, timestamp: Date.now() };
      console.log(`[GEO SERVICE]: Detected IP ${ip} -> ${countryCode} -> ${currency}`);
      return currency;
    } catch (err: any) {
      console.warn(`[GEO SERVICE]: Geolocation lookup failed for ${ip}:`, err.message);
      return null;
    }
  }
}

export const geoService = new GeoService();
export default geoService;
