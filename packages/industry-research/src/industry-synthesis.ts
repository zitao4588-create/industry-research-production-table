import type {
  IndustryModuleClaimResult,
  IndustryModuleResult,
  IndustryModuleResultsArtifact,
} from "./industry-module-results";
import type { IndustryResearchModule } from "./industry-planner";
import {
  createResearchDecisionGuidance,
  type ResearchDecisionGuidance,
  renderResearchDecisionGuidance,
} from "./research-decision";

export const industryClaimLedgerSchemaVersion =
  "industry_claim_ledger.v1" as const;
export const industryKnowledgeMapSchemaVersion =
  "industry_knowledge_map.v1" as const;
export const industryReportBundleSchemaVersion =
  "industry_report_bundle.v1" as const;

export type IndustryClaimKind = "fact" | "signal" | "inference" | "hypothesis";
export type IndustryClaimLedgerStatus =
  | "eligible"
  | "contract_only"
  | "blocked";

export type IndustrySynthesisClaimInput = {
  claimId: string;
  kind: "inference" | "hypothesis";
  statement: string;
  supportingClaimIds: string[];
  moduleIds: IndustryResearchModule["id"][];
  counterEvidence: string[];
  validationPlan: string[];
  opportunity: boolean;
};

export type IndustryClaimLedgerEntry = {
  claimId: string;
  kind: IndustryClaimKind;
  status: IndustryClaimLedgerStatus;
  statement: string;
  moduleIds: IndustryResearchModule["id"][];
  sourceClaimId: string | null;
  supportingClaimIds: string[];
  evidenceIds: string[];
  sourceIds: string[];
  rawDocumentIds: string[];
  quotes: Array<{
    evidenceId: string;
    sourceId: string;
    rawDocumentId: string;
    quote: string;
  }>;
  coverageRowIds: string[];
  counterEvidence: string[];
  validationPlan: string[];
  opportunity: boolean;
  externalFactEligible: boolean;
  gaps: string[];
};

export type IndustryClaimLedger = {
  schemaVersion: typeof industryClaimLedgerSchemaVersion;
  artifactType: "industry-claim-ledger";
  industryPlanId: string;
  moduleResultsSchemaVersion: IndustryModuleResultsArtifact["schemaVersion"];
  evidenceMode: "contract_fixture" | "verified_external_evidence";
  entries: IndustryClaimLedgerEntry[];
  counts: Record<IndustryClaimKind, number> &
    Record<IndustryClaimLedgerStatus, number>;
  blockedModuleIds: IndustryResearchModule["id"][];
  gaps: string[];
  assertions: {
    onlyConfirmedCoveredClaimsEnterFoundation: true;
    opportunitiesAreHypotheses: true;
    contractFixtureExternalFactsProduced: false;
    blockedClaimsPromoted: false;
    liveProviderCalls: 0;
  };
};

export type IndustryKnowledgeMapNode = {
  id: string;
  type:
    | "module"
    | "claim"
    | "coverage"
    | "source"
    | "raw_document"
    | "evidence"
    | "gap"
    | "counterexample";
  label: string;
  status: "eligible" | "contract_only" | "blocked" | "context";
};

export type IndustryKnowledgeMapEdge = {
  from: string;
  to: string;
  relation:
    | "contains"
    | "covers"
    | "produced"
    | "supports"
    | "derived_from"
    | "has_gap"
    | "challenged_by";
};

export type IndustryKnowledgeMap = {
  schemaVersion: typeof industryKnowledgeMapSchemaVersion;
  artifactType: "industry-knowledge-map";
  nodes: IndustryKnowledgeMapNode[];
  edges: IndustryKnowledgeMapEdge[];
  assertions: {
    everyEligibleClaimHasTrace: boolean;
    blockedContentPreserved: true;
    contractFixtureExternalFactsProduced: false;
  };
};

