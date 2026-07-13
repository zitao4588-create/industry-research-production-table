import { describe, expect, it } from "vitest";
import { industryResearchDeliveryPackageFiles } from "./delivery-run";
import { industryExecutionArtifactContracts } from "./industry-execution";
import { createSkincareModuleContractFixture } from "./industry-module-fixtures";
import {
  createIndustryModuleResultsArtifact,
  industryResearchModuleOrder,
} from "./industry-module-results";
import {
  createIndustryClaimLedger,
  createIndustryReportBundle,
} from "./industry-synthesis";
import { createSkincareSynthesisContractClaims } from "./industry-synthesis-fixtures";

function moduleResultsArtifact(blockedModuleId?: string) {
  const fixtures = industryResearchModuleOrder.map((moduleId) => ({
    moduleId,
    fixture: createSkincareModuleContractFixture(moduleId),
  }));
  const shared = fixtures[0]?.fixture;
  if (!shared) throw new Error("g8_module_fixture_missing");
  return createIndustryModuleResultsArtifact({
    industryPlan: shared.industryPlan,
    representativeSamplePlan: shared.representativeSamplePlan,
    moduleInputs: fixtures.map(({ moduleId, fixture }) => ({
      moduleId,
      claimInputs: fixture.claimInputs,
      sources: fixture.sources,
      rawDocuments: fixture.rawDocuments,
      evidence: moduleId === blockedModuleId ? [] : fixture.evidence,
    })),
  });
}

const synthesisClaims = createSkincareSynthesisContractClaims();

describe("G8 claim ledger", () => {
  it("distinguishes fact, signal, inference and hypothesis with full trace", () => {
    const ledger = createIndustryClaimLedger({
      moduleResults: moduleResultsArtifact(),
      evidenceMode: "verified_external_evidence",
      synthesisClaims,
    });

    expect(ledger.counts.fact).toBeGreaterThan(0);
    expect(ledger.counts.signal).toBeGreaterThan(0);
    expect(ledger.counts.inference).toBe(1);
    expect(ledger.counts.hypothesis).toBe(1);
    expect(ledger.entries.every((entry) => entry.status === "eligible")).toBe(
      true,
    );
    expect(
      ledger.entries.every(
        (entry) =>
          entry.evidenceIds.length > 0 &&
          entry.sourceIds.length > 0 &&
          entry.rawDocumentIds.length > 0,
      ),
    ).toBe(true);
  });

  it("keeps every contract fixture entry non-eligible and non-external", () => {
    const ledger = createIndustryClaimLedger({
      moduleResults: moduleResultsArtifact(),
      evidenceMode: "contract_fixture",
      synthesisClaims,
    });

    expect(ledger.counts.eligible).toBe(0);
    expect(ledger.counts.contract_only).toBe(ledger.entries.length);
    expect(ledger.entries.every((entry) => !entry.externalFactEligible)).toBe(
      true,
    );
    expect(ledger.assertions.contractFixtureExternalFactsProduced).toBe(false);
  });

  it("does not promote claims from a blocked module", () => {
    const ledger = createIndustryClaimLedger({
      moduleResults: moduleResultsArtifact("regulation_and_standards"),
      evidenceMode: "verified_external_evidence",
    });
    const regulation = ledger.entries.find((entry) =>
      entry.moduleIds.includes("regulation_and_standards"),
    );

    expect(regulation?.status).toBe("blocked");
    expect(regulation?.externalFactEligible).toBe(false);
    expect(ledger.blockedModuleIds).toEqual(["regulation_and_standards"]);
  });

  it("blocks an opportunity that is not a hypothesis", () => {
    const inference = synthesisClaims[0];
    if (!inference) throw new Error("g8_inference_fixture_missing");
    const ledger = createIndustryClaimLedger({
      moduleResults: moduleResultsArtifact(),
      evidenceMode: "verified_external_evidence",
      synthesisClaims: [
        {
          ...inference,
          claimId: "synthesis:invalid-opportunity",
          opportunity: true,
        },
      ],
    });
    const opportunity = ledger.entries.find(
      (entry) => entry.claimId === "synthesis:invalid-opportunity",
    );

    expect(opportunity?.status).toBe("blocked");
    expect(opportunity?.gaps).toContain("opportunity_must_be_hypothesis");
  });

  it("blocks synthesis when declared modules do not match supporting claims", () => {
    const inference = synthesisClaims[0];
    if (!inference) throw new Error("g8_inference_fixture_missing");
    const ledger = createIndustryClaimLedger({
      moduleResults: moduleResultsArtifact(),
      evidenceMode: "verified_external_evidence",
      synthesisClaims: [
        {
          ...inference,
          claimId: "synthesis:mismatched-modules",
          moduleIds: ["market_landscape", "content_and_traffic"],
        },
      ],
    });
    const entry = ledger.entries.find(
      (claim) => claim.claimId === "synthesis:mismatched-modules",
    );

    expect(entry?.status).toBe("blocked");
    expect(entry?.gaps).toContain("synthesis_module_binding_mismatch");
  });
});

