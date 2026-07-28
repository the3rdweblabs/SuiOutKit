// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import React from "react";
import { usePaymentStatus } from "../hooks/usePaymentStatus";
import { ProgressStepper } from "./ProgressStepper";

type Props = {
  backendUrl: string;
  nonce: string;
};

export default function PaymentStatusUI({ backendUrl, nonce }: Props) {
  const update = usePaymentStatus(backendUrl, nonce);

  const isProcessing = update.status === "PROCESSING";
  const isSettled = update.status === "SETTLED";

  const steps = [
    { label: "Payment received", completed: isProcessing || isSettled },
    { label: "Webhook confirmed", completed: isProcessing || isSettled },
    { label: "Settled on-chain", completed: isSettled },
    { label: "Receipt uploaded", completed: isSettled },
  ];

  let badgeStatus: "PENDING" | "PROCESSING" | "SETTLED" | "ERROR" = "PENDING";
  if (update.error) {
    badgeStatus = "ERROR";
  } else if (isSettled) {
    badgeStatus = "SETTLED";
  } else if (isProcessing) {
    badgeStatus = "PROCESSING";
  }

  const copy = update.error
    ? "Payment monitoring lost connection."
    : isSettled
      ? "Payment settled on-chain. Receipt has been uploaded to Walrus."
      : isProcessing
        ? "Bank transfer received. Confirming on-chain settlement..."
        : "Waiting for the bank transfer to arrive.";

  return (
    <div className="payment-status-ui" style={{ marginTop: "12px" }}>
      <div className="payment-status-copy">{copy}</div>
      <ProgressStepper steps={steps} />
    </div>
  );
}
