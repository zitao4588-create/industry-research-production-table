import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  assertIndustryRawDocumentStore,
  canonicalizeIndustryRawDocumentUrl,
  cleanDocumentText,
  createIndustryAcquisitionRoute,
  createIndustryAcquisitionTaskPlan,
  createIndustryM2LiveBudgetTracker,
  createIndustryPlan,
  createIndustryRawDocumentStore,
  type IndustryAcquisitionRoute,
  type IndustryM2WaveRawDocumentInput,
  type IndustryPlanSourceRole,
  type IndustryRawDocumentStore,
  industryM42PublicGapClosureLiveBudget,
  industryM42PublicRecoveryLiveBudget,
  industryM42RegulationChangeLiveBudget,
  industryM42Wave1LiveBudget,
  industryM42Wave2LiveBudget,
  industryM42Wave3LiveBudget,
  type PublicCrawlerFetch,
  putIndustryRawDocument,
  searchWithApiProvider,
  serializeIndustryM2WaveVerification,
  serializeIndustryRawDocumentStore,
  skincareIndustryPlanningFixture,
  verifyIndustryM2Wave,
} from "../packages/industry-research/src/index.ts";

type Candidate = {
  name: string;
  url: string;
  sourceRole: IndustryPlanSourceRole;
  discovery: "official_public_seed" | "public_market_recovery_seed" | "tavily";
  query: string | null;
  targetCoverageRowId: string | null;
};

type SearchQuery = {
  text: string;
  targetCoverageRowId: string | null;
};

