(function () {
  const VISITOR_ID_KEY = "avelixlink-visitor-id";
  const VISIT_WINDOW_KEY = "avelixlink-visit-window-v1";
  const VISIT_COOLDOWN_MS = 15 * 60 * 1000;
  const ROUTES = {
    home: "/",
    about: "/about",
    terms: "/terms",
    privacy: "/privacy",
    shippingPolicy: "/shipping",
    returnsRefunds: "/refund",
    aiMatch: "/workspace-finder",
    products: "/products",
    support: "/support",
    contact: "/contact",
    admin: "/admin",
    results: "/results",
    detail: "/detail",
    checkout: "/checkout",
    payment: "/payment",
  };

  const routeAliases = {
    "/": "/",
    "/index": "/",
    "/index.html": "/",
    "/about": "/about",
    "/about.html": "/about",
    "/terms": "/terms",
    "/terms.html": "/terms",
    "/shipping": "/shipping",
    "/shipping.html": "/shipping",
    "/privacy": "/privacy",
    "/privacy.html": "/privacy",
    "/shipping-policy": "/shipping-policy",
    "/shipping-policy.html": "/shipping-policy",
    "/refund": "/refund",
    "/refund.html": "/refund",
    "/returns-refunds": "/returns-refunds",
    "/returns-refunds.html": "/returns-refunds",
    "/workspace-finder": "/workspace-finder",
    "/workspace-finder.html": "/workspace-finder",
    "/products": "/products",
    "/products.html": "/products",
    "/support": "/support",
    "/support.html": "/support",
    "/contact": "/contact",
    "/contact.html": "/contact",
    "/admin": "/admin",
    "/admin/": "/admin",
    "/admin/index.html": "/admin",
    "/results": "/results",
    "/results.html": "/results",
    "/detail": "/detail",
    "/detail.html": "/detail",
    "/checkout": "/checkout",
    "/checkout.html": "/checkout",
    "/payment": "/payment",
    "/payment.html": "/payment",
  };

  const resolveActiveRoute = (pathname) => routeAliases[pathname] || pathname.replace(/\/+$/, "") || "/";

  const getNavRoute = (activeRoute) => {
    if (
      activeRoute === ROUTES.results ||
      activeRoute === ROUTES.detail ||
      activeRoute === ROUTES.checkout ||
      activeRoute === ROUTES.payment
    ) {
      return ROUTES.products;
    }

    if (
      activeRoute === ROUTES.terms ||
      activeRoute === ROUTES.privacy ||
      activeRoute === ROUTES.shippingPolicy ||
      activeRoute === ROUTES.returnsRefunds ||
      activeRoute === "/shipping-policy" ||
      activeRoute === "/returns-refunds"
    ) {
      return ROUTES.about;
    }

    return activeRoute;
  };

  const currentRoute = getNavRoute(resolveActiveRoute(window.location.pathname));
  const isPublicPage = !currentRoute.startsWith("/admin");
  const navItems = [
    { label: "Home", href: ROUTES.home, route: ROUTES.home },
    { label: "Products", href: ROUTES.products, route: ROUTES.products },
    { label: "About", href: ROUTES.about, route: ROUTES.about },
    { label: "Support", href: ROUTES.support, route: ROUTES.support },
    { label: "Contact", href: ROUTES.contact, route: ROUTES.contact },
  ];

  const getNavMarkup = (navId) => `
    <nav class="navbar container">
      <a class="logo" href="${ROUTES.home}" aria-label="AvelixLink Home">
        <span class="logo-mark">
          <img src="/assets/brand/avelixlink-mark.png" alt="AvelixLink mark">
        </span>
        <span class="logo-text">
          <strong>AvelixLink</strong>
          <span></span>
        </span>
      </a>

      <button
        class="nav-toggle"
        type="button"
        aria-controls="${navId}"
        aria-expanded="false"
        aria-label="Open navigation"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <div class="nav-links" id="${navId}">
        ${navItems
          .map(
            (item) => `
              <a
                href="${item.href}"
                class="${currentRoute === item.route ? "is-active" : ""}"
                ${currentRoute === item.route ? 'aria-current="page"' : ""}
              >
                ${item.label}
              </a>
            `
          )
          .join("")}
      </div>
    </nav>
  `;

  const getFooterMarkup = () => `
    <footer class="site-footer">
      <div class="container footer-content">
        <div class="footer-brand-block">
          <strong class="footer-brand-title">AvelixLink</strong>
          <p class="footer-tagline">Better Workspace. Better Work.</p>
          <p class="footer-email">Email: avelixlink@outlook.com</p>
          <p class="footer-copyright">&copy; 2026 AvelixLink. All rights reserved.</p>
        </div>
        <nav class="footer-links" aria-label="Legal and policy links">
          <a href="${ROUTES.terms}">Terms</a>
          <a href="${ROUTES.privacy}">Privacy</a>
          <a href="${ROUTES.shippingPolicy}">Shipping</a>
          <a href="${ROUTES.returnsRefunds}">Returns &amp; Refunds</a>
        </nav>
      </div>
    </footer>
  `;

  const getSupportFabMarkup = () => `
    <a class="support-fab" href="${ROUTES.support}" aria-label="Open Support Page">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3C6.48 3 2 6.94 2 11.8c0 2.77 1.45 5.24 3.72 6.86V22l3.24-1.78c.98.27 2 .41 3.04.41 5.52 0 10-3.94 10-8.83S17.52 3 12 3zm-4.2 7.54h8.4a.9.9 0 1 1 0 1.8H7.8a.9.9 0 1 1 0-1.8zm5.4 4.26H7.8a.9.9 0 1 1 0-1.8h5.4a.9.9 0 1 1 0 1.8z"/>
      </svg>
    </a>
  `;

  if (isPublicPage) {
    document.querySelectorAll("[data-public-nav]").forEach((node, index) => {
      const navId = node.getAttribute("data-nav-id") || `public-navigation-${index + 1}`;
      node.outerHTML = getNavMarkup(navId);
    });

    document.querySelectorAll("[data-public-footer]").forEach((node) => {
      node.outerHTML = getFooterMarkup();
    });

    document.querySelectorAll("[data-support-fab]").forEach((node) => {
      node.outerHTML = getSupportFabMarkup();
    });
  }

  const getStorage = () => {
    try {
      return window.localStorage;
    } catch (error) {
      return null;
    }
  };

  const getVisitorId = () => {
    const storage = getStorage();
    const existing = storage?.getItem(VISITOR_ID_KEY);
    if (existing) {
      return existing;
    }

    const generated =
      typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    storage?.setItem(VISITOR_ID_KEY, generated);
    return generated;
  };

  const readVisitWindow = () => {
    const storage = getStorage();
    if (!storage) {
      return null;
    }

    try {
      const parsed = JSON.parse(storage.getItem(VISIT_WINDOW_KEY) || "null");
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
      return null;
    }
  };

  const writeVisitWindow = (value) => {
    const storage = getStorage();
    if (!storage) {
      return;
    }
    storage.setItem(VISIT_WINDOW_KEY, JSON.stringify(value));
  };

  const getDeviceType = () => {
    const userAgent = String(window.navigator.userAgent || "").toLowerCase();
    if (/ipad|tablet|kindle|playbook|silk/i.test(userAgent)) {
      return "tablet";
    }
    if (/mobile|iphone|android|ipod|blackberry|opera mini|iemobile/i.test(userAgent)) {
      return "mobile";
    }
    return "desktop";
  };

  const shouldSkipVisitTrack = () => {
    const lastWindow = readVisitWindow();
    if (!lastWindow) {
      return false;
    }

    return (
      lastWindow.hostname === window.location.hostname &&
      lastWindow.pathname === window.location.pathname &&
      Date.now() - Number(lastWindow.trackedAt || 0) < VISIT_COOLDOWN_MS
    );
  };

  const buildVisitPayload = () => ({
    path: `${window.location.pathname}${window.location.search || ""}`,
    url: window.location.href,
    referrer: document.referrer || "",
    userAgent: window.navigator.userAgent || "",
    deviceType: getDeviceType(),
    visitorId: getVisitorId(),
    pageViewId:
      typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `pv-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
  });

  const sendVisitPayload = (payload) => {
    const body = JSON.stringify(payload);
    const blob = new Blob([body], { type: "application/json" });

    if (typeof navigator.sendBeacon === "function") {
      try {
        return navigator.sendBeacon("/api/analytics/visit", blob);
      } catch (error) {
        // Fall back to fetch below.
      }
    }

    fetch("/api/analytics/visit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      keepalive: true,
      body,
    }).catch(() => {});

    return true;
  };

  const trackVisit = () => {
    if (!isPublicPage || shouldSkipVisitTrack()) {
      return false;
    }

    const payload = buildVisitPayload();
    const sent = sendVisitPayload(payload);
    if (sent) {
      writeVisitWindow({
        hostname: window.location.hostname,
        pathname: window.location.pathname,
        trackedAt: Date.now(),
      });
    }
    return sent;
  };

  if (isPublicPage) {
    window.setTimeout(trackVisit, 0);
  }

  window.ApexLinkRoutes = {
    ...ROUTES,
    currentRoute,
    detail: (id) => `${ROUTES.detail}?id=${encodeURIComponent(id)}`,
    checkout: (id) => `${ROUTES.checkout}?id=${encodeURIComponent(id)}`,
    payment: ROUTES.payment,
    terms: ROUTES.terms,
    privacy: ROUTES.privacy,
    shippingPolicy: ROUTES.shippingPolicy,
    returnsRefunds: ROUTES.returnsRefunds,
  };
  window.AvelixAnalytics = {
    trackVisit,
  };
})();
