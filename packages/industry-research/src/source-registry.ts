import type { ResearchWorkflowInput } from "./types";

export const SOURCE_REGISTRY_JSON_ENV = "AGENT_FACTORY_SOURCE_REGISTRY_JSON";
export const FIXED_SOURCE_URLS_ENV = "AGENT_FACTORY_FIXED_SOURCE_URLS";
export const SOURCE_REGISTRY_DISABLED_ENV =
  "AGENT_FACTORY_SOURCE_REGISTRY_DISABLED";

export type SourceRegistryEntry = {
  name: string;
  url: string;
  matchTerms: string[];
};

type SourceRegistryConfigEntry =
  | string
  | {
      name?: string;
      url?: string;
      matchTerms?: string[];
    };

type SourceRegistryConfig = {
  globalSources?: SourceRegistryConfigEntry[];
  categorySources?: Record<string, SourceRegistryConfigEntry[]>;
};

export type SourceRegistryMatch = {
  name: string;
  url: string;
  matchedBy: "default_registry" | "env_registry" | "fixed_env";
};

const defaultSourceRegistryEntries: SourceRegistryEntry[] = [
  {
    name: "Philips China",
    url: "https://www.philips.com.cn/",
    matchTerms: ["男士电动剃须刀", "电动剃须刀", "剃须刀", "shaver"],
  },
  {
    name: "Braun China",
    url: "https://www.braun.cn/",
    matchTerms: ["男士电动剃须刀", "电动剃须刀", "剃须刀", "shaver"],
  },
  {
    name: "Panasonic China",
    url: "https://www.panasonic.cn/",
    matchTerms: ["男士电动剃须刀", "电动剃须刀", "剃须刀", "shaver"],
  },
  {
    name: "Flyco",
    url: "https://www.flyco.com/",
    matchTerms: ["男士电动剃须刀", "电动剃须刀", "剃须刀", "shaver"],
  },
  {
    name: "Native Pet",
    url: "https://nativepet.com/",
    matchTerms: ["宠物肠胃益生菌", "宠物益生菌", "dog probiotics"],
  },
  {
    name: "Finn",
    url: "https://www.finn.com/",
    matchTerms: ["宠物肠胃益生菌", "宠物益生菌", "dog probiotics"],
  },
  {
    name: "Zesty Paws",
    url: "https://www.zestypaws.com/",
    matchTerms: ["宠物肠胃益生菌", "宠物益生菌", "dog probiotics"],
  },
  {
    name: "Honest Paws",
    url: "https://www.honestpaws.com/",
    matchTerms: ["宠物肠胃益生菌", "宠物益生菌", "dog probiotics"],
  },
  {
    name: "P.F. Candle Co.",
    url: "https://pfcandleco.com/",
    matchTerms: ["大豆蜡香薰", "大豆蜡蜡烛", "soy candle"],
  },
  {
    name: "Yankee Candle",
    url: "https://www.yankeecandle.com/",
    matchTerms: ["大豆蜡香薰", "香薰蜡烛", "soy candle"],
  },
  {
    name: "LMNT",
    url: "https://drinklmnt.com/",
    matchTerms: ["电解质气泡水", "电解质饮料", "electrolyte drink"],
  },
  {
    name: "Liquid I.V.",
    url: "https://www.liquid-iv.com/",
    matchTerms: ["电解质气泡水", "电解质饮料", "electrolyte drink"],
  },
];

function normalizeUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "";
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function cjkNgrams(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (!/[\u3400-\u9fff]/.test(compact) || compact.length < 5) {
    return [];
  }

  const grams: string[] = [];
  for (let size = 3; size <= Math.min(6, compact.length); size += 1) {
    for (let index = 0; index <= compact.length - size; index += 1) {
      grams.push(compact.slice(index, index + size));
    }
  }

  return grams;
}

