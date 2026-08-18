document.body.classList.add("has-js");

const navbar = document.querySelector(".navbar");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const menuItems = document.querySelectorAll(".nav-links a");
const productRoot = document.querySelector("#payment-product");
const totalsRoot = document.querySelector("#payment-totals");
const paymentMethodInput = document.querySelector("#payment-method-value");
const paymentOverviewRoot = document.querySelector("#payment-overview");
const paymentForm = document.querySelector("#payment-form");
const paymentStatus = document.querySelector("#payment-status");
const paymentDetailsRoot = document.querySelector("#payment-details-container");
const backLink = document.querySelector("#payment-back-link");
const secondaryBackLink = document.querySelector("#payment-secondary-back-link");
const routes = window.ApexLinkRoutes || {
  products: "/products",
  checkout: "/checkout",
  detail: "/detail",
};

let currentOrder = null;
let currentProduct = null;
let isSubmittingPayment = false;
let currentPayments = [];
let currentSiteSettings = null;
let isCapturingPayPal = false;
let currentOrderAccessToken = "";
let currentPaymentMethod = "";
const BANK_TRANSFER_PROVIDER = "bank_transfer";
const CRYPTO_PAYMENT_PROVIDER = "crypto_manual";
const WORLD_FIRST_SETTLEMENT_CHANNEL = "WorldFirst";
const IMPLEMENTED_PAYMENT_METHODS = ["PayPal", "Bank Transfer", "Cryptocurrency"];
const RETAIL_PAYMENT_SUPPORTED_METHODS = ["PayPal", "Bank Transfer", "Cryptocurrency"];
const WHOLESALE_PAYMENT_SUPPORTED_METHODS = ["Bank Transfer", "PayPal", "Cryptocurrency"];
const SUPPORTED_PAYMENT_CURRENCIES = ["USD", "HKD"];
const PAYMENT_METHOD_COPY = {
  paypal: "Pay securely with PayPal",
  "bank transfer": "Pay by international SWIFT wire transfer",
  cryptocurrency: "Pay USDT on the TRC20 network",
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const requestJson = async (url, options = {}) => {
  const shouldAttachOrderAccess =
    String(url || "").startsWith("/api/customer/orders/") ||
    String(url || "").startsWith("/api/paypal/");
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(shouldAttachOrderAccess && currentOrderAccessToken
        ? { "X-Order-Access-Token": currentOrderAccessToken }
        : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    throw new Error(String(payload?.error || `Request failed with status ${response.status}.`));
  }

  return payload;
};

const requestForm = async (url, formData, options = {}) => {
  const response = await fetch(url, {
    method: options.method || "POST",
    credentials: "same-origin",
    body: formData,
    headers: {
      ...(currentOrderAccessToken ? { "X-Order-Access-Token": currentOrderAccessToken } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    throw new Error(String(payload?.error || `Request failed with status ${response.status}.`));
  }

  return payload;
};

const isPaidStatus = (value) => String(value || "").trim().toLowerCase() === "paid";
const normalizeCurrencyCode = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  return SUPPORTED_PAYMENT_CURRENCIES.includes(normalized) ? normalized : "USD";
};
const normalizePaymentMethodKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
const isValidTrc20Address = (value) => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(value || "").trim());
const getConfiguredPaymentMethods = () => {
  const baseMethods = Array.isArray(currentSiteSettings?.paymentMethods)
    ? currentSiteSettings.paymentMethods
    : IMPLEMENTED_PAYMENT_METHODS;

  const seen = new Set();
  return baseMethods
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const normalized = normalizePaymentMethodKey(item);
      if (
        !normalized ||
        seen.has(normalized) ||
        !IMPLEMENTED_PAYMENT_METHODS.some(
          (supportedMethod) => normalizePaymentMethodKey(supportedMethod) === normalized
        )
      ) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
};
const isBankTransferMethod = (value) => normalizePaymentMethodKey(value) === "bank transfer";
const isBankTransferPayment = (payment) =>
  isBankTransferMethod(payment?.paymentMethod) ||
  String(payment?.paymentProvider || "").trim().toLowerCase() === BANK_TRANSFER_PROVIDER;
const isCryptoPaymentMethod = (value) =>
  ["cryptocurrency", "usdt cryptocurrency", "usdt"].includes(normalizePaymentMethodKey(value));
const isCryptoPayment = (payment) =>
  isCryptoPaymentMethod(payment?.paymentMethod) ||
  String(payment?.paymentProvider || "").trim().toLowerCase() === CRYPTO_PAYMENT_PROVIDER;

const fetchOrderPayments = async (orderId) => {
  const payload = await requestJson(`/api/customer/orders/${encodeURIComponent(orderId)}/payments`, {
    method: "GET",
  });
  return Array.isArray(payload?.payments) ? payload.payments : [];
};

const syncNavbarState = () => {
  if (!navbar) {
    return;
  }

  navbar.classList.toggle("is-scrolled", window.scrollY > 18);
};

const setupNavigation = () => {
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
      navbar?.classList.toggle("menu-open", isOpen);
    });
  }

  menuItems.forEach((item) => {
    item.addEventListener("click", () => {
      navLinks?.classList.remove("is-open");
      navToggle?.setAttribute("aria-expanded", "false");
      navbar?.classList.remove("menu-open");
    });
  });
};

const setupRevealAnimations = () => {
  const items = document.querySelectorAll(".reveal, .animate-on-scroll");

  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          } else {
            entry.target.classList.remove("is-visible");
          }
        });
      },
      {
        threshold: 0.15,
      }
    );

    items.forEach((item, index) => {
      item.style.transitionDelay = `${Math.min(index * 60, 240)}ms`;
      revealObserver.observe(item);
    });
  } else {
    items.forEach((item) => item.classList.add("is-visible"));
  }
};

