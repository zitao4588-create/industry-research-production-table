import { validateEvidenceQuotes } from "./extraction-validator";
import type {
  CompetitorDatabaseEntry,
  Evidence,
  OpportunityDatabaseEntry,
  RawDocument,
} from "./types";

export type EvidenceCompleteFinding = {
  targetType: "competitor" | "opportunity";
  targetId: string;
  evidenceComplete: boolean;
  failureReasons: string[];
};

function evidenceReferencesFor(evidenceIds: string[], evidence: Evidence[]) {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  return evidenceIds.flatMap((evidenceId) => {
    const item = evidenceById.get(evidenceId);
    if (!item) return [];
    return [
      {
        quote: item.quote,
        rawDocumentId: item.rawDocumentId,
        sourceId: item.sourceId,
      },
    ];
  });
}

export function assessEvidenceCompleteFindings({
  competitors,
  opportunities,
  evidence,
  rawDocuments,
}: {
  competitors: CompetitorDatabaseEntry[];
  opportunities: OpportunityDatabaseEntry[];
  evidence: Evidence[];
  rawDocuments: RawDocument[];
}) {
  const findings: EvidenceCompleteFinding[] = [
    ...competitors.map((competitor) => {
      const validation = validateEvidenceQuotes(
        evidenceReferencesFor(competitor.evidenceIds, evidence),
        rawDocuments,
        {
          claimTexts: [
            competitor.name,
            competitor.channel,
            competitor.positioning,
          ],
          requiredClaimTexts: [
            competitor.name,
            competitor.channel,
            competitor.positioning,
          ],
        },
      );
      return {
        targetType: "competitor" as const,
        targetId: competitor.competitorId,
        evidenceComplete: validation.claimSupportComplete,
        failureReasons: validation.failureReasons,
      };
    }),
    ...opportunities.map((opportunity) => {
      const validation = validateEvidenceQuotes(
        evidenceReferencesFor(opportunity.evidenceIds, evidence),
        rawDocuments,
        {
          claimTexts: [opportunity.title, opportunity.summary],
          requiredClaimTexts: [opportunity.title, opportunity.summary],
          requireDemandEvidence: true,
        },
      );
      return {
        targetType: "opportunity" as const,
        targetId: opportunity.opportunityId,
        evidenceComplete: validation.claimSupportComplete,
        failureReasons: validation.failureReasons,
      };
    }),
  ];
  const evidenceCompleteFindings = findings.filter(
    (finding) => finding.evidenceComplete,
  ).length;

  return {
    findings,
    findingCount: findings.length,
    evidenceCompleteFindings,
    evidenceCompleteFindingRatio:
      findings.length > 0 ? evidenceCompleteFindings / findings.length : 0,
  };
}
