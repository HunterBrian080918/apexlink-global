const assert = require("assert/strict");

const originalEnvironment = {
  enabled: process.env.CRYPTO_MONITOR_ENABLED,
  apiUrl: process.env.TRON_API_URL,
  apiKey: process.env.TRON_API_KEY,
  contract: process.env.USDT_CONTRACT_ADDRESS,
};

process.env.CRYPTO_MONITOR_ENABLED = "false";
delete require.cache[require.resolve("../services/tron-payment-monitor")];
const {
  getProductionTronMonitorConfiguration,
} = require("../services/tron-payment-monitor");

process.env.CRYPTO_MONITOR_ENABLED = "true";
process.env.TRON_API_URL = "https://tron.example.invalid";
process.env.TRON_API_KEY = "startup-test-key";
process.env.USDT_CONTRACT_ADDRESS = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";

const config = getProductionTronMonitorConfiguration();
assert.equal(config.enabled, true);
assert.equal(config.configured, true);
assert.equal(config.requiredConfirmations, 20);
assert.equal(config.intervalMs, 30000);

if (originalEnvironment.enabled === undefined) delete process.env.CRYPTO_MONITOR_ENABLED;
else process.env.CRYPTO_MONITOR_ENABLED = originalEnvironment.enabled;
if (originalEnvironment.apiUrl === undefined) delete process.env.TRON_API_URL;
else process.env.TRON_API_URL = originalEnvironment.apiUrl;
if (originalEnvironment.apiKey === undefined) delete process.env.TRON_API_KEY;
else process.env.TRON_API_KEY = originalEnvironment.apiKey;
if (originalEnvironment.contract === undefined) delete process.env.USDT_CONTRACT_ADDRESS;
else process.env.USDT_CONTRACT_ADDRESS = originalEnvironment.contract;

console.log("TRON monitor startup timing test passed.");
