(function () {
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
      <a class="logo" href="${ROUTES.home}" aria-label="ApexLink Global Home">
        <span class="logo-mark">
          <img src="/assets/brand/apexlink-mark.png" alt="ApexLink Global mark">
        </span>
        <span class="logo-text">
          <strong>ApexLink</strong>
          <span>Global</span>
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
          <strong class="footer-brand-title">ApexLink</strong>
          <p class="footer-tagline">Better Workspace. Better Work.</p>
          <p class="footer-email">Email: ApexLink080918@outlook.com</p>
          <p class="footer-copyright">&copy; 2026 ApexLink. All rights reserved.</p>
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
})();
