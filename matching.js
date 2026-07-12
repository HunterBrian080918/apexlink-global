(function () {
  const STORAGE_KEY = "northstar-ai-match-criteria";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const tokenize = (value) =>
    String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean);

  const parseFieldNumber = (value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getRuleSet = (config) => ({
    priceRangeRule: {
      overPenaltyMultiplier: Number(config?.priceRangeRule?.overPenaltyMultiplier) || 1.1,
      underPenaltyMultiplier: Number(config?.priceRangeRule?.underPenaltyMultiplier) || 0.6,
    },
    moqRule: {
      penaltyDivisor: Number(config?.moqRule?.penaltyDivisor) || 25,
      preferredThreshold: Number(config?.moqRule?.preferredThreshold) || 200,
    },
    shippingRule: {
      penaltyPerDay: Number(config?.shippingRule?.penaltyPerDay) || 1,
    },
    recommendationRule: {
      baseScore: Number(config?.recommendationRule?.baseScore) || 58,
      budgetWeight: Number(config?.recommendationRule?.budgetWeight) || 18,
      shippingWeight: Number(config?.recommendationRule?.shippingWeight) || 15,
      moqWeight: Number(config?.recommendationRule?.moqWeight) || 14,
      keywordWeight: Number(config?.recommendationRule?.keywordWeight) || 18,
      notesWeight: Number(config?.recommendationRule?.notesWeight) || 10,
      regionWeight: Number(config?.recommendationRule?.regionWeight) || 9,
      fallbackLimit: Number(config?.recommendationRule?.fallbackLimit) || 3,
    },
  });

  const buildCriteria = (source) => {
    if (source instanceof FormData) {
      return {
        productType: source.get("productType")?.toString().trim() || "",
        minPrice: parseFieldNumber(source.get("minPrice")),
        maxPrice: parseFieldNumber(source.get("maxPrice")),
        maxShippingTime: parseFieldNumber(source.get("maxShippingTime")),
        maxMoq: parseFieldNumber(source.get("maxMoq")),
        targetRegion: source.get("targetRegion")?.toString().trim() || "",
        notes: source.get("notes")?.toString().trim() || "",
      };
    }

    return {
      productType: String(source?.productType || "").trim(),
      minPrice: parseFieldNumber(source?.minPrice),
      maxPrice: parseFieldNumber(source?.maxPrice),
      maxShippingTime: parseFieldNumber(source?.maxShippingTime),
      maxMoq: parseFieldNumber(source?.maxMoq),
      targetRegion: String(source?.targetRegion || "").trim(),
      notes: String(source?.notes || "").trim(),
    };
  };

  const formatBudgetSummary = (criteria) => {
    if (criteria.minPrice !== null && criteria.maxPrice !== null) {
      return `$${criteria.minPrice.toFixed(2)} - $${criteria.maxPrice.toFixed(2)}`;
    }

    if (criteria.minPrice !== null) {
      return `From $${criteria.minPrice.toFixed(2)}`;
    }

    if (criteria.maxPrice !== null) {
      return `Up to $${criteria.maxPrice.toFixed(2)}`;
    }

    return "Any budget";
  };

  const formatShippingSummary = (criteria) =>
    criteria.maxShippingTime !== null ? `Up to ${criteria.maxShippingTime} days` : "Any shipping timeline";

  const formatDestinationSummary = (criteria) => criteria.targetRegion || "Any destination";

  const buildSummary = (criteria) => ({
    product: criteria.productType || "Any product",
    budget: formatBudgetSummary(criteria),
    shippingTime: formatShippingSummary(criteria),
    destination: formatDestinationSummary(criteria),
  });

  const getMatchAnalysis = (product, criteria, config) => {
    const rules = getRuleSet(config);
    let rawScore = rules.recommendationRule.baseScore;
    let hardChecks = 0;
    let hardMatches = 0;
    const reasons = [];
    const notes = [];
    const productTerms = tokenize(
      [
        product.name,
        product.category,
        product.description,
        product.detailDescription,
        ...(product.functions || []),
        ...(product.scenarios || []),
        ...(product.tags || []),
      ].join(" ")
    );
    const typeTerms = tokenize(criteria.productType);
    const noteTerms = tokenize(criteria.notes);
    const regionTerms = tokenize(criteria.targetRegion);
    const marketTerms = tokenize((product.markets || []).join(" "));

    const budgetEnabled = criteria.minPrice !== null || criteria.maxPrice !== null;
    const budgetMinOk = criteria.minPrice === null || product.priceValue >= criteria.minPrice;
    const budgetMaxOk = criteria.maxPrice === null || product.priceValue <= criteria.maxPrice;

    if (budgetEnabled) {
      hardChecks += 1;

      if (budgetMinOk && budgetMaxOk) {
        hardMatches += 1;
        rawScore += rules.recommendationRule.budgetWeight;
        reasons.push("Fits your budget");
      } else if (!budgetMaxOk && criteria.maxPrice !== null) {
        rawScore -= Math.min(
          15,
          Math.ceil((product.priceValue - criteria.maxPrice) * rules.priceRangeRule.overPenaltyMultiplier)
        );
        notes.push("Price is above your target range, but still among the closest options.");
      } else if (!budgetMinOk && criteria.minPrice !== null) {
        rawScore -= Math.min(
          8,
          Math.ceil((criteria.minPrice - product.priceValue) * rules.priceRangeRule.underPenaltyMultiplier)
        );
        notes.push("Price is below your lower range, but remains relevant to the request.");
      }
    }

    if (criteria.maxShippingTime !== null) {
      hardChecks += 1;

      if (product.shippingDays <= criteria.maxShippingTime) {
        hardMatches += 1;
        rawScore += rules.recommendationRule.shippingWeight;
        reasons.push("Meets shipping timeline");
      } else {
        rawScore -= Math.min(
          14,
          Math.ceil((product.shippingDays - criteria.maxShippingTime) * rules.shippingRule.penaltyPerDay)
        );
        notes.push("Shipping time is slightly longer than requested.");
      }
    }

    if (criteria.maxMoq !== null) {
      hardChecks += 1;

      if (product.moqValue <= criteria.maxMoq) {
        hardMatches += 1;
        rawScore += rules.recommendationRule.moqWeight;
        reasons.push(
          product.moqValue <= rules.moqRule.preferredThreshold ? "Suitable MOQ" : "MOQ is within your requirement"
        );
      } else {
        rawScore -= Math.min(14, Math.ceil((product.moqValue - criteria.maxMoq) / rules.moqRule.penaltyDivisor));
        notes.push("MOQ is higher than your target, but still one of the nearest alternatives.");
      }
    }

    if (typeTerms.length > 0) {
      hardChecks += 1;
      const typeHits = typeTerms.filter((term) => productTerms.includes(term)).length;

      if (typeHits > 0) {
        hardMatches += 1;
        rawScore += Math.min(rules.recommendationRule.keywordWeight, 12 + typeHits * 2);
        reasons.push("Relevant to your product request");
      } else {
        rawScore -= 22;
        notes.push("Product category is not closely aligned with your requested type.");
      }
    }

    if (noteTerms.length > 0) {
      const noteHits = noteTerms.filter((term) => productTerms.includes(term)).length;

      if (noteHits > 0) {
        rawScore += Math.min(rules.recommendationRule.notesWeight, noteHits * 3);
        reasons.push("Matches your feature requirements");
      }
    }

    if (regionTerms.length > 0) {
      const regionHits = regionTerms.filter((term) => marketTerms.includes(term)).length;

      if (regionHits > 0) {
        rawScore += rules.recommendationRule.regionWeight;
        reasons.push("Popular in your target market");
      }
    }

    const uniqueReasons = [...new Set(reasons)];

    if (!uniqueReasons.length) {
      uniqueReasons.push("Closest overall match");
    }

    const score = clamp(Math.round(rawScore), 42, 98);
    const isCompleteMatch = hardChecks > 0 ? hardChecks === hardMatches : true;

    return {
      ...product,
      score,
      hardChecks,
      hardMatches,
      reasons: uniqueReasons.slice(0, 4),
      notes,
      isCompleteMatch,
    };
  };

  const buildInsights = (criteria, isFallback, totalMatches) => {
    const insightLines = [
      "Recommendations are ranked by budget fit, shipping timeline, MOQ, product relevance, and market alignment.",
      "Products with the strongest score appear first so buyers can evaluate the best options immediately.",
    ];

    if (criteria.notes) {
      insightLines.push("Your additional notes were used to boost products with matching features and use cases.");
    }

    if (isFallback) {
      insightLines.push("No product met every hard filter, so the engine returned the closest alternatives by total fit.");
    } else {
      insightLines.push(`${totalMatches} product(s) matched your hard requirements and were then sorted by overall relevance.`);
    }

    return insightLines;
  };

  const getRecommendations = (criteria, products, config) => {
    const normalizedCriteria = buildCriteria(criteria);
    const sourceProducts = Array.isArray(products) ? products : [];
    const rules = getRuleSet(config);
    const analyzed = sourceProducts
      .map((product) => getMatchAnalysis(product, normalizedCriteria, rules))
      .sort((left, right) => right.score - left.score);

    const completeMatches = analyzed.filter((item) => item.isCompleteMatch);
    const isFallback = completeMatches.length === 0;
    const items = isFallback ? analyzed.slice(0, rules.recommendationRule.fallbackLimit) : completeMatches;

    return {
      criteria: normalizedCriteria,
      summary: buildSummary(normalizedCriteria),
      items,
      isFallback,
      totalMatches: completeMatches.length,
      totalProducts: sourceProducts.length,
      insights: buildInsights(normalizedCriteria, isFallback, completeMatches.length),
    };
  };

  window.MatchEngine = {
    storageKey: STORAGE_KEY,
    buildCriteria,
    getMatchAnalysis,
    getRecommendations,
  };
})();
