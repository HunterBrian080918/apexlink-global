(function () {
  const root = document.documentElement;
  const ENTER_CLASS = "page-transition-entered";
  const EXIT_CLASS = "page-transition-exit";
  const INIT_CLASS = "page-transition-init";
  const EXIT_DURATION = 350;
  let isExiting = false;

  root.classList.add(INIT_CLASS);

  const isReducedMotion = () =>
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const enterPage = () => {
    window.setTimeout(() => {
      root.classList.add(ENTER_CLASS);
      root.classList.remove(EXIT_CLASS);
    }, 24);
  };

  const navigate = (targetUrl) => {
    if (!targetUrl) {
      return;
    }

    if (isReducedMotion()) {
      window.location.href = targetUrl;
      return;
    }

    if (isExiting) {
      return;
    }

    isExiting = true;
    root.classList.remove(ENTER_CLASS);
    root.classList.add(EXIT_CLASS);

    window.setTimeout(() => {
      window.location.href = targetUrl;
    }, EXIT_DURATION);
  };

  const shouldInterceptLink = (link, event) => {
    if (!link || event.defaultPrevented || isExiting) {
      return false;
    }

    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return false;
    }

    if (link.target && link.target !== "_self") {
      return false;
    }

    if (link.hasAttribute("download") || link.dataset.noTransition !== undefined) {
      return false;
    }

    const href = link.getAttribute("href");

    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return false;
    }

    const nextUrl = new URL(link.href, window.location.href);
    const currentUrl = new URL(window.location.href);

    if (nextUrl.origin !== currentUrl.origin) {
      return false;
    }

    if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) {
      return false;
    }

    return true;
  };

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");

    if (!shouldInterceptLink(link, event)) {
      return;
    }

    event.preventDefault();
    navigate(link.href);
  });

  window.addEventListener("pageshow", () => {
    isExiting = false;
    root.classList.remove(EXIT_CLASS);
    enterPage();
  });

  const pageTransitionApi = {
    navigate,
  };

  window.PageTransition = pageTransitionApi;
  globalThis.PageTransition = pageTransitionApi;

  enterPage();
})();
