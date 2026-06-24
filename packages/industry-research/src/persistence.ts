import type {
  IndustryResearchDeliveryPackageManifest,
  IndustryResearchRunLog,
} from "./delivery-run";
import type {
  RawDocument,
  ResearchReviewItem,
  ResearchWorkflowInput,
} from "./types";

export type IndustryResearchRunRecord = {
  runId: string;
  status: "running" | "ready_for_review" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  input: ResearchWorkflowInput;
  manifest?: IndustryResearchDeliveryPackageManifest;
};

export type IndustryResearchReportRecord = {
  runId: string;
  reportMarkdown?: string;
  reviewedReportMarkdown?: string;
  updatedAt: string;
};

export type IndustryResearchRepositorySnapshot = {
  runs: IndustryResearchRunRecord[];
  rawDocuments: Array<{
    runId: string;
    documents: RawDocument[];
  }>;
  reviewItems: Array<{
    runId: string;
    items: ResearchReviewItem[];
  }>;
  reports: IndustryResearchReportRecord[];
  runLogs: Array<{
    runId: string;
    runLog: IndustryResearchRunLog;
  }>;
};

export type IndustryResearchRepository = {
  listRuns: () => Promise<IndustryResearchRunRecord[]>;
  getRun: (runId: string) => Promise<IndustryResearchRunRecord | null>;
  upsertRun: (record: IndustryResearchRunRecord) => Promise<void>;
  saveRawDocuments: (runId: string, documents: RawDocument[]) => Promise<void>;
  saveReviewItems: (
    runId: string,
    items: ResearchReviewItem[],
  ) => Promise<void>;
  saveReports: (record: IndustryResearchReportRecord) => Promise<void>;
  saveRunLog: (runId: string, runLog: IndustryResearchRunLog) => Promise<void>;
  snapshot: () => Promise<IndustryResearchRepositorySnapshot>;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function emptySnapshot(): IndustryResearchRepositorySnapshot {
  return {
    runs: [],
    rawDocuments: [],
    reviewItems: [],
    reports: [],
    runLogs: [],
  };
}

function upsertByRunId<T extends { runId: string }>(records: T[], record: T) {
  const index = records.findIndex((item) => item.runId === record.runId);

  if (index >= 0) {
    records[index] = record;
    return;
  }

  records.push(record);
}

export function createIndustryResearchLocalJsonRepository(
  initialSnapshot: Partial<IndustryResearchRepositorySnapshot> = {},
): IndustryResearchRepository {
  const state: IndustryResearchRepositorySnapshot = {
    ...emptySnapshot(),
    ...clone(initialSnapshot),
  };

  return {
    async listRuns() {
      return clone(
        [...state.runs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    },
    async getRun(runId) {
      return clone(state.runs.find((run) => run.runId === runId) ?? null);
    },
    async upsertRun(record) {
      upsertByRunId(state.runs, clone(record));
    },
    async saveRawDocuments(runId, documents) {
      upsertByRunId(state.rawDocuments, {
        runId,
        documents: clone(documents),
      });
    },
    async saveReviewItems(runId, items) {
      upsertByRunId(state.reviewItems, {
        runId,
        items: clone(items),
      });
    },
    async saveReports(record) {
      upsertByRunId(state.reports, clone(record));
    },
    async saveRunLog(runId, runLog) {
      upsertByRunId(state.runLogs, {
        runId,
        runLog: clone(runLog),
      });
    },
    async snapshot() {
      return clone(state);
    },
  };
}
