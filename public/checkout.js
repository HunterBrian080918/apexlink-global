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
const routes = window.ApexLinkRoutes || {
  products: "/products",
  payment: "/payment",
};

let currentProduct = null;
let currentPurchaseMode = "retail";
let currentMinimumQuantity = 1;
let quantityValidationTimer;
let isSubmittingOrder = false;
let currentCheckoutPaymentMethod = "PayPal";
let currentSiteSettings = null;
const RETAIL_CHECKOUT_SUPPORTED_METHODS = ["PayPal", "Bank Transfer"];

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

const getConfiguredCheckoutPaymentMethods = () => {
  if (!Array.isArray(currentSiteSettings?.paymentMethods)) {
    return RETAIL_CHECKOUT_SUPPORTED_METHODS.slice();
  }

  const seen = new Set();
  return currentSiteSettings.paymentMethods
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const normalized = normalizePaymentMethodName(item);
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
};

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

const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

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

const getWholesaleUnitPrice = (product, quantity) => {
  const tiers = Array.isArray(product?.b2b?.priceTiers)
    ? product.b2b.priceTiers
        .filter((tier) => Number(tier?.unitPrice || 0) > 0)
        .slice()
        .sort((left, right) => Number(left.minQuantity || 0) - Number(right.minQuantity || 0))
    : [];

  if (!tiers.length) {
    return 0;
  }

  const nextQuantity = Math.max(1, Number(quantity || 1));
  const matchedTier =
    tiers.find((tier) => {
      const min = Math.max(1, Number(tier.minQuantity || 1));
      const max = Math.max(0, Number(tier.maxQuantity || 0));
      return nextQuantity >= min && (max === 0 || nextQuantity <= max);
    }) || tiers[tiers.length - 1];

  return Number(matchedTier?.unitPrice || 0);
};

const getShippingCost = (product, quantity) => {
  if (!product) {
    return 0;
  }

  const baseShipping = Math.max(18, Math.round(Number(product.priceValue || 0) * 0.22));
  return baseShipping + Math.max(0, quantity - 1) * 4;
};

const getCheckoutViewModel = (product, mode, quantity = 1) => {
  if (mode === "wholesale") {
    const wholesaleMoq = Math.max(1, Number(product?.b2b?.wholesaleMoq || 1));
    const wholesaleLeadTime = formatLeadTime(product?.b2b?.wholesaleLeadTime, product?.shippingTime || "");
    const depositValue = formatDepositValue(product?.b2b?.deposit || {});
    const depositTerms = String(
      product?.b2b?.depositTerms || product?.b2b?.deposit?.customPaymentTerms || ""
    ).trim();
    const unitPriceValue = getWholesaleUnitPrice(product, quantity);

    return {
      mode: "wholesale",
      modeLabel: "Wholesale",
      minimumQuantity: wholesaleMoq,
      unitPriceValue,
      unitPriceText: unitPriceValue > 0 ? formatCurrency(unitPriceValue) : "Contact for wholesale pricing",
      leadTime: wholesaleLeadTime,
      moqText: `${wholesaleMoq} units`,
      depositValue,
      depositTerms,
    };
  }

  const retailPriceValue = Number(product?.b2c?.retailPrice || 0);

  return {
    mode: "retail",
    modeLabel: "Retail",
    minimumQuantity: 1,
    unitPriceValue: retailPriceValue,
    unitPriceText: retailPriceValue > 0 ? formatCurrency(retailPriceValue) : "$0.00",
    leadTime: formatLeadTime(product?.shippingDays, product?.shippingTime || ""),
    moqText: "1 unit",
    depositValue: "",
    depositTerms: "",
  };
};

const getPaymentUrl = (productId, mode) =>
  `${routes.payment || "/payment"}?id=${encodeURIComponent(productId)}&mode=${encodeURIComponent(mode)}`;

const getRetailCheckoutPaymentMethods = () =>
  getConfiguredCheckoutPaymentMethods().filter((method) =>
    RETAIL_CHECKOUT_SUPPORTED_METHODS.some(
      (supportedMethod) => normalizePaymentMethodName(supportedMethod) === normalizePaymentMethodName(method)
    )
  );