const formatCurrency = (value, currency = currentOrder?.currency || "USD") => {
  const amount = Number(String(value || "").replace(/[^\d.-]/g, "") || 0);
  const normalizedCurrency = normalizeCurrencyCode(currency);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    return `${normalizedCurrency} ${amount.toFixed(2)}`;
  }
};
const parseMoneyValue = (value) => Number(String(value || "").replace(/[^\d.-]/g, "") || 0);
const hasNonZeroAmount = (value) => Math.abs(parseMoneyValue(value)) > 0.0001;
const getPaymentMethodDescription = (method) => PAYMENT_METHOD_COPY[normalizePaymentMethodKey(method)] || "Secure payment method";

const getSupportedPayPalCurrencies = () => {
  if (typeof window.NorthstarStore?.getSupportedPayPalCurrencies === "function") {
    return window.NorthstarStore.getSupportedPayPalCurrencies(currentSiteSettings).map((item) =>
      normalizeCurrencyCode(item)
    );
  }

  return ["USD"];
};

const isBankTransferCurrencyConfigured = (currencyKey, details) => {
  const requiredFields = ["beneficiaryName", "bankName", "accountNumber", "swiftBic"];
  const config = details && typeof details === "object" ? details : {};
  return Boolean(config.enabled) && requiredFields.every((field) => String(config[field] || "").trim());
};

const resolveBankTransferAccount = (currency) => {
  if (typeof window.NorthstarStore?.resolveBankTransferAccount === "function") {
    return window.NorthstarStore.resolveBankTransferAccount(currentSiteSettings, normalizeCurrencyCode(currency));
  }

  return {
    currency: normalizeCurrencyCode(currency),
    providerName: WORLD_FIRST_SETTLEMENT_CHANNEL,
    settlementChannel: WORLD_FIRST_SETTLEMENT_CHANNEL,
    details: {},
    available: false,
  };
};

const resolveCryptoPaymentSettings = () => {
  const settings = currentSiteSettings?.cryptoPaymentSettings || {};
  const walletAddress = String(settings.walletAddress || "").trim();
  return {
    asset: "USDT",
    network: "TRC20",
    walletAddress,
    available: isValidTrc20Address(walletAddress) && normalizeCurrencyCode(currentOrder?.currency || "USD") === "USD",
  };
};

const getPaymentMethods = (mode) => {
  const configured = getConfiguredPaymentMethods();
  const supportedMethods = mode === "retail" ? RETAIL_PAYMENT_SUPPORTED_METHODS : WHOLESALE_PAYMENT_SUPPORTED_METHODS;
  return supportedMethods.filter((supportedMethod) =>
    configured.some((configuredMethod) => {
      const normalizedMethod = normalizePaymentMethodKey(configuredMethod);
      if (normalizedMethod !== normalizePaymentMethodKey(supportedMethod)) {
        return false;
      }
      if (normalizedMethod === "paypal") {
        return getSupportedPayPalCurrencies().includes(normalizeCurrencyCode(currentOrder?.currency || "USD"));
      }
      if (normalizedMethod === "bank transfer") {
        return resolveBankTransferAccount(currentOrder?.currency || "USD").available;
      }
      if (normalizedMethod === "cryptocurrency") {
        return resolveCryptoPaymentSettings().available;
      }
      return false;
    })
  );
};

const hasDepositConfiguration = (order) => {
  const depositPercentage = Number(String(order?.depositPercentage || "").replace(/[^\d.-]/g, "") || 0);
  const depositAmount = Number(String(order?.depositAmount || "").replace(/[^\d.-]/g, "") || 0);
  return depositPercentage > 0 || depositAmount > 0;
};

const getNextPaymentType = (order, payments) => {
  if ((order?.purchaseMode || "") !== "wholesale") {
    const fullPayment = payments.find((payment) => payment.paymentType === "full-payment");
    return isPaidStatus(fullPayment?.status) ? "" : "full-payment";
  }

  if (!hasDepositConfiguration(order)) {
    const fullPayment = payments.find((payment) => payment.paymentType === "full-payment");
    return isPaidStatus(fullPayment?.status) ? "" : "full-payment";
  }

  const depositPayment = payments.find((payment) => payment.paymentType === "deposit");
  if (!isPaidStatus(depositPayment?.status)) {
    return "deposit";
  }

  const balancePayment = payments.find((payment) => payment.paymentType === "balance");
  return isPaidStatus(balancePayment?.status) ? "" : "balance";
};

const isPaymentFlowComplete = (order, payments) => {
  const nextType = getNextPaymentType(order, payments);
  return !nextType;
};

const getPrimaryRetailPayment = (payments) =>
  (Array.isArray(payments) ? payments : []).find((payment) => payment.paymentType === "full-payment") || null;
const getPendingBankTransferPayment = (payments) =>
  (Array.isArray(payments) ? payments : [])
    .filter((payment) => isBankTransferPayment(payment))
    .slice()
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] || null;
const getPendingCryptoPayment = (payments) =>
  (Array.isArray(payments) ? payments : [])
    .filter((payment) => isCryptoPayment(payment))
    .slice()
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] || null;

const getPaymentTypeLabel = (type) =>
  ({
    deposit: "Deposit",
    "full-payment": "Full Payment",
    balance: "Balance",
    refund: "Refund",
  }[String(type || "").trim().toLowerCase()] || "Full Payment");

const canonicalPaymentMethod = (value) => {
  const normalized = normalizePaymentMethodKey(value);
  if (normalized === "paypal") {
    return "PayPal";
  }
  if (normalized === "bank transfer") {
    return "Bank Transfer";
  }
  if (["cryptocurrency", "usdt cryptocurrency", "usdt"].includes(normalized)) {
    return "Cryptocurrency";
  }
  return "";
};

const getSelectedPaymentMethod = () =>
  String(paymentMethodInput?.value || currentPaymentMethod || "").trim();