export type IndustryReportChapter = {
  chapter: number;
  id: string;
  title: string;
  moduleIds: IndustryResearchModule["id"][];
  status: "complete" | "blocked" | "context_only";
  claimIds: string[];
  coverageRowIds: string[];
  gaps: string[];
};

export type IndustryReportBundle = {
  schemaVersion: typeof industryReportBundleSchemaVersion;
  artifactType: "industry-report-bundle";
  claimLedger: IndustryClaimLedger;
  decisionGuidance: ResearchDecisionGuidance;
  chapters: IndustryReportChapter[];
  reportMarkdown: string;
  knowledgeMap: IndustryKnowledgeMap;
  compatibility: {
    industryExecutionManifestUnchanged: true;
    legacyDeliveryManifestSchemaVersion: "industry_research_delivery_manifest.v1";
    legacyEightFilePackageUnchanged: true;
    externalDeliveryBoundaryChanged: false;
  };
};

const directClaimKind: Record<IndustryResearchModule["id"], "fact" | "signal"> =
  {
    market_landscape: "fact",
    regulation_and_standards: "fact",
    consumer_demand: "signal",
    ecommerce_competitor_research: "fact",
    content_and_traffic: "signal",
    business_model_and_supply_chain: "fact",
  };

function unique<T extends string>(values: T[]) {
  return [...new Set(values.filter(Boolean))];
}

function relevantCoverage(
  module: IndustryModuleResult,
  claim: IndustryModuleClaimResult,
) {
  return module.coverage.filter((row) =>
    row.targetAxisItemIds.some((id) => claim.axisItemIds.includes(id)),
  );
}

function directLedgerEntry(input: {
  module: IndustryModuleResult;
  claim: IndustryModuleClaimResult;
  evidenceMode: IndustryClaimLedger["evidenceMode"];
}): IndustryClaimLedgerEntry {
  const coverage = relevantCoverage(input.module, input.claim);
  const coveragePassed =
    coverage.length > 0 && coverage.every((row) => row.status === "pass");
  const traceComplete =
    input.claim.quotes.length > 0 &&
    input.claim.evidenceIds.length > 0 &&
    input.claim.sourceIds.length > 0 &&
    input.claim.rawDocumentIds.length > 0;
  const foundationEligible =
    input.module.status === "complete" &&
    input.claim.status === "confirmed" &&
    coveragePassed &&
    traceComplete;
  const gaps = unique([
    ...input.claim.failures,
    ...coverage.flatMap((row) => row.gaps),
    ...(coverage.length === 0 ? ["claim_coverage_row_missing"] : []),
    ...(!traceComplete ? ["claim_trace_incomplete"] : []),
    ...(!foundationEligible ? ["claim_not_confirmed_and_covered"] : []),
  ]);
  const status = !foundationEligible
    ? "blocked"
    : input.evidenceMode === "contract_fixture"
      ? "contract_only"
      : "eligible";
  return {
    claimId: `ledger:${input.claim.claimId}`,
    kind: directClaimKind[input.module.moduleId],
    status,
    statement: input.claim.statement,
    moduleIds: [input.module.moduleId],
    sourceClaimId: input.claim.claimId,
    supportingClaimIds: [],
    evidenceIds: unique(input.claim.quotes.map((quote) => quote.evidenceId)),
    sourceIds: input.claim.sourceIds,
    rawDocumentIds: input.claim.rawDocumentIds,
    quotes: input.claim.quotes,
    coverageRowIds: coverage.map((row) => row.coverageRowId),
    counterEvidence: [],
    validationPlan: [],
    opportunity: false,
    externalFactEligible: status === "eligible",
    gaps,
  };
}

