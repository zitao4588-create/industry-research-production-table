import type {
  IndustryResearchDatabaseName,
  ResearchWorkflowStepStatus,
} from "@industry-research/core";
import type {
  UIDatabaseSummary,
  UIResearchModel,
  UIResearchStats,
  UISourceCandidate,
  UIWorkflowStep,
} from "./research";

type StatKey = keyof UIResearchStats;
type WorkflowStepId = UIWorkflowStep["id"];

export type RunEvent =
  | {
      type: "step.start";
      at: string;
      stepId: WorkflowStepId;
      message?: string;
    }
  | {
      type: "step.done";
      at: string;
      stepId: WorkflowStepId;
      message?: string;
    }
  | {
      type: "source.found";
      at: string;
      candidate: UISourceCandidate;
    }
  | {
      type: "crawl.progress";
      at: string;
      completed: number;
      total: number;
      rawDocs: number;
    }
  | {
      type: "db.upserted";
      at: string;
      database: IndustryResearchDatabaseName;
      count: number;
    }
  | {
      type: "stat.update";
      at: string;
      key: StatKey;
      value: number;
    }
  | {
      type: "log";
      at: string;
      message: string;
    }
  | {
      type: "run.error";
      at: string;
      message: string;
      stepId?: WorkflowStepId;
    }
  | {
      type: "run.done";
      at: string;
      message?: string;
    };

export type TimedRunEvent = RunEvent & {
  delayMs: number;
};

export type DerivedRunState = {
  currentStepId?: WorkflowStepId;
  progress: number;
  completedSteps: number;
  sourceCandidates: UISourceCandidate[];
  databases: UIDatabaseSummary[];
  stats: UIResearchStats;
  logs: string[];
  stepStatus: Record<WorkflowStepId, ResearchWorkflowStepStatus>;
  crawl: {
    completed: number;
    total: number;
    rawDocs: number;
  };
  done: boolean;
  error?: string;
};

function isoAt(startedAt: Date, offsetMs: number) {
  return new Date(startedAt.getTime() + offsetMs).toISOString();
}

function withDelay<T extends RunEvent>(
  event: T,
  delayMs: number,
): TimedRunEvent {
  return {
    ...event,
    delayMs,
  };
}

function databaseCountById(
  model: UIResearchModel,
  id: IndustryResearchDatabaseName,
) {
  return model.databases.find((database) => database.id === id)?.count ?? 0;
}

export function createMockRunEventTimeline(
  model: UIResearchModel,
  startedAt = new Date(),
): TimedRunEvent[] {
  const events: TimedRunEvent[] = [];
  let t = 0;

  const push = (event: RunEvent, advance = 320) => {
    events.push(withDelay(event, t));
    t += advance;
  };

  for (const [index, step] of model.workflowSteps.entries()) {
    push(
      {
        type: "step.start",
        at: isoAt(startedAt, t),
        stepId: step.id,
        message: step.title,
      },
      index === 0 ? 260 : 360,
    );

    if (step.id === "discover_sources") {
      model.sourceCandidates.forEach((candidate, sourceIndex) => {
        push(
          {
            type: "source.found",
            at: isoAt(startedAt, t),
            candidate,
          },
          sourceIndex < 2 ? 180 : 130,
        );
      });
      push({
        type: "stat.update",
        at: isoAt(startedAt, t),
        key: "candidates",
        value: model.stats.candidates,
      });
    }

    if (step.id === "mock_crawl_sources") {
      const total = model.stats.crawlJobs;
      [3, 6, 9, total].forEach((completed, crawlIndex) => {
        push(
          {
            type: "crawl.progress",
            at: isoAt(startedAt, t),
            completed,
            total,
            rawDocs: Math.min(model.stats.rawDocs, 5 + crawlIndex * 5),
          },
          180,
        );
      });
      push({
        type: "stat.update",
        at: isoAt(startedAt, t),
        key: "rawDocs",
        value: model.stats.rawDocs,
      });
      push({
        type: "stat.update",
        at: isoAt(startedAt, t),
        key: "crawlJobs",
        value: model.stats.crawlJobs,
      });
    }

    if (step.id === "build_industry_databases") {
      model.databases.forEach((database) => {
        push(
          {
            type: "db.upserted",
            at: isoAt(startedAt, t),
            database: database.id,
            count: database.count,
          },
          90,
        );
      });
    }

    if (step.id === "score_opportunities") {
      push({
        type: "stat.update",
        at: isoAt(startedAt, t),
        key: "extractionJobs",
        value: model.stats.extractionJobs,
      });
      push({
        type: "stat.update",
        at: isoAt(startedAt, t),
        key: "evidence",
        value: model.stats.evidence,
      });
    }

    push(
      {
        type: "step.done",
        at: isoAt(startedAt, t),
        stepId: step.id,
        message: `${step.title}完成`,
      },
      180,
    );
  }

  push(
    {
      type: "run.done",
      at: isoAt(startedAt, t),
      message: "研究生产台已生成可审核结果。",
    },
    0,
  );

  return events;
}

