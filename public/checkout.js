document.body.classList.add("has-js");

const navbar = document.querySelector(".navbar");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const menuItems = document.querySelectorAll(".nav-links a");
const productRoot = document.querySelector("#checkout-product");
const totalsRoot = document.querySelector("#checkout-totals");
const quantityInput = document.querySelector("#quantity-input");
const quantityNote = document.querySelector("#checkout-quantity-note");
const checkoutForm = document.querySelector("#checkout-form");
const checkoutStatus = document.querySelector(".checkout-status");
const checkoutActionButton = document.querySelector("#checkout-action-button");
const checkoutNextStepNote = document.querySelector("#checkout-next-step-note");
const checkoutPaymentMethods = document.querySelector("#checkout-payment-methods");
const checkoutPaymentMethodGrid = document.querySelector("#checkout-payment-method-grid");
const checkoutCurrencyRoot = document.querySelector("#checkout-currency");
const routes = window.ApexLinkRoutes || {
  products: "/products",
  payment: "/payment",
};

let currentProduct = null;
let currentPurchaseMode = "retail";
let currentOrderCurrency = "USD";
let currentMinimumQuantity = 1;
let quantityValidationTimer;
let isSubmittingOrder = false;
let currentCheckoutPaymentMethod = "";
let currentSiteSettings = null;
let checkoutPricingRefreshPromise = null;
let currentOrderAccessToken = "";
const IMPLEMENTED_CHECKOUT_PAYMENT_METHODS = ["PayPal", "Bank Transfer"];
const RETAIL_CHECKOUT_SUPPORTED_METHODS = ["PayPal", "Bank Transfer"];
const WHOLESALE_CHECKOUT_SUPPORTED_METHODS = ["Bank Transfer", "PayPal"];
const SUPPORTED_PAYMENT_CURRENCIES = ["USD", "HKD"];
const BANK_TRANSFER_ACCOUNT_FIELDS = {
  usd: ["enabled", "beneficiaryName", "bankName", "accountNumber", "swiftBic"],
  hkd: ["enabled", "beneficiaryName", "bankName", "accountNumber", "swiftBic"],
};

const setCheckoutActionState = (label = "", disabled = false) => {
  if (checkoutActionButton) {
    checkoutActionButton.disabled = disabled;
    if (label) {
      checkoutActionButton.textContent = label;
    }
  }
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizePaymentMethodName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

const normalizeCurrencyCode = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  return SUPPORTED_PAYMENT_CURRENCIES.includes(normalized) ? normalized : "USD";
};

const isBankTransferCurrencyConfigured = (currencyKey, details) => {
  const normalizedCurrency = normalizeCurrencyCode(currencyKey).toLowerCase();
  const config = details && typeof details === "object" ? details : {};
  const requiredFields = BANK_TRANSFER_ACCOUNT_FIELDS[normalizedCurrency] || [];
  return Boolean(config.enabled) && requiredFields.every((field) => field === "enabled" || String(config[field] || "").trim());
};

const getBankTransferCurrencyState = (bankTransferSettings = {}) =>
  ["USD", "HKD"].map((currencyKey) => {
    const normalizedCurrency = currencyKey.toLowerCase();
    const details =
      bankTransferSettings[normalizedCurrency] && typeof bankTransferSettings[normalizedCurrency] === "object"
        ? bankTransferSettings[normalizedCurrency]
        : {};
    return {
      key: currencyKey,
      configured: isBankTransferCurrencyConfigured(currencyKey, details),
      details,
    };
  });

const getSupportedPayPalCurrencies = () => {
  if (typeof window.NorthstarStore?.getSupportedPayPalCurrencies === "function") {
    return window.NorthstarStore.getSupportedPayPalCurrencies(currentSiteSettings).map((item) =>
      normalizeCurrencyCode(item)
    );
  }

  return ["USD"];
};

const resolveBankTransferAccount = (currency) => {
  if (typeof window.NorthstarStore?.resolveBankTransferAccount === "function") {
    return window.NorthstarStore.resolveBankTransferAccount(currentSiteSettings, normalizeCurrencyCode(currency));
  }

  return {
    currency: normalizeCurrencyCode(currency),
    providerName: "WorldFirst",
    settlementChannel: "WorldFirst",
    details: {},
    available: false,
  };
};