const getInitialPaymentMethod = () => {
  const params = new URLSearchParams(window.location.search);
  const hasPayPalReturnState =
    Boolean(String(params.get("token") || "").trim()) ||
    params.get("paypal") === "cancelled";

  if (hasPayPalReturnState) {
    return "PayPal";
  }

  const latestPayment = (Array.isArray(currentPayments) ? currentPayments : [])
    .slice()
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
    .find((payment) => canonicalPaymentMethod(payment.paymentMethod));
  const persistedMethod = canonicalPaymentMethod(latestPayment?.paymentMethod || currentOrder?.paymentMethod);
  if (persistedMethod) {
    return persistedMethod;
  }

  return getPaymentMethods(currentOrder?.purchaseMode || "retail")[0] || "";
};

const renderPaymentMethods = (mode, selectedMethod = "", options = {}) => {
  const methods = getPaymentMethods(mode);
  const lockedMethod = String(options.lockedMethod || "").trim();
  currentPaymentMethod = canonicalPaymentMethod(lockedMethod || selectedMethod);
  if (!currentPaymentMethod && methods.length) {
    currentPaymentMethod = methods[0];
  }
  if (paymentMethodInput) {
    paymentMethodInput.value = currentPaymentMethod;
  }
  renderPaymentOverview();
};

const getPaymentSubmitButton = () => paymentForm?.querySelector('button[type="submit"]') || null;

const setSubmitButtonState = () => {
  const submitButton = getPaymentSubmitButton();
  if (!submitButton || !currentOrder) {
    return;
  }
  const activeBankTransferPayment = getPendingBankTransferPayment(currentPayments);
  const activeCryptoPayment = getPendingCryptoPayment(currentPayments);
  const selectedMethod = getSelectedPaymentMethod();
  const availableMethods = getPaymentMethods(currentOrder.purchaseMode || "retail");

  const retailPaid = currentOrder.purchaseMode === "retail" && (
    isPaidStatus(currentOrder.paymentStatus) ||
    isPaidStatus(currentOrder.orderStatus) ||
    currentPayments.some((payment) => isPaidStatus(payment.status))
  );

  if (isCapturingPayPal) {
    submitButton.disabled = true;
    submitButton.textContent = "Capturing PayPal Payment...";
    return;
  }

  if (isSubmittingPayment) {
    submitButton.disabled = true;
    submitButton.textContent = isCryptoPaymentMethod(selectedMethod)
      ? "Submitting USDT Payment..."
      : isBankTransferMethod(selectedMethod)
        ? activeBankTransferPayment
          ? "Uploading Payment Proof..."
          : "Preparing Bank Transfer..."
        : "Redirecting to PayPal...";
    return;
  }

  if (retailPaid) {
    submitButton.disabled = true;
    submitButton.textContent = "Payment Completed";
    return;
  }

  if (!availableMethods.length) {
    submitButton.disabled = true;
    submitButton.textContent = "No Payment Methods Available";
    return;
  }

  if (!selectedMethod) {
    submitButton.disabled = true;
    submitButton.textContent = "Select a Payment Method";
    return;
  }

  if (
    isBankTransferMethod(selectedMethod) &&
    activeBankTransferPayment &&
    !isPaidStatus(activeBankTransferPayment.status)
  ) {
    submitButton.disabled = false;
    submitButton.textContent = activeBankTransferPayment.paymentProofUrl
      ? "Update Payment Proof"
      : "I Have Completed the Payment";
    return;
  }

  if (
    isCryptoPaymentMethod(selectedMethod) &&
    activeCryptoPayment &&
    !isPaidStatus(activeCryptoPayment.status)
  ) {
    submitButton.disabled = false;
    submitButton.textContent = "Submit USDT Payment Proof";
    return;
  }

  if (currentOrder.purchaseMode === "retail") {
    submitButton.disabled = false;
    submitButton.textContent =
      selectedMethod === "Bank Transfer"
        ? "Continue with SWIFT Transfer"
        : selectedMethod === "Cryptocurrency"
          ? "Continue with USDT"
          : "Pay with PayPal";
    return;
  }

  const isComplete = isPaymentFlowComplete(currentOrder, currentPayments);
  submitButton.disabled = isComplete;
  submitButton.textContent = isComplete
    ? "Payment Method Confirmed"
    : selectedMethod === "Bank Transfer"
      ? "Submit SWIFT Transfer Order"
      : selectedMethod === "Cryptocurrency"
        ? "Submit USDT Payment Order"
        : "Pay with PayPal";
};

const renderCustomerInfoHtml = (order) => `
    <div class="payment-customer-card-head">
      <strong>Customer information</strong>
      <p>Review the delivery details attached to this order before you continue.</p>
    </div>
    <div class="payment-customer-grid">
      <div class="payment-customer-field">
        <span>Email</span>
        <strong>${escapeHtml(order.email || "-")}</strong>
      </div>
      <div class="payment-customer-field">
        <span>Name</span>
        <strong>${escapeHtml(order.customerName || "-")}</strong>
      </div>
      <div class="payment-customer-field">
        <span>Phone</span>
        <strong>${escapeHtml(order.phone || "-")}</strong>
      </div>
      <div class="payment-customer-field">
        <span>Country</span>
        <strong>${escapeHtml(order.country || "-")}</strong>
      </div>
      <div class="payment-customer-field payment-customer-field-full">
        <span>Shipping Address</span>
        <strong>${escapeHtml(order.shippingAddress || "-")}</strong>
      </div>
      ${
        order.message
          ? `
            <div class="payment-customer-field payment-customer-field-full">
              <span>Order Notes</span>
              <strong>${escapeHtml(order.message)}</strong>
            </div>
          `
          : ""
      }
    </div>
  `;

