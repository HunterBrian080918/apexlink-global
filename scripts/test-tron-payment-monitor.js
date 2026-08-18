const assert = require("assert");
const {
  createTronPaymentMonitor,
  decimalToUnits,
  calculateConfirmations,
} = require("../services/tron-payment-monitor");

const walletAddress = "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8";
const contractAddress = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";
const txHash = "a".repeat(64);

const createResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
});

const createFetch = (rawAmount = "199000000") => async (url) => {
  if (url.includes("/wallet/getnowblock")) {
    return createResponse({ block_header: { raw_data: { number: 100 } } });
  }
  if (url.includes("/wallet/gettransactioninfobyid")) {
    return createResponse({ blockNumber: 80, receipt: { result: "SUCCESS" } });
  }
  if (url.includes("/transactions/trc20")) {
    return createResponse({
      data: [
        {
          transaction_id: txHash,
          to: walletAddress,
          value: rawAmount,
          block_timestamp: Date.now(),
          token_info: {
            address: contractAddress,
            symbol: "USDT",
            decimals: 6,
          },
        },
      ],
      meta: {},
    });
  }
  throw new Error(`Unexpected test URL: ${url}`);
};

const basePayment = {
  id: "payment-1",
  paymentId: "PAY-1",
  amount: 199,
  status: "pending_crypto_detection",
  cryptoAsset: "USDT",
  cryptoNetwork: "TRC20",
  cryptoWalletAddress: walletAddress,
  cryptoExpectedAmount: 199,
  cryptoReceivedAmount: 0,
  cryptoTxHash: "",
  cryptoStatus: "waiting",
  createdAt: new Date(Date.now() - 60000).toISOString(),
};

const config = {
  enabled: true,
  configured: true,
  apiUrl: "https://tron.test",
  apiKey: "test-key",
  usdtContractAddress: contractAddress,
  intervalMs: 30000,
  requiredConfirmations: 20,
  requestTimeoutMs: 1000,
};

const silentLogger = { log: () => {}, error: () => {} };

const run = async () => {
  assert.strictEqual(decimalToUnits("199.000001"), 199000001n);
  assert.strictEqual(calculateConfirmations(100, 80), 20);

  const updates = [];
  const confirmations = [];
  const monitor = createTronPaymentMonitor({
    config,
    logger: silentLogger,
    fetch: createFetch(),
    listPendingCryptoPayments: async () => [basePayment],
    getPaymentByCryptoTxHash: async () => null,
    updateCryptoDetection: async (paymentId, input) => {
      updates.push({ paymentId, input });
      return { payment: { ...basePayment, ...input, id: paymentId } };
    },
    confirmCryptoPayment: async (paymentId, options) => {
      confirmations.push({ paymentId, options });
      return { paymentId };
    },
  });
  const result = await monitor.runCycle();
  assert.deepStrictEqual(result, { checked: 1, detected: 1 });
  assert.strictEqual(updates.length, 1);
  assert.strictEqual(updates[0].input.txHash, txHash);
  assert.strictEqual(updates[0].input.receivedAmount, "199");
  assert.strictEqual(updates[0].input.confirmations, 20);
  assert.strictEqual(confirmations.length, 1);
  assert.strictEqual(confirmations[0].options.createdBy, "crypto-monitor");

  let duplicateUpdated = false;
  const duplicateMonitor = createTronPaymentMonitor({
    config,
    logger: silentLogger,
    fetch: createFetch(),
    listPendingCryptoPayments: async () => [basePayment],
    getPaymentByCryptoTxHash: async () => ({ id: "another-payment" }),
    updateCryptoDetection: async () => {
      duplicateUpdated = true;
    },
    confirmCryptoPayment: async () => {
      throw new Error("Duplicate transaction must not be confirmed.");
    },
  });
  const duplicateResult = await duplicateMonitor.runCycle();
  assert.deepStrictEqual(duplicateResult, { checked: 1, detected: 0 });
  assert.strictEqual(duplicateUpdated, false);

  let underpaymentUpdated = false;
  const underpaymentMonitor = createTronPaymentMonitor({
    config,
    logger: silentLogger,
    fetch: createFetch("198999998"),
    listPendingCryptoPayments: async () => [basePayment],
    getPaymentByCryptoTxHash: async () => null,
    updateCryptoDetection: async () => {
      underpaymentUpdated = true;
    },
    confirmCryptoPayment: async () => {},
  });
  const underpaymentResult = await underpaymentMonitor.runCycle();
  assert.deepStrictEqual(underpaymentResult, { checked: 1, detected: 0 });
  assert.strictEqual(underpaymentUpdated, false);

  const disabledMonitor = createTronPaymentMonitor({
    config: { ...config, enabled: false },
    logger: silentLogger,
    listPendingCryptoPayments: async () => {
      throw new Error("Disabled monitor must not query payments.");
    },
  });
  assert.deepStrictEqual(await disabledMonitor.runCycle(), { skipped: true, reason: "disabled" });
  assert.deepStrictEqual(disabledMonitor.start(), { started: false, reason: "disabled" });

  console.log("TRON payment monitor tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
