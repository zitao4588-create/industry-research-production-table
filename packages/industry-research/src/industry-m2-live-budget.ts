import type {
  PublicCrawlerFetch,
  PublicCrawlerResponse,
} from "./public-crawl-adapter";

export type IndustryM2LiveBudget = {
  maximumPublicRequests: number;
  maximumTavilySearchRequests: number;
  maximumFirecrawlCredits: number;
  maximumLlmRequests: 0;
  maximumCostYuan: number;
  maximumDurationMs: number;
  tavilyCostYuanPerRequest: number;
  firecrawlMapCreditReservation: number;
  firecrawlOtherCreditReservation: number;
};

export const industryM23LiveBudget: IndustryM2LiveBudget = {
  maximumPublicRequests: 30,
  maximumTavilySearchRequests: 3,
  maximumFirecrawlCredits: 50,
  maximumLlmRequests: 0,
  maximumCostYuan: 2,
  maximumDurationMs: 600_000,
  tavilyCostYuanPerRequest: 0.064,
  firecrawlMapCreditReservation: 20,
  firecrawlOtherCreditReservation: 5,
};

export const industryM24LiveBudget: IndustryM2LiveBudget = {
  maximumPublicRequests: 24,
  maximumTavilySearchRequests: 3,
  maximumFirecrawlCredits: 20,
  maximumLlmRequests: 0,
  maximumCostYuan: 1,
  maximumDurationMs: 600_000,
  tavilyCostYuanPerRequest: 0.064,
  firecrawlMapCreditReservation: 20,
  firecrawlOtherCreditReservation: 5,
};

export const industryM42Wave1LiveBudget: IndustryM2LiveBudget = {
  maximumPublicRequests: 36,
  maximumTavilySearchRequests: 6,
  maximumFirecrawlCredits: 30,
  maximumLlmRequests: 0,
  maximumCostYuan: 2,
  maximumDurationMs: 720_000,
  tavilyCostYuanPerRequest: 0.064,
  firecrawlMapCreditReservation: 20,
  firecrawlOtherCreditReservation: 5,
};

export const industryM42Wave2LiveBudget: IndustryM2LiveBudget = {
  maximumPublicRequests: 36,
  maximumTavilySearchRequests: 6,
  maximumFirecrawlCredits: 30,
  maximumLlmRequests: 0,
  maximumCostYuan: 2,
  maximumDurationMs: 720_000,
  tavilyCostYuanPerRequest: 0.064,
  firecrawlMapCreditReservation: 20,
  firecrawlOtherCreditReservation: 5,
};

export const industryM42Wave3LiveBudget: IndustryM2LiveBudget = {
  maximumPublicRequests: 36,
  maximumTavilySearchRequests: 6,
  maximumFirecrawlCredits: 30,
  maximumLlmRequests: 0,
  maximumCostYuan: 2,
  maximumDurationMs: 720_000,
  tavilyCostYuanPerRequest: 0.064,
  firecrawlMapCreditReservation: 20,
  firecrawlOtherCreditReservation: 5,
};

export const industryM42PublicRecoveryLiveBudget: IndustryM2LiveBudget = {
  maximumPublicRequests: 48,
  maximumTavilySearchRequests: 6,
  maximumFirecrawlCredits: 60,
  maximumLlmRequests: 0,
  maximumCostYuan: 2,
  maximumDurationMs: 900_000,
  tavilyCostYuanPerRequest: 0.064,
  firecrawlMapCreditReservation: 20,
  firecrawlOtherCreditReservation: 5,
};

export const industryM42PublicGapClosureLiveBudget: IndustryM2LiveBudget = {
  maximumPublicRequests: 12,
  maximumTavilySearchRequests: 0,
  maximumFirecrawlCredits: 20,
  maximumLlmRequests: 0,
  maximumCostYuan: 0,
  maximumDurationMs: 300_000,
  tavilyCostYuanPerRequest: 0.064,
  firecrawlMapCreditReservation: 20,
  firecrawlOtherCreditReservation: 5,
};

export const industryM42RegulationChangeLiveBudget: IndustryM2LiveBudget = {
  maximumPublicRequests: 4,
  maximumTavilySearchRequests: 0,
  maximumFirecrawlCredits: 10,
  maximumLlmRequests: 0,
  maximumCostYuan: 0,
  maximumDurationMs: 120_000,
  tavilyCostYuanPerRequest: 0.064,
  firecrawlMapCreditReservation: 10,
  firecrawlOtherCreditReservation: 5,
};

export type IndustryM2LiveRequestPhase = "discovery" | "crawl";
export type IndustryM2LiveRequestKind =
  | "tavily"
  | "firecrawl_map"
  | "firecrawl_other"
  | "native_public";

export type IndustryM2LiveRequestAudit = {
  requestNumber: number;
  phase: IndustryM2LiveRequestPhase;
  kind: IndustryM2LiveRequestKind;
  requestUrl: string;
  targetUrl: string | null;
  reservedFirecrawlCredits: number;
  reportedFirecrawlCredits: number | null;
  reservedCostYuan: number;
  status: "completed" | "http_error" | "failed";
  httpStatus: number | null;
  error: string | null;
};

export type IndustryM2LiveBudgetSnapshot = {
  publicRequests: number;
  tavilySearchRequests: number;
  firecrawlRequests: number;
  firecrawlReservedCredits: number;
  firecrawlReportedCredits: number;
  firecrawlResponsesWithCreditUsage: number;
  nativePublicRequests: number;
  llmRequests: 0;
  reservedCostYuan: number;
  events: IndustryM2LiveRequestAudit[];
};