const getConfiguredCheckoutPaymentMethods = () => {
  const baseMethods = Array.isArray(currentSiteSettings?.paymentMethods)
    ? currentSiteSettings.paymentMethods
    : IMPLEMENTED_CHECKOUT_PAYMENT_METHODS;

  const seen = new Set();
  return baseMethods
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const normalized = normalizePaymentMethodName(item);
      if (
        !normalized ||
        seen.has(normalized) ||
        !IMPLEMENTED_CHECKOUT_PAYMENT_METHODS.some(
          (supportedMethod) => normalizePaymentMethodName(supportedMethod) === normalized
        )
      ) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
};

const isCheckoutPaymentMethodConfigured = (method) => {
  const normalizedMethod = normalizePaymentMethodName(method);

  if (normalizedMethod === "paypal") {
    return getSupportedPayPalCurrencies().includes(normalizeCurrencyCode(currentOrderCurrency));
  }

  if (normalizedMethod === "bank transfer") {
    return resolveBankTransferAccount(currentOrderCurrency).available;
  }

  return false;
};

const resolveCheckoutPaymentMethods = (mode) => {
  const supportedMethods =
    mode === "wholesale" ? WHOLESALE_CHECKOUT_SUPPORTED_METHODS : RETAIL_CHECKOUT_SUPPORTED_METHODS;
  const configuredMethods = getConfiguredCheckoutPaymentMethods();

  return supportedMethods.filter((supportedMethod) =>
    configuredMethods.some(
      (configuredMethod) =>
        normalizePaymentMethodName(configuredMethod) === normalizePaymentMethodName(supportedMethod) &&
        isCheckoutPaymentMethodConfigured(configuredMethod)
    )
  );
};

const getRetailCheckoutPaymentMethods = () => resolveCheckoutPaymentMethods("retail");
const getWholesaleCheckoutPaymentMethods = () => resolveCheckoutPaymentMethods("wholesale");

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
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

const storeOrderAccessToken = (orderId, token) => {
  const normalizedOrderId = String(orderId || "").trim();
  const normalizedToken = String(token || "").trim();
  if (!normalizedOrderId || !normalizedToken) {
    return;
  }
  currentOrderAccessToken = normalizedToken;
  window.sessionStorage.setItem(`avelixlink-order-access:${normalizedOrderId}`, normalizedToken);
};