const renderCheckoutPaymentMethods = () => {
  if (!checkoutPaymentMethods || !checkoutPaymentMethodGrid) {
    return;
  }

  if (currentPurchaseMode !== "retail") {
    checkoutPaymentMethods.hidden = true;
    checkoutPaymentMethodGrid.innerHTML = "";
    return;
  }

  const availableMethods = getRetailCheckoutPaymentMethods();
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
    : `<div class="checkout-note-box"><strong>No payment methods enabled</strong><p>Please contact our team before placing a retail order.</p></div>`;
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
  `;

  renderProductSummary(currentProduct);
};

const syncCheckoutModeUi = () => {
  if (currentPurchaseMode === "retail") {
    const availableMethods = getRetailCheckoutPaymentMethods();
    currentCheckoutPaymentMethod = getSelectedCheckoutPaymentMethod();
    if (!availableMethods.length) {
      setCheckoutActionState("No Payment Methods Available", true);
      if (checkoutNextStepNote) {
        checkoutNextStepNote.textContent =
          "No retail payment methods are currently enabled. Please contact our team for manual assistance.";
      }
      return;
    }
    const isBankTransfer = currentCheckoutPaymentMethod === "Bank Transfer";
    setCheckoutActionState(
      isSubmittingOrder
        ? isBankTransfer
          ? "Creating Bank Transfer..."
          : "Preparing PayPal..."
        : isBankTransfer
          ? "Continue to Bank Transfer"
          : "Pay with PayPal",
      isSubmittingOrder
    );
    if (checkoutNextStepNote) {
      checkoutNextStepNote.textContent = isBankTransfer
        ? "Your order will be created first, then you will be redirected to the payment page with WorldFirst bank transfer instructions."
        : "Your retail order will be created first, then you will be redirected to PayPal Checkout.";
    }
    return;
  }

  setCheckoutActionState(isSubmittingOrder ? "Creating order..." : "Continue to Payment", isSubmittingOrder);
  if (checkoutNextStepNote) {
    checkoutNextStepNote.textContent = "Your order details will be reviewed on the next step before any payment method is selected.";
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
    }, 800);

    renderTotals();
  });

  quantityInput?.addEventListener("change", () => {
    window.clearTimeout(quantityValidationTimer);
    enforceMinimumQuantity(true);
    renderTotals();
  });

  quantityInput?.addEventListener("blur", () => {
    window.clearTimeout(quantityValidationTimer);
    enforceMinimumQuantity(true);
    renderTotals();
  });

  checkoutPaymentMethodGrid?.addEventListener("change", () => {
    currentCheckoutPaymentMethod = getSelectedCheckoutPaymentMethod();
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

    if (currentPurchaseMode === "retail" && !getRetailCheckoutPaymentMethods().length) {
      if (checkoutStatus) {
        checkoutStatus.textContent = "No retail payment methods are currently enabled.";
      }
      return;
    }

    currentCheckoutPaymentMethod = getSelectedCheckoutPaymentMethod();
    const originalButtonLabel =
      currentPurchaseMode === "retail"
        ? currentCheckoutPaymentMethod === "Bank Transfer"
          ? "Continue to Bank Transfer"
          : "Pay with PayPal"
        : "Continue to Payment";
    let createdOrderId = "";

    try {
      isSubmittingOrder = true;
      setCheckoutActionState(
        currentPurchaseMode === "retail"
          ? currentCheckoutPaymentMethod === "Bank Transfer"
            ? "Creating Bank Transfer..."
            : "Preparing PayPal..."
          : "Creating order...",
        true
      );
    if (checkoutStatus) {
      checkoutStatus.textContent = currentPurchaseMode === "retail"
        ? !getRetailCheckoutPaymentMethods().length
          ? "No retail payment methods are currently available."
          : currentCheckoutPaymentMethod === "Bank Transfer"
            ? "Creating order and preparing bank transfer details..."
            : "Creating order and preparing PayPal..."
        : "Creating order...";
      }

      const quantity = enforceMinimumQuantity(true);
      renderTotals();
      const summary = getCheckoutViewModel(currentProduct, currentPurchaseMode, quantity);
      const subtotal = summary.unitPriceValue * quantity;
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
            quantity: String(quantity),
            message: String(formData.get("notes") || "").trim(),
            paymentMethod: currentPurchaseMode === "retail" ? currentCheckoutPaymentMethod : "",
          },
        }),
      });
      const createdOrder = payload?.order;
      createdOrderId = String(createdOrder?.id || "").trim();

      if (!createdOrderId) {
        throw new Error("Order was not created.");
      }

      if (currentPurchaseMode === "retail" && currentCheckoutPaymentMethod !== "Bank Transfer") {
        const paypalPayload = await requestJson("/api/paypal/create-order", {
          method: "POST",
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
            ? "Redirecting to bank transfer instructions..."
            : "Redirecting to payment...";
      }

      window.location.href = `${routes.payment || "/payment"}?orderId=${encodeURIComponent(createdOrderId)}`;
    } catch (error) {
      console.error("Checkout order creation failed:", error);
      if (checkoutStatus) {
        checkoutStatus.textContent = createdOrderId && currentPurchaseMode === "retail"
          ? `Order created, but PayPal could not be started: ${error?.message || "Unknown error."}`
          : `Unable to create the order: ${error?.message || "Unknown error."}`;
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
  currentMinimumQuantity = currentPurchaseMode === "wholesale"
    ? Math.max(1, Number(currentProduct.b2b?.wholesaleMoq || 1))
    : 1;
  currentCheckoutPaymentMethod = getRetailCheckoutPaymentMethods()[0] || "";

  if (quantityInput) {
    quantityInput.min = String(currentMinimumQuantity);
    quantityInput.value = String(currentMinimumQuantity);
  }

  if (quantityNote) {
    quantityNote.textContent =
      currentPurchaseMode === "wholesale"
        ? `Wholesale orders start at ${currentMinimumQuantity} units.`
        : "Retail quantity can be adjusted from 1 unit upward.";
  }

  renderTotals();
  renderCheckoutPaymentMethods();
  syncCheckoutModeUi();
};

setupNavigation();
setupRevealAnimations();
setupCheckoutForm();
syncNavbarState();
window.addEventListener("scroll", syncNavbarState, { passive: true });
initCheckoutPage();