describe("G8 12-chapter report and knowledge map", () => {
  it("renders exactly 12 chapters with coverage, counterexamples and gaps", () => {
    const bundle = createIndustryReportBundle({
      moduleResults: moduleResultsArtifact(),
      evidenceMode: "contract_fixture",
      synthesisClaims,
    });

    expect(bundle.chapters).toHaveLength(12);
    expect(bundle.reportMarkdown.match(/^## \d+\./gm)).toHaveLength(12);
    expect(bundle.reportMarkdown).toContain("Coverage：");
    expect(bundle.reportMarkdown).toContain("反例：");
    expect(bundle.reportMarkdown).toContain("CONTRACT_ONLY / 非行业事实");
    expect(bundle.reportMarkdown).toContain("可执行机会假设");
    expect(bundle.reportMarkdown).toContain("知识地图与持续监控计划");
    expect(bundle.reportMarkdown).toContain("## 决策摘要");
    expect(bundle.decisionGuidance).toMatchObject({
      researchReadiness: "contract_only",
      commercializationAssessment: "not_evaluated",
    });
    expect(bundle.claimLedger.counts.eligible).toBe(0);
  });

  it("preserves a blocked module as a blocked chapter instead of drafting conclusions", () => {
    const bundle = createIndustryReportBundle({
      moduleResults: moduleResultsArtifact("regulation_and_standards"),
      evidenceMode: "verified_external_evidence",
      synthesisClaims: [],
    });
    const regulationChapter = bundle.chapters.find(
      (chapter) => chapter.id === "regulation-trends",
    );

    expect(regulationChapter?.status).toBe("blocked");
    expect(bundle.reportMarkdown).toContain(
      "BLOCKED：证据或覆盖不足，本章不生成完整结论性正文。",
    );
    expect(bundle.decisionGuidance.commercializationAssessment).toBe(
      "not_evaluated",
    );
    expect(regulationChapter?.gaps.length).toBeGreaterThan(0);
  });

  it("builds source-to-raw-to-evidence-to-claim trace edges", () => {
    const bundle = createIndustryReportBundle({
      moduleResults: moduleResultsArtifact(),
      evidenceMode: "verified_external_evidence",
      synthesisClaims,
    });
    const relations = new Set(
      bundle.knowledgeMap.edges.map((edge) => edge.relation),
    );

    expect(relations).toEqual(
      new Set([
        "contains",
        "covers",
        "produced",
        "supports",
        "derived_from",
        "challenged_by",
      ]),
    );
    expect(bundle.knowledgeMap.assertions.everyEligibleClaimHasTrace).toBe(
      true,
    );
  });

  it("keeps the legacy eight-file delivery boundary unchanged", () => {
    const bundle = createIndustryReportBundle({
      moduleResults: moduleResultsArtifact(),
      evidenceMode: "contract_fixture",
    });

    expect(industryResearchDeliveryPackageFiles).toHaveLength(8);
    expect(
      industryResearchDeliveryPackageFiles.map((file) => file.fileName),
    ).toEqual([
      "input.json",
      "raw_documents.json",
      "databases.json",
      "review_items.json",
      "report.md",
      "reviewed_report.md",
      "run_log.json",
      "manifest.json",
    ]);
    expect(bundle.compatibility).toEqual({
      industryExecutionManifestUnchanged: true,
      legacyDeliveryManifestSchemaVersion:
        "industry_research_delivery_manifest.v1",
      legacyEightFilePackageUnchanged: true,
      externalDeliveryBoundaryChanged: false,
    });
    expect(
      industryExecutionArtifactContracts.find(
        (contract) => contract.stage === "synthesis",
      )?.requiredArtifactTypes,
    ).toEqual(["claim_ledger"]);
    expect(
      industryExecutionArtifactContracts.find(
        (contract) => contract.stage === "reporting",
      )?.requiredArtifactTypes,
    ).toEqual(["industry_report"]);
  });
});