function synthesisLedgerEntry(input: {
  claim: IndustrySynthesisClaimInput;
  directEntries: IndustryClaimLedgerEntry[];
  evidenceMode: IndustryClaimLedger["evidenceMode"];
}): IndustryClaimLedgerEntry {
  const supportingEntries = input.claim.supportingClaimIds.map((claimId) =>
    input.directEntries.find((entry) => entry.claimId === claimId),
  );
  const gaps: string[] = [];
  if (!input.claim.claimId.trim()) gaps.push("claim_id_required");
  if (!input.claim.statement.trim()) gaps.push("claim_statement_required");
  if (supportingEntries.length === 0) gaps.push("supporting_claims_required");
  if (supportingEntries.some((entry) => !entry)) {
    gaps.push("supporting_claim_missing");
  }
  const existingSupport = supportingEntries.filter(
    (entry): entry is IndustryClaimLedgerEntry => Boolean(entry),
  );
  if (existingSupport.some((entry) => entry.status === "blocked")) {
    gaps.push("blocked_claim_cannot_support_synthesis");
  }
  const supportModuleIds = unique(
    existingSupport.flatMap((entry) => entry.moduleIds),
  );
  if (
    supportModuleIds.some(
      (moduleId) => !input.claim.moduleIds.includes(moduleId),
    ) ||
    input.claim.moduleIds.some(
      (moduleId) => !supportModuleIds.includes(moduleId),
    )
  ) {
    gaps.push("synthesis_module_binding_mismatch");
  }
  if (
    input.claim.kind === "inference" &&
    (existingSupport.length < 2 || supportModuleIds.length < 2)
  ) {
    gaps.push("inference_requires_two_cross_module_claims");
  }
  if (
    input.claim.kind === "hypothesis" &&
    input.claim.validationPlan.length === 0
  ) {
    gaps.push("hypothesis_validation_plan_required");
  }
  if (input.claim.opportunity && input.claim.kind !== "hypothesis") {
    gaps.push("opportunity_must_be_hypothesis");
  }
  const supportEligible =
    existingSupport.length === supportingEntries.length &&
    existingSupport.every((entry) => entry.status !== "blocked");
  const status =
    gaps.length > 0 || !supportEligible
      ? "blocked"
      : input.evidenceMode === "contract_fixture"
        ? "contract_only"
        : "eligible";
  return {
    claimId: input.claim.claimId,
    kind: input.claim.kind,
    status,
    statement: input.claim.statement,
    moduleIds: unique(input.claim.moduleIds),
    sourceClaimId: null,
    supportingClaimIds: input.claim.supportingClaimIds,
    evidenceIds: unique(existingSupport.flatMap((entry) => entry.evidenceIds)),
    sourceIds: unique(existingSupport.flatMap((entry) => entry.sourceIds)),
    rawDocumentIds: unique(
      existingSupport.flatMap((entry) => entry.rawDocumentIds),
    ),
    quotes: existingSupport.flatMap((entry) => entry.quotes),
    coverageRowIds: unique(
      existingSupport.flatMap((entry) => entry.coverageRowIds),
    ),
    counterEvidence: unique(input.claim.counterEvidence),
    validationPlan: unique(input.claim.validationPlan),
    opportunity: input.claim.opportunity,
    externalFactEligible: status === "eligible",
    gaps: unique(gaps),
  };
}

