document.body.classList.add("has-js");

const navbar = document.querySelector(".navbar");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const menuItems = document.querySelectorAll(".nav-links a");
const chatWindow = document.querySelector("#chat-window");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatSubmitButton = chatForm?.querySelector('button[type="submit"]');
const supportIdentityPanel = document.querySelector("#support-identity-panel");
const supportIdentityForm = document.querySelector("#support-identity-form");
const supportNameInput = document.querySelector("#support-name");
const supportEmailInput = document.querySelector("#support-email");
const supportPhoneInput = document.querySelector("#support-phone");
const supportCountryInput = document.querySelector("#support-country");
const supportSubjectInput = document.querySelector("#support-subject");
const supportFormStatus = document.querySelector("#support-form-status");

const VISITOR_THREAD_ID_KEY = "northstar-visitor-thread-id";
const SUPPORT_PROFILE_KEY = "northstar-support-profile-v1";
const PLATFORM_STORAGE_KEY = "northstar-platform-store-v1";
const assistantAvatar = "assets/brand/avelixlink-favicon.png";
const SUPPORT_MESSAGE_POLL_INTERVAL_MS = 2000;

let currentConversation = null;
let currentMessages = [];
let isSending = false;
let isLoadingConversation = false;
let noticeTimer = null;
let supportPollTimer = null;
let lastRenderedMessageSignature = "";
let isPollingConversation = false;
let supportConnectionState = "offline";
let supportNoticeMessage = "";
let supportNoticeType = "neutral";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === "object" && payload.error
        ? payload.error
        : `Request failed with status ${response.status}`;
    const requestError = new Error(errorMessage);
    requestError.status = response.status;
    requestError.payload = payload;
    throw requestError;
  }

  return payload;
};
const nowMs = () => performance.now();
const durationMs = (startedAt) => Math.round(nowMs() - startedAt);
const logSupportClientTiming = (scope, timings) => {
  try {
    console.info(`[support][client][${scope}] ${JSON.stringify(timings)}`);
  } catch (error) {
    console.info(`[support][client][${scope}]`, timings);
  }
};

const loadSupportProfile = () => {
  try {
    const rawValue = window.localStorage.getItem(SUPPORT_PROFILE_KEY);
    if (!rawValue) {
      return {
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        customerCountry: "",
        subject: "",
      };
    }

    const parsed = JSON.parse(rawValue);
    return {
      customerName: String(parsed?.customerName || ""),
      customerEmail: String(parsed?.customerEmail || ""),
      customerPhone: String(parsed?.customerPhone || ""),
      customerCountry: String(parsed?.customerCountry || ""),
      subject: String(parsed?.subject || ""),
    };
  } catch (error) {
    return {
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      customerCountry: "",
      subject: "",
    };
  }
};