function argumentValue(name: string) {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function timestampForPath(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function loadLocalEnv() {
  try {
    return readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .reduce<Record<string, string>>((env, line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return env;
        const separator = trimmed.indexOf("=");
        if (separator <= 0) return env;
        env[trimmed.slice(0, separator).trim()] = trimmed
          .slice(separator + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        return env;
      }, {});
  } catch {
    return {};
  }
}

function sanitizedError(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(process.cwd(), "[workspace]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/api[_ -]?key[:=]\s*[^\s]+/gi, "api_key=[redacted]");
}

async function writeTextAtomic(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, path);
}

async function writeJsonAtomic(path: string, value: unknown) {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

function hostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function roleForUrl(url: string): IndustryPlanSourceRole | null {
  const host = hostname(url);
  if (!host) return null;
  if (
    host.includes("static.cninfo") ||
    (host.includes("proya-group.com") &&
      (/\/finance(?:\/|$)/i.test(new URL(url).pathname) ||
        /\/local_upload\/.*\.pdf$/i.test(new URL(url).pathname))) ||
    (host.includes("finance.sina.com.cn") &&
      new URL(url).pathname.includes("BulletinDetail"))
  ) {
    return "financial_report";
  }
  if (host === "stats.gov.cn" || host.endsWith(".stats.gov.cn")) {
    return "government_statistics";
  }
  if (
    host === "nmpa.gov.cn" ||
    host.endsWith(".nmpa.gov.cn") ||
    host === "samr.gov.cn" ||
    host.endsWith(".samr.gov.cn") ||
    host.endsWith(".gov.cn")
  ) {
    return "regulator";
  }
  if (host === "cninfo.com.cn" || host.endsWith(".cninfo.com.cn")) {
    return "financial_report";
  }
  if (
    host.includes("iresearch") ||
    host.includes("questmobile") ||
    host.includes("nielseniq") ||
    host.includes("cncic") ||
    host.includes("cic")
  ) {
    return "credible_research_institution";
  }
  if (
    host.includes("caffci") ||
    host.includes("chinabeauty") ||
    host.includes("cosmetics")
  ) {
    return "industry_association";
  }
  if (
    host.includes("proya") ||
    host.includes("loreal") ||
    host.includes("jahwa") ||
    host.includes("pechoin")
  ) {
    return "brand_official_site";
  }
  if (
    host.includes("bloomage") ||
    host.includes("cosmax") ||
    host.includes("intercos")
  ) {
    return "supply_chain_company";
  }
  if (host.endsWith("jd.com") || host.endsWith("tmall.com")) {
    return "trusted_retail_channel";
  }
  if (host.includes("kantarworldpanel")) return "user_research";
  if (host.includes("index.baidu")) return "search_trend";
  if (host.includes("newrank") || host.includes("qian-gua")) {
    return "creator_data";
  }
  if (host.includes("xiaohongshu")) return "public_community";
  if (host.includes("zhihu")) return "public_community";
  if (host.includes("oceanengine")) return "content_platform";
  return null;
}

function sourceNameFromUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

if (!process.argv.includes("--execute")) {
  throw new Error("m4_2_live_wave_requires_explicit_execute");
}

const started = new Date();
const waveNumber = Number(argumentValue("wave") ?? "1");
if (![1, 2, 3, 4, 5, 6].includes(waveNumber)) {
  throw new Error("m4_2_wave_number_invalid");
}
const previousRunArgument = argumentValue("previous-run");
const previousRunDir = previousRunArgument
  ? resolve(previousRunArgument)
  : null;
if (waveNumber > 1 && !previousRunDir) {
  throw new Error("m4_2_wave_previous_run_required");
}
const budget =
  waveNumber === 1
    ? industryM42Wave1LiveBudget
    : waveNumber === 2
      ? industryM42Wave2LiveBudget
      : waveNumber === 3
        ? industryM42Wave3LiveBudget
        : waveNumber === 4
          ? industryM42PublicRecoveryLiveBudget
          : waveNumber === 5
            ? industryM42PublicGapClosureLiveBudget
            : industryM42RegulationChangeLiveBudget;
const runId = `skincare-m4-2-wave-${waveNumber}-${timestampForPath(started)}`;
const outputDir = resolve(
  argumentValue("output") ??
    join("outputs", "industry-data-report-loop", "m4.2", runId),
);
await mkdir(outputDir, { recursive: true });
const loadedEnv = { ...loadLocalEnv(), ...process.env };
const searchApiKey = loadedEnv.AGENT_FACTORY_SEARCH_API_KEY?.trim();
const firecrawlApiKey = (
  loadedEnv.AGENT_FACTORY_FIRECRAWL_API_KEY ??
  loadedEnv.FIRECRAWL_API_KEY ??
  ""
).trim();
if (!firecrawlApiKey) throw new Error("m4_2_firecrawl_api_key_missing");

const query = (
  text: string,
  targetCoverageRowId: string | null = null,
): SearchQuery => ({ text, targetCoverageRowId });
const queries: SearchQuery[] =
  waveNumber === 1
    ? [
        query("护肤品 市场规模 2024 中国 国家统计局 行业协会"),
        query("护肤品 化妆品 监管 功效宣称 国家药监局"),
        query("护肤品 消费者需求 调研 中国"),
        query("护肤品 品牌 官网 产品 中国 珀莱雅 欧莱雅"),
        query("护肤品 内容趋势 百度指数 巨量算数 小红书"),
        query("化妆品 供应链 OEM ODM 年报 华熙生物"),
      ]
    : waveNumber === 2
      ? [
          query("site:iresearch.com.cn 护肤品 中国 行业 2024"),
          query("site:questmobile.com.cn 护肤 美妆 消费者 2024"),
          query("site:item.jd.com 护肤 珀莱雅 精华"),
          query("site:proya.com 护肤 产品 精华 面霜"),
          query("site:xiaohongshu.com OR site:index.baidu.com 护肤品 趋势"),
          query("site:bloomagebiotech.com 护肤 化妆品 原料 产业链"),
        ]
      : waveNumber === 3
        ? [
            query("site:caffci.org.cn OR site:caffci.com 护肤品 化妆品 行业"),
            query("site:cninfo.com.cn 珀莱雅 2024 年度报告 PDF"),
            query("site:zhihu.com 护肤品 消费者 痛点"),
            query("site:item.jd.com 护肤品 精华 面霜"),
            query(
              "site:lorealchina.com 护肤 产品 精华 OR site:jahwa.com.cn 护肤",
            ),
            query(
              "site:oceanengine.com 护肤 美妆 趋势 OR site:index.baidu.com 护肤品",
            ),
          ]
        : waveNumber === 4
          ? [
              query(
                "中国 护肤品 全渠道 品类 公开报告 NIQ",
                "coverage-market-channels",
              ),
              query(
                "中国 护肤品 消费者 需求 公开调查 凯度",
                "coverage-consumer-needs",
              ),
              query(
                "site:item.jd.com 护肤品 面霜 精华",
                "coverage-competitor-channels",
              ),
              query(
                "site:cninfo.com.cn 化妆品 2024 年度报告 供应链",
                "coverage-supply-chain",
              ),
              query(
                "site:oceanengine.com 护肤 美妆 内容 趋势 报告",
                "coverage-content-channels",
              ),
              query(
                "site:newrank.cn 护肤 美妆 内容 趋势 数据",
                "coverage-content-channels",
              ),
            ]
          : [];
if (queries.length > 0 && !searchApiKey) {
  throw new Error("m4_2_tavily_api_key_missing");
}
const publicMarketRecoverySeeds: Candidate[] =
  waveNumber === 4
    ? [
        {
          name: "NIQ 中国美妆个护行业趋势与展望",
          url: "https://nielseniq.cn/global/zh/insights/report/2024/niq-2024-china-beauty-and-personal-insight/",
          sourceRole: "credible_research_institution",
          discovery: "public_market_recovery_seed",
          query: null,
          targetCoverageRowId: "coverage-market-channels",
        },
        {
          name: "珀莱雅 2024 年年度报告",
          url: "https://www.proya-group.com/local_upload/20250428/1916677184807374848.pdf",
          sourceRole: "financial_report",
          discovery: "public_market_recovery_seed",
          query: null,
          targetCoverageRowId: "coverage-market-price-tiers",
        },
        {
          name: "中国香料香精化妆品工业协会 2024 年产业发展报告发布页",
          url: "https://npo05545b.npoall.com/news/itemid-223157.html",
          sourceRole: "industry_association",
          discovery: "public_market_recovery_seed",
          query: null,
          targetCoverageRowId: "coverage-market-taxonomy",
        },
        {
          name: "凯度 2024 中国美妆趋势报告",
          url: "https://www.kantarworldpanel.com/cn/News/2024-China-Beauty-Trend-Report",
          sourceRole: "user_research",
          discovery: "public_market_recovery_seed",
          query: null,
          targetCoverageRowId: "coverage-consumer-needs",
        },
        {
          name: "京东美妆护肤公开频道",
          url: "https://channel.jd.com/beauty.html",
          sourceRole: "trusted_retail_channel",
          discovery: "public_market_recovery_seed",
          query: null,
          targetCoverageRowId: "coverage-competitor-channels",
        },
        {
          name: "京东护肤公开商品页",
          url: "https://item.jd.com/100071237043.html",
          sourceRole: "trusted_retail_channel",
          discovery: "public_market_recovery_seed",
          query: null,
          targetCoverageRowId: "coverage-competitor-taxonomy",
        },
        {
          name: "珀莱雅 2024 年年度报告公开公告",
          url: "https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?id=10958293",
          sourceRole: "financial_report",
          discovery: "public_market_recovery_seed",
          query: null,
          targetCoverageRowId: "coverage-business-models",
        },
        {
          name: "贝泰妮 2024 年年度报告",
          url: "https://static.cninfo.com.cn/finalpage/2025-04-25/1223273022.PDF",
          sourceRole: "financial_report",
          discovery: "public_market_recovery_seed",
          query: null,
          targetCoverageRowId: "coverage-supply-chain",
        },
        {
          name: "巨量引擎中国美妆行业趋势公开页",
          url: "https://www.oceanengine.com/blog/meizhuang-hangye-baogao.html",
          sourceRole: "content_platform",
          discovery: "public_market_recovery_seed",
          query: null,
          targetCoverageRowId: "coverage-content-channels",
        },
        {
          name: "新榜小红书美妆用户趋势洞察",
          url: "https://www.newrank.cn/report/detail/393",
          sourceRole: "creator_data",
          discovery: "public_market_recovery_seed",
          query: null,
          targetCoverageRowId: "coverage-content-channels",
        },
      ]
    : waveNumber === 5
      ? [
          {
            name: "凯度 2024 中国美妆趋势报告",
            url: "https://www.kantarworldpanel.com/cn/News/2024-China-Beauty-Trend-Report",
            sourceRole: "user_research",
            discovery: "public_market_recovery_seed",
            query: null,
            targetCoverageRowId: "coverage-consumer-needs",
          },
          {
            name: "丝芙兰公开护肤品专题",
            url: "https://m.sephora.cn/zt/",
            sourceRole: "trusted_retail_channel",
            discovery: "public_market_recovery_seed",
            query: null,
            targetCoverageRowId: "coverage-competitor-channels",
          },
          {
            name: "百雀羚公开护肤产品页",
            url: "https://www.pechoin.com/",
            sourceRole: "brand_official_site",
            discovery: "public_market_recovery_seed",
            query: null,
            targetCoverageRowId: "coverage-competitor-taxonomy",
          },
          {
            name: "珀莱雅 2024 年年度报告公开披露文件",
            url: "https://static.cninfo.com.cn/finalpage/2025-04-25/1223280349.PDF",
            sourceRole: "financial_report",
            discovery: "public_market_recovery_seed",
            query: null,
            targetCoverageRowId: "coverage-business-models",
          },
        ]
      : waveNumber === 6
        ? [
            {
              name: "国家药监局 2024 化妆品安全评估管理优化公告",
              url: "https://english.nmpa.gov.cn/2024-04/22/c_1049743.htm",
              sourceRole: "regulator",
              discovery: "public_market_recovery_seed",
              query: null,
              targetCoverageRowId: "coverage-regulation",
            },
          ]
        : [];
const officialSeedFixture = JSON.parse(
  await readFile(
    resolve("fixtures/industry-source-candidates/skincare-official-seeds.json"),
    "utf8",
  ),
) as {
  candidates: Array<{
    name: string;
    url: string;
    sourceRole: IndustryPlanSourceRole;
  }>;
};
const deadline = new AbortController();
const timeout = setTimeout(
  () => deadline.abort(new Error("m4_2_wave_duration_cap_reached")),
  budget.maximumDurationMs,
);
const delegate: PublicCrawlerFetch = (url, init) => fetch(url, init);
const tracker = createIndustryM2LiveBudgetTracker({
  delegate,
  deadlineSignal: deadline.signal,
  budget,
});
const taskPlan = createIndustryAcquisitionTaskPlan(
  createIndustryPlan(structuredClone(skincareIndustryPlanningFixture)),
);
let candidates: Candidate[] = [
  ...publicMarketRecoverySeeds,
  ...(waveNumber === 1
    ? officialSeedFixture.candidates.map((candidate) => ({
        ...candidate,
        discovery: "official_public_seed" as const,
        query: null,
        targetCoverageRowId: null,
      }))
    : []),
];
const searchAudits: Array<{
  query: string;
  ok: boolean;
  returnedUrls: number;
  acceptedUrls: number;
  error?: string;
}> = [];
let runError: string | null = null;

try {
  for (const searchQuery of queries) {
    const result = await searchWithApiProvider(
      {
        provider: "tavily",
        endpoint: "https://api.tavily.com/search",
        apiKey: searchApiKey,
      },
      searchQuery.text,
      tracker.createFetcher("discovery"),
      { maxResults: 8, timeoutMs: 10_000 },
    );
    const accepted = result.urls.flatMap((url) => {
      const sourceRole = roleForUrl(url);
      return sourceRole
        ? [
            {
              name: sourceNameFromUrl(url),
              url,
              sourceRole,
              discovery: "tavily" as const,
              query: searchQuery.text,
              targetCoverageRowId: searchQuery.targetCoverageRowId,
            },
          ]
        : [];
    });
    candidates.push(...accepted);
    searchAudits.push({
      query: searchQuery.text,
      ok: result.ok,
      returnedUrls: result.urls.length,
      acceptedUrls: accepted.length,
      ...(result.error ? { error: result.error } : {}),
    });
  }
} catch (error) {
  runError = sanitizedError(error);
}

const deduplicatedCandidates = new Map<string, Candidate>();
for (const candidate of candidates) {
  const key =
    canonicalizeIndustryRawDocumentUrl(candidate.url) ?? candidate.url;
  if (!deduplicatedCandidates.has(key)) {
    deduplicatedCandidates.set(key, candidate);
  }
}
candidates = [...deduplicatedCandidates.values()];
const taskAssignments = new Map<string, number>();
const previousRoutes = previousRunDir
  ? (JSON.parse(
      await readFile(join(previousRunDir, "routes.json"), "utf8"),
    ) as IndustryAcquisitionRoute[])
  : [];
for (const route of previousRoutes) {
  taskAssignments.set(
    route.taskId,
    (taskAssignments.get(route.taskId) ?? 0) + 1,
  );
}
const previousRawDocuments = previousRunDir
  ? (JSON.parse(
      await readFile(join(previousRunDir, "raw_documents.json"), "utf8"),
    ) as IndustryM2WaveRawDocumentInput[])
  : [];
const previousCanonicalUrls = new Set(
  previousRawDocuments.map((document) =>
    canonicalizeIndustryRawDocumentUrl(document.url),
  ),
);
const selected = candidates
  .filter(
    (candidate) =>
      !previousCanonicalUrls.has(
        canonicalizeIndustryRawDocumentUrl(candidate.url),
      ),
  )
  .flatMap((candidate) => {
    const compatible = taskPlan.tasks
      .filter(
        (task) =>
          task.allowedSourceRoles.includes(candidate.sourceRole) &&
          (!candidate.targetCoverageRowId ||
            task.coverageRowId === candidate.targetCoverageRowId),
      )
      .sort(
        (left, right) =>
          (taskAssignments.get(left.taskId) ?? 0) -
            (taskAssignments.get(right.taskId) ?? 0) ||
          left.priority.localeCompare(right.priority) ||
          left.taskId.localeCompare(right.taskId),
      );
    const task = compatible[0];
    if (!task) return [];
    taskAssignments.set(
      task.taskId,
      (taskAssignments.get(task.taskId) ?? 0) + 1,
    );
    return [{ candidate, task }];
  })
  .slice(0, 24);

const routes: IndustryAcquisitionRoute[] = [];
const rawDocuments: IndustryM2WaveRawDocumentInput[] = [];
const fetchAudits: Array<{
  url: string;
  taskId: string;
  sourceRole: IndustryPlanSourceRole;
  ok: boolean;
  httpStatus: number | null;
  mediaType: string | null;
  extractedCharacters: number;
  error?: string;
}> = [];
let rawStore: IndustryRawDocumentStore = previousRunDir
  ? (JSON.parse(
      await readFile(join(previousRunDir, "immutable_raw_store.json"), "utf8"),
    ) as IndustryRawDocumentStore)
  : createIndustryRawDocumentStore(`${runId}-raw-store`);
await assertIndustryRawDocumentStore(rawStore);

for (const [index, assignment] of selected.entries()) {
  if (runError) break;
  const route = createIndustryAcquisitionRoute({
    task: assignment.task,
    sourceRole: assignment.candidate.sourceRole,
    targetKind: "public_page",
    targetReference: assignment.candidate.url,
    access: {
      requiresLogin: false,
      requiresCookie: false,
      requiresCaptcha: false,
      isPaywalled: false,
      containsPrivateData: false,
    },
  });
  if (route.status !== "planned") continue;
  routes.push(route);
  try {
    let mediaType = "text/plain";
    let originalContent = "";
    let effectiveStatus = 599;
    let nativeOk = false;
    let nativeError: string | null = null;
    try {
      const response = await tracker.createFetcher("crawl")(
        assignment.candidate.url,
        {
          signal: AbortSignal.timeout(20_000),
          headers: {
            Accept:
              "text/html,application/xhtml+xml,text/plain,application/pdf",
            "User-Agent": "IndustryResearchOS/1.0 public research crawler",
          },
        },
      );
      mediaType = response.headers.get("content-type") ?? "text/plain";
      originalContent = await response.text();
      effectiveStatus = response.status;
      nativeOk = response.ok;
    } catch (error) {
      nativeError = sanitizedError(error);
    }
    let firecrawlUsed = false;
    const nativeCleaned = mediaType.toLowerCase().includes("html")
      ? cleanDocumentText({
          text: originalContent,
          format: "html",
          maxTextLength: 12_000,
        }).cleanedText
      : originalContent.slice(0, 12_000);
    if (
      nativeError ||
      !nativeOk ||
      nativeCleaned.length < 300 ||
      mediaType.toLowerCase().includes("application/pdf") ||
      originalContent.trimStart().startsWith("%PDF-")
    ) {
      try {
        const firecrawlResponse = await tracker.createFetcher("crawl")(
          "https://api.firecrawl.dev/v2/scrape",
          {
            method: "POST",
            signal: AbortSignal.timeout(30_000),
            headers: {
              Authorization: `Bearer ${firecrawlApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: assignment.candidate.url,
              formats: ["markdown"],
              onlyMainContent: true,
            }),
          },
        );
        const payload = (await firecrawlResponse.json()) as {
          success?: boolean;
          data?: { markdown?: string };
        };
        const markdown = payload.data?.markdown?.trim() ?? "";
        if (firecrawlResponse.ok && payload.success && markdown.length >= 300) {
          originalContent = markdown;
          mediaType = "text/markdown";
          effectiveStatus = 200;
          firecrawlUsed = true;
          nativeError = null;
        }
      } catch (error) {
        const message = sanitizedError(error);
        if (!originalContent || /cap_reached|already_exhausted/.test(message)) {
          throw error;
        }
      }
    }
    if (nativeError && !firecrawlUsed) {
      throw new Error(`m4_2_native_and_fallback_failed:${nativeError}`);
    }
    const binaryPdf =
      mediaType.toLowerCase().includes("application/pdf") ||
      originalContent.trimStart().startsWith("%PDF-");
    const cleaned = binaryPdf
      ? originalContent.slice(0, 12_000)
      : cleanDocumentText({
          text: originalContent,
          format: mediaType.toLowerCase().includes("html")
            ? "html"
            : mediaType.toLowerCase().includes("markdown")
              ? "markdown"
              : "text",
          maxTextLength: 12_000,
        }).cleanedText;
    const acceptedForReport =
      effectiveStatus < 400 && !binaryPdf && cleaned.length >= 300;
    rawDocuments.push({
      id: `m4-2-raw-document-${index + 1}`,
      url: assignment.candidate.url,
      title: assignment.candidate.name,
      extractedText: cleaned,
      sourceQuality: { acceptedForReport },
    });
    const put = await putIndustryRawDocument(rawStore, {
      route,
      originalUrl: assignment.candidate.url,
      capturedAt: started.toISOString(),
      mediaType,
      httpStatus: effectiveStatus,
      originalContent,
      collectionMethod: "live_public",
      usage: {
        publicRequestsUsed: 1,
        providerRequestsUsed: firecrawlUsed ? 1 : 0,
        creditsUsed: firecrawlUsed ? 5 : 0,
        costYuan: 0,
      },
    });
    rawStore = put.store;
    fetchAudits.push({
      url: assignment.candidate.url,
      taskId: assignment.task.taskId,
      sourceRole: assignment.candidate.sourceRole,
      ok: effectiveStatus < 400,
      httpStatus: effectiveStatus,
      mediaType,
      extractedCharacters: cleaned.length,
    });
  } catch (error) {
    fetchAudits.push({
      url: assignment.candidate.url,
      taskId: assignment.task.taskId,
      sourceRole: assignment.candidate.sourceRole,
      ok: false,
      httpStatus: null,
      mediaType: null,
      extractedCharacters: 0,
      error: sanitizedError(error),
    });
    if (
      /cap_reached|duration_cap|already_exhausted/.test(sanitizedError(error))
    ) {
      runError = sanitizedError(error);
    }
  }
}
clearTimeout(timeout);
await assertIndustryRawDocumentStore(rawStore);
const combinedRawDocuments = [...previousRawDocuments, ...rawDocuments];
const combinedRoutes = [...previousRoutes, ...routes];
const verification = verifyIndustryM2Wave({
  runId,
  category: "护肤品",
  categoryTerms: ["护肤品", "护肤", "化妆品", "面霜", "精华", "防晒"],
  conflictingCategoryTerms: ["洗碗机", "洗地机", "空调", "冰箱"],
  rawDocuments: combinedRawDocuments,
  routes: combinedRoutes,
  taskPlan,
});
const usage = tracker.snapshot();
const samplingAudit = {
  schemaVersion: "industry_m4_2_sampling_audit.v1",
  artifactType: "industry-m4-2-sampling-audit",
  status: "blocked_no_validated_representative_samples",
  selectedSamples: [],
  validatedSamplingCandidates: 0,
  reason:
    "Wave one collected source pages only. No entity is promoted to a representative sample without explicit axis assignments and source validation.",
  nextAction:
    "derive_and_validate_sampling_candidates_from_relevant_raw_documents",
  assertions: {
    searchRankDeterminedSelection: false,
    rawCandidateTreatedAsRepresentativeSample: false,
    moduleResearchAllowed: false,
  },
};
const finished = new Date();
const audit = {
  schemaVersion: "industry_m4_2_live_wave_audit.v1",
  artifactType: "industry-m4-2-live-wave-audit",
  runId,
  status: runError
    ? "stopped_with_error_or_cap"
    : "completed_with_verification",
  startedAt: started.toISOString(),
  finishedAt: finished.toISOString(),
  durationMs: finished.getTime() - started.getTime(),
  waveNumber,
  previousRunDir,
  approvedBudget: budget,
  usage,
  searchAudits,
  candidateCount: candidates.length,
  selectedCandidateCount: selected.length,
  fetchedDocumentCount: rawDocuments.length,
  immutableDocumentCount: rawStore.documents.length,
  fetchAudits,
  runError,
  verificationSummary: verification.summary,
  decision: verification.decision,
  samplingStatus: samplingAudit.status,
  assertions: {
    broadIndustryInputPreserved: true,
    llmRequests: 0,
    reportGenerated: false,
    productionWrite: false,
  },
};

await Promise.all([
  writeJsonAtomic(join(outputDir, "input.json"), {
    industry: "护肤品",
    market: "中国大陆",
    scopeLevel: "broad_industry",
    runId,
    waveNumber,
    previousRunDir,
    approvedBudget: budget,
    queries,
  }),
  writeJsonAtomic(join(outputDir, "candidates.json"), candidates),
  writeJsonAtomic(join(outputDir, "wave_routes.json"), routes),
  writeJsonAtomic(join(outputDir, "wave_raw_documents.json"), rawDocuments),
  writeJsonAtomic(join(outputDir, "routes.json"), combinedRoutes),
  writeJsonAtomic(join(outputDir, "raw_documents.json"), combinedRawDocuments),
  writeTextAtomic(
    join(outputDir, "immutable_raw_store.json"),
    await serializeIndustryRawDocumentStore(rawStore),
  ),
  writeTextAtomic(
    join(outputDir, "verification.json"),
    serializeIndustryM2WaveVerification(verification),
  ),
  writeJsonAtomic(join(outputDir, "sampling_audit.json"), samplingAudit),
  writeJsonAtomic(join(outputDir, "run_audit.json"), audit),
]);

console.log(
  JSON.stringify(
    {
      status: audit.status,
      usage,
      candidateCount: candidates.length,
      selectedCandidateCount: selected.length,
      fetchedDocumentCount: rawDocuments.length,
      immutableDocumentCount: rawStore.documents.length,
      verificationSummary: verification.summary,
      decision: verification.decision,
      samplingStatus: samplingAudit.status,
      runError,
      outputDir,
    },
    null,
    2,
  ),
);