const buildPaymentRecordPayload = (order, paymentType, paymentMethod) => {
  const orderTotal = parseMoneyValue(order.totalAmount || order.subtotal || order.budget || "$0.00");
  const depositPercentage = Number(String(order.depositPercentage || "").replace(/[^\d.-]/g, "") || 0);
  const configuredDepositAmount = parseMoneyValue(order.depositAmount || 0);
  const configuredBalanceAmount = parseMoneyValue(order.balanceAmount || 0);
  const depositAmount = paymentType === "deposit"
    ? configuredDepositAmount || (depositPercentage > 0 ? (orderTotal * depositPercentage) / 100 : orderTotal)
    : 0;
  const balanceAmount = paymentType === "balance"
    ? configuredBalanceAmount || Math.max(0, orderTotal - (configuredDepositAmount || (orderTotal * depositPercentage) / 100))
    : 0;
  const amount =
    paymentType === "deposit"
      ? depositAmount || orderTotal
      : paymentType === "balance"
        ? balanceAmount || orderTotal
        : orderTotal;
  const bankTransferAccount = isBankTransferMethod(paymentMethod) ? getBankTransferAccount(order) : null;
  const cryptoSettings = isCryptoPaymentMethod(paymentMethod) ? resolveCryptoPaymentSettings() : null;

  return {
    orderId: order.orderId || order.id,
    product: order.productName || "",
    customer: order.customerName || "",
    customerEmail: order.email || "",
    customerPhone: order.phone || "",
    orderType: order.purchaseMode || "retail",
    paymentMethod,
    paymentProvider: isBankTransferMethod(paymentMethod)
      ? BANK_TRANSFER_PROVIDER
      : isCryptoPaymentMethod(paymentMethod)
        ? CRYPTO_PAYMENT_PROVIDER
        : "paypal",
    settlementChannel: isBankTransferMethod(paymentMethod)
      ? String(bankTransferAccount?.settlementChannel || bankTransferAccount?.providerName || WORLD_FIRST_SETTLEMENT_CHANNEL)
      : isCryptoPaymentMethod(paymentMethod)
        ? cryptoSettings?.network || "TRC20"
        : WORLD_FIRST_SETTLEMENT_CHANNEL,
    paymentType,
    amount,
    currency: order.currency || "USD",
    depositAmount,
    balanceAmount,
    billingAddress: order.shippingAddress || "",
    status: "pending",
    ...(isCryptoPaymentMethod(paymentMethod)
      ? {
          cryptoAsset: "USDT",
          cryptoNetwork: "TRC20",
          cryptoWalletAddress: cryptoSettings?.walletAddress || "",
          cryptoExpectedAmount: amount,
        }
      : {}),
  };
};

const getCurrentPaymentAmountDue = () => {
  const paymentType = getNextPaymentType(currentOrder, currentPayments);
  if (!paymentType) {
    return 0;
  }
  return buildPaymentRecordPayload(currentOrder, paymentType, "PayPal").amount;
};

const renderPaymentOverview = () => {
  if (!paymentOverviewRoot || !currentOrder) {
    return;
  }
  const paymentType = getNextPaymentType(currentOrder, currentPayments);
  const methodLabel = currentPaymentMethod === "Cryptocurrency" ? "USDT Cryptocurrency" : currentPaymentMethod || "-";
  const amountDue = getCurrentPaymentAmountDue();
  paymentOverviewRoot.innerHTML = `
    <div>
      <span>Order Number</span>
      <strong>${escapeHtml(currentOrder.orderNumber || currentOrder.orderId || currentOrder.id || "-")}</strong>
    </div>
    <div>
      <span>Payment Method</span>
      <strong>${escapeHtml(methodLabel)}</strong>
    </div>
    <div class="payment-overview-amount">
      <span>Amount Due</span>
      <strong>${escapeHtml(formatCurrency(amountDue, currentOrder.currency || "USD"))}</strong>
    </div>
    <div>
      <span>Payment For</span>
      <strong>${escapeHtml(paymentType ? getPaymentTypeLabel(paymentType) : "Payment Completed")}</strong>
    </div>
  `;
};

const getBankTransferCurrencyKey = (order) => {
  return normalizeCurrencyCode(order?.currency || "USD");
};

const getBankTransferAccount = (order) => {
  return resolveBankTransferAccount(getBankTransferCurrencyKey(order));
};