const cleanupLegacySupportStorage = () => {
  try {
    const rawValue = window.localStorage.getItem(PLATFORM_STORAGE_KEY);
    window.localStorage.removeItem("northstar-support-legacy-cleaned-v1");
    if (!rawValue) {
      return;
    }

    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return;
    }

    let changed = false;

    if (Array.isArray(parsed.messages) && parsed.messages.length) {
      parsed.messages = [];
      changed = true;
    } else if ("messages" in parsed && !Array.isArray(parsed.messages)) {
      parsed.messages = [];
      changed = true;
    }

    if (changed) {
      window.localStorage.setItem(PLATFORM_STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch (error) {
    console.warn("[support] legacy support cleanup failed:", error);
  }
};

const saveSupportProfile = (profile) => {
  try {
    window.localStorage.setItem(
      SUPPORT_PROFILE_KEY,
      JSON.stringify({
        customerName: String(profile?.customerName || "").trim(),
        customerEmail: String(profile?.customerEmail || "").trim(),
        customerPhone: String(profile?.customerPhone || "").trim(),
        customerCountry: String(profile?.customerCountry || "").trim(),
        subject: String(profile?.subject || "").trim(),
      })
    );
  } catch (error) {
    console.warn("[support] unable to persist support profile:", error);
  }
};

const hydrateSupportProfileForm = () => {
  const profile = loadSupportProfile();

  if (supportNameInput) {
    supportNameInput.value = profile.customerName;
  }
  if (supportEmailInput) {
    supportEmailInput.value = profile.customerEmail;
  }
  if (supportPhoneInput) {
    supportPhoneInput.value = profile.customerPhone;
  }
  if (supportCountryInput) {
    supportCountryInput.value = profile.customerCountry;
  }
  if (supportSubjectInput) {
    supportSubjectInput.value = profile.subject;
  }
};

const getSupportProfileFromForm = () => ({
  customerName: String(supportNameInput?.value || "").trim(),
  customerEmail: String(supportEmailInput?.value || "").trim(),
  customerPhone: String(supportPhoneInput?.value || "").trim(),
  customerCountry: String(supportCountryInput?.value || "").trim(),
  subject: String(supportSubjectInput?.value || "").trim(),
});

const validateSupportProfile = () => {
  const profile = getSupportProfileFromForm();

  if (!profile.customerName) {
    throw new Error("Name is required before sending your first message.");
  }

  if (!profile.customerEmail) {
    throw new Error("Email is required before sending your first message.");
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(profile.customerEmail)) {
    throw new Error("Please enter a valid email address.");
  }

  return profile;
};

const formatMessageTime = (value) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const scrollChatToBottom = () => {
  if (!chatWindow) {
    return;
  }

  chatWindow.scrollTop = chatWindow.scrollHeight;
};

const isChatNearBottom = (threshold = 72) => {
  if (!chatWindow) {
    return true;
  }

  const remaining = chatWindow.scrollHeight - chatWindow.scrollTop - chatWindow.clientHeight;
  return remaining <= threshold;
};

const renderSupportStatus = () => {
  if (!supportFormStatus) {
    return;
  }

  const connectionLabels = {
    connecting: "Connecting...",
    connected: "Connected",
    reconnecting: "Reconnecting...",
    offline: "Offline",
  };
  const connectionMessage = connectionLabels[supportConnectionState] || "";
  const parts = [supportNoticeMessage, connectionMessage].filter(Boolean);
  const nextState =
    supportNoticeMessage
      ? supportNoticeType
      : supportConnectionState === "connected"
        ? "success"
        : supportConnectionState === "offline"
          ? "error"
          : "neutral";

  supportFormStatus.textContent = parts.join(" · ");
  supportFormStatus.dataset.state = nextState;
};

const setSupportStatus = (message, type = "neutral") => {
  supportNoticeMessage = String(message || "");
  supportNoticeType = type;
  renderSupportStatus();
};

const setSupportConnectionState = (state) => {
  supportConnectionState = String(state || "offline").trim().toLowerCase();
  renderSupportStatus();
};

const clearSupportStatus = () => {
  supportNoticeMessage = "";
  supportNoticeType = "neutral";
  renderSupportStatus();
};

const showTemporaryNotice = (message) => {
  setSupportStatus(message, "success");
  if (noticeTimer) {
    window.clearTimeout(noticeTimer);
  }
  noticeTimer = window.setTimeout(() => {
    clearSupportStatus();
  }, 5000);
};

const renderWelcomeState = () => {
  if (!chatWindow) {
    return;
  }

  const now = new Date().toISOString();
  const currentTime = formatMessageTime(now);
  chatWindow.innerHTML = `
    <article class="chat-message chat-message-assistant">
      <div class="chat-avatar" aria-hidden="true">
        <img src="${assistantAvatar}" alt="">
      </div>
      <div class="chat-message-body">
        <div class="chat-bubble">
          <p>Hello. I can help with products, delivery, pricing, payment, and workspace setup questions.</p>
        </div>
        <time class="chat-timestamp" datetime="${now}">${currentTime}</time>
      </div>
    </article>
    <article class="chat-message chat-message-assistant">
      <div class="chat-avatar" aria-hidden="true">
        <img src="${assistantAvatar}" alt="">
      </div>
      <div class="chat-message-body">
        <div class="chat-bubble">
          <p>Start a conversation and our team will reply here.</p>
        </div>
        <time class="chat-timestamp" datetime="${now}">${currentTime}</time>
      </div>
    </article>
  `;

  scrollChatToBottom();
};

const renderInfoState = (message) => {
  if (!chatWindow) {
    return;
  }

  chatWindow.innerHTML = `
    <div class="chat-empty-state">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
};

const createChatMessageMarkup = (item) => {
  const sender = item.sender === "customer" ? "user" : "assistant";
  const timestamp = formatMessageTime(item.createdAt);
  const image = item.imageUrl || item.image;
  const avatar =
    sender === "assistant"
      ? `
        <div class="chat-avatar" aria-hidden="true">
          <img src="${assistantAvatar}" alt="">
        </div>
      `
      : "";

  return `
    <article class="chat-message chat-message-${sender}" data-message-id="${escapeHtml(item.id || "")}">
      ${avatar}
      <div class="chat-message-body">
        <div class="chat-bubble">
          ${image ? `<div class="chat-image-wrap"><img class="chat-image" src="${escapeHtml(image)}" alt="Shared image"></div>` : ""}
          ${item.text ? `<p>${escapeHtml(item.text)}</p>` : ""}
        </div>
        <time class="chat-timestamp"${item.createdAt ? ` datetime="${escapeHtml(item.createdAt)}"` : ""}>${timestamp}</time>
      </div>
    </article>
  `;
};

const renderMessages = (messages) => {
  if (!chatWindow) {
    return;
  }

  if (!Array.isArray(messages) || !messages.length) {
    lastRenderedMessageSignature = "";
    renderWelcomeState();
    return;
  }

  chatWindow.innerHTML = messages.map(createChatMessageMarkup).join("");

  lastRenderedMessageSignature = getMessageSignature(messages);
  scrollChatToBottom();
};

const getMessageSignature = (messages) =>
  (Array.isArray(messages) ? messages : [])
    .map((item) => `${String(item?.id || "")}:${String(item?.createdAt || "")}:${String(item?.sender || "")}`)
    .join("|");
const getLatestMessageId = (messages) => {
  if (!Array.isArray(messages) || !messages.length) {
    return "";
  }
  return String(messages[messages.length - 1]?.id || "");
};

const syncIdentityPanelState = () => {
  const hasConversation = Boolean(currentConversation?.id);
  if (supportIdentityPanel) {
    supportIdentityPanel.hidden = hasConversation;
  }
};

const stopSupportPolling = () => {
  if (supportPollTimer) {
    window.clearInterval(supportPollTimer);
    supportPollTimer = null;
  }
};

const applyConversationSnapshot = (conversation, messages, options = {}) => {
  currentConversation = conversation || null;
  currentMessages = Array.isArray(messages) ? messages : [];
  syncIdentityPanelState();

  const nextSignature = getMessageSignature(currentMessages);
  const shouldForceRender = options.forceRender === true;
  if (shouldForceRender || nextSignature !== lastRenderedMessageSignature) {
    renderMessages(currentMessages);
  }
};

const appendMessagesToChat = (messages, options = {}) => {
  if (!chatWindow || !Array.isArray(messages) || !messages.length) {
    return;
  }

  const shouldAutoScroll = options.forceScroll === true || (options.autoScroll !== false && isChatNearBottom());
  const existingIds = new Set(
    Array.from(chatWindow.querySelectorAll("[data-message-id]")).map((node) => String(node.dataset.messageId || ""))
  );
  const fragment = document.createDocumentFragment();

  messages.forEach((message) => {
    const normalizedId = String(message?.id || "");
    if (normalizedId && existingIds.has(normalizedId)) {
      return;
    }

    const template = document.createElement("template");
    template.innerHTML = createChatMessageMarkup(message).trim();
    if (template.content.firstElementChild) {
      fragment.appendChild(template.content.firstElementChild);
    }
  });

  if (!fragment.childNodes.length) {
    return;
  }

  chatWindow.appendChild(fragment);
  lastRenderedMessageSignature = getMessageSignature(currentMessages);

  if (shouldAutoScroll) {
    scrollChatToBottom();
  }
};

const appendReturnedServerMessage = (conversation, message) => {
  currentConversation = conversation || currentConversation;
  if (!message?.id) {
    applyConversationSnapshot(currentConversation, currentMessages, { forceRender: true });
    return;
  }

  const withoutDuplicate = currentMessages.filter((item) => item.id !== message.id);
  currentMessages = [...withoutDuplicate, message];

  if (!Array.isArray(currentMessages) || currentMessages.length === 1) {
    applyConversationSnapshot(currentConversation, currentMessages, { forceRender: true });
    return;
  }

  syncIdentityPanelState();
  appendMessagesToChat([message], {
    forceScroll: true,
  });
};

const fetchConversationSnapshot = async (conversationId) => {
  const normalizedId = String(conversationId || "").trim();
  if (!normalizedId) {
    throw new Error("Support conversation id is required.");
  }

  const [conversationPayload, messagesPayload] = await Promise.all([
    requestJson(`/api/support/conversations/${encodeURIComponent(normalizedId)}`),
    requestJson(`/api/support/conversations/${encodeURIComponent(normalizedId)}/messages`),
  ]);

  const conversation = conversationPayload?.conversation || null;
  const messages = Array.isArray(messagesPayload?.messages) ? messagesPayload.messages : [];

  if (!conversation?.id) {
    throw new Error("Support conversation not found.");
  }

  return {
    conversation,
    messages,
  };
};

const fetchConversationMessagesOnly = async (conversationId) => {
  const normalizedId = String(conversationId || "").trim();
  if (!normalizedId) {
    throw new Error("Support conversation id is required.");
  }

  const messagesPayload = await requestJson(`/api/support/conversations/${encodeURIComponent(normalizedId)}/messages`);
  const conversation = messagesPayload?.conversation || null;
  const messages = Array.isArray(messagesPayload?.messages) ? messagesPayload.messages : [];

  if (!conversation?.id) {
    throw new Error("Support conversation not found.");
  }

  return {
    conversation,
    messages,
  };
};

const ensureExistingConversation = async () => {
  if (currentConversation?.id) {
    return currentConversation;
  }

  const storedConversationId = String(window.localStorage.getItem(VISITOR_THREAD_ID_KEY) || "").trim();
  if (!storedConversationId) {
    return null;
  }

  try {
    const snapshot = await fetchConversationSnapshot(storedConversationId);
    applyConversationSnapshot(snapshot.conversation, snapshot.messages, {
      forceRender: !currentMessages.length,
    });
    setSupportConnectionState("connected");
    return snapshot.conversation;
  } catch (error) {
    if (Number(error?.status || 0) === 404) {
      storeConversationId("");
      currentConversation = null;
      currentMessages = [];
      lastRenderedMessageSignature = "";
      renderWelcomeState();
      syncIdentityPanelState();
      return null;
    }

    throw error;
  }
};

const reloadConversationFromServer = async (conversationId, options = {}) => {
  const snapshot = await fetchConversationSnapshot(conversationId);
  applyConversationSnapshot(snapshot.conversation, snapshot.messages, options);
  return snapshot;
};

const pollConversationMessages = async () => {
  if (!currentConversation?.id || isLoadingConversation || isSending || isPollingConversation) {
    return;
  }

  isPollingConversation = true;
  try {
    const snapshot = await fetchConversationMessagesOnly(currentConversation.id);
    const nextMessages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
    const existingIds = new Set((Array.isArray(currentMessages) ? currentMessages : []).map((item) => String(item?.id || "")));
    const nextIds = new Set(nextMessages.map((item) => String(item?.id || "")));
    const newMessages = nextMessages.filter((item) => !existingIds.has(String(item?.id || "")));
    const requiresFullSync =
      nextMessages.length < currentMessages.length ||
      currentMessages.some((item) => !nextIds.has(String(item?.id || "")));

    currentConversation = snapshot.conversation || currentConversation;
    syncIdentityPanelState();
    setSupportConnectionState("connected");

    if (requiresFullSync) {
      applyConversationSnapshot(currentConversation, nextMessages, { forceRender: true });
      return;
    }

    if (newMessages.length) {
      currentMessages = [...currentMessages, ...newMessages];
      appendMessagesToChat(newMessages, {
        autoScroll: true,
      });
    }

    currentConversation = snapshot.conversation || currentConversation;
    currentMessages = nextMessages;
    lastRenderedMessageSignature = getMessageSignature(currentMessages);
  } catch (error) {
    setSupportConnectionState(window.navigator.onLine === false ? "offline" : "reconnecting");
    console.warn("[support] polling failed:", error);
  } finally {
    isPollingConversation = false;
  }
};

const startSupportPolling = () => {
  stopSupportPolling();
  if (!currentConversation?.id) {
    return;
  }

  supportPollTimer = window.setInterval(() => {
    pollConversationMessages();
  }, SUPPORT_MESSAGE_POLL_INTERVAL_MS);
};

const startSupportLiveSync = () => {
  if (!currentConversation?.id) {
    stopSupportPolling();
    setSupportConnectionState("offline");
    return;
  }

  setSupportConnectionState("connected");
  startSupportPolling();
};

const setSendingState = (sending, buttonLabel) => {
  isSending = sending;

  if (chatInput) {
    chatInput.disabled = sending || isLoadingConversation;
  }

  if (chatSubmitButton) {
    chatSubmitButton.disabled = sending || isLoadingConversation;
    const label = chatSubmitButton.querySelector("span");
    if (label) {
      label.textContent = buttonLabel || "Send";
    }
  }
};

const setLoadingConversationState = (loading) => {
  isLoadingConversation = loading;
  if (chatInput) {
    chatInput.disabled = loading || isSending;
  }
  if (chatSubmitButton) {
    chatSubmitButton.disabled = loading || isSending;
  }
};

const storeConversationId = (conversationId) => {
  if (conversationId) {
    window.localStorage.setItem(VISITOR_THREAD_ID_KEY, String(conversationId));
  } else {
    window.localStorage.removeItem(VISITOR_THREAD_ID_KEY);
  }
};

const createSupportConversation = async ({ firstMessage, profile }) => {
  const payload = {
    customerName: profile.customerName,
    customerEmail: profile.customerEmail,
    email: profile.customerEmail,
    customerPhone: profile.customerPhone || undefined,
    customerCountry: profile.customerCountry || undefined,
    country: profile.customerCountry || undefined,
    conversationType: "general_contact",
    subject: profile.subject || undefined,
    firstMessage,
    text: firstMessage,
    source: "support",
  };

  return requestJson("/api/support/conversations", {
    method: "POST",
    body: payload,
  });
};

const createSupportMessage = async (conversationId, text) =>
  requestJson(`/api/support/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: {
      sender: "customer",
      text,
    },
  });

const loadConversationById = async (conversationId) => {
  const normalizedId = String(conversationId || "").trim();
  if (!normalizedId) {
    stopSupportPolling();
    currentConversation = null;
    currentMessages = [];
    lastRenderedMessageSignature = "";
    syncIdentityPanelState();
    renderWelcomeState();
    setSupportConnectionState("offline");
    return;
  }

  setLoadingConversationState(true);
  renderInfoState("Loading conversation...");
  clearSupportStatus();

  try {
    await reloadConversationFromServer(normalizedId, { forceRender: true });
    startSupportLiveSync();
  } catch (error) {
    stopSupportPolling();
    currentConversation = null;
    currentMessages = [];
    lastRenderedMessageSignature = "";
    storeConversationId("");
    syncIdentityPanelState();
    renderWelcomeState();
    setSupportStatus(`Failed to load conversation: ${error?.message || "Unknown error."}`, "error");
  } finally {
    setLoadingConversationState(false);
  }
};

const sendUserMessage = async (message) => {
  const trimmed = String(message || "").trim();

  if (!trimmed || isSending || isLoadingConversation) {
    return false;
  }

  setSendingState(true, "Sending...");
  clearSupportStatus();
  const clickToPostStartMs = 0;

  try {
    let result = null;

    if (!currentConversation?.id) {
      const existingConversation = await ensureExistingConversation();
      if (existingConversation?.id) {
        const postStartedAt = nowMs();
        result = await createSupportMessage(existingConversation.id, trimmed);
        const postDurationMs = durationMs(postStartedAt);
        const renderStartedAt = nowMs();
        appendReturnedServerMessage(result?.conversation || existingConversation, result?.message || null);
        startSupportLiveSync();
        const renderDurationMs = durationMs(renderStartedAt);
        logSupportClientTiming("later_reply_send", {
          click_to_post_start_ms: clickToPostStartMs,
          post_duration_ms: postDurationMs,
          post_success_render_ms: renderDurationMs,
          follow_up_get_duration_ms: 0,
        });
        showTemporaryNotice("Message sent.");
        return true;
      }

      const profile = validateSupportProfile();
      saveSupportProfile(profile);
      const postStartedAt = nowMs();
      result = await createSupportConversation({
        firstMessage: trimmed,
        profile,
      });
      const postDurationMs = durationMs(postStartedAt);

      const conversationId = result?.conversation?.id;
      const message = result?.message || null;
      if (!conversationId) {
        throw new Error("Support conversation was created without an id.");
      }

      storeConversationId(conversationId);
      const renderStartedAt = nowMs();
      appendReturnedServerMessage(result.conversation, message);
      startSupportLiveSync();
      const renderDurationMs = durationMs(renderStartedAt);
      logSupportClientTiming("first_conversation_send", {
        click_to_post_start_ms: clickToPostStartMs,
        post_duration_ms: postDurationMs,
        post_success_render_ms: renderDurationMs,
        follow_up_get_duration_ms: 0,
      });
      showTemporaryNotice("Message sent.");
      return true;
    }

    const postStartedAt = nowMs();
    result = await createSupportMessage(currentConversation.id, trimmed);
    const postDurationMs = durationMs(postStartedAt);
    const renderStartedAt = nowMs();
    appendReturnedServerMessage(result?.conversation || currentConversation, result?.message || null);
    startSupportLiveSync();
    const renderDurationMs = durationMs(renderStartedAt);
    logSupportClientTiming("later_reply_send", {
      click_to_post_start_ms: clickToPostStartMs,
      post_duration_ms: postDurationMs,
      post_success_render_ms: renderDurationMs,
      follow_up_get_duration_ms: 0,
    });
    showTemporaryNotice("Message sent.");
    return true;
  } catch (error) {
    setSupportStatus(`Failed to send message: ${error?.message || "Unknown error."}`, "error");
    return false;
  } finally {
    setSendingState(false, "Send");
  }
};

const setupChat = () => {
  if (!chatForm || !chatInput) {
    return;
  }

  supportIdentityForm?.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  supportIdentityForm?.addEventListener("input", () => {
    saveSupportProfile(getSupportProfileFromForm());
  });

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = chatInput.value;
    const success = await sendUserMessage(value);

    if (success) {
      chatInput.value = "";
    }

    chatInput.focus();
  });

  chatInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatForm.requestSubmit();
    }
  });
};

const initPage = async () => {
  cleanupLegacySupportStorage();
  hydrateSupportProfileForm();

  if (window.NorthstarStore?.ready) {
    try {
      await window.NorthstarStore.ready;
      await window.NorthstarStore.trackVisit();
    } catch (error) {
      console.warn("[support] analytics tracking failed:", error);
    }
  }

  syncIdentityPanelState();

  const storedConversationId = window.localStorage.getItem(VISITOR_THREAD_ID_KEY);
  if (storedConversationId) {
    await loadConversationById(storedConversationId);
    return;
  }

  stopSupportPolling();
  renderWelcomeState();
};

setupNavigation();
setupRevealAnimations();
setupChat();
syncNavbarState();
window.addEventListener("scroll", syncNavbarState, { passive: true });
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !currentConversation?.id) {
    return;
  }

  pollConversationMessages();
});
window.addEventListener("online", () => {
  if (currentConversation?.id) {
    setSupportConnectionState("reconnecting");
    pollConversationMessages();
  } else {
    setSupportConnectionState("offline");
  }
});
window.addEventListener("offline", () => {
  setSupportConnectionState("offline");
});
initPage();
