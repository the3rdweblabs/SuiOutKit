// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import React from "react";
import { createRoot } from "react-dom/client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/utils";
import { createPaymentTransactionUri } from "@mysten/payment-kit";
import { paymentKit } from "@mysten/payment-kit";
import { createDAppKit } from "@mysten/dapp-kit-core";
import "@mysten/dapp-kit-core/web";
import QRCode from "qrcode";
import { loadStripe, StripeElements, Stripe } from "@stripe/stripe-js";
import { CheckoutSession, ChargeResponse, CheckoutStatusResponse, CryptoIntentResponse, SuiOutKitModalOptions, PaymentResult } from "../types/index.js";
import PaymentStatusUI from "./PaymentStatusUI";
import { joinApiPath } from "../config/api.js";
import { formatCurrency } from "../utils/format.js";

const SUI_GRPC_URLS = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443"
};

type SupportedNetwork = keyof typeof SUI_GRPC_URLS;

function getExplorerNetworkPath() {
  const requestedNetwork = (window as any).SuiOutKitNetwork as string | undefined;
  return requestedNetwork === "mainnet" ? "mainnet" : "testnet";
}

export class SuiOutKitModal {
  private overlay: HTMLDivElement | null = null;
  private session: CheckoutSession;
  private backendUrl: string;
  private pollInterval: any = null;
  private walletConnectionUnsubscribe: (() => void) | null = null;
  private onCloseCallback?: () => void;
  private onPaymentCompleteCallback?: (result: PaymentResult) => void;
  private redirectUrl?: string;
  private autoCloseOnSuccess?: boolean;
  private cryptoIntent: CryptoIntentResponse | null = null;
  private dAppKit: any | null = null;
  private paymentClient: any | null = null;
  private stripeInstance: Stripe | null = null;
  private stripeElements: StripeElements | null = null;

  constructor(session: CheckoutSession, backendUrl: string, options?: SuiOutKitModalOptions) {
    this.session = session;
    this.backendUrl = backendUrl;
    this.onCloseCallback = options?.onClose;
    this.onPaymentCompleteCallback = options?.onPaymentComplete;
    this.redirectUrl = options?.redirectUrl;
    this.autoCloseOnSuccess = options?.autoCloseOnSuccess;
    this.ensureDAppKit(); // Initialize early so wallets have time to inject
    this.injectStyles();
    this.createModal();
  }

  private injectStyles() {
    if (!document.getElementById("suioutkit-styles")) {
      const link = document.createElement("link");
      link.id = "suioutkit-styles";
      link.rel = "stylesheet";
      link.href = `${this.backendUrl}/style.css`;
      document.head.appendChild(link);
    }

    if (!document.getElementById("suioutkit-lucide")) {
      const script = document.createElement("script");
      script.id = "suioutkit-lucide";
      script.src = "https://unpkg.com/lucide@latest";
      script.onload = () => this.renderIcons();
      document.head.appendChild(script);
    } else {
      this.renderIcons();
    }
  }

  private renderIcons() {
    const globalWindow = window as any;
    if (globalWindow.lucide) {
      globalWindow.lucide.createIcons();
    }
  }

