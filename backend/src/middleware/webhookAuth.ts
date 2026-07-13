// SPDX-License-Identifier: AGPL-3.0-or-later
// AGPL: Strong copyleft license requiring source disclosure for network use. See LICENSE file.
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { Request, Response, NextFunction } from "express";
import { getEnv } from "../config/env.js";
import logger from "../utils/logger.js";

const FLW_MODE = getEnv("FLW_MODE", "test");
const FLW_HASH = getEnv(`FLW_HASH_${FLW_MODE}`) || getEnv("FLW_HASH");

/**
 * Express middleware that intercepts and validates the Flutterwave Webhook source hash signature.
 * Prevents unauthorized web request manipulation of settlement routes.
 */
export function validateWebhookAuth(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers["verif-hash"];
  
  if (!signature || signature !== FLW_HASH) {
    logger.security("SECURITY", `Blocked unauthorized webhook attempt. Path: ${req.path}`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}