function requestKind(value: string): IndustryM2LiveRequestKind {
  try {
    const url = new URL(value);
    if (url.hostname.includes("tavily")) return "tavily";
    if (url.hostname.includes("firecrawl")) {
      return /\/map\/?$/i.test(url.pathname)
        ? "firecrawl_map"
        : "firecrawl_other";
    }
  } catch {
    // The underlying public fetcher will reject malformed URLs.
  }
  return "native_public";
}

function targetUrlFromBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") return null;
  try {
    const parsed = JSON.parse(body) as { url?: unknown };
    return typeof parsed.url === "string" ? parsed.url : null;
  } catch {
    return null;
  }
}

function combineSignals(
  first: AbortSignal | null | undefined,
  second: AbortSignal | null | undefined,
) {
  const signals = [first, second].filter(Boolean) as AbortSignal[];
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}

function sanitizedError(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/api[_ -]?key[:=]\s*[^\s]+/gi, "api_key=[redacted]");
}

function reportedCreditsFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const direct = (payload as { creditsUsed?: unknown }).creditsUsed;
  if (typeof direct === "number" && direct >= 0) return direct;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const nested = (data as { creditsUsed?: unknown }).creditsUsed;
  return typeof nested === "number" && nested >= 0 ? nested : null;
}

async function captureReportedCredits(response: PublicCrawlerResponse) {
  const clone = (
    response as PublicCrawlerResponse & {
      clone?: () => { json: () => Promise<unknown> };
    }
  ).clone;
  if (!clone) return null;
  try {
    return reportedCreditsFromPayload(await clone.call(response).json());
  } catch {
    return null;
  }
}

export function createIndustryM2LiveBudgetTracker(input: {
  delegate: PublicCrawlerFetch;
  deadlineSignal?: AbortSignal;
  budget?: IndustryM2LiveBudget;
}) {
  const budget = input.budget ?? industryM23LiveBudget;
  const events: IndustryM2LiveRequestAudit[] = [];
  let publicRequests = 0;
  let tavilySearchRequests = 0;
  let firecrawlRequests = 0;
  let firecrawlReservedCredits = 0;
  let firecrawlReportedCredits = 0;
  let firecrawlResponsesWithCreditUsage = 0;
  let nativePublicRequests = 0;
  let reservedCostYuan = 0;
  let exhausted = false;

  const createFetcher = (
    phase: IndustryM2LiveRequestPhase,
  ): PublicCrawlerFetch => {
    return async (requestUrl, init) => {
      if (exhausted) throw new Error("m2_live_budget_already_exhausted");
      const kind = requestKind(requestUrl);
      const reservedCredits =
        kind === "firecrawl_map"
          ? budget.firecrawlMapCreditReservation
          : kind === "firecrawl_other"
            ? budget.firecrawlOtherCreditReservation
            : 0;
      const requestCost =
        kind === "tavily" ? budget.tavilyCostYuanPerRequest : 0;
      if (publicRequests + 1 > budget.maximumPublicRequests) {
        exhausted = true;
        throw new Error("m2_public_request_cap_reached");
      }
      if (
        kind === "tavily" &&
        tavilySearchRequests + 1 > budget.maximumTavilySearchRequests
      ) {
        exhausted = true;
        throw new Error("m2_tavily_request_cap_reached");
      }
      if (
        firecrawlReservedCredits + reservedCredits >
        budget.maximumFirecrawlCredits
      ) {
        exhausted = true;
        throw new Error("m2_firecrawl_credit_cap_reached");
      }
      if (reservedCostYuan + requestCost > budget.maximumCostYuan) {
        exhausted = true;
        throw new Error("m2_monetary_cost_cap_reached");
      }

      publicRequests += 1;
      if (kind === "tavily") tavilySearchRequests += 1;
      if (kind === "native_public") nativePublicRequests += 1;
      if (kind === "firecrawl_map" || kind === "firecrawl_other") {
        firecrawlRequests += 1;
        firecrawlReservedCredits += reservedCredits;
      }
      reservedCostYuan = Number((reservedCostYuan + requestCost).toFixed(6));
      const event: IndustryM2LiveRequestAudit = {
        requestNumber: publicRequests,
        phase,
        kind,
        requestUrl,
        targetUrl: targetUrlFromBody(init?.body),
        reservedFirecrawlCredits: reservedCredits,
        reportedFirecrawlCredits: null,
        reservedCostYuan: requestCost,
        status: "failed",
        httpStatus: null,
        error: null,
      };
      events.push(event);

      try {
        const response = await input.delegate(requestUrl, {
          ...init,
          signal: combineSignals(init?.signal, input.deadlineSignal),
        });
        event.httpStatus = response.status;
        event.status = response.ok ? "completed" : "http_error";
        if (kind === "firecrawl_map" || kind === "firecrawl_other") {
          const reported = await captureReportedCredits(response);
          event.reportedFirecrawlCredits = reported;
          if (reported !== null) {
            firecrawlReportedCredits += reported;
            firecrawlResponsesWithCreditUsage += 1;
            if (firecrawlReportedCredits > budget.maximumFirecrawlCredits) {
              exhausted = true;
              throw new Error("m2_firecrawl_reported_credit_cap_exceeded");
            }
          }
        }
        return response;
      } catch (error) {
        event.status = "failed";
        event.error = sanitizedError(error);
        throw error;
      }
    };
  };

  const snapshot = (): IndustryM2LiveBudgetSnapshot => ({
    publicRequests,
    tavilySearchRequests,
    firecrawlRequests,
    firecrawlReservedCredits,
    firecrawlReportedCredits,
    firecrawlResponsesWithCreditUsage,
    nativePublicRequests,
    llmRequests: 0,
    reservedCostYuan,
    events: structuredClone(events),
  });

  return { createFetcher, snapshot };
}