const getBankTransferDetailsHtml = () => {
  const activeBankTransferPayment = getPendingBankTransferPayment(currentPayments);
  const bankTransferAccount = getBankTransferAccount(currentOrder);
  const details = bankTransferAccount.details || {};
  const paymentId = String(activeBankTransferPayment?.id || "").trim();
  const proofUrl = String(activeBankTransferPayment?.paymentProofUrl || "").trim();
  const transactionReference = String(
    activeBankTransferPayment?.transactionId || activeBankTransferPayment?.providerReference || ""
  ).trim();

  const detailFields = [
    ["Beneficiary Name", details.beneficiaryName],
    ["Bank Name", details.bankName],
    ["SWIFT / BIC", details.swiftBic],
    ["Account Number", details.accountNumber],
    ["Currency", bankTransferAccount.currency],
    ["Amount", formatCurrency(getCurrentPaymentAmountDue(), currentOrder.currency || "USD")],
    ["Reference / Remarks", currentOrder.orderNumber || currentOrder.orderId || currentOrder.id || "-"],
    ["Bank Address", details.bankAddress],
    ["Beneficiary Address", details.beneficiaryAddress],
    ["Intermediary Bank", details.intermediaryBank],
    ["Intermediary SWIFT / BIC", details.intermediarySwiftBic],
    ["Instructions", details.instructions],
  ].filter(([, value]) => String(value || "").trim());

  const detailRows = detailFields.length
    ? detailFields
        .map(
          ([label, value]) => `
            <div class="payment-bank-table-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
          `
        )
        .join("")
    : `<div class="payment-bank-table-row"><span>Account Status</span><strong>Unavailable</strong></div>`;

  return `
    <div class="bank-transfer-box payment-details-card payment-instruction-card">
      <div class="payment-info-box-head">
        <div>
          <span class="payment-method-kicker">Selected payment method</span>
          <strong>Bank Transfer Instructions</strong>
          <p>Use the receiving account below to complete your international SWIFT wire transfer.</p>
        </div>
        <span class="payment-method-status">Bank Transfer</span>
      </div>
      <div class="payment-bank-table" aria-label="Bank transfer account details">
        ${detailRows}
      </div>
      <div class="payment-important-notes">
        <strong>Important Notes</strong>
        <ul>
          <li>Include the order number in the transfer reference or remarks.</li>
          <li>Transfer fees must be paid by the sender.</li>
          <li>Bank transfers are normally confirmed within 1-2 business days.</li>
          <li>You will receive an email when the payment is confirmed.</li>
        </ul>
      </div>
    </div>
    ${
      paymentId
        ? `
          <div class="bank-transfer-proof-box payment-details-card payment-proof-card">
            <div class="payment-info-box-head">
              <div>
                <span class="payment-method-kicker">Verification</span>
                <strong>Upload Payment Proof</strong>
                <p>Add your transaction reference and transfer receipt for verification.</p>
              </div>
            </div>
            <input type="hidden" name="bankTransferPaymentId" value="${escapeHtml(paymentId)}">
            <div class="form-grid bank-transfer-proof-grid">
              <label>
                Transaction Reference
                <input type="text" name="transactionReference" value="${escapeHtml(transactionReference)}" placeholder="Reference shown on your transfer receipt" required>
              </label>
              <label class="payment-proof-upload">
                <span>Upload Payment Proof</span>
                <span class="payment-proof-dropzone">
                  <strong>Choose a receipt to upload</strong>
                  <small>PNG, JPG or WEBP up to the configured upload limit</small>
                  <input type="file" name="paymentProof" accept="image/png,image/jpeg,image/webp" ${proofUrl ? "" : "required"}>
                </span>
              </label>
            </div>
            ${
              proofUrl
                ? `<p class="bank-transfer-proof-link">Current proof: <a href="${escapeHtml(proofUrl)}" target="_blank" rel="noreferrer">View uploaded proof</a></p>`
                : ""
            }
          </div>
        `
        : `
          <div class="bank-transfer-proof-box payment-details-card payment-proof-card">
            <div class="payment-info-box-head">
              <div>
                <span class="payment-method-kicker">Next Step</span>
                <strong>Prepare your transfer</strong>
                <p>Continue to create the bank transfer record. You can then upload the payment proof on this page.</p>
              </div>
            </div>
          </div>
        `
    }
  `;
};

const getCryptoPaymentDetailsHtml = () => {
  const activePayment = getPendingCryptoPayment(currentPayments);
  const configured = resolveCryptoPaymentSettings();
  const walletAddress = String(activePayment?.cryptoWalletAddress || configured.walletAddress || "").trim();
  const network = String(activePayment?.cryptoNetwork || configured.network || "TRC20").trim().toUpperCase();
  const cryptoAsset = String(activePayment?.cryptoAsset || configured.asset || "USDT").trim().toUpperCase();
  const cryptoAmount = Number(
    activePayment?.cryptoExpectedAmount || activePayment?.amount || getCurrentPaymentAmountDue() || 0
  );
  const txHash = String(activePayment?.cryptoTxHash || "").trim();
  const proofUrl = String(activePayment?.paymentProofUrl || "").trim();

  return `
    <div class="checkout-note-box payment-details-card">
      ${renderCustomerInfoHtml(currentOrder)}
    </div>
    <div class="checkout-note-box crypto-payment-box payment-details-card">
      <div class="payment-info-box-head">
        <strong>USDT Payment Instructions</strong>
        <p>Send the exact amount to the TRC20 address below. Manual verification is required before fulfillment begins.</p>
      </div>
      <div class="payment-bank-transfer-highlights">
        <div><span>Order Amount USD</span><strong>${escapeHtml(formatCurrency(cryptoAmount, "USD"))}</strong></div>
        <div><span>USDT Amount</span><strong>${escapeHtml(cryptoAmount.toFixed(6))} USDT</strong></div>
        <div><span>Network</span><strong>${escapeHtml(network)}</strong></div>
      </div>
      <div class="crypto-payment-instructions">
        <div class="crypto-wallet-details">
          <span>USDT receiving address</span>
          <strong>${escapeHtml(walletAddress || "Wallet address unavailable")}</strong>
          <small>Only send ${escapeHtml(cryptoAsset)} using ${escapeHtml(network)}. Sending another asset or network may result in permanent loss.</small>
        </div>
        <div class="crypto-qr-placeholder" aria-label="QR code placeholder">
          <span>QR</span>
          <small>Scan support coming later</small>
        </div>
      </div>
      <div class="checkout-summary-facts compact">
        <div><span>Order Reference</span><strong>${escapeHtml(currentOrder.orderNumber || currentOrder.orderId || currentOrder.id || "-")}</strong></div>
        <div><span>Verification</span><strong>Manual</strong></div>
      </div>
    </div>
    ${activePayment?.id ? `
      <div class="checkout-note-box crypto-proof-box payment-details-card">
        <div class="payment-info-box-head">
          <strong>Submit Payment Proof</strong>
          <p>Enter the TRC20 transaction hash. A screenshot is optional.</p>
        </div>
        <input type="hidden" name="cryptoPaymentId" value="${escapeHtml(activePayment.id)}">
        <div class="form-grid bank-transfer-proof-grid">
          <label>
            TX Hash
            <input type="text" name="cryptoTxHash" value="${escapeHtml(txHash)}" placeholder="64-character TRC20 transaction hash" minlength="64" maxlength="64" required>
          </label>
          <label>
            Optional Screenshot
            <input type="file" name="cryptoProof" accept="image/png,image/jpeg,image/webp">
          </label>
        </div>
        ${proofUrl ? `<p class="bank-transfer-proof-link">Current screenshot: <a href="${escapeHtml(proofUrl)}" target="_blank" rel="noreferrer">View uploaded proof</a></p>` : ""}
      </div>
    ` : `
      <div class="checkout-note-box crypto-proof-box payment-details-card">
        <div class="payment-info-box-head">
          <strong>Next Step</strong>
          <p>Confirm USDT as the payment method first. The transaction hash form will then appear here.</p>
        </div>
      </div>
    `}
  `;
};

