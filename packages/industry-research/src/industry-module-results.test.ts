import { describe, expect, it } from "vitest";
import { createSkincareModuleContractFixture } from "./industry-module-fixtures";
import {
  createIndustryModuleResult,
  createIndustryModuleResultsArtifact,
  industryResearchModuleOrder,
} from "./industry-module-results";

function marketEvidenceFixture() {
  return createSkincareModuleContractFixture("market_landscape");
}

function regulationEvidenceFixture() {
  return createSkincareModuleContractFixture("regulation_and_standards");
}

function consumerEvidenceFixture() {
  return createSkincareModuleContractFixture("consumer_demand");
}

function ecommerceEvidenceFixture() {
  return createSkincareModuleContractFixture("ecommerce_competitor_research");
}

function contentEvidenceFixture() {
  return createSkincareModuleContractFixture("content_and_traffic");
}

function businessEvidenceFixture() {
  return createSkincareModuleContractFixture("business_model_and_supply_chain");
}

describe("G7.1 market landscape module result", () => {
  it("produces a traceable complete market result when every coverage row passes", () => {
    const fixture = marketEvidenceFixture();
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "market_landscape",
    });

    expect(result.status).toBe("complete");
    expect(result.coverage).toHaveLength(3);
    expect(result.coverage.every((row) => row.status === "pass")).toBe(true);
    expect(result.claims.every((claim) => claim.status === "confirmed")).toBe(
      true,
    );
    expect(result.claims.every((claim) => claim.quotes.length === 2)).toBe(
      true,
    );
    expect(result.assertions).toEqual({
      candidateInputsTreatedAsEvidence: false,
      contractFixtureTreatedAsExternalFact: false,
      allConfirmedClaimsTraceable: true,
      moduleFailureIsolated: true,
      liveProviderCalls: 0,
    });
  });

  it("fails closed without source evidence and records coverage gaps", () => {
    const fixture = marketEvidenceFixture();
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "market_landscape",
      sources: [],
      rawDocuments: [],
      evidence: [],
    });

    expect(result.status).toBe("blocked_missing_evidence");
    expect(result.claims.every((claim) => claim.status === "blocked")).toBe(
      true,
    );
    expect(result.coverage.every((row) => row.status === "blocked")).toBe(true);
    expect(result.gaps).toContain(
      "market_landscape-claim-1:claim_evidence_missing",
    );
  });

  it("blocks an unauthorized role even when stored validation says accepted", () => {
    const fixture = marketEvidenceFixture();
    const forgedSources = fixture.sources.map((source) => ({
      ...source,
      industrySourceRole: "brand_official_site" as const,
    }));
    const forgedRaw = fixture.rawDocuments.map((raw) => ({
      ...raw,
      industrySourceRole: "brand_official_site" as const,
    }));
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "market_landscape",
      sources: forgedSources,
      rawDocuments: forgedRaw,
    });

    expect(result.status).toBe("blocked_missing_evidence");
    expect(result.claims[0]?.failures.join("\n")).toContain(
      "source_role_not_authorized:brand_official_site:market_size_growth",
    );
  });

  it("keeps incomplete market coverage blocked instead of marking the module complete", () => {
    const fixture = marketEvidenceFixture();
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "market_landscape",
      claimInputs: fixture.claimInputs.slice(0, 1),
    });

    expect(result.status).toBe("blocked_insufficient_coverage");
    expect(
      result.coverage.filter((row) => row.status === "blocked"),
    ).toHaveLength(2);
  });
});

