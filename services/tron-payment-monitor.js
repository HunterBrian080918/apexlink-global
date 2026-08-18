const {
  listPendingCryptoPayments,
  getPaymentByCryptoTxHash,
} = require("./supabase-payments");
const {
  updateCryptoDetection,
  confirmCryptoPayment,
} = require("./crypto-payments");

const USDT_DECIMALS = 6;
const AMOUNT_TOLERANCE_UNITS = 1n;
const DEFAULT_INTERVAL_MS = 30000;
const DEFAULT_CONFIRMATIONS = 20;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const MAX_TRANSFER_PAGES = 5;

const normalizeText = (value) => String(value || "").trim();
const normalizeUrl = (value) => normalizeText(value).replace(/\/+$/, "");
const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const isEnabled = (value) => normalizeText(value).toLowerCase() === "true";

const getTronMonitorConfiguration = (environment = process.env) => {
  const enabled = isEnabled(environment.CRYPTO_MONITOR_ENABLED);
  const config = {
    enabled,
    apiUrl: normalizeUrl(environment.TRON_API_URL),
    apiKey: normalizeText(environment.TRON_API_KEY),
    usdtContractAddress: normalizeText(environment.USDT_CONTRACT_ADDRESS),
    intervalMs: parsePositiveInteger(environment.CRYPTO_MONITOR_INTERVAL_MS, DEFAULT_INTERVAL_MS),
    requiredConfirmations: parsePositiveInteger(
      environment.TRON_REQUIRED_CONFIRMATIONS,
      DEFAULT_CONFIRMATIONS
    ),
    requestTimeoutMs: parsePositiveInteger(
      environment.TRON_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS
    ),
  };

  return {
    ...config,
    configured: Boolean(config.apiUrl && config.apiKey && config.usdtContractAddress),
  };
};

const decimalToUnits = (value, decimals = USDT_DECIMALS) => {
  const normalized = String(value ?? "0").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error("Invalid token amount.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0");
};

const tokenUnitsToDecimal = (units, decimals = USDT_DECIMALS) => {
  const normalizedUnits = BigInt(String(units || "0"));
  const scale = 10n ** BigInt(decimals);
  const whole = normalizedUnits / scale;
  const fraction = String(normalizedUnits % scale).padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
};

const calculateConfirmations = (currentBlock, transactionBlock) =>
  Math.max(0, Number(currentBlock || 0) - Number(transactionBlock || 0));

const parseTrc20Transfer = (row) => {
  const tokenInfo = row?.token_info || row?.tokenInfo || {};
  const decimals = Number.parseInt(String(tokenInfo.decimals ?? USDT_DECIMALS), 10);
  const rawAmount = normalizeText(row?.value ?? row?.amount);
  if (!/^\d+$/.test(rawAmount) || !Number.isInteger(decimals) || decimals < 0) {
    return null;
  }

  return {
    txHash: normalizeText(row?.transaction_id || row?.txID || row?.tx_hash).toLowerCase(),
    toAddress: normalizeText(row?.to || row?.to_address),
    contractAddress: normalizeText(tokenInfo.address || row?.contract_address),
    tokenSymbol: normalizeText(tokenInfo.symbol || row?.token_symbol).toUpperCase(),
    decimals,
    rawAmount,
    timestamp: Number(row?.block_timestamp || row?.timestamp || 0),
  };
};

const isMatchingTransfer = (payment, transfer, config) => {
  if (!transfer || !/^[0-9a-f]{64}$/.test(transfer.txHash)) {
    return false;
  }
  if (transfer.toAddress !== normalizeText(payment.cryptoWalletAddress)) {
    return false;
  }
  if (
    transfer.contractAddress !== config.usdtContractAddress ||
    transfer.tokenSymbol !== "USDT" ||
    transfer.decimals !== USDT_DECIMALS
  ) {
    return false;
  }

  const createdAt = Date.parse(payment.createdAt || "");
  if (Number.isFinite(createdAt) && transfer.timestamp && transfer.timestamp < createdAt - 5 * 60 * 1000) {
    return false;
  }

  const receivedUnits = BigInt(transfer.rawAmount);
  const expectedUnits = decimalToUnits(Number(payment.cryptoExpectedAmount || payment.amount || 0).toFixed(6));
  return receivedUnits + AMOUNT_TOLERANCE_UNITS >= expectedUnits;
};