const buildPaymentPageUrl = (orderId) => {
  const paymentRoute = String(routes.payment || "/payment").trim() || "/payment";
  const params = new URLSearchParams({ orderId: String(orderId || "").trim() });
  if (currentOrderAccessToken) {
    params.set("accessToken", currentOrderAccessToken);
  }
  return `${paymentRoute}?${params.toString()}`;
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

const formatCurrency = (value, currency = currentOrderCurrency) => {
  const amount = Number(value || 0);
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

const formatLeadTime = (value, fallback = "") => {
  const days = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(days) && days > 0 ? `${days} days` : String(fallback || "");
};

const formatDepositValue = (deposit) => {
  const value = Number(deposit?.value || 0);

  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  if (deposit?.type === "fixed") {
    return formatCurrency(value);
  }

  if (Number.isInteger(value)) {
    return `${value}%`;
  }

  return `${value.toFixed(2)}%`;
};

const getDepositAmountValue = (deposit, subtotalValue) => {
  const normalizedSubtotal = Math.max(0, Number(subtotalValue || 0));
  const rawValue = Number(deposit?.value || 0);
  if (!normalizedSubtotal || !deposit?.required || !Number.isFinite(rawValue) || rawValue <= 0) {
    return 0;
  }

  if (deposit?.type === "fixed") {
    return rawValue;
  }

  return normalizedSubtotal * (rawValue / 100);
};

const resolvePurchaseMode = (product, requestedMode) => {
  const retailEnabled = product?.b2c?.enabled !== false;
  const wholesaleEnabled = product?.b2b?.enabled !== false;

  if (requestedMode === "wholesale" && wholesaleEnabled) {
    return "wholesale";
  }

  if (requestedMode === "retail" && retailEnabled) {
    return "retail";
  }

  if (retailEnabled) {
    return "retail";
  }

  if (wholesaleEnabled) {
    return "wholesale";
  }

  return "retail";
};

const getSortedWholesalePriceTiers = (product, currency = currentOrderCurrency) =>
  Array.isArray(product?.b2b?.priceTiers)
    ? product.b2b.priceTiers
        .filter((tier) => normalizeCurrencyCode(tier?.currency || "USD") === normalizeCurrencyCode(currency))
        .filter((tier) => Number(tier?.unitPrice || 0) > 0)
        .slice()
        .sort((left, right) => Number(left.minQuantity || 0) - Number(right.minQuantity || 0))
    : [];

const resolveWholesaleTier = (tiers, quantity) => {
  const sortedTiers = Array.isArray(tiers)
    ? tiers
        .filter((tier) => Number(tier?.unitPrice || 0) > 0)
        .slice()
        .sort((left, right) => Number(left?.minQuantity || 0) - Number(right?.minQuantity || 0))
    : [];

  if (!sortedTiers.length) {
    return null;
  }

  const nextQuantity = Math.max(1, Number(quantity || 1));
  return (
    sortedTiers.find((tier) => {
      const min = Math.max(1, Number(tier?.minQuantity || 1));
      const max = Math.max(0, Number(tier?.maxQuantity || 0));
      return nextQuantity >= min && (max === 0 || nextQuantity <= max);
    }) || null
  );
};

const getWholesaleUnitPrice = (product, quantity, currency = currentOrderCurrency) => {
  const tiers = getSortedWholesalePriceTiers(product, currency);
  if (!tiers.length) {
    return 0;
  }

  return Number(resolveWholesaleTier(tiers, quantity)?.unitPrice || 0);
};

const getCheckoutViewModel = (product, mode, quantity = 1) => {
  if (mode === "wholesale") {
    const wholesaleMoq = Math.max(1, Number(product?.b2b?.wholesaleMoq || 1));
    const wholesaleLeadTime = formatLeadTime(product?.b2b?.wholesaleLeadTime, product?.shippingTime || "");
    const depositConfig = product?.b2b?.deposit || {};
    const depositValue = formatDepositValue(depositConfig);
    const depositTerms = String(
      product?.b2b?.depositTerms || depositConfig?.customPaymentTerms || ""
    ).trim();
    const selectedTier = resolveWholesaleTier(
      getSortedWholesalePriceTiers(product, currentOrderCurrency),
      quantity
    );
    const unitPriceValue = Number(selectedTier?.unitPrice || 0);
    const subtotalValue = unitPriceValue * Math.max(1, Number(quantity || 1));
    const totalValue = subtotalValue;
    const depositAmountValue = getDepositAmountValue(depositConfig, subtotalValue);
    const balanceAmountValue = Math.max(0, totalValue - depositAmountValue);
    const pricingAvailable = unitPriceValue > 0;
    const tierRange = selectedTier
      ? (() => {
          const min = Math.max(1, Number(selectedTier.minQuantity || 1));
          const max = Math.max(0, Number(selectedTier.maxQuantity || 0));
          return max > 0 ? `${min}-${max}` : `${min}+`;
        })()
      : "";

    return {
      mode: "wholesale",
      modeLabel: "Wholesale",
      currency: currentOrderCurrency,
      minimumQuantity: wholesaleMoq,
      pricingAvailable,
      selectedTier,
      tierRange,
      unitPriceValue,
      unitPriceText: pricingAvailable
        ? formatCurrency(unitPriceValue, currentOrderCurrency)
        : "Request a Quote",
      leadTime: wholesaleLeadTime,
      moqText: `${wholesaleMoq} units`,
      depositValue,
      depositAmountValue,
      depositAmountText: pricingAvailable
        ? depositAmountValue > 0
          ? formatCurrency(depositAmountValue, currentOrderCurrency)
          : ""
        : "Request a Quote",
      balanceAmountValue,
      balanceAmountText: pricingAvailable
        ? balanceAmountValue > 0
          ? formatCurrency(balanceAmountValue, currentOrderCurrency)
          : ""
        : "Request a Quote",
      depositTerms,
      subtotalValue,
      subtotalText: pricingAvailable ? formatCurrency(subtotalValue, currentOrderCurrency) : "Request a Quote",
      totalValue,
      totalText: pricingAvailable ? formatCurrency(totalValue, currentOrderCurrency) : "Request a Quote",
    };
  }

  const retailPriceValue = Number(product?.b2c?.retailPrice || 0);
  const subtotalValue = retailPriceValue * Math.max(1, Number(quantity || 1));
  const totalValue = subtotalValue;

  return {
    mode: "retail",
    modeLabel: "Retail",
    currency: "USD",
    minimumQuantity: 1,
    pricingAvailable: retailPriceValue > 0,
    selectedTier: null,
    tierRange: "",
    unitPriceValue: retailPriceValue,
    unitPriceText: retailPriceValue > 0 ? formatCurrency(retailPriceValue, "USD") : formatCurrency(0, "USD"),
    leadTime: formatLeadTime(product?.shippingDays, product?.shippingTime || ""),
    moqText: "1 unit",
    depositValue: "",
    depositAmountValue: 0,
    depositAmountText: "",
    balanceAmountValue: 0,
    balanceAmountText: "",
    depositTerms: "",
    subtotalValue,
    subtotalText: retailPriceValue > 0 ? formatCurrency(subtotalValue, "USD") : formatCurrency(0, "USD"),
    totalValue,
    totalText: retailPriceValue > 0 ? formatCurrency(totalValue, "USD") : formatCurrency(0, "USD"),
  };
};

const getAvailableWholesaleCurrencies = (product) => {
  const currencies = SUPPORTED_PAYMENT_CURRENCIES.filter((currency) =>
    (Array.isArray(product?.b2b?.priceTiers) ? product.b2b.priceTiers : []).some(
      (tier) => normalizeCurrencyCode(tier?.currency || "USD") === currency
    )
  );
  return currencies.length ? currencies : ["USD"];
};

const renderCurrencySelector = () => {
  if (!checkoutCurrencyRoot || !currentProduct) {
    return;
  }

  if (currentPurchaseMode !== "wholesale") {
    checkoutCurrencyRoot.hidden = true;
    checkoutCurrencyRoot.innerHTML = "";
    return;
  }

  const currencies = getAvailableWholesaleCurrencies(currentProduct);
  if (!currencies.includes(currentOrderCurrency)) {
    currentOrderCurrency = currencies[0] || "USD";
  }

  checkoutCurrencyRoot.hidden = false;
  checkoutCurrencyRoot.innerHTML = `
    <label>
      Currency
      <select id="checkout-currency-select" name="currency">
        ${currencies
          .map(
            (currency) => `
              <option value="${escapeHtml(currency)}" ${currency === currentOrderCurrency ? "selected" : ""}>
                ${escapeHtml(currency)}
              </option>
            `
          )
          .join("")}
      </select>
    </label>
    <p class="checkout-currency-note">Wholesale pricing, subtotal, deposit, balance and payment methods follow the selected currency.</p>
  `;
};

const getPaymentUrl = (productId, mode) =>
  `${routes.payment || "/payment"}?id=${encodeURIComponent(productId)}&mode=${encodeURIComponent(mode)}`;

const getCheckoutPaymentMethods = (mode) =>
  mode === "wholesale" ? getWholesaleCheckoutPaymentMethods() : getRetailCheckoutPaymentMethods();

const loadLatestCheckoutProduct = async (productId) => {
  const normalizedProductId = String(productId || "").trim();
  if (!normalizedProductId) {
    return null;
  }

  const payload = await requestJson(`/api/products/${encodeURIComponent(normalizedProductId)}`, {
    method: "GET",
  });
  return payload?.product && typeof payload.product === "object" ? payload.product : null;
};

const refreshCheckoutProductPricing = async () => {
  if (!currentProduct?.id) {
    return currentProduct;
  }

  if (checkoutPricingRefreshPromise) {
    return checkoutPricingRefreshPromise;
  }

  checkoutPricingRefreshPromise = (async () => {
    const latestProduct = await loadLatestCheckoutProduct(currentProduct.id);
    if (!latestProduct?.id) {
      return currentProduct;
    }

    currentProduct = latestProduct;
    currentPurchaseMode = resolvePurchaseMode(currentProduct, currentPurchaseMode);
    const availableCurrencies = currentPurchaseMode === "wholesale" ? getAvailableWholesaleCurrencies(currentProduct) : ["USD"];
    if (!availableCurrencies.includes(currentOrderCurrency)) {
      currentOrderCurrency = availableCurrencies[0] || "USD";
    }
    currentMinimumQuantity =
      currentPurchaseMode === "wholesale"
        ? Math.max(1, Number(currentProduct.b2b?.wholesaleMoq || 1))
        : 1;

    if (quantityInput) {
      quantityInput.min = String(currentMinimumQuantity);
      if (Number(quantityInput.value) < currentMinimumQuantity) {
        quantityInput.value = String(currentMinimumQuantity);
      }
    }

    return currentProduct;
  })();

  try {
    return await checkoutPricingRefreshPromise;
  } finally {
    checkoutPricingRefreshPromise = null;
  }
};

const refreshWholesalePricingUi = () => {
  if (currentPurchaseMode !== "wholesale" || !currentProduct?.id) {
    return;
  }

  void refreshCheckoutProductPricing()
    .then(() => {
      enforceMinimumQuantity(false);
      renderTotals();
      renderCurrencySelector();
      renderCheckoutPaymentMethods();
      syncCheckoutModeUi();
    })
    .catch((error) => {
      console.error("[checkout] Wholesale pricing refresh failed:", error);
    });
};

const renderCheckoutPaymentMethods = () => {
  if (!checkoutPaymentMethods || !checkoutPaymentMethodGrid) {
    return;
  }

  const availableMethods = getCheckoutPaymentMethods(currentPurchaseMode);
  currentCheckoutPaymentMethod = availableMethods.includes(currentCheckoutPaymentMethod)
    ? currentCheckoutPaymentMethod
    : availableMethods[0] || "";

  checkoutPaymentMethods.hidden = false;
  checkoutPaymentMethodGrid.innerHTML = availableMethods.length
    ? availableMethods
    .map(
      (method, index) => `
        <label class="payment-method-card">
          <input
            type="radio"
            name="checkoutPaymentMethod"
            value="${escapeHtml(method)}"
            ${currentCheckoutPaymentMethod ? (currentCheckoutPaymentMethod === method ? "checked" : "") : index === 0 ? "checked" : ""}
          >
          <span class="payment-method-indicator" aria-hidden="true"></span>
          <span class="payment-method-label">${escapeHtml(method)}</span>
        </label>
      `
    )
    .join("")
    : `<div class="checkout-note-box"><strong>No payment methods available</strong><p>${
        currentPurchaseMode === "wholesale" && currentOrderCurrency === "HKD"
          ? "Bank transfer is currently unavailable for HKD, and no other configured payment method can be used for this currency yet."
          : "Please contact our team before placing this order."
      }</p></div>`;
};

const getSelectedCheckoutPaymentMethod = () => {
  const selected = checkoutForm?.querySelector('input[name="checkoutPaymentMethod"]:checked');
  return String(selected?.value || currentCheckoutPaymentMethod || "").trim();
};

const renderProductSummary = (product) => {
  if (!productRoot || !product) {
    return;
  }

  const quantity = Math.max(currentMinimumQuantity, Number(quantityInput?.value) || currentMinimumQuantity);
  const summary = getCheckoutViewModel(product, currentPurchaseMode, quantity);

  productRoot.innerHTML = `
    <div class="checkout-product-media">
      <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
    </div>
    <div class="checkout-product-copy">
      <h3>${escapeHtml(product.name)}</h3>
      <p class="checkout-mode-label">${escapeHtml(summary.modeLabel)}</p>
    </div>
  `;
};

const renderTotals = () => {
  if (!totalsRoot || !currentProduct) {
    return;
  }

  const quantity = Math.max(currentMinimumQuantity, Number(quantityInput?.value) || currentMinimumQuantity);
  const summary = getCheckoutViewModel(currentProduct, currentPurchaseMode, quantity);
  const minimumOrderText =
    summary.mode === "wholesale"
      ? summary.moqText
      : `${summary.minimumQuantity} unit${summary.minimumQuantity > 1 ? "s" : ""}`;

  totalsRoot.innerHTML = `
    <div class="checkout-total-row">
      <span>Unit Price</span>
      <strong>${escapeHtml(summary.unitPriceText)}</strong>
    </div>
    <div class="checkout-total-row">
      <span>Minimum Order</span>
      <strong>${escapeHtml(minimumOrderText)}</strong>
    </div>
    <div class="checkout-total-row">
      <span>Delivery Time</span>
      <strong>${escapeHtml(summary.leadTime || "-")}</strong>
    </div>
    <div class="checkout-total-row">
      <span>Subtotal</span>
      <strong>${escapeHtml(summary.subtotalText)}</strong>
    </div>
    <div class="checkout-total-row">
      <span>Total</span>
      <strong>${escapeHtml(summary.totalText)}</strong>
    </div>
    ${
      summary.mode === "wholesale" && summary.tierRange
        ? `
          <div class="checkout-total-row">
            <span>Current Tier</span>
            <strong>${escapeHtml(summary.tierRange)}</strong>
          </div>
        `
        : ""
    }
    ${
      summary.mode === "wholesale" && summary.depositValue
        ? `
          <div class="checkout-total-row">
            <span>Deposit</span>
            <strong>${escapeHtml(summary.depositValue)}${summary.depositAmountText ? ` (${escapeHtml(summary.depositAmountText)})` : ""}</strong>
          </div>
          <div class="checkout-total-row">
            <span>Balance</span>
            <strong>${escapeHtml(summary.balanceAmountText || "$0.00")}</strong>
          </div>
        `
        : ""
    }
  `;

  renderProductSummary(currentProduct);
};

const syncCheckoutModeUi = () => {
  const availableMethods = getCheckoutPaymentMethods(currentPurchaseMode);
  currentCheckoutPaymentMethod = getSelectedCheckoutPaymentMethod();
  const quantity = Math.max(currentMinimumQuantity, Number(quantityInput?.value) || currentMinimumQuantity);
  const summary = currentProduct ? getCheckoutViewModel(currentProduct, currentPurchaseMode, quantity) : null;
  if (currentPurchaseMode === "wholesale" && summary && !summary.pricingAvailable) {
    setCheckoutActionState("Request a Quote", true);
    if (checkoutNextStepNote) {
      checkoutNextStepNote.textContent =
        "The selected wholesale quantity is outside the configured pricing tiers. Please request a quote instead of creating an order.";
    }
    return;
  }
  if (!availableMethods.length) {
    setCheckoutActionState("No Payment Methods Available", true);
    if (checkoutNextStepNote) {
      checkoutNextStepNote.textContent =
        currentPurchaseMode === "wholesale"
          ? "No wholesale payment methods are currently enabled. Please contact our team for manual assistance."
          : "No retail payment methods are currently enabled. Please contact our team for manual assistance.";
    }
    return;
  }

  if (currentPurchaseMode === "retail") {
    const isBankTransfer = currentCheckoutPaymentMethod === "Bank Transfer";
    setCheckoutActionState(
      isSubmittingOrder
        ? isBankTransfer
          ? "Creating SWIFT Transfer..."
          : "Preparing PayPal..."
        : isBankTransfer
          ? "Continue to SWIFT Transfer"
          : "Pay with PayPal",
      isSubmittingOrder
    );
    if (checkoutNextStepNote) {
      checkoutNextStepNote.textContent = isBankTransfer
        ? "Your order will be created first, then you will be redirected to the payment page with SWIFT international wire transfer instructions."
        : "Your retail order will be created first, then you will be redirected to PayPal Checkout.";
    }
    return;
  }

  setCheckoutActionState(isSubmittingOrder ? "Creating order..." : "Continue to Payment", isSubmittingOrder);
  if (checkoutNextStepNote) {
    checkoutNextStepNote.textContent =
      currentCheckoutPaymentMethod === "Bank Transfer"
        ? "Your wholesale order will be created first, then you will be redirected to SWIFT international wire transfer instructions on the payment page."
        : "Your wholesale order will be created first, then you will continue to the payment page to confirm PayPal.";
  }
};

const enforceMinimumQuantity = (shouldNotify) => {
  if (!quantityInput) {
    return currentMinimumQuantity;
  }

  const nextQuantity = Number(quantityInput.value);

  if (!Number.isFinite(nextQuantity) || nextQuantity < currentMinimumQuantity) {
    quantityInput.value = String(currentMinimumQuantity);

    if (shouldNotify && quantityNote) {
      quantityNote.textContent =
        currentPurchaseMode === "wholesale"
          ? `Wholesale orders start at ${currentMinimumQuantity} units.`
          : "Retail orders start at 1 unit.";
    }

    return currentMinimumQuantity;
  }

  if (quantityNote) {
    quantityNote.textContent =
      currentPurchaseMode === "wholesale"
        ? `Wholesale orders start at ${currentMinimumQuantity} units.`
        : "Retail quantity can be adjusted from 1 unit upward.";
  }

  return nextQuantity;
};

const setupCheckoutForm = () => {
  quantityInput?.addEventListener("input", () => {
    window.clearTimeout(quantityValidationTimer);
    quantityValidationTimer = window.setTimeout(() => {
      enforceMinimumQuantity(true);
      renderTotals();
      refreshWholesalePricingUi();
    }, 800);

    renderTotals();
  });

  quantityInput?.addEventListener("change", () => {
    window.clearTimeout(quantityValidationTimer);
    enforceMinimumQuantity(true);
    renderTotals();
    refreshWholesalePricingUi();
  });

  quantityInput?.addEventListener("blur", () => {
    window.clearTimeout(quantityValidationTimer);
    enforceMinimumQuantity(true);
    renderTotals();
    refreshWholesalePricingUi();
  });

  checkoutPaymentMethodGrid?.addEventListener("change", () => {
    currentCheckoutPaymentMethod = getSelectedCheckoutPaymentMethod();
    syncCheckoutModeUi();
  });

  checkoutForm?.addEventListener("change", (event) => {
    if (event.target?.id !== "checkout-currency-select") {
      return;
    }
    currentOrderCurrency = normalizeCurrencyCode(event.target.value);
    renderTotals();
    renderCheckoutPaymentMethods();
    syncCheckoutModeUi();
  });

  checkoutForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmittingOrder) {
      return;
    }

    if (!checkoutForm?.reportValidity()) {
      if (checkoutStatus) {
        checkoutStatus.textContent = "Please complete all required buyer and shipping fields.";
      }
      return;
    }

    if (!currentProduct) {
      return;
    }

    if (!getCheckoutPaymentMethods(currentPurchaseMode).length) {
      if (checkoutStatus) {
        checkoutStatus.textContent =
          currentPurchaseMode === "wholesale"
            ? "No wholesale payment methods are currently enabled or fully configured."
            : "No retail payment methods are currently enabled or fully configured.";
      }
      return;
    }

    currentCheckoutPaymentMethod = getSelectedCheckoutPaymentMethod();
    const originalButtonLabel =
      currentPurchaseMode === "retail"
        ? currentCheckoutPaymentMethod === "Bank Transfer"
          ? "Continue to SWIFT Transfer"
          : "Pay with PayPal"
        : "Continue to Payment";
    let createdOrderId = "";

    try {
      isSubmittingOrder = true;
      setCheckoutActionState(
        currentPurchaseMode === "retail"
          ? currentCheckoutPaymentMethod === "Bank Transfer"
            ? "Creating SWIFT Transfer..."
            : "Preparing PayPal..."
          : "Creating order...",
        true
      );
    if (checkoutStatus) {
      checkoutStatus.textContent = currentPurchaseMode === "retail"
        ? !getRetailCheckoutPaymentMethods().length
          ? "No retail payment methods are currently available."
          : currentCheckoutPaymentMethod === "Bank Transfer"
            ? "Creating order and preparing SWIFT transfer details..."
            : "Creating order and preparing PayPal..."
        : "Creating order...";
      }

      await refreshCheckoutProductPricing();
      const quantity = enforceMinimumQuantity(true);
      renderTotals();
      const summary = getCheckoutViewModel(currentProduct, currentPurchaseMode, quantity);
      if (currentPurchaseMode === "wholesale" && !summary.pricingAvailable) {
        throw new Error("The selected wholesale quantity is outside the configured pricing tiers. Please request a quote.");
      }
      const formData = new FormData(checkoutForm);

      const payload = await requestJson("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          order: {
            purchaseMode: currentPurchaseMode,
            customerName: String(formData.get("buyerName") || "").trim(),
            email: String(formData.get("email") || "").trim(),
            phone: String(formData.get("phone") || "").trim(),
            country: String(formData.get("country") || "").trim(),
            shippingAddress: String(formData.get("address") || "").trim(),
            billingAddress: String(formData.get("address") || "").trim(),
            productId: currentProduct.id,
            currency: currentPurchaseMode === "wholesale" ? currentOrderCurrency : "USD",
            quantity: String(quantity),
            message: String(formData.get("notes") || "").trim(),
            paymentMethod: currentCheckoutPaymentMethod,
          },
        }),
      });
      const createdOrder = payload?.order;
      createdOrderId = String(createdOrder?.id || "").trim();
      storeOrderAccessToken(createdOrderId, payload?.orderAccessToken);

      if (!createdOrderId) {
        throw new Error("Order was not created.");
      }
      if (!currentOrderAccessToken) {
        throw new Error("Secure order access token was not returned.");
      }

      if (currentPurchaseMode === "retail" && currentCheckoutPaymentMethod !== "Bank Transfer") {
        const paypalPayload = await requestJson("/api/paypal/create-order", {
          method: "POST",
          headers: {
            "X-Order-Access-Token": currentOrderAccessToken,
          },
          body: JSON.stringify({
            orderId: createdOrderId,
          }),
        });

        if (!paypalPayload?.approvalUrl) {
          throw new Error("PayPal approval URL was not returned.");
        }

        if (checkoutStatus) {
          checkoutStatus.textContent = "Redirecting to PayPal...";
        }

        window.location.href = String(paypalPayload.approvalUrl || "");
        return;
      }

      if (checkoutStatus) {
        checkoutStatus.textContent =
          currentPurchaseMode === "retail" && currentCheckoutPaymentMethod === "Bank Transfer"
            ? "Redirecting to SWIFT transfer instructions..."
            : "Redirecting to payment...";
      }

      window.location.href = buildPaymentPageUrl(createdOrderId);
    } catch (error) {
      console.error("Checkout order creation failed:", error);
      if (checkoutStatus) {
        const message = String(error?.message || "Unknown error.");
        checkoutStatus.textContent = createdOrderId && currentPurchaseMode === "retail"
          ? `Order created, but the selected payment method could not be started: ${message}`
          : `Unable to create the order: ${message}`;
      }
      isSubmittingOrder = false;
      setCheckoutActionState(originalButtonLabel, false);
    }
  });
};

