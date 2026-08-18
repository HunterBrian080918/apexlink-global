const {
  createPaymentForOrder,
  getPaymentById,
  reviewCryptoPayment,
} = require("./supabase-payments");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ADMIN_KEY = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();

const SUPPORTED_CRYPTO_ASSETS = Object.freeze({
  USDT: ["TRC20"],
});
const CRYPTO_STATUSES = new Set(["waiting", "detected", "confirming", "confirmed", "failed"]);
const DEFAULT_REQUIRED_CONFIRMATIONS = 20;
const getRequiredConfirmations = () => {
  const configured = Number.parseInt(String(process.env.TRON_REQUIRED_CONFIRMATIONS || ""), 10);
  return Number.isInteger(configured) && configured >= DEFAULT_REQUIRED_CONFIRMATIONS
    ? configured
    : DEFAULT_REQUIRED_CONFIRMATIONS;
};

const requireConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
    throw new Error(
      "Crypto payment foundation is not configured. Set SUPABASE_URL and either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return {
    rpcUrl: `${SUPABASE_URL}/rest/v1/rpc`,
    headers: {
      apikey: SUPABASE_ADMIN_KEY,
      Authorization: `Bearer ${SUPABASE_ADMIN_KEY}`,
      "Content-Type": "application/json",
    },
  };
};

