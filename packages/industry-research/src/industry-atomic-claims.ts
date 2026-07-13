import { canIndustrySourceRoleSupportClaimRole } from "./evidence-role-gate";
import type { IndustryAcquisitionRoute } from "./industry-acquisition-router";
import type { IndustryAcquisitionTaskPlan } from "./industry-acquisition-task";
import type {
  IndustryM2WaveRawDocumentInput,
  IndustryM2WaveVerification,
} from "./industry-m2-wave-verification";
import type {
  IndustryPlanClaimRole,
  IndustryPlanSourceRole,
} from "./industry-planner";
import {
  assertIndustryRawDocumentStore,
  canonicalizeIndustryRawDocumentUrl,
  type IndustryRawDocumentStore,
  sha256IndustryContent,
} from "./industry-raw-document-store";

export const industryAtomicClaimsSchemaVersion =
  "industry_atomic_claims.v1" as const;

export type IndustryAtomicClaimCandidate = {
  candidateId: string;
  statement: string;
  claimRole: IndustryPlanClaimRole;
  sourceUrl: string;
  quote: string;
};

export type IndustryAtomicClaim = {
  claimId: string;
  statement: string;
  claimRole: IndustryPlanClaimRole;
  sourceRole: IndustryPlanSourceRole;
  taskId: string;
  coverageRowId: string;
  rawDocumentId: string;
  extractedDocumentId: string;
  extractedContentHash: `sha256:${string}`;
  sourceUrl: string;
  quote: string;
  quoteStart: number;
  quoteEnd: number;
  status: "confirmed_atomic_fact";
  assertions: {
    m2StronglyRelevantCandidate: true;
    immutableRawDocumentBound: true;
    quoteExactMatch: true;
    statementDirectlySupportedByQuote: true;
    sourceRoleAuthorizedForClaimRole: true;
    candidateIsNotCommercializationDecision: true;
  };
};

export type IndustryAtomicClaimRejection = {
  candidateId: string;
  sourceUrl: string;
  failures: string[];
};

export type IndustryAtomicClaimsArtifact = {
  schemaVersion: typeof industryAtomicClaimsSchemaVersion;
  artifactType: "industry-atomic-claims";
  runId: string;
  category: string;
  claims: IndustryAtomicClaim[];
  rejectedCandidates: IndustryAtomicClaimRejection[];
  excludedM2Documents: Array<{
    url: string;
    status: Exclude<
      IndustryM2WaveVerification["documentAudit"][number]["status"],
      "raw_candidate_relevant_not_evidence"
    >;
    binaryPayloadDetected: boolean;
  }>;
  summary: {
    inputCandidateCount: number;
    confirmedAtomicClaimCount: number;
    rejectedCandidateCount: number;
    immutableRawDocumentCount: number;
    sourceRoles: IndustryPlanSourceRole[];
    claimRoles: IndustryPlanClaimRole[];
    coverageRowIds: string[];
    excludedM2DocumentCount: number;
  };
  assertions: {
    onlyM2StronglyRelevantCandidatesUsed: true;
    everyClaimBindsImmutableRawDocument: true;
    everyQuoteExactMatched: true;
    everyClaimRoleAuthorized: true;
    rejectedM2DocumentsFailClosed: true;
    llmRequests: 0;
    reportGenerated: false;
    commercializationAssessed: false;
    productionWrite: false;
  };
};

function unique<T extends string>(values: T[]) {
  return [...new Set(values)];
}

function normalized(value: string) {
  return value.replace(/\s+/g, "").replace(/[。；;]$/g, "");
}