  private createModal() {
    this.overlay = document.createElement("div");
    this.overlay.className = "suioutkit-overlay";
    this.overlay.innerHTML = `
      <div class="suioutkit-card">
        <button class="suioutkit-close" id="sok-close-btn">&times;</button>
        <div class="suioutkit-content" id="sok-content-panel"></div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    const closeBtn = this.overlay.querySelector("#sok-close-btn");
    closeBtn?.addEventListener("click", () => this.destroy());

    const card = this.overlay.querySelector(".suioutkit-card");
    card?.addEventListener("click", (e) => e.stopPropagation());

    this.overlay.addEventListener("click", () => this.destroy());

    this.renderSelectionPanel();

    setTimeout(() => {
      this.overlay?.classList.add("active");
    }, 50);
  }

  private static readonly USSD_BANKS = [
    { code: "044", name: "Access Bank", icon: "access" },
    { code: "214", name: "FCMB", icon: "fcmb" },
    { code: "011", name: "First Bank", icon: "firstbank" },
    { code: "058", name: "GTBank", icon: "gtb" },
    { code: "232", name: "Sterling Bank", icon: "sterling" },
    { code: "033", name: "UBA", icon: "uba" },
    { code: "032", name: "Union Bank", icon: "union" },
    { code: "090110", name: "VFD MFB", icon: "vfd" },
    { code: "035", name: "Wema Bank", icon: "wema" },
    { code: "057", name: "Zenith Bank", icon: "zenith" }
  ];

  private renderSelectionPanel() {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    const currency = this.session.resolvedCurrency || this.session.currency || "USD";
    const formattedAmount = formatCurrency(this.session.amount, currency);
    const localAmount = this.session.localAmount;
    const localCurrency = this.session.localCurrency;
    const hasLocalAmount = !!localAmount && !!localCurrency && localCurrency !== currency;

    const flutterwaveMethods = ["NGN", "GHS"];
    const merchantSupports = flutterwaveMethods.includes(currency);
    const localSupports = localCurrency ? flutterwaveMethods.includes(localCurrency) : false;
    const isCrossRegion = hasLocalAmount && localCurrency !== currency;
    const noGeoInfo = !localCurrency && !merchantSupports;

    const bankTransferEnabled = merchantSupports || localSupports || noGeoInfo || isCrossRegion;
    const opayEnabled = (currency === "NGN") || (localCurrency === "NGN") || noGeoInfo || isCrossRegion;
    const ussdEnabled = (currency === "NGN") || (localCurrency === "NGN") || noGeoInfo || isCrossRegion;
    
    const supportedCoins = this.session.supportedCoins || [];
    const merchantTokens = this.session.settlementToken;
    let cryptoEnabled = true;
    if (merchantTokens) {
      const allowedTokens = Array.isArray(merchantTokens) ? merchantTokens : [merchantTokens];
      cryptoEnabled = supportedCoins.some((c) => 
        allowedTokens.some((t) => c.type.includes(t) || c.symbol.toUpperCase() === t.toUpperCase())
      );
    }

    const crossRegionClass = (isCrossRegion || noGeoInfo) ? "suioutkit-option-cross-region" : "";
    const crossRegionLabel = isCrossRegion
      ? `<span class="suioutkit-option-cross-label">Pay in ${localCurrency} →</span>`
      : noGeoInfo
        ? `<span class="suioutkit-option-cross-label">Pay in NGN →</span>`
        : "";

    const disabledLabel = `<span class="suioutkit-option-unavailable">Not available in your region</span>`;

    container.innerHTML = `
      <div class="suioutkit-header">
        <h2 class="suioutkit-title">Checkout</h2>
        <p class="suioutkit-subtitle">Select payment method to settle ${hasLocalAmount ? formatCurrency(localAmount!, localCurrency!) : formattedAmount}</p>
        ${hasLocalAmount ? `<p class="sok-fiat-amt sok-op-75" style="font-size: 20px; margin-top: 2px;">(${formattedAmount})</p>` : ""}
      </div>
      <div class="suioutkit-body">
        <button class="suioutkit-option ${bankTransferEnabled ? crossRegionClass : "suioutkit-option-disabled"}" id="sok-method-bank" ${bankTransferEnabled ? "" : "disabled"}>
          <div class="suioutkit-option-content">
            <img src="${this.backendUrl}/assets/flutterwave.png" class="suioutkit-option-img" alt="Bank Transfer" />
            <span class="suioutkit-option-name">Bank Transfer${crossRegionLabel}</span>
          </div>
          ${bankTransferEnabled ? "" : disabledLabel}
        </button>

        <button class="suioutkit-option" id="sok-method-stripe">
          <div class="suioutkit-option-content">
            <img src="${this.backendUrl}/assets/stripe_c.jpeg" class="suioutkit-option-img" alt="Card / Global" />
            <span class="suioutkit-option-name">Card / Global</span>
          </div>
        </button>

        <button class="suioutkit-option ${opayEnabled ? crossRegionClass : "suioutkit-option-disabled"}" id="sok-method-opay" ${opayEnabled ? "" : "disabled"}>
          <div class="suioutkit-option-content">
            <img src="${this.backendUrl}/assets/opay.png" class="suioutkit-option-img" alt="OPay Account" />
            <span class="suioutkit-option-name">OPay Account${crossRegionLabel}</span>
          </div>
          ${opayEnabled ? "" : disabledLabel}
        </button>

        <button class="suioutkit-option ${ussdEnabled ? crossRegionClass : "suioutkit-option-disabled"}" id="sok-method-ussd" ${ussdEnabled ? "" : "disabled"}>
          <div class="suioutkit-option-content">
            <img src="${this.backendUrl}/assets/flutterwave.png" class="suioutkit-option-img" alt="USSD" />
            <span class="suioutkit-option-name">USSD${crossRegionLabel}</span>
          </div>
          ${ussdEnabled ? "" : disabledLabel}
        </button>

        <button class="suioutkit-option ${cryptoEnabled ? "" : "suioutkit-option-disabled"}" id="sok-method-crypto" ${cryptoEnabled ? "" : "disabled"}>
          <div class="suioutkit-option-content">
            <img src="${this.backendUrl}/assets/sui.png" class="suioutkit-option-img" alt="Sui Wallet" />
            <span class="suioutkit-option-name">Sui Wallet</span>
          </div>
          ${cryptoEnabled ? "" : disabledLabel}
        </button>
      </div>
    `;

    this.renderIcons();

    if (bankTransferEnabled) {
      container.querySelector("#sok-method-bank")?.addEventListener("click", () => this.handleCharge("bank_transfer"));
    }
    container.querySelector("#sok-method-stripe")?.addEventListener("click", () => void this.handleStripePaymentPanel());
    if (opayEnabled) {
      container.querySelector("#sok-method-opay")?.addEventListener("click", () => this.renderOPayFormPanel());
    }
    if (ussdEnabled) {
      container.querySelector("#sok-method-ussd")?.addEventListener("click", () => this.renderUssdBankGrid());
    }
    if (cryptoEnabled) {
      container.querySelector("#sok-method-crypto")?.addEventListener("click", () => void this.handleCryptoPaymentPanel());
    }
  }

  private async handleCharge(method: "bank_transfer" | "opay" | "ussd", phoneNumber?: string, accountBank?: string) {
    this.renderLoadingPanel("Allocating checkout session...");

    try {
      const response = await fetch(joinApiPath(this.backendUrl, "checkout", "charge"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: this.session.token,
          method,
          phoneNumber,
          accountBank
        })
      });

      const result: ChargeResponse = await response.json();

      if (result.status === "success") {
        if (method === "bank_transfer" && result.virtualAccount) {
          this.renderBankTransferPanel(result.virtualAccount);
        } else if (method === "opay") {
          if (result.opayAuthorizationUrl) {
            this.openOPayFlow(result.opayAuthorizationUrl);
          } else {
            this.renderErrorPanel("OPay authorization URL not received.");
          }
        } else if (method === "ussd") {
          if (result.ussdCode) {
            this.renderUssdCodePanel(result.ussdCode, result.paymentCode ?? null);
          } else {
            this.renderErrorPanel("USSD code not received.");
          }
        }
      } else {
        this.renderErrorPanel(result.message || "Failed to process charge.");
      }
    } catch (err) {
      this.renderErrorPanel("Connection to payment server failed.");
    }
  }

  private openOPayFlow(authorizationUrl: string) {
    // Try popup first, fall back to new tab if blocked
    let opayWindow: Window | null = null;
    try {
      opayWindow = window.open(authorizationUrl, "suioutkit_opay", "width=500,height=700,popup=yes");
    } catch {}

    if (!opayWindow) {
      // Popup blocked — open in new tab
      opayWindow = window.open(authorizationUrl, "_blank");
    }

    this.renderOPayWaitingPanel(opayWindow);
  }

  private renderOPayWaitingPanel(opayWindow: Window | null) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-panel">
        <div class="sok-spinner"></div>
        <p class="sok-status-text">Waiting for OPay approval...</p>
        <p class="sok-status-text" style="margin-top: 8px;">Complete payment in the OPay window</p>
      </div>
    `;

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => {
      try { opayWindow?.close(); } catch {}
      this.stopPolling();
      this.removeOPayMessageListener();
      this.renderSelectionPanel();
    });

