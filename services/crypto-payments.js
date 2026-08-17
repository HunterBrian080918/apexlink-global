const CRYPTO_PROVIDER = String(process.env.CRYPTO_PROVIDER || "").trim();
const CRYPTO_API_KEY = String(process.env.CRYPTO_API_KEY || "").trim();
const CRYPTO_WEBHOOK_SECRET = String(process.env.CRYPTO_WEBHOOK_SECRET || "").trim();

const SUPPORTED_CRYPTO_ASSETS = Object.freeze({
  USDT: ["ERC20", "TRC20"],
  USDC: ["ERC20"],
});

const hasProviderCredentials = () => Boolean(CRYPTO_PROVIDER && CRYPTO_API_KEY && CRYPTO_WEBHOOK_SECRET);

const getConfigurationStatus = () => ({
  provider: CRYPTO_PROVIDER || "",
  configured: hasProviderCredentials(),
  enabled: false,
  supportedAssets: hasProviderCredentials() ? SUPPORTED_CRYPTO_ASSETS : {},
});

const getSupportedPaymentOptions = () => {
  const status = getConfigurationStatus();
  if (!status.configured) {
    return [];
  }

  return Object.entries(SUPPORTED_CRYPTO_ASSETS).flatMap(([asset, networks]) =>
    networks.map((network) => ({
      asset,
      network,
    }))
  );
};

const createCryptoPayment = async () => {
  throw new Error(
    hasProviderCredentials()
      ? "Crypto provider adapter is not implemented yet."
      : "Cryptocurrency payments are disabled because provider credentials are not configured."
  );
};

const getCryptoPaymentStatus = async () => {
  throw new Error(
    hasProviderCredentials()
      ? "Crypto provider adapter is not implemented yet."
      : "Cryptocurrency payments are disabled because provider credentials are not configured."
  );
};

const verifyCryptoWebhookSignature = async () => hasProviderCredentials() && false;

module.exports = {
  getConfigurationStatus,
  getSupportedPaymentOptions,
  createCryptoPayment,
  getCryptoPaymentStatus,
  verifyCryptoWebhookSignature,
};