describe("G7.2 regulation and standards module result", () => {
  it("completes only when regulator evidence covers every planned question", () => {
    const fixture = regulationEvidenceFixture();
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "regulation_and_standards",
    });

    expect(result.status).toBe("complete");
    expect(result.coverage).toHaveLength(1);
    expect(result.coverage[0]).toMatchObject({
      status: "pass",
      sourceRoles: ["regulator"],
      uncoveredAxisItemIds: [],
    });
    expect(result.assertions.allConfirmedClaimsTraceable).toBe(true);
  });

  it("rejects a brand source from supporting a regulation claim", () => {
    const fixture = regulationEvidenceFixture();
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "regulation_and_standards",
      sources: fixture.sources.map((source) => ({
        ...source,
        industrySourceRole: "brand_official_site" as const,
      })),
      rawDocuments: fixture.rawDocuments.map((raw) => ({
        ...raw,
        industrySourceRole: "brand_official_site" as const,
      })),
    });

    expect(result.status).toBe("blocked_missing_evidence");
    expect(result.claims[0]?.failures.join("\n")).toContain(
      "source_role_not_authorized:brand_official_site:regulation_standard",
    );
  });

  it("does not let a failed regulation run mutate a completed market result", () => {
    const marketFixture = marketEvidenceFixture();
    const market = createIndustryModuleResult({
      ...marketFixture,
      moduleId: "market_landscape",
    });
    const snapshot = JSON.stringify(market);
    const regulationFixture = regulationEvidenceFixture();
    const regulation = createIndustryModuleResult({
      ...regulationFixture,
      moduleId: "regulation_and_standards",
      evidence: [],
    });

    expect(regulation.status).toBe("blocked_missing_evidence");
    expect(JSON.stringify(market)).toBe(snapshot);
    expect(market.status).toBe("complete");
  });
});

describe("G7.3 consumer demand module result", () => {
  it("requires two consumer source roles, direct demand evidence and representative samples", () => {
    const fixture = consumerEvidenceFixture();
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "consumer_demand",
    });

    expect(result.status).toBe("complete");
    expect(result.coverage[0]).toMatchObject({
      status: "pass",
      sourceRoles: ["consumer_review", "public_community"],
    });
    expect(
      result.coverage[0]?.representativeSampleIds.length,
    ).toBeGreaterThanOrEqual(2);
    expect(result.claims[0]?.quotes).toHaveLength(2);
  });

  it("keeps a single-role consumer signal below the coverage threshold", () => {
    const fixture = consumerEvidenceFixture();
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "consumer_demand",
      sources: fixture.sources.slice(0, 1),
      rawDocuments: fixture.rawDocuments.slice(0, 1),
      evidence: fixture.evidence.filter(
        (item) => item.sourceId === fixture.sources[0]?.id,
      ),
      claimInputs: fixture.claimInputs.map((claim) => ({
        ...claim,
        evidenceIds: claim.evidenceIds.slice(0, 1),
      })),
    });

    expect(result.status).toBe("blocked_insufficient_coverage");
    expect(result.coverage[0]?.gaps).toContain("source_roles:1/2");
  });

  it("rejects a market claim role from the consumer module", () => {
    const fixture = consumerEvidenceFixture();
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "consumer_demand",
      claimInputs: fixture.claimInputs.map((claim) => ({
        ...claim,
        claimRole: "market_size_growth" as const,
      })),
    });

    expect(result.status).toBe("blocked_missing_evidence");
    expect(result.claims[0]?.failures).toContain(
      "claim_role_not_allowed_for_module:market_size_growth",
    );
  });
});

describe("G7.4 ecommerce competitor module result", () => {
  it("completes taxonomy, price-tier and channel coverage with traceable samples", () => {
    const fixture = ecommerceEvidenceFixture();
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "ecommerce_competitor_research",
    });

    expect(result.status).toBe("complete");
    expect(result.coverage).toHaveLength(3);
    expect(result.coverage.every((row) => row.status === "pass")).toBe(true);
    expect(
      result.coverage.find((row) => row.axisType === "channel")?.sourceRoles,
    ).toEqual(["brand_official_site", "trusted_retail_channel"]);
    expect(
      result.claims.every((claim) => claim.representativeSampleIds.length >= 3),
    ).toBe(true);
  });

  it("does not let brand-only evidence satisfy the channel role target", () => {
    const fixture = ecommerceEvidenceFixture();
    const brandSourceId = fixture.sources[0]?.id;
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "ecommerce_competitor_research",
      sources: fixture.sources.slice(0, 1),
      rawDocuments: fixture.rawDocuments.slice(0, 1),
      evidence: fixture.evidence.filter(
        (item) => item.sourceId === brandSourceId,
      ),
      claimInputs: fixture.claimInputs.map((claim) => ({
        ...claim,
        evidenceIds: claim.evidenceIds.slice(0, 1),
      })),
    });

    expect(result.status).toBe("blocked_insufficient_coverage");
    expect(
      result.coverage.find((row) => row.axisType === "channel")?.gaps,
    ).toContain("source_roles:1/2");
  });

  it("rejects a sample that exists but does not cover the claim axis", () => {
    const fixture = ecommerceEvidenceFixture();
    const channelClaim = fixture.claimInputs.find(
      (_claim, index) => index === 2,
    );
    const nonChannelSample =
      fixture.representativeSamplePlan.selectedSamples.find(
        (sample) => sample.axisAssignments.channelIds.length === 0,
      );
    if (!channelClaim || !nonChannelSample) {
      throw new Error("g7_ecommerce_sample_fixture_missing");
    }
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "ecommerce_competitor_research",
      claimInputs: fixture.claimInputs.map((claim) =>
        claim === channelClaim
          ? {
              ...claim,
              representativeSampleIds: [nonChannelSample.id],
            }
          : claim,
      ),
    });

    expect(result.status).toBe("blocked_insufficient_coverage");
    expect(result.claims[2]?.failures).toContain(
      `sample_does_not_cover_claim_axis:${nonChannelSample.id}`,
    );
    expect(result.claims[2]?.failures).toContain(
      `sample_relationship_not_allowed:${nonChannelSample.id}`,
    );
  });
});