function atomicStatementFailures(statement: string) {
  const failures: string[] = [];
  const trimmed = statement.trim();
  if (trimmed.length < 4) failures.push("atomic_statement_too_short");
  if (trimmed.length > 180) failures.push("atomic_statement_too_long");
  if (
    /(?:停止商业化|终止商业化|值得进入|不值得进入|蓝海|商业机会|建议推出)/.test(
      trimmed,
    )
  ) {
    failures.push("commercialization_decision_forbidden");
  }
  if (/(?:此外|另一方面|与此同时|不仅.+而且|不但.+而且)/.test(trimmed)) {
    failures.push("compound_statement_requires_split");
  }
  if ((trimmed.match(/[。！？!?]/g) ?? []).length > 1) {
    failures.push("multiple_sentences_require_split");
  }
  return failures;
}

export async function createIndustryAtomicClaimsArtifact(input: {
  runId: string;
  category: string;
  candidates: IndustryAtomicClaimCandidate[];
  rawDocuments: IndustryM2WaveRawDocumentInput[];
  routes: IndustryAcquisitionRoute[];
  rawStore: IndustryRawDocumentStore;
  verification: IndustryM2WaveVerification;
  taskPlan: IndustryAcquisitionTaskPlan;
}): Promise<IndustryAtomicClaimsArtifact> {
  if (!input.runId.trim() || !input.category.trim()) {
    throw new Error("industry_atomic_claims_identity_required");
  }
  await assertIndustryRawDocumentStore(input.rawStore);
  const relevantByUrl = new Map(
    input.verification.documentAudit.flatMap((document) => {
      if (document.status !== "raw_candidate_relevant_not_evidence") return [];
      const canonical = canonicalizeIndustryRawDocumentUrl(document.url);
      return canonical ? [[canonical, document] as const] : [];
    }),
  );
  const rawByUrl = new Map(
    input.rawDocuments.flatMap((document) => {
      const canonical = canonicalizeIndustryRawDocumentUrl(document.url);
      return canonical ? [[canonical, document] as const] : [];
    }),
  );
  const routeByUrl = new Map(
    input.routes.flatMap((route) => {
      const canonical = canonicalizeIndustryRawDocumentUrl(
        route.targetReference,
      );
      return canonical ? [[canonical, route] as const] : [];
    }),
  );
  const immutableByUrl = new Map(
    input.rawStore.documents.map((document) => [
      document.canonicalUrl,
      document,
    ]),
  );
  const claims: IndustryAtomicClaim[] = [];
  const rejectedCandidates: IndustryAtomicClaimRejection[] = [];
  const seenCandidateIds = new Set<string>();

  for (const candidate of input.candidates) {
    const failures = atomicStatementFailures(candidate.statement);
    if (!candidate.candidateId.trim()) failures.push("candidate_id_required");
    if (seenCandidateIds.has(candidate.candidateId)) {
      failures.push("candidate_id_duplicate");
    }
    seenCandidateIds.add(candidate.candidateId);
    const canonical = canonicalizeIndustryRawDocumentUrl(candidate.sourceUrl);
    if (!canonical) failures.push("candidate_source_url_invalid");
    const relevant = canonical ? relevantByUrl.get(canonical) : undefined;
    const rawDocument = canonical ? rawByUrl.get(canonical) : undefined;
    const route = canonical ? routeByUrl.get(canonical) : undefined;
    const immutable = canonical ? immutableByUrl.get(canonical) : undefined;
    if (!relevant) failures.push("m2_strong_relevance_gate_failed");
    if (!rawDocument) failures.push("extracted_raw_document_missing");
    if (!route) failures.push("acquisition_route_missing");
    if (!immutable) failures.push("immutable_raw_document_missing");
    const task = route
      ? input.taskPlan.tasks.find((item) => item.taskId === route.taskId)
      : undefined;
    if (!task) failures.push("acquisition_task_missing");
    if (route && relevant && route.sourceRole !== relevant.sourceRole) {
      failures.push("m2_source_role_mismatch");
    }
    if (
      route &&
      immutable &&
      (immutable.taskId !== route.taskId ||
        immutable.routeId !== route.routeId ||
        immutable.sourceRole !== route.sourceRole)
    ) {
      failures.push("immutable_route_binding_mismatch");
    }
    if (task && !task.targetClaimRoles.includes(candidate.claimRole)) {
      failures.push("claim_role_not_targeted_by_task");
    }
    if (
      route &&
      !canIndustrySourceRoleSupportClaimRole(
        route.sourceRole,
        candidate.claimRole,
      )
    ) {
      failures.push("source_role_not_authorized_for_claim_role");
    }
    const quoteStart = rawDocument
      ? rawDocument.extractedText.indexOf(candidate.quote)
      : -1;
    if (!candidate.quote.trim()) failures.push("quote_required");
    if (quoteStart < 0) failures.push("quote_not_exactly_matched");
    if (
      candidate.quote &&
      !normalized(candidate.quote).includes(normalized(candidate.statement))
    ) {
      failures.push("statement_not_directly_supported_by_quote");
    }

    if (
      failures.length > 0 ||
      !canonical ||
      !relevant ||
      !rawDocument ||
      !route ||
      !immutable ||
      !task
    ) {
      rejectedCandidates.push({
        candidateId: candidate.candidateId,
        sourceUrl: candidate.sourceUrl,
        failures: unique(failures),
      });
      continue;
    }
    claims.push({
      claimId: candidate.candidateId,
      statement: candidate.statement.trim(),
      claimRole: candidate.claimRole,
      sourceRole: route.sourceRole,
      taskId: task.taskId,
      coverageRowId: task.coverageRowId,
      rawDocumentId: immutable.documentId,
      extractedDocumentId: rawDocument.id,
      extractedContentHash: await sha256IndustryContent(
        rawDocument.extractedText,
      ),
      sourceUrl: canonical,
      quote: candidate.quote,
      quoteStart,
      quoteEnd: quoteStart + candidate.quote.length,
      status: "confirmed_atomic_fact",
      assertions: {
        m2StronglyRelevantCandidate: true,
        immutableRawDocumentBound: true,
        quoteExactMatch: true,
        statementDirectlySupportedByQuote: true,
        sourceRoleAuthorizedForClaimRole: true,
        candidateIsNotCommercializationDecision: true,
      },
    });
  }

  const excludedM2Documents = input.verification.documentAudit.flatMap(
    (document) =>
      document.status === "raw_candidate_relevant_not_evidence"
        ? []
        : [
            {
              url: document.url,
              status: document.status,
              binaryPayloadDetected: document.binaryPayloadDetected,
            },
          ],
  );
  return {
    schemaVersion: industryAtomicClaimsSchemaVersion,
    artifactType: "industry-atomic-claims",
    runId: input.runId,
    category: input.category,
    claims,
    rejectedCandidates,
    excludedM2Documents,
    summary: {
      inputCandidateCount: input.candidates.length,
      confirmedAtomicClaimCount: claims.length,
      rejectedCandidateCount: rejectedCandidates.length,
      immutableRawDocumentCount: new Set(
        claims.map((claim) => claim.rawDocumentId),
      ).size,
      sourceRoles: unique(claims.map((claim) => claim.sourceRole)),
      claimRoles: unique(claims.map((claim) => claim.claimRole)),
      coverageRowIds: unique(claims.map((claim) => claim.coverageRowId)),
      excludedM2DocumentCount: excludedM2Documents.length,
    },
    assertions: {
      onlyM2StronglyRelevantCandidatesUsed: true,
      everyClaimBindsImmutableRawDocument: true,
      everyQuoteExactMatched: true,
      everyClaimRoleAuthorized: true,
      rejectedM2DocumentsFailClosed: true,
      llmRequests: 0,
      reportGenerated: false,
      commercializationAssessed: false,
      productionWrite: false,
    },
  };
}

export function serializeIndustryAtomicClaimsArtifact(
  artifact: IndustryAtomicClaimsArtifact,
) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