const getPayPalDetailsHtml = () => `
  <div class="paypal-payment-box payment-details-card payment-instruction-card">
    <div class="payment-info-box-head">
      <div>
        <span class="payment-method-kicker">Selected payment method</span>
        <strong>PayPal Checkout</strong>
        <p>You will continue to PayPal to complete this payment securely.</p>
      </div>
      <span class="payment-method-status">PayPal</span>
    </div>
    <div class="payment-bank-transfer-highlights payment-paypal-highlights">
      <div>
        <span>Amount</span>
        <strong>${escapeHtml(formatCurrency(getCurrentPaymentAmountDue(), currentOrder?.currency || "USD"))}</strong>
      </div>
      <div>
        <span>Currency</span>
        <strong>${escapeHtml(currentOrder?.currency || "USD")}</strong>
      </div>
      <div>
        <span>Order Reference</span>
        <strong>${escapeHtml(currentOrder?.orderNumber || currentOrder?.orderId || currentOrder?.id || "-")}</strong>
      </div>
    </div>
    <div class="payment-important-notes payment-paypal-note">
      <strong>Secure PayPal payment</strong>
      <p>Your payment is confirmed only after PayPal capture succeeds. AvelixLink never receives your PayPal password.</p>
    </div>
  </div>
`;

const hidePaymentDetails = () => {
  if (paymentDetailsRoot) {
    paymentDetailsRoot.innerHTML = "";
  }
};

const renderPaymentDetails = (method = "") => {
  if (!paymentDetailsRoot || !currentOrder) {
    return;
  }

  const normalizedMethod = normalizePaymentMethodKey(method);
  renderPaymentOverview();
  if (!normalizedMethod) {
    hidePaymentDetails();
    return;
  }

  if (normalizedMethod === "bank transfer") {
    paymentDetailsRoot.innerHTML = getBankTransferDetailsHtml();
    return;
  }

  if (normalizedMethod === "paypal") {
    paymentDetailsRoot.innerHTML = getPayPalDetailsHtml();
    return;
  }

  if (normalizedMethod === "cryptocurrency") {
    paymentDetailsRoot.innerHTML = getCryptoPaymentDetailsHtml();
    return;
  }

  hidePaymentDetails();
};

const renderProductSummary = (product, order) => {
  if (!productRoot || !product || !order) {
    return;
  }

  const snapshotItem = Array.isArray(order.items) ? order.items[0] || null : null;
  const productImage = String(snapshotItem?.productImage || product.image || "").trim();
  const productName = String(order.productName || snapshotItem?.productName || product.name || "Selected Product").trim();

  productRoot.innerHTML = `
    <div class="checkout-product-media">
      ${
        productImage
          ? `<img src="${escapeHtml(productImage)}" alt="${escapeHtml(productName)}">`
          : `<div class="checkout-product-media-fallback">${escapeHtml(productName)}</div>`
      }
    </div>
    <div class="checkout-product-copy">
      <p class="checkout-mode-label">${escapeHtml(order.purchaseMode === "wholesale" ? "Wholesale order" : "Retail order")}</p>
      <h3>${escapeHtml(productName)}</h3>
      <div class="payment-product-meta-grid">
        <div>
          <span>Quantity</span>
          <strong>${escapeHtml(order.quantity || 1)}</strong>
        </div>
        <div>
          <span>Unit Price</span>
          <strong>${escapeHtml(order.unitPrice || "$0.00")}</strong>
        </div>
        <div class="payment-product-meta-wide">
          <span>Subtotal</span>
          <strong>${escapeHtml(order.subtotal || "$0.00")}</strong>
        </div>
      </div>
    </div>
  `;
};

const renderTotals = (order) => {
  if (!totalsRoot || !order) {
    return;
  }

  const discountMarkup = hasNonZeroAmount(order.discountAmount)
    ? `
      <div class="checkout-total-row">
        <span>Discount</span>
        <strong>${escapeHtml(order.discountAmount || "$0.00")}</strong>
      </div>
    `
    : "";

  totalsRoot.innerHTML = `
    <div class="checkout-total-row">
      <span>Subtotal</span>
      <strong>${escapeHtml(order.subtotal || "$0.00")}</strong>
    </div>
    ${discountMarkup}
    <div class="checkout-total-row checkout-total-row-emphasis">
      <span>Total</span>
      <strong>${escapeHtml(order.totalAmount || order.subtotal || "$0.00")}</strong>
    </div>
  `;
};

const renderEmptyState = (message = "Please complete the checkout details step before choosing a payment method.") => {
  if (productRoot) {
    productRoot.innerHTML = `
      <div class="detail-empty">
        <h2>Order not found</h2>
        <p>${escapeHtml(message)}</p>
        <p><a class="btn btn-primary" href="${routes.products}">Browse Products</a></p>
      </div>
    `;
  }

  if (totalsRoot) {
    totalsRoot.innerHTML = "";
  }

  hidePaymentDetails();
};

const buildProductFallbackUrl = (order, product) => {
  const detailRoute = routes.detail;
  const productsBase = String(routes.products || "/products").trim() || "/products";
  const productId = String(order?.productId || product?.id || "").trim();

  if (productId) {
    if (typeof detailRoute === "function") {
      return String(detailRoute(productId) || productsBase);
    }
    const detailBase = String(detailRoute || "/detail").trim();
    return `${detailBase}?id=${encodeURIComponent(productId)}`;
  }

  return productsBase;
};