describe("G7.5 content and traffic module result", () => {
  it("completes with two content roles and two axis-bound content actors", () => {
    const fixture = contentEvidenceFixture();
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "content_and_traffic",
    });

    expect(result.status).toBe("complete");
    expect(result.coverage[0]).toMatchObject({
      status: "pass",
      sourceRoles: ["content_platform", "search_trend"],
      uncoveredAxisItemIds: [],
    });
    expect(result.coverage[0]?.representativeSampleIds).toEqual([
      "g7-contract-content-a",
      "g7-contract-content-b",
    ]);
  });

  it("blocks conversion extrapolation even when the quote is exact and role-authorized", () => {
    const fixture = contentEvidenceFixture();
    const statement = `${fixture.claimInputs[0]?.statement}，并证明转化提升`;
    const rawDocuments = fixture.rawDocuments.map((raw) => ({
      ...raw,
      excerpt: `${raw.excerpt}。${statement}`,
      extractedText: `${raw.extractedText}。${statement}`,
    }));
    const evidence = fixture.evidence.map((item) =>
      item.id.includes("-evidence-1-") ? { ...item, quote: statement } : item,
    );
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "content_and_traffic",
      rawDocuments,
      evidence,
      claimInputs: fixture.claimInputs.map((claim, index) =>
        index === 0 ? { ...claim, statement } : claim,
      ),
    });

    expect(result.status).toBe("blocked_missing_evidence");
    expect(result.claims[0]?.failures).toContain(
      "content_metrics_cannot_support_conversion_claim",
    );
  });

  it("does not pass coverage with only one content actor", () => {
    const fixture = contentEvidenceFixture();
    const firstSample = fixture.claimInputs[0]?.representativeSampleIds[0];
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "content_and_traffic",
      claimInputs: fixture.claimInputs.map((claim) => ({
        ...claim,
        representativeSampleIds: firstSample ? [firstSample] : [],
      })),
    });

    expect(result.status).toBe("blocked_insufficient_coverage");
    expect(result.coverage[0]?.gaps).toContain("representative_samples:1/2");
  });
});

describe("G7.6 business model and supply-chain module result", () => {
  it("completes value-chain and business-model coverage with three or more aligned samples", () => {
    const fixture = businessEvidenceFixture();
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "business_model_and_supply_chain",
    });

    expect(result.status).toBe("complete");
    expect(result.coverage).toHaveLength(2);
    expect(result.coverage.every((row) => row.status === "pass")).toBe(true);
    expect(
      result.coverage.every((row) => row.representativeSampleIds.length >= 3),
    ).toBe(true);
    expect(result.coverage[0]?.sourceRoles).toEqual([
      "financial_report",
      "supply_chain_company",
    ]);
  });

  it("requires financial-report evidence for a profitability statement", () => {
    const fixture = businessEvidenceFixture();
    const supplySource = fixture.sources.find(
      (source) => source.industrySourceRole === "supply_chain_company",
    );
    if (!supplySource) throw new Error("g7_supply_source_fixture_missing");
    const statement = `${fixture.claimInputs[0]?.statement}，并证明整体盈利能力`;
    const rawDocuments = fixture.rawDocuments
      .filter((raw) => raw.sourceId === supplySource.id)
      .map((raw) => ({
        ...raw,
        excerpt: `${raw.excerpt}。${statement}`,
        extractedText: `${raw.extractedText}。${statement}`,
      }));
    const evidence = fixture.evidence
      .filter((item) => item.sourceId === supplySource.id)
      .map((item) =>
        item.id.includes("-evidence-1-") ? { ...item, quote: statement } : item,
      );
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "business_model_and_supply_chain",
      sources: [supplySource],
      rawDocuments,
      evidence,
      claimInputs: fixture.claimInputs.map((claim, index) => ({
        ...claim,
        statement: index === 0 ? statement : claim.statement,
        evidenceIds: claim.evidenceIds.filter((id) =>
          evidence.some((item) => item.id === id),
        ),
      })),
    });

    expect(result.status).not.toBe("complete");
    expect(result.claims[0]?.failures).toContain(
      "profitability_requires_financial_report",
    );
  });

  it("keeps the module blocked when a third supply-chain sample is removed", () => {
    const fixture = businessEvidenceFixture();
    const result = createIndustryModuleResult({
      ...fixture,
      moduleId: "business_model_and_supply_chain",
      claimInputs: fixture.claimInputs.map((claim) => ({
        ...claim,
        representativeSampleIds: claim.representativeSampleIds.filter(
          (id) => id !== "g7-contract-supply-b",
        ),
      })),
    });

    expect(result.status).toBe("blocked_insufficient_coverage");
    expect(result.gaps.join("\n")).toContain(
      "uncovered_axis_items:business-model-brand",
    );
  });
});