const initCheckoutPage = async () => {
  const store = window.NorthstarStore;

  if (!store) {
    return;
  }

  await store.ready;
  await store.trackVisit();
  const [website, settings] = await Promise.all([store.getWebsiteSettings(), store.getSettings()]);
  currentSiteSettings = settings;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const requestedMode = String(params.get("mode") || "").trim().toLowerCase();
  const requestedCurrency = normalizeCurrencyCode(params.get("currency") || "USD");
  const requestedQuantity = Math.max(1, Number.parseInt(String(params.get("quantity") || "1"), 10) || 1);
  currentProduct = id ? await store.getProductById(id) : (await store.getProducts())[0] || null;

  if (!currentProduct) {
    if (productRoot) {
      productRoot.innerHTML = `
        <div class="detail-empty">
          <h2>No product selected</h2>
          <p>Please return to the catalog and choose a product before continuing to checkout.</p>
          <p><a class="btn btn-primary" href="${routes.products}">Browse Products</a></p>
        </div>
      `;
    }

    return;
  }

  document.title = `${currentProduct.name} Checkout | ${website?.brand?.name || "AvelixLink"}`;
  currentPurchaseMode = resolvePurchaseMode(currentProduct, requestedMode);
  currentOrderCurrency = currentPurchaseMode === "wholesale"
    ? (() => {
        const currencies = getAvailableWholesaleCurrencies(currentProduct);
        return currencies.includes(requestedCurrency) ? requestedCurrency : currencies[0] || "USD";
      })()
    : "USD";
  currentMinimumQuantity = currentPurchaseMode === "wholesale"
    ? Math.max(1, Number(currentProduct.b2b?.wholesaleMoq || 1))
    : 1;
  currentCheckoutPaymentMethod = getCheckoutPaymentMethods(currentPurchaseMode)[0] || "";

  if (quantityInput) {
    quantityInput.min = String(currentMinimumQuantity);
    quantityInput.value = String(Math.max(currentMinimumQuantity, requestedQuantity));
  }

  if (quantityNote) {
    quantityNote.textContent =
      currentPurchaseMode === "wholesale"
        ? `Wholesale orders start at ${currentMinimumQuantity} units.`
        : "Retail quantity can be adjusted from 1 unit upward.";
  }

  renderTotals();
  renderCurrencySelector();
  renderCheckoutPaymentMethods();
  syncCheckoutModeUi();
};

setupNavigation();
setupRevealAnimations();
setupCheckoutForm();
syncNavbarState();
window.addEventListener("scroll", syncNavbarState, { passive: true });
initCheckoutPage();