    // Listen for postMessage from popup/tab when payment completes
    this.setupOPayMessageListener();

    // Poll backend for session status as backup
    this.startPolling();
  }

  private opayMessageHandler: ((event: MessageEvent) => void) | null = null;

  private setupOPayMessageListener() {
    this.removeOPayMessageListener();
    this.opayMessageHandler = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === "suioutkit_opay_complete") {
        this.removeOPayMessageListener();
        this.stopPolling();
        // Polling will pick up the SETTLED status and render success
      }
    };
    window.addEventListener("message", this.opayMessageHandler);
  }

  private removeOPayMessageListener() {
    if (this.opayMessageHandler) {
      window.removeEventListener("message", this.opayMessageHandler);
      this.opayMessageHandler = null;
    }
  }

  private renderLoadingPanel(message: string) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <div class="suioutkit-panel">
        <div class="sok-spinner"></div>
        <p class="sok-status-text">${message}</p>
      </div>
    `;
  }

  private renderUssdBankGrid() {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    const banks = SuiOutKitModal.USSD_BANKS;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-panel">
        <h2 class="suioutkit-title">Select your bank</h2>
        <div class="sok-ussd-bank-grid">
          ${banks.map(bank => `
            <button class="sok-ussd-bank-cell" data-bank-code="${bank.code}" data-bank-name="${bank.name}">
              <img src="${this.backendUrl}/assets/banks/${bank.icon}.png" alt="${bank.name}" class="sok-ussd-bank-icon" />
              <span class="sok-ussd-bank-name">${bank.name}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => {
      this.renderSelectionPanel();
    });

    container.querySelectorAll(".sok-ussd-bank-cell").forEach(cell => {
      cell.addEventListener("click", () => {
        const bankCode = cell.getAttribute("data-bank-code") || "";
        this.handleCharge("ussd", undefined, bankCode);
      });
    });
  }

  private renderUssdCodePanel(ussdCode: string, paymentCode: string | null) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to banks</button>
      <div class="suioutkit-panel">
        <h2 class="suioutkit-title">Complete payment</h2>
        <p class="suioutkit-subtitle">Dial this code from your phone</p>

        <div class="sok-ussd-code-box">
          <div class="sok-copied-alert" id="sok-copy-bubble">Copied!</div>
          <span id="sok-ussd-code" class="sok-ussd-code">${ussdCode}</span>
          <button class="sok-copy-btn" id="sok-copy-ussd">Copy</button>
        </div>

        ${paymentCode ? `
          <div class="sok-ussd-payment-code">
            <p class="sok-ussd-payment-label">If prompted, enter payment code:</p>
            <span class="sok-ussd-payment-value">${paymentCode}</span>
          </div>
        ` : ""}

        <div id="sok-status-react"></div>
        <p class="sok-status-text">Waiting for your payment...</p>
      </div>
    `;

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => {
      this.stopPolling();
      this.renderUssdBankGrid();
    });

    container.querySelector("#sok-copy-ussd")?.addEventListener("click", () => {
      navigator.clipboard.writeText(ussdCode);
      const bubble = container.querySelector("#sok-copy-bubble");
      bubble?.classList.add("show");
      setTimeout(() => bubble?.classList.remove("show"), 2000);
    });

    this.mountPaymentStatus(container as HTMLElement);
    this.startPolling();
  }

  private renderBankTransferPanel(va: any) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    const hasLocalAmount = this.session.localAmount && this.session.localCurrency && this.session.localCurrency !== this.session.resolvedCurrency;
    const displayAmount = hasLocalAmount ? this.session.localAmount! : va.amount;
    const displayCurrency = hasLocalAmount ? this.session.localCurrency! : (this.session.resolvedCurrency || this.session.currency || "USD");
    const formattedDisplayAmount = formatCurrency(displayAmount, displayCurrency);
    const formattedMerchantAmount = hasLocalAmount ? formatCurrency(this.session.amount, this.session.resolvedCurrency || this.session.currency || "USD") : null;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-panel">
        <div class="suioutkit-amount-box">
          <p class="suioutkit-subtitle">Please transfer exactly</p>
          <h2 class="sok-fiat-amt">${formattedDisplayAmount}</h2>
          ${formattedMerchantAmount ? `<p class="sok-fiat-amt sok-op-75" style="font-size: 20px; margin-top: 2px;">(${formattedMerchantAmount})</p>` : ""}
        </div>

        <div class="sok-va-card">
          <div class="sok-copied-alert" id="sok-copy-bubble">Copied!</div>
          
          <div class="sok-va-row">
            <div class="sok-va-lbl">Bank Name</div>
            <div class="sok-va-val">${va.bankName}</div>
          </div>

          <div class="sok-va-row">
            <div class="sok-va-lbl">Account Number</div>
            <div class="sok-va-val">
              <span id="sok-acct-num">${va.accountNumber}</span>
              <button class="sok-copy-btn" id="sok-copy-acct">Copy</button>
            </div>
          </div>
        </div>

        <div id="sok-status-react"></div>
        <p class="sok-status-text">Waiting for your bank transfer alert...</p>
      </div>
    `;

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => {
      this.stopPolling();
      this.renderSelectionPanel();
    });

    container.querySelector("#sok-copy-acct")?.addEventListener("click", () => {
      const numSpan = container.querySelector("#sok-acct-num");
      if (numSpan) {
        navigator.clipboard.writeText(numSpan.textContent || "");
        const bubble = container.querySelector("#sok-copy-bubble");
        bubble?.classList.add("show");
        setTimeout(() => bubble?.classList.remove("show"), 2000);
      }
    });

    this.mountPaymentStatus(container as HTMLElement);
    this.startPolling();
  }

  private mountPaymentStatus(container: HTMLElement) {
    const statusDiv = container.querySelector("#sok-status-react");
    if (!statusDiv) return;
    const root = createRoot(statusDiv as HTMLElement);
    root.render(
      React.createElement(PaymentStatusUI, {
        backendUrl: this.backendUrl,
        nonce: this.session.nonce,
      })
    );
  }

  private renderOPayFormPanel() {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-header">
        <h2 class="suioutkit-title">OPay Direct</h2>
        <p class="suioutkit-subtitle">Enter your OPay registered phone number</p>
      </div>
      <div class="suioutkit-panel">
        <form class="sok-form" id="sok-opay-form" style="width: 100%;">
          <input type="tel" class="sok-input" placeholder="e.g. 08012345678" id="sok-phone-input" pattern="\\d{11}" maxlength="11" required />
          <span class="sok-phone-error sok-text-red" id="sok-phone-error" style="display:none; margin-top:4px;">Enter a valid 11-digit phone number</span>
          <button type="submit" class="sok-btn" id="sok-opay-submit" disabled>Continue</button>
        </form>
      </div>
    `;

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.renderSelectionPanel());

    const phoneInput = container.querySelector("#sok-phone-input") as HTMLInputElement;
    const submitBtn = container.querySelector("#sok-opay-submit") as HTMLButtonElement;
    const errorEl = container.querySelector("#sok-phone-error") as HTMLElement;

    const validatePhone = (value: string) => /^\d{11}$/.test(value);

    phoneInput?.addEventListener("input", () => {
      const valid = validatePhone(phoneInput.value.trim());
      submitBtn.disabled = !valid;
      if (errorEl) errorEl.style.display = valid ? "none" : "block";
    });

    container.querySelector("#sok-opay-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const phone = phoneInput?.value.trim() || "";
      if (!validatePhone(phone)) {
        if (errorEl) errorEl.style.display = "block";
        return;
      }
      this.handleCharge("opay", phone);
    });
  }

  private renderOPayInstructionsPanel(promptText: string) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-panel">
        <div class="suioutkit-amount-box">
          <p class="suioutkit-subtitle">Check your phone to approve</p>
          <h2 class="sok-fiat-amt">OPay Prompt</h2>
        </div>
        <p class="sok-status-text sok-mb-20" style="font-weight:600;">${promptText}</p>
        <div class="sok-spinner"></div>
        <p class="sok-status-text">Waiting for your OPay confirmation...</p>
      </div>
    `;

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => {
      this.stopPolling();
      this.renderSelectionPanel();
    });

    this.startPolling();
  }

  private async handleStripePaymentPanel() {
    this.renderLoadingPanel("Initializing secure global checkout...");
    try {
      const response = await fetch(joinApiPath(this.backendUrl, "checkout", "charge"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: this.session.token,
          method: "stripe"
        })
      });

      const result: any = await response.json();
      if (result.status === "success" && result.clientSecret && result.stripePublicKey) {
        this.renderStripeElementsPanel(result.clientSecret, result.stripePublicKey, result.validatedRate);
      } else {
        this.renderErrorPanel(result.message || "Failed to initialize Stripe checkout.");
      }
    } catch (err) {
      this.renderErrorPanel("Connection to payment server failed.");
    }
  }

  private async renderStripeElementsPanel(clientSecret: string, publicKey: string, rate: number) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-header">
        <h2 class="suioutkit-title">Global Checkout</h2>
        <p class="suioutkit-subtitle">Secured by Stripe</p>
      </div>
      <div class="suioutkit-panel">
        <form id="payment-form" style="width: 100%;">
          <div id="payment-element" style="min-height: 200px; margin-bottom: 16px;">
            <div class="sok-spinner" style="margin: 0 auto;"></div>
          </div>
          <button class="sok-btn sok-btn-indigo" id="submit-stripe-btn">
            Pay Now
          </button>
          <div id="payment-message" class="sok-text-red" style="margin-top: 8px; text-align: center; display: none;"></div>
        </form>
      </div>
    `;

    this.renderIcons();
    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.renderSelectionPanel());

    try {
      if (!this.stripeInstance) {
        this.stripeInstance = await loadStripe(publicKey);
      }

      if (!this.stripeInstance) throw new Error("Stripe failed to load");

      const appearance = { theme: 'night' as const, variables: { colorPrimary: '#4E75F8', colorBackground: '#121219' } };
      this.stripeElements = this.stripeInstance.elements({ appearance, clientSecret });
      const paymentElement = this.stripeElements.create("payment", {
        wallets: { link: 'never' }
      });
      paymentElement.mount("#payment-element");

      const form = document.getElementById("payment-form");
      form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById("submit-stripe-btn") as HTMLButtonElement;
        submitBtn.disabled = true;
        submitBtn.textContent = "Processing...";

        const { error } = await this.stripeInstance!.confirmPayment({
          elements: this.stripeElements!,
          confirmParams: {
            return_url: window.location.href, // Fallback, we use 'if_required' for cards
          },
          redirect: "if_required"
        });

        if (error) {
          const msg = document.getElementById("payment-message");
          if (msg) {
            msg.textContent = error.message || "An unexpected error occurred.";
            msg.style.display = "block";
          }
          submitBtn.disabled = false;
          submitBtn.textContent = "Pay Now";
        } else {
          this.renderLoadingPanel("Payment approved! Waiting for settlement...");
          this.startPolling();
        }
      });
    } catch (e: any) {
      this.renderErrorPanel("Failed to load Stripe: " + e.message);
    }
  }

  private async handleCryptoPaymentPanel() {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    const allCoins = this.session.supportedCoins || [];
    const merchantTokens = this.session.settlementToken;
    
    let coins = allCoins;
    if (merchantTokens) {
      const allowedTokens = Array.isArray(merchantTokens) ? merchantTokens : [merchantTokens];
      coins = allCoins.filter((c) => 
        allowedTokens.some((t) => c.type.includes(t) || c.symbol.toUpperCase() === t.toUpperCase())
      );
      if (coins.length === 0) coins = allCoins;
    }

    const currentCoin = this.session.coinType || coins[0]?.type || "0x2::sui::SUI";
    const currentSymbol = coins.find((c) => c.type === currentCoin)?.symbol || "SUI";

    if (!this.session.coinType && coins.length > 0) {
      this.session.coinType = coins[0].type;
    }

    const coinChips = coins.length > 1
      ? `<div class="sok-coin-selector">${coins
          .map(
            (c) =>
              `<button class="sok-coin-chip${c.type === currentCoin ? " active" : ""}" data-coin-type="${c.type}">${c.symbol}</button>`
          )
          .join("")}</div>`
      : `<div class="sok-coin-badge">${currentSymbol}</div>`;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-header">
        <h2 class="suioutkit-title">Pay with Sui Wallet</h2>
        <p class="suioutkit-subtitle">Choose settlement token and payment channel</p>
      </div>
      <div class="suioutkit-panel">
        ${coinChips}
        <p class="sok-status-text" style="margin-bottom: 12px;">
          Choose whether to pay via a desktop extension wallet or scan a dynamic QR Code with your mobile wallet.
        </p>
        <button class="sok-btn sok-btn-blue" id="sok-connect-extension-btn" style="margin-bottom: 4px;">
          Standard Connect Wallet
        </button>
        <button class="sok-btn sok-btn-green" id="sok-outpay-qr-btn">
          outPay (Scan QR Code)
        </button>
      </div>
    `;

    if (coins.length > 1) {
      container.querySelectorAll(".sok-coin-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          const coinType = (chip as HTMLElement).dataset.coinType || "";
          if (coinType && coinType !== this.session.coinType) {
            this.session.coinType = coinType;
            void this.handleCryptoPaymentPanel();
          }
        });
      });
    }

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.renderSelectionPanel());

    container.querySelector("#sok-connect-extension-btn")?.addEventListener("click", async () => {
      this.renderLoadingPanel("Preparing crypto payment...");
      try {
        this.cryptoIntent = await this.loadCryptoIntent("sui_wallet");
      } catch (err: any) {
        this.renderErrorPanel(err.message || "Failed to prepare crypto payment.");
        return;
      }
      void this.openStandardConnectWallet();
    });

    container.querySelector("#sok-outpay-qr-btn")?.addEventListener("click", () => void this.renderOutPayQRPanel());
  }

  private async renderCustomWalletListPanel() {
    await this.openStandardConnectWallet();
  }

  private async openStandardConnectWallet() {
    if (!this.cryptoIntent) {
      this.renderErrorPanel("Crypto intent not ready.");
      return;
    }

    if (this.isFileOrigin()) {
      this.renderUnsupportedOriginPanel();
      return;
    }

    const wallets = await this.getCompatibleWallets();

    if (wallets.length === 0) {
      this.renderNoSupportedWalletsPanel();
      return;
    }

    this.renderWalletPickerPanel(wallets);
  }

  private async getCompatibleWallets() {
    const dAppKit = this.ensureDAppKit();
    const getWallets = () => (dAppKit.stores as any)?.$wallets?.get?.() || [];

    let wallets: any[] = getWallets();
    if (wallets.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      wallets = getWallets();
    }

    return wallets
      .filter((wallet) => wallet?.name && wallet?.icon)
      .sort((a, b) => {
        const rank = (name: string) => {
          const normalized = name.toLowerCase();
          if (normalized.includes("slush")) return 0;
          if (normalized.includes("phantom")) return 1;
          return 2;
        };

        return rank(String(a.name)) - rank(String(b.name)) || String(a.name).localeCompare(String(b.name));
      });
  }

  private renderWalletPickerPanel(wallets: any[]) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    const walletCardsHtml = wallets
      .map((wallet, index) => this.renderWalletCard(wallet, index))
      .join("");

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to Sui options</button>
      <div class="suioutkit-header">
        <h2 class="suioutkit-title">Connect Wallet</h2>
        <p class="suioutkit-subtitle">Choose the extension you want to use</p>
      </div>
      <div class="suioutkit-wallet-list">
        ${walletCardsHtml}
      </div>
      <p class="sok-status-text sok-op-75 sok-mt-14" style="text-align: center;">
        Wallets are filtered from the browser extensions detected by dApp Kit.
      </p>
    `;

    this.renderIcons();

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.handleCryptoPaymentPanel());

    wallets.forEach((wallet, index) => {
      const btn = container.querySelector(`[data-wallet-index="${index}"]`);
      btn?.addEventListener("click", async () => {
        const dAppKit = this.ensureDAppKit();
        this.renderLoadingPanel(`Connecting to ${wallet.name}...`);

        try {
          const result = await dAppKit.connectWallet({ wallet });
          const connection = (dAppKit.stores as any)?.$connection?.get?.() || {};
          const account = result.accounts?.[0] || connection.currentAccount || connection.account;

          if (!account) {
            this.renderErrorPanel("Wallet connected, but no account was returned. Please unlock the wallet and try again.");
            return;
          }

          this.renderPaymentConfirmPanel(account);
        } catch (err: any) {
          const errMsg = err?.message || "Failed to connect wallet.";
          if (errMsg.toLowerCase().includes("no accounts were authorized") || errMsg.toLowerCase().includes("rejected")) {
            this.renderErrorPanel("Connection rejected or wallet is locked. Please unlock your wallet and try again.");
          } else {
            this.renderErrorPanel(errMsg);
          }
        }
      });
    });
  }

  private ensureDAppKit() {
    if (this.dAppKit) {
      return this.dAppKit;
    }

    const requestedNetwork = (window as any).SuiOutKitNetwork as string | undefined;
    const network: SupportedNetwork = requestedNetwork === "mainnet" || requestedNetwork === "testnet" ? requestedNetwork : "testnet";

    this.dAppKit = createDAppKit({
      networks: [network],
      defaultNetwork: network,
      autoConnect: false,
      slushWalletConfig: null,
      createClient: (selectedNetwork) =>
        new SuiGrpcClient({
          network: selectedNetwork,
          baseUrl: SUI_GRPC_URLS[selectedNetwork as keyof typeof SUI_GRPC_URLS] || SUI_GRPC_URLS.testnet
        })
    });

    return this.dAppKit;
  }

  private clearWalletConnectionWaiter() {
    if (this.walletConnectionUnsubscribe) {
      this.walletConnectionUnsubscribe();
      this.walletConnectionUnsubscribe = null;
    }
  }

  private isFileOrigin() {
    return window.location.protocol === "file:";
  }

  private renderUnsupportedOriginPanel() {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to Sui options</button>
      <div class="suioutkit-panel">
        <div class="sok-icon-wrap sok-text-amber">
          <i data-lucide="alert-circle" style="width: 48px; height: 48px;"></i>
        </div>
        <h2 class="sok-success-title">Open this demo from localhost</h2>
        <p class="sok-status-text" style="max-width: 320px;">
          This page is running from a local file URL. Browser extension wallets like Slush and Phantom do not reliably inject into file:// pages, so dApp Kit cannot list them here.
        </p>
        <p class="sok-status-text sok-op-75" style="max-width: 320px;">
          Open the demo over http://localhost or another web server, then reload. That is the supported origin for wallet detection and connection.
        </p>
      </div>
    `;

    this.renderIcons();
    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.handleCryptoPaymentPanel());
  }

  private renderWalletCard(wallet: any, index: number): string {
    const walletName = wallet.name || "Unknown Wallet";
    const icon = wallet.icon || "https://via.placeholder.com/48";

    return `
      <button
        class="sok-wallet-card"
        data-wallet-index="${index}"
      >
        <img src="${icon}" alt="${walletName}" class="sok-wallet-icon" />
        <span class="sok-wallet-info">
          <span class="sok-wallet-name">${walletName}</span>
          <span class="sok-wallet-desc">Detected browser wallet</span>
        </span>
        <span class="sok-wallet-connect">Connect</span>
      </button>
    `;
  }

  private renderNoSupportedWalletsPanel() {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to Sui options</button>
      <div class="suioutkit-panel">
        <div class="sok-icon-wrap sok-text-amber">
          <i data-lucide="alert-circle" style="width: 48px; height: 48px;"></i>
        </div>
        <h2 class="sok-success-title">No Wallets Detected</h2>
        <p class="sok-status-text sok-mt-16">
          We couldn't find any installed Sui wallets. Please install a wallet extension like Phantom, Slush, or others from the app store and refresh the page.
        </p>
        <p class="sok-status-text sok-op-75 sok-mt-12">
          Alternatively, you can use the outPay QR option to pay from any Sui wallet.
        </p>
      </div>
    `;

    this.renderIcons();
    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.handleCryptoPaymentPanel());
  }

  // Step 2 of crypto flow: show payment summary after wallet connected
  private renderPaymentConfirmPanel(account: any) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    const formattedAmount = formatCurrency(this.session.amount, this.session.resolvedCurrency || this.session.currency || "USD");
    const shortAddress = `${account.address.substring(0, 6)}...${account.address.slice(-4)}`;
    const network = ((window as any).SuiOutKitNetwork as string) || "testnet";

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Change wallet</button>
      <div class="suioutkit-header">
        <h2 class="suioutkit-title">Confirm Payment</h2>
        <p class="suioutkit-subtitle">Review and approve this transaction</p>
      </div>
      <div class="suioutkit-panel">
        <div class="sok-va-card">
          <div class="sok-va-row">
            <div class="sok-va-lbl">Amount</div>
            <div class="sok-va-val sok-text-green" style="font-weight: 700; font-size: 20px;">${formattedAmount}</div>
          </div>
          <div class="sok-va-row">
            <div class="sok-va-lbl">From Wallet</div>
            <div class="sok-va-val">${shortAddress}</div>
          </div>
          <div class="sok-va-row">
            <div class="sok-va-lbl">Network</div>
            <div class="sok-va-val">${network}</div>
          </div>
        </div>
        <button class="sok-btn sok-btn-green" id="sok-confirm-pay-btn">
          Confirm & Pay
        </button>
      </div>
    `;

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => void this.openStandardConnectWallet());
    container.querySelector("#sok-confirm-pay-btn")?.addEventListener("click", () => void this.executeWalletPayment());
  }

  // Step 3 of crypto flow: sign and submit the transaction
  private async executeWalletPayment() {
    if (!this.cryptoIntent) {
      this.renderErrorPanel("Crypto intent not ready.");
      return;
    }

    this.renderLoadingPanel("Waiting for wallet approval...");

    const dAppKit = this.ensureDAppKit();
    const connection = (dAppKit.stores as any)?.$connection?.get?.() || {};
    const account = connection.currentAccount || connection.account;

    if (!account) {
      this.renderErrorPanel("No connected wallet account found.");
      return;
    }

    const baseUnits = this.cryptoIntent.amountBaseUnits;
    const walrusBlobId = this.cryptoIntent.walrusBlobId;

    if (!this.cryptoIntent.packageId) {
      this.renderErrorPanel("Crypto intent is missing the contract package id.");
      return;
    }

    if (!walrusBlobId) {
      this.renderErrorPanel("Crypto intent is missing the Walrus receipt blob id.");
      return;
    }

    try {
      const paymentClient = this.ensurePaymentClient();
      const tx = new Transaction();
      const paymentReceipt = tx.add(paymentClient.paymentKit.calls.processRegistryPayment({
        nonce: this.cryptoIntent.nonce,
        coinType: this.cryptoIntent.coinType,
        amount: BigInt(baseUnits),
        receiver: this.cryptoIntent.receiverAddress,
        sender: account.address,
        ...(this.cryptoIntent.registryName ? { registryName: this.cryptoIntent.registryName } : {})
      }));

      const [suioutkitReceipt] = tx.moveCall({
        target: `${this.cryptoIntent.packageId}::checkout::mint_suioutkit_receipt`,
        arguments: [
          paymentReceipt,
          tx.pure.address(this.cryptoIntent.receiverAddress),
          tx.pure.u64(BigInt(baseUnits)),
          tx.pure.string(this.cryptoIntent.nonce),
          tx.pure.string(this.cryptoIntent.coinType),
          tx.pure.string("sui_wallet"),
          tx.pure.string(walrusBlobId)
        ]
      });

      tx.transferObjects([suioutkitReceipt], this.cryptoIntent.receiverAddress);

      // Sign via wallet, then execute via gRPC client — avoids dapp-kit BCS parsing bug
      const signed = await dAppKit.signTransaction({ transaction: tx });
      const client = dAppKit.stores.$currentClient.get() as SuiGrpcClient;
      const result = await client.executeTransaction({
        transaction: fromBase64(signed.bytes),
        signatures: [signed.signature],
        include: { effects: true, events: true },
      });

      if ((result as any).FailedTransaction) {
        this.renderErrorPanel(
          `Transaction failed: ${(result as any).FailedTransaction?.effects?.status?.error || "Unknown error"}`
        );
        return;
      }

      const txDigest = (result as any).Transaction?.digest || "";

      // Notify backend to verify on-chain and store Walrus receipt
      this.renderLoadingPanel("Confirming payment on-chain...");
      const confirmResponse = await fetch(joinApiPath(this.backendUrl, "checkout", "crypto", "confirm"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce: this.session.nonce,
          txDigest,
          method: "sui_wallet"
        })
      });

      const confirmResult: any = await confirmResponse.json().catch(() => ({}));
      if (!confirmResponse.ok) {
        this.renderErrorPanel(confirmResult.error || confirmResult.message || "Unable to confirm payment on-chain.");
        return;
      }

      // Poll for SETTLED status (backend verifies + emits Walrus receipt)
      this.startPolling();
    } catch (err) {
      this.renderErrorPanel(`Payment failed: ${(err as any)?.message || String(err)}`);
    }
  }

  private async renderOutPayQRPanel() {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    this.renderLoadingPanel("Preparing outPay QR...");

    try {
      this.cryptoIntent = await this.loadCryptoIntent("outpay");
    } catch (err: any) {
      this.renderErrorPanel(err.message || "Failed to prepare outPay QR.");
      return;
    }

    const paymentUri = this.buildPaymentUri(this.cryptoIntent);
    const qrCodeUrl = await QRCode.toDataURL(paymentUri, { width: 300, margin: 2 });

    const coins = this.session.supportedCoins || [];
    const currentSymbol = coins.find((c) => c.type === this.cryptoIntent!.coinType)?.symbol || this.cryptoIntent.coinType.split("::").pop()?.toUpperCase() || "SUI";

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to Sui options</button>
      <div class="suioutkit-panel">
        <div class="suioutkit-amount-box" style="margin-bottom: 8px;">
          <p class="suioutkit-subtitle">Scan QR to pay with ${currentSymbol}</p>
          <h2 class="sok-fiat-amt sok-text-green" style="font-size: 28px;">outPay</h2>
        </div>

        <div class="sok-qr-card">
          <div class="sok-qr-frame">
            <img src="${qrCodeUrl}" alt="outPay QR Code" class="sok-qr-img" />
            <div class="sok-qr-logo-badge">
              <img src="${this.backendUrl}/assets/slush.jpeg" alt="Slush" style="width: 35px; height: 35px; border-radius: 16px;" />
            </div>
            <div class="sok-qr-scan-pulse"></div>
          </div>
          <p class="sok-status-text sok-op-75" style="word-break: break-all; margin-bottom: 4px;">
            ${paymentUri.substring(0, 60)}...
          </p>
        </div>

        <div class="sok-spinner"></div>
        <p class="sok-status-text">Awaiting scan & on-chain verification...</p>
      </div>
    `;

    this.renderIcons();

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.handleCryptoPaymentPanel());

    this.startPolling();
  }

  private buildPaymentUri(intent: CryptoIntentResponse): string {
    return createPaymentTransactionUri({
      receiverAddress: intent.receiverAddress,
      amount: BigInt(intent.amountBaseUnits),
      coinType: intent.coinType,
      nonce: intent.nonce,
      registryName: intent.registryName,
      label: "SuiOutKit Payment",
      message: `Payment for ${intent.nonce.substring(0, 8)}`,
      iconUrl: "https://raw.githubusercontent.com/MystenLabs/sui/refs/heads/main/docs/site/static/img/logo.svg"
    });
  }

  private async loadCryptoIntent(method: "sui_wallet" | "outpay"): Promise<CryptoIntentResponse> {
    const body: Record<string, any> = {
      token: this.session.token,
      method
    };
    if (this.session.coinType) {
      body.coinType = this.session.coinType;
    }
    const response = await fetch(joinApiPath(this.backendUrl, "checkout", "crypto", "intent"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const result: any = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Failed to prepare crypto intent.");
    }

    return result as CryptoIntentResponse;
  }

  private ensurePaymentClient() {
    if (this.paymentClient) {
      return this.paymentClient;
    }

    const requestedNetwork = (window as any).SuiOutKitNetwork as string | undefined;
    const network: SupportedNetwork = requestedNetwork === "mainnet" || requestedNetwork === "testnet" ? requestedNetwork : "testnet";

    this.paymentClient = new SuiGrpcClient({
      network,
      baseUrl: SUI_GRPC_URLS[network]
    }).$extend(paymentKit());

    return this.paymentClient;
  }

  private renderSuccessPanel(txDigest: string, walrusBlobId: string) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    this.stopPolling();
    const walrusNetworkPath = getExplorerNetworkPath();

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-panel">
        <div class="sok-icon-wrap sok-text-green">
          <i data-lucide="check-circle" style="width: 48px; height: 48px;"></i>
        </div>
        <h2 class="sok-success-title">Payment Successful!</h2>
        <p class="sok-success-desc">The merchant has been paid on-chain.</p>

        <div class="sok-success-details">
          <div class="sok-receipt-row">
            <span class="sok-receipt-lbl">Amount Paid</span>
            <span class="sok-receipt-val sok-text-green" style="font-weight:700; font-size: 18px;">
              ${formatCurrency(this.session.amount, this.session.resolvedCurrency || this.session.currency || "USD")}
            </span>
          </div>

          <div class="sok-receipt-row">
            <span class="sok-receipt-lbl">Sui Transaction</span>
            <span class="sok-receipt-val">
              <a href="https://suiscan.xyz/testnet/tx/${txDigest}" target="_blank">${txDigest.substring(0, 10)}...</a>
            </span>
          </div>

          <div class="sok-receipt-row">
            <span class="sok-receipt-lbl">Walrus Invoice ID</span>
            <span class="sok-receipt-val">
              <a href="https://walruscan.com/${walrusNetworkPath}/blob/${walrusBlobId}" target="_blank">${walrusBlobId.substring(0, 10)}...</a>
            </span>
          </div>
        </div>
      </div>
    `;

    this.renderIcons();
    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.renderSelectionPanel());

    const result: PaymentResult = { nonce: this.session.nonce, txDigest, walrusBlobId };
    this.onPaymentCompleteCallback?.(result);
    if (this.redirectUrl) {
      window.location.href = this.redirectUrl;
    } else if (this.autoCloseOnSuccess) {
      this.destroy();
    }
  }

  private renderErrorPanel(message: string) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-panel">
        <div class="sok-icon-wrap sok-text-red">
          <i data-lucide="x-circle" style="width: 48px; height: 48px;"></i>
        </div>
        <h2 class="sok-success-title">Payment Failed</h2>
        <p class="sok-status-text sok-mb-20 sok-text-red">${message}</p>
      </div>
    `;

    this.renderIcons();

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.renderSelectionPanel());
  }

  private startPolling() {
    this.stopPolling();
    this.pollInterval = setInterval(async () => {
      try {
        const response = await fetch(joinApiPath(this.backendUrl, "checkout", "status", this.session.nonce));
        const result: CheckoutStatusResponse = await response.json();

        if (result.status === "SETTLED" && result.txDigest && result.walrusBlobId) {
          this.renderSuccessPanel(result.txDigest, result.walrusBlobId);
        }
      } catch (err) {
        // Soft fail on polling connectivity issues, keep retrying
      }
    }, 3000);
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  public destroy() {
    this.stopPolling();
    this.removeOPayMessageListener();
    this.clearWalletConnectionWaiter();
    if (this.dAppKit) {
      this.dAppKit.disconnectWallet().catch(() => { });
    }
    this.overlay?.classList.remove("active");
    setTimeout(() => {
      this.overlay?.remove();
      this.onCloseCallback?.();
    }, 300);
  }
}