const buildCheckoutUrl = (order, product) => {
  const productId = String(order?.productId || product?.id || "").trim();
  const purchaseMode = String(order?.purchaseMode || "").trim().toLowerCase();
  const mode = purchaseMode === "wholesale" ? "wholesale" : purchaseMode === "retail" ? "retail" : "";

  if (productId && mode) {
    const routeValue =
      typeof routes.checkout === "function"
        ? String(routes.checkout(productId) || "")
        : String(routes.checkout || "/checkout").trim();
    const checkoutUrl = new URL(routeValue || "/checkout", window.location.origin);
    checkoutUrl.searchParams.set("id", productId);
    checkoutUrl.searchParams.set("mode", mode);
    if (order?.quantity) {
      checkoutUrl.searchParams.set("quantity", String(order.quantity));
    }
    if (mode === "wholesale" && order?.currency) {
      checkoutUrl.searchParams.set("currency", normalizeCurrencyCode(order.currency));
    }
    return `${checkoutUrl.pathname}${checkoutUrl.search}`;
  }

  return buildProductFallbackUrl(order, product);
};

const setupPaymentForm = () => {
  paymentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmittingPayment || isCapturingPayPal || !currentOrder?.id) {
      return;
    }

    try {
      isSubmittingPayment = true;
      setSubmitButtonState();
      if (paymentStatus) {
        paymentStatus.textContent = "";
      }

      const formData = new FormData(paymentForm);
      const paymentMethod = String(formData.get("paymentMethod") || getSelectedPaymentMethod() || "").trim();
      const activeBankTransferPayment = getPendingBankTransferPayment(currentPayments);
      const activeCryptoPayment = getPendingCryptoPayment(currentPayments);

      if (!paymentMethod) {
        throw new Error("No payment method selected.");
      }

      if (
        isBankTransferMethod(paymentMethod) &&
        activeBankTransferPayment &&
        !isPaidStatus(activeBankTransferPayment.status)
      ) {
        const paymentId = String(formData.get("bankTransferPaymentId") || activeBankTransferPayment.id || "").trim();
        const transactionReference = String(formData.get("transactionReference") || "").trim();
        const paymentProof = formData.get("paymentProof");

        if (!paymentId) {
          throw new Error("Bank transfer payment record is missing.");
        }

        if (!(paymentProof instanceof File) || !paymentProof.size) {
          if (!String(activeBankTransferPayment.paymentProofUrl || "").trim()) {
            throw new Error("Please upload your payment proof image.");
          }
        }

        if (!transactionReference) {
          throw new Error("Please enter the bank transaction reference.");
        }

        const uploadFormData = new FormData();
        uploadFormData.set("paymentId", paymentId);
        uploadFormData.set("transactionReference", transactionReference);
        if (paymentProof instanceof File && paymentProof.size) {
          uploadFormData.set("file", paymentProof);
        }

        const proofPayload = await requestForm(
          `/api/customer/orders/${encodeURIComponent(currentOrder.id)}/bank-transfer-proof`,
          uploadFormData,
          { method: "POST" }
        );
        currentPayments = await fetchOrderPayments(currentOrder.id);
        renderPaymentDetails("Bank Transfer");
        if (paymentStatus) {
          paymentStatus.textContent = proofPayload?.payment?.paymentProofUrl
            ? "Bank transfer proof submitted. Our team will review it shortly."
            : "Bank transfer details updated.";
        }
        isSubmittingPayment = false;
        setSubmitButtonState();
        return;
      }

      if (
        isCryptoPaymentMethod(paymentMethod) &&
        activeCryptoPayment &&
        !isPaidStatus(activeCryptoPayment.status)
      ) {
        const paymentId = String(formData.get("cryptoPaymentId") || activeCryptoPayment.id || "").trim();
        const txHash = String(formData.get("cryptoTxHash") || "").trim();
        const paymentProof = formData.get("cryptoProof");

        if (!paymentId) {
          throw new Error("USDT payment record is missing.");
        }
        if (!/^[a-fA-F0-9]{64}$/.test(txHash)) {
          throw new Error("Please enter a valid 64-character TRC20 transaction hash.");
        }

        const uploadFormData = new FormData();
        uploadFormData.set("paymentId", paymentId);
        uploadFormData.set("txHash", txHash);
        if (paymentProof instanceof File && paymentProof.size) {
          uploadFormData.set("file", paymentProof);
        }

        await requestForm(
          `/api/customer/orders/${encodeURIComponent(currentOrder.id)}/crypto-payment-proof`,
          uploadFormData,
          { method: "POST" }
        );
        currentPayments = await fetchOrderPayments(currentOrder.id);
        renderPaymentDetails("Cryptocurrency");
        if (paymentStatus) {
          paymentStatus.textContent = "USDT transaction submitted. Our team will verify it before confirming payment.";
        }
        isSubmittingPayment = false;
        setSubmitButtonState();
        return;
      }

      if (normalizePaymentMethodKey(paymentMethod) === "paypal") {
        const payload = await requestJson("/api/paypal/create-order", {
          method: "POST",
          body: JSON.stringify({
            orderId: currentOrder.id,
          }),
        });

        if (!payload?.approvalUrl) {
          throw new Error("PayPal did not return an approval link.");
        }

        if (paymentStatus) {
          paymentStatus.textContent = "Redirecting to PayPal...";
        }

        window.location.href = payload.approvalUrl;
        return;
      }

      const paymentType = getNextPaymentType(currentOrder, currentPayments);
      if (!paymentType) {
        throw new Error("All required payment records have already been created.");
      }

      const paymentPayload = buildPaymentRecordPayload(currentOrder, paymentType, paymentMethod);
      const payload = await requestJson(`/api/customer/orders/${encodeURIComponent(currentOrder.id)}/payments`, {
        method: "POST",
        body: JSON.stringify({
          payment: paymentPayload,
        }),
      });
      const paymentRecord = payload?.payment || null;
      currentOrder = payload?.order || currentOrder;

      if (!currentOrder?.id || !paymentRecord?.id) {
        throw new Error("Payment record creation failed.");
      }

      currentPayments = await fetchOrderPayments(currentOrder.id);

      if (paymentStatus) {
        paymentStatus.textContent = isBankTransferMethod(paymentMethod)
          ? "Bank transfer payment record created. Upload your payment proof to notify our team."
          : isCryptoPaymentMethod(paymentMethod)
            ? "USDT payment record created. Submit the TRC20 transaction hash after sending payment."
            : `${getPaymentTypeLabel(paymentRecord.paymentType)} record created. The order remains pending until manual confirmation.`;
      }

      renderPaymentMethods(currentOrder.purchaseMode || "retail", paymentMethod, {
        lockedMethod: isBankTransferPayment(paymentRecord)
          ? "Bank Transfer"
          : isCryptoPayment(paymentRecord)
            ? "Cryptocurrency"
            : "",
      });
      renderPaymentDetails(paymentMethod);
      setSubmitButtonState();
    } catch (error) {
      console.error("Payment method update failed:", error);
      if (paymentStatus) {
        paymentStatus.textContent = `Unable to save the payment method: ${error?.message || "Unknown error."}`;
      }
      isSubmittingPayment = false;
      setSubmitButtonState();
      return;
    }

    isSubmittingPayment = false;
    setSubmitButtonState();
  });
};