export function createIndustryClaimLedger(input: {
  moduleResults: IndustryModuleResultsArtifact;
  evidenceMode: IndustryClaimLedger["evidenceMode"];
  synthesisClaims?: IndustrySynthesisClaimInput[];
}): IndustryClaimLedger {
  const directEntries = input.moduleResults.moduleResults.flatMap((module) =>
    module.claims.map((claim) =>
      directLedgerEntry({ module, claim, evidenceMode: input.evidenceMode }),
    ),
  );
  const duplicateDirectIds = directEntries.filter(
    (entry, index) =>
      directEntries.findIndex(
        (candidate) => candidate.claimId === entry.claimId,
      ) !== index,
  );
  if (duplicateDirectIds.length > 0) {
    throw new Error("industry_claim_ledger_duplicate_direct_claim_id");
  }
  const synthesisEntries = (input.synthesisClaims ?? []).map((claim) =>
    synthesisLedgerEntry({
      claim,
      directEntries,
      evidenceMode: input.evidenceMode,
    }),
  );
  const allIds = [...directEntries, ...synthesisEntries].map(
    (entry) => entry.claimId,
  );
  if (new Set(allIds).size !== allIds.length) {
    throw new Error("industry_claim_ledger_duplicate_claim_id");
  }
  const entries = [...directEntries, ...synthesisEntries];
  const count = (value: IndustryClaimKind | IndustryClaimLedgerStatus) =>
    entries.filter((entry) => entry.kind === value || entry.status === value)
      .length;
  return {
    schemaVersion: industryClaimLedgerSchemaVersion,
    artifactType: "industry-claim-ledger",
    industryPlanId: input.moduleResults.industryPlanId,
    moduleResultsSchemaVersion: input.moduleResults.schemaVersion,
    evidenceMode: input.evidenceMode,
    entries,
    counts: {
      fact: count("fact"),
      signal: count("signal"),
      inference: count("inference"),
      hypothesis: count("hypothesis"),
      eligible: count("eligible"),
      contract_only: count("contract_only"),
      blocked: count("blocked"),
    },
    blockedModuleIds: input.moduleResults.blockedModuleIds,
    gaps: unique([
      ...input.moduleResults.gaps,
      ...entries.flatMap((entry) =>
        entry.gaps.map((gap) => `${entry.claimId}:${gap}`),
      ),
    ]),
    assertions: {
      onlyConfirmedCoveredClaimsEnterFoundation: true,
      opportunitiesAreHypotheses: true,
      contractFixtureExternalFactsProduced: false,
      blockedClaimsPromoted: false,
      liveProviderCalls: 0,
    },
  };
}

const reportChapterDefinitions: Array<{
  id: string;
  title: string;
  moduleIds: IndustryResearchModule["id"][];
}> = [
  { id: "scope", title: "研究范围、定义和证据边界", moduleIds: [] },
  {
    id: "taxonomy",
    title: "子市场与分类体系",
    moduleIds: ["market_landscape"],
  },
  {
    id: "value-chain",
    title: "产业链和商业模式",
    moduleIds: ["business_model_and_supply_chain"],
  },
  {
    id: "market",
    title: "市场规模、增速和渠道结构",
    moduleIds: ["market_landscape"],
  },
  {
    id: "competition",
    title: "竞争格局与品牌集群",
    moduleIds: ["ecommerce_competitor_research"],
  },
  {
    id: "product-price",
    title: "产品、功效和价格带",
    moduleIds: ["ecommerce_competitor_research"],
  },
  {
    id: "consumer",
    title: "消费者人群、需求和痛点",
    moduleIds: ["consumer_demand"],
  },
  {
    id: "content-traffic",
    title: "搜索关键词、内容与流量生态",
    moduleIds: ["content_and_traffic"],
  },
  {
    id: "regulation-trends",
    title: "监管、技术、成分和趋势",
    moduleIds: ["regulation_and_standards", "content_and_traffic"],
  },
  {
    id: "opportunities",
    title: "可执行机会假设",
    moduleIds: [],
  },
  {
    id: "counterexamples-gaps",
    title: "反例、证据缺口和待验证问题",
    moduleIds: [],
  },
  {
    id: "knowledge-map",
    title: "知识地图与持续监控计划",
    moduleIds: [],
  },
];

function chapterStatus(input: {
  moduleIds: IndustryResearchModule["id"][];
  moduleResults: IndustryModuleResultsArtifact;
  entries: IndustryClaimLedgerEntry[];
  chapterId: string;
}) {
  if (input.chapterId === "scope" || input.chapterId === "knowledge-map") {
    return "context_only" as const;
  }
  if (input.chapterId === "opportunities") {
    return input.entries.some(
      (entry) => entry.opportunity && entry.status !== "blocked",
    )
      ? ("complete" as const)
      : ("blocked" as const);
  }
  if (input.chapterId === "counterexamples-gaps") {
    return "context_only" as const;
  }
  return input.moduleIds.every(
    (moduleId) =>
      input.moduleResults.moduleResults.find(
        (module) => module.moduleId === moduleId,
      )?.status === "complete",
  )
    ? ("complete" as const)
    : ("blocked" as const);
}

