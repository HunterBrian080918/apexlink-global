document.body.classList.add("has-js");

const navbar = document.querySelector(".navbar");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const menuItems = document.querySelectorAll(".nav-links a");
const productRoot = document.querySelector("#payment-product");
const totalsRoot = document.querySelector("#payment-totals");
const paymentMethodGrid = document.querySelector("#payment-method-grid");
const paymentForm = document.querySelector("#payment-form");
const paymentStatus = document.querySelector("#payment-status");
const buyerDetailsRoot = document.querySelector("#payment-buyer-details");
const backLink = document.querySelector("#payment-back-link");
const routes = window.ApexLinkRoutes || {
  products: "/products",
  checkout: "/checkout",
};

let currentOrder = null;
let currentProduct = null;
let isSubmittingPayment = false;
let currentPayments = [];
let currentSiteSettings = null;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

const fetchOrderPayments = async (orderId) => {
  const payload = await requestJson(`/api/orders/${encodeURIComponent(orderId)}/payments`, {
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

const formatCurrency = (value) => `$${Number(String(value || "").replace(/[^\d.-]/g, "") || 0).toFixed(2)}`;

const getPaymentMethods = (mode) => {
  const configured = Array.isArray(currentSiteSettings?.paymentMethods)
    ? currentSiteSettings.paymentMethods.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (configured.length) {
    return configured;
  }

  return mode === "wholesale" ? ["PayPal Invoice", "Bank Transfer"] : ["PayPal"];
};

const hasDepositConfiguration = (order) => {
  const depositPercentage = Number(String(order?.depositPercentage || "").replace(/[^\d.-]/g, "") || 0);
  const depositAmount = Number(String(order?.depositAmount || "").replace(/[^\d.-]/g, "") || 0);
  return depositPercentage > 0 || depositAmount > 0;
};

const getNextPaymentType = (order, payments) => {
  if ((order?.purchaseMode || "") !== "wholesale") {
    return payments.some((payment) => payment.paymentType === "full-payment") ? "" : "full-payment";
  }

  if (!hasDepositConfiguration(order)) {
    return payments.some((payment) => payment.paymentType === "full-payment") ? "" : "full-payment";
  }

  const hasDeposit = payments.some((payment) => payment.paymentType === "deposit");
  const hasBalance = payments.some((payment) => payment.paymentType === "balance");
  if (!hasDeposit) {
    return "deposit";
  }

  if (!hasBalance) {
    return "balance";
  }

  return "";
};

const isPaymentFlowComplete = (order, payments) => {
  const nextType = getNextPaymentType(order, payments);
  return !nextType;
};

const getPaymentTypeLabel = (type) =>
  ({
    deposit: "Deposit",
    "full-payment": "Full Payment",
    balance: "Balance",
    refund: "Refund",
  }[String(type || "").trim().toLowerCase()] || "Full Payment");

const renderPaymentMethods = (mode, selectedMethod = "") => {
  if (!paymentMethodGrid) {
    return;
  }

  const methods = getPaymentMethods(mode);
  paymentMethodGrid.innerHTML = methods
    .map(
      (method, index) => `
        <label class="payment-method-card">
          <input
            type="radio"
            name="paymentMethod"
            value="${escapeHtml(method)}"
            ${selectedMethod ? (selectedMethod === method ? "checked" : "") : index === 0 ? "checked" : ""}
          >
          <span class="payment-method-indicator" aria-hidden="true"></span>
          <span class="payment-method-label">${escapeHtml(method)}</span>
        </label>
      `
    )
    .join("");
};

const renderBuyerDetails = (order) => {
  if (!buyerDetailsRoot || !order) {
    return;
  }

  buyerDetailsRoot.innerHTML = `
    <strong>Buyer and Shipping Details</strong>
    <div class="checkout-summary-facts compact">
      <div>
        <span>Buyer</span>
        <strong>${escapeHtml(order.customerName || "-")}</strong>
      </div>
      <div>
        <span>Email</span>
        <strong>${escapeHtml(order.email || "-")}</strong>
      </div>
      <div>
        <span>Phone</span>
        <strong>${escapeHtml(order.phone || "-")}</strong>
      </div>
      <div>
        <span>Country / Region</span>
        <strong>${escapeHtml(order.country || "-")}</strong>
      </div>
      <div class="checkout-summary-row full">
        <span>Shipping Address</span>
        <strong>${escapeHtml(order.shippingAddress || "-")}</strong>
      </div>
      ${
        order.message
          ? `
            <div class="checkout-summary-row full">
              <span>Notes</span>
              <strong>${escapeHtml(order.message)}</strong>
            </div>
          `
          : ""
      }
    </div>
  `;
};

const buildPaymentRecordPayload = (order, paymentType, paymentMethod) => {
  const orderSubtotal = Number(String(order.subtotal || order.budget || "$0.00").replace(/[^\d.-]/g, "") || 0);
  const depositPercentage = Number(String(order.depositPercentage || "").replace(/[^\d.-]/g, "") || 0);
  const depositAmount =
    paymentType === "deposit" && depositPercentage > 0 ? (orderSubtotal * depositPercentage) / 100 : 0;
  const balanceAmount =
    paymentType === "balance" && depositPercentage > 0 ? Math.max(0, orderSubtotal - (orderSubtotal * depositPercentage) / 100) : 0;
  const amount =
    paymentType === "deposit"
      ? depositAmount || orderSubtotal
      : paymentType === "balance"
        ? balanceAmount || orderSubtotal
        : orderSubtotal;

  return {
    orderId: order.orderId || order.id,
    product: order.productName || "",
    customer: order.customerName || "",
    customerEmail: order.email || "",
    customerPhone: order.phone || "",
    orderType: order.purchaseMode || "retail",
    paymentMethod,
    paymentType,
    amount,
    currency: order.currency || "USD",
    depositAmount,
    balanceAmount,
    billingAddress: order.shippingAddress || "",
    status: "pending",
  };
};

const renderProductSummary = (product, order) => {
  if (!productRoot || !product || !order) {
    return;
  }

  productRoot.innerHTML = `
    <div class="checkout-product-media">
      <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
    </div>
    <div class="checkout-product-copy">
      <h3>${escapeHtml(product.name)}</h3>
    </div>
  `;
};

const renderTotals = (order) => {
  if (!totalsRoot || !order) {
    return;
  }

  totalsRoot.innerHTML = `
    <div class="checkout-total-row">
      <span>Mode</span>
      <strong>${escapeHtml(order.purchaseMode === "wholesale" ? "Wholesale" : "Retail")}</strong>
    </div>
    <div class="checkout-total-row">
      <span>Unit Price</span>
      <strong>${escapeHtml(order.unitPrice || "$0.00")}</strong>
    </div>
    <div class="checkout-total-row">
      <span>Quantity</span>
      <strong>${escapeHtml(order.quantity || 1)}</strong>
    </div>
    <div class="checkout-total-row">
      <span>Subtotal</span>
      <strong>${escapeHtml(order.subtotal || "$0.00")}</strong>
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

  if (buyerDetailsRoot) {
    buyerDetailsRoot.innerHTML = "";
  }

  if (paymentMethodGrid) {
    paymentMethodGrid.innerHTML = "";
  }
};

const buildCheckoutUrl = (order) =>
  `${routes.checkout || "/checkout"}?id=${encodeURIComponent(order.productId)}&mode=${encodeURIComponent(
    order.purchaseMode || "retail"
  )}`;

const setupPaymentForm = () => {
  paymentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmittingPayment || !currentOrder?.id) {
      return;
    }

    const submitButton = paymentForm.querySelector('button[type="submit"]');

    try {
      isSubmittingPayment = true;
      if (submitButton) {
        submitButton.disabled = true;
      }
      if (paymentStatus) {
        paymentStatus.textContent = "";
      }

      const formData = new FormData(paymentForm);
      const paymentMethod = String(formData.get("paymentMethod") || "").trim();

      if (!paymentMethod) {
        throw new Error("No payment method selected.");
      }

      const paymentType = getNextPaymentType(currentOrder, currentPayments);
      if (!paymentType) {
        throw new Error("All required payment records have already been created.");
      }

      const paymentPayload = buildPaymentRecordPayload(currentOrder, paymentType, paymentMethod);
      const payload = await requestJson(`/api/orders/${encodeURIComponent(currentOrder.id)}/payments`, {
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
        paymentStatus.textContent = `${getPaymentTypeLabel(paymentRecord.paymentType)} record created. The order remains pending until manual confirmation.`;
      }

      renderPaymentMethods(currentOrder.purchaseMode || "retail", paymentMethod);
      if (submitButton) {
        const isComplete = isPaymentFlowComplete(currentOrder, currentPayments);
        submitButton.disabled = isComplete;
        submitButton.textContent = isComplete ? "Payment Method Confirmed" : "Confirm Payment Method";
      }
    } catch (error) {
      console.error("Payment method update failed:", error);
      if (paymentStatus) {
        paymentStatus.textContent = `Unable to save the payment method: ${error?.message || "Unknown error."}`;
      }
      if (submitButton) {
        submitButton.disabled = false;
      }
      isSubmittingPayment = false;
      return;
    }

    if (submitButton) {
      submitButton.disabled = false;
    }
    isSubmittingPayment = false;
  });
};

const initPaymentPage = async () => {
  const store = window.NorthstarStore;

  if (!store) {
    return;
  }

  await store.ready;
  await store.trackVisit();
  const [website, settings] = await Promise.all([store.getWebsiteSettings(), store.getSettings()]);
  currentSiteSettings = settings;
  const params = new URLSearchParams(window.location.search);
  const orderId = String(params.get("orderId") || "").trim();

  if (!orderId) {
    renderEmptyState();
    return;
  }

  const payload = await requestJson(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
  });
  currentOrder = payload?.order || null;
  if (!currentOrder?.id) {
    renderEmptyState("The requested order could not be loaded.");
    return;
  }

  currentProduct = await store.getProductById(currentOrder.productId);
  if (!currentProduct) {
    renderEmptyState("The selected product for this order could not be loaded.");
    return;
  }

  document.title = `Payment | ${website?.brand?.name || "ApexLink Global"}`;
  currentPayments = await fetchOrderPayments(currentOrder.id);
  if (backLink) {
    backLink.href = buildCheckoutUrl(currentOrder);
  }

  renderProductSummary(currentProduct, currentOrder);
  renderTotals(currentOrder);
  renderBuyerDetails(currentOrder);
  renderPaymentMethods(currentOrder.purchaseMode || "retail", currentOrder.paymentMethod || "");

  if (currentPayments.length) {
    const submitButton = paymentForm?.querySelector('button[type="submit"]');
    if (submitButton) {
      const isComplete = isPaymentFlowComplete(currentOrder, currentPayments);
      submitButton.disabled = isComplete;
      submitButton.textContent = isComplete ? "Payment Method Confirmed" : "Confirm Payment Method";
    }
  }
};

setupNavigation();
setupRevealAnimations();
setupPaymentForm();
syncNavbarState();
window.addEventListener("scroll", syncNavbarState, { passive: true });
initPaymentPage();