describe("G7 module-results bundle", () => {
  it("runs all six modules once in fixed order and keeps synthesis disabled", () => {
    const fixtures = industryResearchModuleOrder.map((moduleId) => ({
      moduleId,
      fixture: createSkincareModuleContractFixture(moduleId),
    }));
    const first = fixtures[0]?.fixture;
    if (!first) throw new Error("g7_bundle_fixture_missing");
    const artifact = createIndustryModuleResultsArtifact({
      industryPlan: first.industryPlan,
      representativeSamplePlan: first.representativeSamplePlan,
      moduleInputs: fixtures.map(({ moduleId, fixture }) => ({
        moduleId,
        claimInputs: fixture.claimInputs,
        sources: fixture.sources,
        rawDocuments: fixture.rawDocuments,
        evidence: fixture.evidence,
      })),
    });

    expect(artifact.status).toBe("complete");
    expect(artifact.moduleOrder).toEqual(industryResearchModuleOrder);
    expect(artifact.moduleResults).toHaveLength(6);
    expect(
      artifact.moduleResults.every((result) => result.status === "complete"),
    ).toBe(true);
    expect(artifact.assertions.synthesisAllowed).toBe(false);
    expect(artifact.assertions.contractFixtureTreatedAsExternalFact).toBe(
      false,
    );
  });

  it("isolates one blocked module while preserving the other five results", () => {
    const fixtures = industryResearchModuleOrder.map((moduleId) => ({
      moduleId,
      fixture: createSkincareModuleContractFixture(moduleId),
    }));
    const first = fixtures[0]?.fixture;
    if (!first) throw new Error("g7_bundle_fixture_missing");
    const artifact = createIndustryModuleResultsArtifact({
      industryPlan: first.industryPlan,
      representativeSamplePlan: first.representativeSamplePlan,
      moduleInputs: fixtures.map(({ moduleId, fixture }) => ({
        moduleId,
        claimInputs: fixture.claimInputs,
        sources: fixture.sources,
        rawDocuments: fixture.rawDocuments,
        evidence:
          moduleId === "regulation_and_standards" ? [] : fixture.evidence,
      })),
    });

    expect(artifact.status).toBe("blocked");
    expect(artifact.blockedModuleIds).toEqual(["regulation_and_standards"]);
    expect(
      artifact.moduleResults.filter((result) => result.status === "complete"),
    ).toHaveLength(5);
  });

  it("rejects missing or duplicate module inputs", () => {
    const fixture = createSkincareModuleContractFixture("market_landscape");
    const input = {
      moduleId: "market_landscape" as const,
      claimInputs: fixture.claimInputs,
      sources: fixture.sources,
      rawDocuments: fixture.rawDocuments,
      evidence: fixture.evidence,
    };

    expect(() =>
      createIndustryModuleResultsArtifact({
        industryPlan: fixture.industryPlan,
        representativeSamplePlan: fixture.representativeSamplePlan,
        moduleInputs: Array.from({ length: 6 }, () => input),
      }),
    ).toThrow("industry_module_results_six_unique_modules_required");
  });
});