function createReportChapters(input: {
  moduleResults: IndustryModuleResultsArtifact;
  ledger: IndustryClaimLedger;
}) {
  return reportChapterDefinitions.map((definition, index) => {
    const moduleResults = input.moduleResults.moduleResults.filter((module) =>
      definition.moduleIds.includes(module.moduleId),
    );
    const entries =
      definition.id === "opportunities"
        ? input.ledger.entries.filter((entry) => entry.opportunity)
        : definition.id === "counterexamples-gaps"
          ? input.ledger.entries.filter(
              (entry) =>
                entry.status === "blocked" ||
                entry.gaps.length > 0 ||
                entry.counterEvidence.length > 0,
            )
          : input.ledger.entries.filter((entry) =>
              entry.moduleIds.some((moduleId) =>
                definition.moduleIds.includes(moduleId),
              ),
            );
    const coverage = moduleResults.flatMap((module) => module.coverage);
    return {
      chapter: index + 1,
      id: definition.id,
      title: definition.title,
      moduleIds: definition.moduleIds,
      status: chapterStatus({
        moduleIds: definition.moduleIds,
        moduleResults: input.moduleResults,
        entries,
        chapterId: definition.id,
      }),
      claimIds: entries.map((entry) => entry.claimId),
      coverageRowIds: coverage.map((row) => row.coverageRowId),
      gaps: unique([
        ...moduleResults.flatMap((module) => module.gaps),
        ...entries.flatMap((entry) => entry.gaps),
      ]),
    } satisfies IndustryReportChapter;
  });
}

function nodeStatus(entry: IndustryClaimLedgerEntry) {
  return entry.status;
}