const requestRpc = async (functionName, body) => {
  const { rpcUrl, headers } = requireConfig();
  const response = await fetch(`${rpcUrl}/${functionName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = text;
    }
  }

  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload
        ? payload.message || payload.error_description || payload.error || JSON.stringify(payload)
        : text;
    const requestError = new Error(detail || `Supabase RPC failed with status ${response.status}.`);
    requestError.status = response.status;
    requestError.payload = payload;
    throw requestError;
  }

  return payload;
};

const normalizeAsset = (value) => String(value || "USDT").trim().toUpperCase();
const normalizeNetwork = (value) => String(value || "TRC20").trim().toUpperCase();
const normalizeWalletAddress = (value) => String(value || "").trim();
const isValidTrc20Address = (value) => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalizeWalletAddress(value));
const isValidTxHash = (value) => /^[0-9A-Fa-f]{64}$/.test(String(value || "").trim());
const toUsdtUnits = (value) => {
  const normalized = Number(value || 0).toFixed(6);
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0").slice(0, 6));
};

const assertSupportedCrypto = (asset, network) => {
  const normalizedAsset = normalizeAsset(asset);
  const normalizedNetwork = normalizeNetwork(network);
  if (!SUPPORTED_CRYPTO_ASSETS[normalizedAsset]?.includes(normalizedNetwork)) {
    throw new Error("Only USDT on the TRC20 network is supported in this phase.");
  }
  return { asset: normalizedAsset, network: normalizedNetwork };
};

const getConfigurationStatus = () => {
  const monitoringEnabled = String(process.env.CRYPTO_MONITOR_ENABLED || "").trim().toLowerCase() === "true";
  const monitoringConfigured = Boolean(
    String(process.env.TRON_API_URL || "").trim() &&
      String(process.env.TRON_API_KEY || "").trim() &&
      String(process.env.USDT_CONTRACT_ADDRESS || "").trim()
  );
  return {
    provider: "crypto_trc20",
    configured: Boolean(SUPABASE_URL && SUPABASE_ADMIN_KEY),
    enabled: monitoringEnabled && monitoringConfigured,
    monitoringEnabled,
    monitoringConfigured,
    supportedAssets: SUPPORTED_CRYPTO_ASSETS,
  };
};

const getSupportedPaymentOptions = () =>
  Object.entries(SUPPORTED_CRYPTO_ASSETS).flatMap(([asset, networks]) =>
    networks.map((network) => ({ asset, network }))
  );

const createCryptoPaymentRecord = async (orderId, input = {}) => {
  const { asset, network } = assertSupportedCrypto(input.asset, input.network);
  const walletAddress = normalizeWalletAddress(input.walletAddress);
  if (!isValidTrc20Address(walletAddress)) {
    throw new Error("A valid USDT TRC20 receiving address is required.");
  }

  return createPaymentForOrder(orderId, {
    ...input,
    paymentMethod: "USDT Cryptocurrency",
    paymentProvider: "crypto_trc20",
    settlementChannel: network,
    cryptoAsset: asset,
    cryptoNetwork: network,
    cryptoWalletAddress: walletAddress,
    cryptoStatus: "waiting",
    cryptoConfirmations: 0,
    status: "pending_crypto_detection",
  });
};

const updateCryptoDetection = async (paymentId, input = {}) => {
  const normalizedPaymentId = String(paymentId || "").trim();
  const txHash = String(input.txHash || "").trim().toLowerCase();
  const receivedAmount = Number(input.receivedAmount);
  const confirmations = Number(input.confirmations);

  if (!normalizedPaymentId) {
    throw new Error("Payment id is required.");
  }
  if (!isValidTxHash(txHash)) {
    throw new Error("A valid 64-character transaction hash is required.");
  }
  if (!Number.isFinite(receivedAmount) || receivedAmount < 0) {
    throw new Error("Received amount must be zero or greater.");
  }
  if (!Number.isInteger(confirmations) || confirmations < 0) {
    throw new Error("Confirmations must be a non-negative integer.");
  }

  const result = await requestRpc("record_crypto_transaction", {
    p_payment_id: normalizedPaymentId,
    p_tx_hash: txHash,
    p_received_amount: receivedAmount,
    p_confirmations: confirmations,
  });
  const payment = await getPaymentById(normalizedPaymentId);
  if (!payment?.id) {
    throw new Error("Crypto detection update did not return a persisted payment.");
  }
  return { payment, result };
};

const assertCryptoPaymentConfirmable = (payment, requiredConfirmations = getRequiredConfirmations()) => {
  const cryptoStatus = String(payment.cryptoStatus || "").trim().toLowerCase();
  if (!CRYPTO_STATUSES.has(cryptoStatus)) {
    throw new Error("Payment does not contain a valid crypto detection status.");
  }
  if (!isValidTxHash(payment.cryptoTxHash)) {
    throw new Error("A detected transaction hash is required before confirmation.");
  }
  if (
    !["confirming", "confirmed"].includes(cryptoStatus) ||
    Number(payment.cryptoConfirmations || 0) < requiredConfirmations
  ) {
    const confirmationError = new Error(
      `The crypto transaction requires at least ${requiredConfirmations} confirmations before payment can be confirmed.`
    );
    confirmationError.status = 409;
    throw confirmationError;
  }
  if (toUsdtUnits(payment.cryptoReceivedAmount) + 1n < toUsdtUnits(payment.cryptoExpectedAmount)) {
    throw new Error("The received crypto amount is below the expected amount.");
  }

  return true;
};

const confirmCryptoPayment = async (paymentId, options = {}) => {
  const payment = await getPaymentById(paymentId);
  if (!payment?.id) {
    throw new Error("Payment not found.");
  }
  assertCryptoPaymentConfirmable(payment);

  return reviewCryptoPayment(payment.id, "paid", {
    createdBy: String(options.createdBy || "crypto-monitor").trim() || "crypto-monitor",
  });
};

const createCryptoPayment = createCryptoPaymentRecord;
const getCryptoPaymentStatus = async (paymentId) => getPaymentById(paymentId);
const verifyCryptoWebhookSignature = async () => false;

module.exports = {
  getConfigurationStatus,
  getSupportedPaymentOptions,
  createCryptoPaymentRecord,
  updateCryptoDetection,
  assertCryptoPaymentConfirmable,
  confirmCryptoPayment,
  createCryptoPayment,
  getCryptoPaymentStatus,
  verifyCryptoWebhookSignature,
};