function inputTerms(input: ResearchWorkflowInput) {
  const terms = [
    input.industry,
    input.category,
    input.market,
    input.researchGoal,
    ...input.industry.split(/\s+|\/|,|，/),
    ...input.category.split(/\s+|\/|,|，/),
    ...input.market.split(/\s+|\/|,|，/),
  ]
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  return [...new Set(terms.flatMap((term) => [term, ...cjkNgrams(term)]))];
}

function entryMatchesInput(entry: SourceRegistryEntry, terms: string[]) {
  const haystack = terms.map(normalizeText).join("\n");
  return entry.matchTerms.some((term) => {
    const normalized = normalizeText(term);
    return normalized.length >= 2 && haystack.includes(normalized);
  });
}

function entryNameFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function coerceEntry(
  value: SourceRegistryConfigEntry,
  fallbackMatchTerms: string[],
) {
  if (typeof value === "string") {
    const url = normalizeUrl(value);
    return url
      ? {
          name: entryNameFromUrl(url),
          url,
          matchTerms: fallbackMatchTerms,
        }
      : undefined;
  }

  const url = normalizeUrl(value.url ?? "");
  if (!url) {
    return undefined;
  }

  return {
    name: value.name?.trim() || entryNameFromUrl(url),
    url,
    matchTerms:
      value.matchTerms?.map((term) => term.trim()).filter(Boolean) ??
      fallbackMatchTerms,
  } satisfies SourceRegistryEntry;
}

function parseRegistryJson(value: string | undefined) {
  if (!value?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as SourceRegistryConfig;
    const entries: SourceRegistryEntry[] = [];

    for (const source of parsed.globalSources ?? []) {
      const entry = coerceEntry(source, ["*"]);
      if (entry) {
        entries.push(entry);
      }
    }

    for (const [matchTerm, sources] of Object.entries(
      parsed.categorySources ?? {},
    )) {
      for (const source of sources) {
        const entry = coerceEntry(source, [matchTerm]);
        if (entry) {
          entries.push(entry);
        }
      }
    }

    return entries;
  } catch {
    return [];
  }
}

function parseFixedSourceUrls(value: string | undefined) {
  return (value ?? "")
    .split(/[\n,]/)
    .map((url) => normalizeUrl(url))
    .filter(Boolean)
    .map(
      (url) =>
        ({
          name: entryNameFromUrl(url),
          url,
          matchTerms: ["*"],
        }) satisfies SourceRegistryEntry,
    );
}

function isTruthyEnv(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(
    (value ?? "").trim().toLowerCase(),
  );
}

export function resolveSourceRegistryMatches(
  input: ResearchWorkflowInput,
  env: Record<string, string | undefined> = {},
): SourceRegistryMatch[] {
  if (isTruthyEnv(env[SOURCE_REGISTRY_DISABLED_ENV])) {
    return [];
  }

  const terms = inputTerms(input);
  const envEntries = parseRegistryJson(env[SOURCE_REGISTRY_JSON_ENV]);
  const fixedEntries = parseFixedSourceUrls(env[FIXED_SOURCE_URLS_ENV]);
  const matches: SourceRegistryMatch[] = [];

  for (const entry of defaultSourceRegistryEntries) {
    if (entryMatchesInput(entry, terms)) {
      matches.push({
        name: entry.name,
        url: normalizeUrl(entry.url),
        matchedBy: "default_registry",
      });
    }
  }

  for (const entry of envEntries) {
    if (entry.matchTerms.includes("*") || entryMatchesInput(entry, terms)) {
      matches.push({
        name: entry.name,
        url: normalizeUrl(entry.url),
        matchedBy: "env_registry",
      });
    }
  }

  for (const entry of fixedEntries) {
    matches.push({
      name: entry.name,
      url: entry.url,
      matchedBy: "fixed_env",
    });
  }

  const seen = new Set<string>();
  return matches.filter((match) => {
    if (!match.url || seen.has(match.url)) {
      return false;
    }
    seen.add(match.url);
    return true;
  });
}