export function createIndustryKnowledgeMap(input: {
  moduleResults: IndustryModuleResultsArtifact;
  ledger: IndustryClaimLedger;
}): IndustryKnowledgeMap {
  const nodes: IndustryKnowledgeMapNode[] = [];
  const edges: IndustryKnowledgeMapEdge[] = [];
  const addNode = (node: IndustryKnowledgeMapNode) => {
    if (!nodes.some((entry) => entry.id === node.id)) nodes.push(node);
  };
  const addEdge = (edge: IndustryKnowledgeMapEdge) => {
    if (
      !edges.some(
        (entry) =>
          entry.from === edge.from &&
          entry.to === edge.to &&
          entry.relation === edge.relation,
      )
    ) {
      edges.push(edge);
    }
  };
  for (const module of input.moduleResults.moduleResults) {
    const moduleId = `module:${module.moduleId}`;
    addNode({
      id: moduleId,
      type: "module",
      label: module.moduleName,
      status: module.status === "complete" ? "context" : "blocked",
    });
    for (const coverage of module.coverage) {
      const coverageId = `coverage:${coverage.coverageRowId}`;
      addNode({
        id: coverageId,
        type: "coverage",
        label: coverage.coverageRowId,
        status: coverage.status === "pass" ? "context" : "blocked",
      });
      addEdge({ from: coverageId, to: moduleId, relation: "covers" });
    }
  }
  for (const entry of input.ledger.entries) {
    addNode({
      id: entry.claimId,
      type: "claim",
      label: entry.statement,
      status: nodeStatus(entry),
    });
    for (const moduleId of entry.moduleIds) {
      addEdge({
        from: `module:${moduleId}`,
        to: entry.claimId,
        relation: "contains",
      });
    }
    for (const quote of entry.quotes) {
      const sourceId = `source:${quote.sourceId}`;
      const rawId = `raw:${quote.rawDocumentId}`;
      const evidenceId = `evidence:${quote.evidenceId}`;
      addNode({
        id: sourceId,
        type: "source",
        label: quote.sourceId,
        status: "context",
      });
      addNode({
        id: rawId,
        type: "raw_document",
        label: quote.rawDocumentId,
        status: "context",
      });
      addNode({
        id: evidenceId,
        type: "evidence",
        label: quote.quote,
        status: "context",
      });
      addEdge({ from: sourceId, to: rawId, relation: "produced" });
      addEdge({ from: rawId, to: evidenceId, relation: "contains" });
      addEdge({ from: evidenceId, to: entry.claimId, relation: "supports" });
    }
    for (const supportingClaimId of entry.supportingClaimIds) {
      addEdge({
        from: supportingClaimId,
        to: entry.claimId,
        relation: "derived_from",
      });
    }
    entry.gaps.forEach((gap, index) => {
      const gapId = `gap:${entry.claimId}:${index + 1}`;
      addNode({
        id: gapId,
        type: "gap",
        label: gap,
        status: "blocked",
      });
      addEdge({ from: entry.claimId, to: gapId, relation: "has_gap" });
    });
    entry.counterEvidence.forEach((counterexample, index) => {
      const counterexampleId = `counterexample:${entry.claimId}:${index + 1}`;
      addNode({
        id: counterexampleId,
        type: "counterexample",
        label: counterexample,
        status: "context",
      });
      addEdge({
        from: entry.claimId,
        to: counterexampleId,
        relation: "challenged_by",
      });
    });
  }
  const eligible = input.ledger.entries.filter(
    (entry) => entry.status === "eligible",
  );
  return {
    schemaVersion: industryKnowledgeMapSchemaVersion,
    artifactType: "industry-knowledge-map",
    nodes,
    edges,
    assertions: {
      everyEligibleClaimHasTrace: eligible.every(
        (entry) =>
          entry.evidenceIds.length > 0 &&
          entry.sourceIds.length > 0 &&
          entry.rawDocumentIds.length > 0,
      ),
      blockedContentPreserved: true,
      contractFixtureExternalFactsProduced: false,
    },
  };
}

function renderEntry(entry: IndustryClaimLedgerEntry) {
  const label =
    entry.status === "contract_only"
      ? "CONTRACT_ONLY / 非行业事实"
      : entry.status === "blocked"
        ? "BLOCKED"
        : "ELIGIBLE";
  return [
    `- [${label}] [${entry.kind}] ${entry.statement}`,
    `  - claimId: ${entry.claimId}`,
    `  - trace: evidence=${entry.evidenceIds.join(", ") || "none"}; source=${entry.sourceIds.join(", ") || "none"}; raw=${entry.rawDocumentIds.join(", ") || "none"}`,
    ...(entry.counterEvidence.length > 0
      ? [`  - 反例：${entry.counterEvidence.join("；")}`]
      : []),
    ...(entry.validationPlan.length > 0
      ? [`  - 验证计划：${entry.validationPlan.join("；")}`]
      : []),
    ...(entry.gaps.length > 0 ? [`  - gaps：${entry.gaps.join("；")}`] : []),
  ].join("\n");
}