export function createRunStartedEvents(
  model: UIResearchModel,
  startedAt = new Date(),
): RunEvent[] {
  const firstStep = model.workflowSteps[0];

  if (!firstStep) {
    return [];
  }

  return [
    {
      type: "step.start",
      at: startedAt.toISOString(),
      stepId: firstStep.id,
      message: firstStep.title,
    },
    {
      type: "log",
      at: startedAt.toISOString(),
      message: "已进入运行态，等待后端返回事件。",
    },
  ];
}

export function deriveRunState(
  events: RunEvent[],
  model: UIResearchModel,
): DerivedRunState {
  const stepStatus = model.workflowSteps.reduce(
    (status, step) => {
      status[step.id] = "pending";
      return status;
    },
    {} as Record<WorkflowStepId, ResearchWorkflowStepStatus>,
  );
  const sources: UISourceCandidate[] = [];
  const databaseCounts = new Map<IndustryResearchDatabaseName, number>();
  const stats: UIResearchStats = {
    candidates: 0,
    rawDocs: 0,
    extractionJobs: 0,
    evidence: 0,
    crawlJobs: 0,
  };
  const logs: string[] = [];
  const crawl = {
    completed: 0,
    total: model.stats.crawlJobs,
    rawDocs: 0,
  };
  let currentStepId: WorkflowStepId | undefined;
  let done = false;
  let error: string | undefined;

  for (const event of events) {
    switch (event.type) {
      case "step.start":
        stepStatus[event.stepId] = "running";
        currentStepId = event.stepId;
        logs.push(event.message ?? `开始 ${event.stepId}`);
        break;
      case "step.done":
        stepStatus[event.stepId] = "done";
        if (currentStepId === event.stepId) {
          currentStepId = undefined;
        }
        logs.push(event.message ?? `完成 ${event.stepId}`);
        break;
      case "source.found":
        sources.push(event.candidate);
        stats.candidates = Math.max(stats.candidates, sources.length);
        logs.push(`发现信息源：${event.candidate.title}`);
        break;
      case "crawl.progress":
        crawl.completed = event.completed;
        crawl.total = event.total;
        crawl.rawDocs = event.rawDocs;
        stats.crawlJobs = event.completed;
        stats.rawDocs = event.rawDocs;
        logs.push(`采集进度 ${event.completed}/${event.total}`);
        break;
      case "db.upserted":
        databaseCounts.set(event.database, event.count);
        logs.push(`写入 ${event.database}：${event.count} 条`);
        break;
      case "stat.update":
        stats[event.key] = event.value;
        break;
      case "log":
        logs.push(event.message);
        break;
      case "run.error":
        error = event.message;
        if (event.stepId) {
          stepStatus[event.stepId] = "failed";
        }
        logs.push(event.message);
        break;
      case "run.done":
        done = true;
        logs.push(event.message ?? "运行完成");
        break;
    }
  }

  const completedSteps = model.workflowSteps.filter(
    (step) => stepStatus[step.id] === "done",
  ).length;

  if (done) {
    for (const database of model.databases) {
      databaseCounts.set(database.id, database.count);
    }
  }

  return {
    currentStepId,
    progress: model.workflowSteps.length
      ? completedSteps / model.workflowSteps.length
      : 0,
    completedSteps,
    sourceCandidates: sources,
    databases: model.databases.map((database) => ({
      ...database,
      count: databaseCounts.get(database.id) ?? (done ? database.count : 0),
    })),
    stats: done ? model.stats : stats,
    logs: logs.slice(-9).reverse(),
    stepStatus,
    crawl,
    done,
    error,
  };
}

export function getDatabaseCount(
  model: UIResearchModel,
  id: IndustryResearchDatabaseName,
) {
  return databaseCountById(model, id);
}