const createTronPaymentMonitor = (options = {}) => {
  const dependencies = {
    listPendingCryptoPayments: options.listPendingCryptoPayments || listPendingCryptoPayments,
    getPaymentByCryptoTxHash: options.getPaymentByCryptoTxHash || getPaymentByCryptoTxHash,
    updateCryptoDetection: options.updateCryptoDetection || updateCryptoDetection,
    confirmCryptoPayment: options.confirmCryptoPayment || confirmCryptoPayment,
    fetch: options.fetch || globalThis.fetch,
  };
  const config = options.config || getTronMonitorConfiguration();
  const logger = options.logger || console;
  let timer = null;
  let running = false;
  let stopped = true;

  const log = (message) => logger.log(`[TRON MONITOR] ${message}`);
  const logError = (message, error) =>
    logger.error(`[TRON MONITOR] ${message}: ${error?.message || error}`);

  const requestJson = async (pathname, requestOptions = {}) => {
    if (typeof dependencies.fetch !== "function") {
      throw new Error("Fetch is unavailable in this Node runtime.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const response = await dependencies.fetch(`${config.apiUrl}${pathname}`, {
        ...requestOptions,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "TRON-PRO-API-KEY": config.apiKey,
          ...(requestOptions.body ? { "Content-Type": "application/json" } : {}),
          ...(requestOptions.headers || {}),
        },
      });
      const text = await response.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch (error) {
        throw new Error(`TRON API returned invalid JSON (${response.status}).`);
      }
      if (!response.ok) {
        throw new Error(payload?.Error || payload?.message || `TRON API request failed (${response.status}).`);
      }
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  };

  const getCurrentBlock = async () => {
    const payload = await requestJson("/wallet/getnowblock", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const block = Number(payload?.block_header?.raw_data?.number);
    if (!Number.isInteger(block) || block < 0) {
      throw new Error("TRON API did not return the current block number.");
    }
    return block;
  };

  const getTransactionInfo = async (txHash) => {
    const payload = await requestJson("/wallet/gettransactioninfobyid", {
      method: "POST",
      body: JSON.stringify({ value: txHash }),
    });
    const result = normalizeText(payload?.receipt?.result || payload?.result).toUpperCase();
    if (result && result !== "SUCCESS") {
      throw new Error(`TRON transaction result is ${result}.`);
    }
    const blockNumber = Number(payload?.blockNumber);
    if (!Number.isInteger(blockNumber) || blockNumber < 0) {
      throw new Error("TRON transaction is not yet included in a block.");
    }
    return { blockNumber };
  };

  const listWalletTransfers = async (walletAddress, minTimestamp) => {
    const transfers = [];
    let fingerprint = "";
    for (let page = 0; page < MAX_TRANSFER_PAGES; page += 1) {
      const query = new URLSearchParams({
        only_confirmed: "false",
        only_to: "true",
        limit: "200",
        order_by: "block_timestamp,asc",
        min_timestamp: String(Math.max(0, minTimestamp || 0)),
        contract_address: config.usdtContractAddress,
      });
      if (fingerprint) {
        query.set("fingerprint", fingerprint);
      }
      const payload = await requestJson(
        `/v1/accounts/${encodeURIComponent(walletAddress)}/transactions/trc20?${query.toString()}`
      );
      const pageTransfers = (Array.isArray(payload?.data) ? payload.data : [])
        .map(parseTrc20Transfer)
        .filter(Boolean);
      transfers.push(...pageTransfers);
      fingerprint = normalizeText(payload?.meta?.fingerprint);
      if (!fingerprint || !pageTransfers.length) {
        break;
      }
    }
    return transfers;
  };

  const processDetectedTransaction = async (payment, transfer, currentBlock) => {
    const existing = await dependencies.getPaymentByCryptoTxHash(transfer.txHash);
    if (existing?.id && existing.id !== payment.id) {
      log(`Skipping duplicate transaction ${transfer.txHash}; it belongs to another payment.`);
      return false;
    }

    const transaction = await getTransactionInfo(transfer.txHash);
    const confirmations = calculateConfirmations(currentBlock, transaction.blockNumber);
    const receivedAmount = tokenUnitsToDecimal(transfer.rawAmount, transfer.decimals);

    const updated = await dependencies.updateCryptoDetection(payment.id, {
      txHash: transfer.txHash,
      receivedAmount,
      confirmations,
    });
    const updatedPayment = updated?.payment || updated;
    log(
      `Detected payment ${payment.paymentId || payment.id}: ${receivedAmount} USDT, TX ${transfer.txHash}, confirmations ${confirmations}.`
    );

    if (confirmations >= config.requiredConfirmations) {
      await dependencies.confirmCryptoPayment(updatedPayment?.id || payment.id, {
        createdBy: "crypto-monitor",
      });
      log(`Payment ${payment.paymentId || payment.id} confirmed automatically.`);
    }
    return true;
  };

  const runCycle = async () => {
    if (running) {
      return { skipped: true, reason: "already_running" };
    }
    if (!config.enabled) {
      return { skipped: true, reason: "disabled" };
    }
    if (!config.configured) {
      throw new Error(
        "TRON monitor is enabled but TRON_API_URL, TRON_API_KEY, or USDT_CONTRACT_ADDRESS is missing."
      );
    }

    running = true;
    try {
      const payments = await dependencies.listPendingCryptoPayments();
      if (!payments.length) {
        return { checked: 0, detected: 0 };
      }
      log(`Checking ${payments.length} pending crypto payment(s)...`);
      const currentBlock = await getCurrentBlock();
      const transfersByWallet = new Map();
      const reservedTxHashes = new Set();
      let detected = 0;

      const loadWalletTransfers = async (wallet) => {
        if (!transfersByWallet.has(wallet)) {
          const paymentTimes = payments
            .filter((item) => normalizeText(item.cryptoWalletAddress) === wallet)
            .map((item) => Date.parse(item.createdAt || ""))
            .filter(Number.isFinite);
          const earliest = paymentTimes.length ? Math.min(...paymentTimes) - 5 * 60 * 1000 : 0;
          transfersByWallet.set(wallet, await listWalletTransfers(wallet, earliest));
        }
        return transfersByWallet.get(wallet);
      };

      for (const payment of payments) {
        try {
          let transfer = null;
          const wallet = normalizeText(payment.cryptoWalletAddress);
          if (payment.cryptoTxHash) {
            const expectedHash = normalizeText(payment.cryptoTxHash).toLowerCase();
            transfer = (await loadWalletTransfers(wallet)).find((item) => item.txHash === expectedHash) || null;
          } else {
            const candidates = (await loadWalletTransfers(wallet))
              .filter(
                (item) =>
                  !reservedTxHashes.has(item.txHash) && isMatchingTransfer(payment, item, config)
              )
              .sort((left, right) => left.timestamp - right.timestamp);
            transfer = candidates[0] || null;
          }

          if (!transfer || !isMatchingTransfer(payment, transfer, config)) {
            continue;
          }
          reservedTxHashes.add(transfer.txHash);
          if (await processDetectedTransaction(payment, transfer, currentBlock)) {
            detected += 1;
          }
        } catch (error) {
          logError(`Unable to process payment ${payment.paymentId || payment.id}`, error);
        }
      }

      return { checked: payments.length, detected };
    } finally {
      running = false;
    }
  };

  const scheduleNext = () => {
    if (stopped) {
      return;
    }
    timer = setTimeout(async () => {
      try {
        await runCycle();
      } catch (error) {
        logError("Monitor cycle failed", error);
      } finally {
        scheduleNext();
      }
    }, config.intervalMs);
    timer.unref?.();
  };

  const start = () => {
    if (!config.enabled) {
      log("Disabled. Set CRYPTO_MONITOR_ENABLED=true to start automatic detection.");
      return { started: false, reason: "disabled" };
    }
    if (!config.configured) {
      logError("Not started", new Error("Required TRON environment variables are missing"));
      return { started: false, reason: "not_configured" };
    }
    if (!stopped) {
      return { started: true, reason: "already_started" };
    }
    stopped = false;
    log(`Started with a ${config.intervalMs}ms interval and ${config.requiredConfirmations} required confirmations.`);
    Promise.resolve()
      .then(runCycle)
      .catch((error) => logError("Initial monitor cycle failed", error))
      .finally(scheduleNext);
    return { started: true };
  };

  const stop = () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return { start, stop, runCycle, config };
};

const productionMonitor = createTronPaymentMonitor();

module.exports = {
  getTronMonitorConfiguration,
  decimalToUnits,
  tokenUnitsToDecimal,
  calculateConfirmations,
  parseTrc20Transfer,
  isMatchingTransfer,
  createTronPaymentMonitor,
  startTronPaymentMonitor: productionMonitor.start,
  stopTronPaymentMonitor: productionMonitor.stop,
};