const handlePayPalReturnState = async () => {
  if (!currentOrder?.id) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const cancelled = params.get("paypal") === "cancelled";
  const paypalOrderId = String(params.get("token") || "").trim();

  if (cancelled && paymentStatus) {
    paymentStatus.textContent = "PayPal checkout was cancelled. You can try again when ready.";
  }

  if (!paypalOrderId) {
    return;
  }

  const primaryPayment = getPrimaryRetailPayment(currentPayments);
  if (isPaidStatus(currentOrder.paymentStatus) || isPaidStatus(primaryPayment?.status)) {
    params.delete("token");
    params.delete("PayerID");
    params.delete("payerId");
    params.delete("paypal");
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", nextUrl.replace(/\?$/, ""));
    if (paymentStatus) {
      paymentStatus.textContent = "PayPal payment already completed.";
    }
    setSubmitButtonState();
    return;
  }

  try {
    isCapturingPayPal = true;
    setSubmitButtonState();
    if (paymentStatus) {
      paymentStatus.textContent = "Capturing PayPal payment...";
    }

    const payload = await requestJson("/api/paypal/capture-order", {
      method: "POST",
      body: JSON.stringify({
        orderId: currentOrder.id,
        paypalOrderId,
      }),
    });

    currentOrder = payload?.order || currentOrder;
    currentPayments = await fetchOrderPayments(currentOrder.id);
    renderPaymentOverview();

    params.delete("token");
    params.delete("PayerID");
    params.delete("payerId");
    params.delete("paypal");
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", nextUrl.replace(/\?$/, ""));

    if (paymentStatus) {
      paymentStatus.textContent = payload?.alreadyPaid
        ? "PayPal payment already completed."
        : "PayPal payment completed successfully.";
    }
  } catch (error) {
    console.error("PayPal capture failed:", error);
    if (paymentStatus) {
      paymentStatus.textContent = `Unable to capture the PayPal payment: ${error?.message || "Unknown error."}`;
    }
  } finally {
    isCapturingPayPal = false;
    setSubmitButtonState();
  }
};

const initPaymentPage = async () => {
  const store = window.NorthstarStore;

  if (!store) {
    return;
  }

  await store.ready;
  const [website, settings] = await Promise.all([store.getWebsiteSettings(), store.getSettings()]);
  currentSiteSettings = settings;
  const params = new URLSearchParams(window.location.search);
  const orderId = String(params.get("orderId") || "").trim();
  const accessTokenFromUrl = String(params.get("accessToken") || "").trim();
  const accessStorageKey = orderId ? `avelixlink-order-access:${orderId}` : "";
  currentOrderAccessToken =
    accessTokenFromUrl || (accessStorageKey ? String(window.sessionStorage.getItem(accessStorageKey) || "").trim() : "");

  if (accessStorageKey && currentOrderAccessToken) {
    window.sessionStorage.setItem(accessStorageKey, currentOrderAccessToken);
  }
  if (accessTokenFromUrl) {
    params.delete("accessToken");
    const cleanQuery = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}`);
  }

  if (!orderId) {
    renderEmptyState();
    return;
  }

  if (!currentOrderAccessToken) {
    renderEmptyState("Secure order access is unavailable. Return to checkout and create the order again.");
    return;
  }

  const payload = await requestJson(`/api/customer/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
  });
  currentOrder = payload?.order || null;
  if (!currentOrder?.id) {
    renderEmptyState("The requested order could not be loaded.");
    return;
  }

  currentProduct = await store.getProductById(currentOrder.productId);

  document.title = `Payment | ${website?.brand?.name || "AvelixLink"}`;
  currentPayments = await fetchOrderPayments(currentOrder.id);
  const activeBankTransferPayment = getPendingBankTransferPayment(currentPayments);
  const selectedMethod = getInitialPaymentMethod();
  if (backLink) {
    backLink.href = buildCheckoutUrl(currentOrder, currentProduct);
  }
  if (secondaryBackLink) {
    secondaryBackLink.href = buildCheckoutUrl(currentOrder, currentProduct);
  }

  renderProductSummary(
    currentProduct || {
      id: currentOrder.productId,
      name: currentOrder.productName || "Selected Product",
      image: currentOrder.items?.[0]?.productImage || "",
    },
    currentOrder
  );
  renderTotals(currentOrder);
  renderPaymentMethods(currentOrder.purchaseMode || "retail", selectedMethod, {
    lockedMethod: "",
  });
  renderPaymentDetails(selectedMethod);
  setSubmitButtonState();
  await handlePayPalReturnState();
};

setupNavigation();
setupRevealAnimations();
setupPaymentForm();
syncNavbarState();
window.addEventListener("scroll", syncNavbarState, { passive: true });
initPaymentPage();