export function createIndustryReportBundle(input: {
  moduleResults: IndustryModuleResultsArtifact;
  evidenceMode: IndustryClaimLedger["evidenceMode"];
  synthesisClaims?: IndustrySynthesisClaimInput[];
}): IndustryReportBundle {
  const claimLedger = createIndustryClaimLedger(input);
  const chapters = createReportChapters({
    moduleResults: input.moduleResults,
    ledger: claimLedger,
  });
  const knowledgeMap = createIndustryKnowledgeMap({
    moduleResults: input.moduleResults,
    ledger: claimLedger,
  });
  const decisionGuidance = createResearchDecisionGuidance({
    evidenceMode:
      input.evidenceMode === "contract_fixture"
        ? "contract_only"
        : "verified_external_evidence",
    acceptedEvidenceCount: new Set(
      claimLedger.entries
        .filter((entry) => entry.status === "eligible")
        .flatMap((entry) => entry.evidenceIds),
    ).size,
    confirmedFindingCount: claimLedger.entries.filter(
      (entry) =>
        entry.status === "eligible" &&
        (entry.kind === "fact" || entry.kind === "signal"),
    ).length,
    actionableHypothesisCount: claimLedger.entries.filter(
      (entry) => entry.opportunity && entry.status !== "blocked",
    ).length,
    technicalFailureCount: claimLedger.blockedModuleIds.length,
    coverageGapCount: claimLedger.gaps.length,
  });
  const moduleById = new Map(
    input.moduleResults.moduleResults.map((module) => [
      module.moduleId,
      module,
    ]),
  );
  const markdown = [
    "# Industry Research OS 本地行业报告",
    "",
    input.evidenceMode === "contract_fixture"
      ? "> **CONTRACT_ONLY：本报告只验证 G8 契约，不包含真实行业事实、规模、增速、需求强度或机会确定性。**"
      : "> 本报告只将 confirmed、coverage pass 且证据可追溯的声明列为 eligible；其余内容保持 blocked。",
    "",
    "## 决策摘要",
    "",
    renderResearchDecisionGuidance(decisionGuidance),
    "",
    ...chapters.flatMap((chapter) => {
      const entries = chapter.claimIds
        .map((claimId) =>
          claimLedger.entries.find((entry) => entry.claimId === claimId),
        )
        .filter((entry): entry is IndustryClaimLedgerEntry => Boolean(entry));
      const moduleCoverage = chapter.moduleIds.flatMap(
        (moduleId) => moduleById.get(moduleId)?.coverage ?? [],
      );
      const body: string[] = [
        `## ${chapter.chapter}. ${chapter.title}`,
        "",
        `- 章节状态：${chapter.status}`,
        `- Coverage：${moduleCoverage.length === 0 ? "context_only" : moduleCoverage.map((row) => `${row.coverageRowId}=${row.status}`).join("；")}`,
      ];
      if (chapter.status === "blocked") {
        body.push("- **BLOCKED：证据或覆盖不足，本章不生成完整结论性正文。**");
      }
      if (entries.length === 0) {
        body.push("- 无可列入声明；保留为 context/gap。", "");
      } else {
        body.push("", ...entries.map(renderEntry), "");
      }
      if (chapter.gaps.length > 0) {
        body.push(`- 证据缺口：${chapter.gaps.join("；")}`, "");
      }
      if (chapter.id === "knowledge-map") {
        body.push(
          `- 知识地图：nodes=${knowledgeMap.nodes.length}，edges=${knowledgeMap.edges.length}。`,
          "- 持续监控计划：只在获得新的公开、授权、可追溯 evidence 后增量更新；本地 contract fixture 不触发生产或外部监控。",
          "",
        );
      }
      return body;
    }),
  ].join("\n");
  return {
    schemaVersion: industryReportBundleSchemaVersion,
    artifactType: "industry-report-bundle",
    claimLedger,
    decisionGuidance,
    chapters,
    reportMarkdown: `${markdown.trimEnd()}\n`,
    knowledgeMap,
    compatibility: {
      industryExecutionManifestUnchanged: true,
      legacyDeliveryManifestSchemaVersion:
        "industry_research_delivery_manifest.v1",
      legacyEightFilePackageUnchanged: true,
      externalDeliveryBoundaryChanged: false,
    },
  };
}

export function serializeIndustryClaimLedger(ledger: IndustryClaimLedger) {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

export function serializeIndustryKnowledgeMap(map: IndustryKnowledgeMap) {
  return `${JSON.stringify(map, null, 2)}\n`;
}
