import { describe, expect, it } from "vitest";
import { collectContentApiSignals } from "./content-api-adapter";
import type { PublicCrawlerFetch } from "./public-crawl-adapter";
import type { ResearchWorkflowInput } from "./types";

const input: ResearchWorkflowInput = {
  projectName: "内容 API 测试",
  industry: "宠物健康电商",
  category: "宠物肠胃益生菌",
  market: "美国 DTC 电商",
  researchGoal: "验证官方内容 API 采集",
  templateId: "ecommerce_competitor_research",
  urls: [],
  csvText: "",
  manualText: "",
};

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
    headers: { get: () => "application/json" },
  };
}

describe("collectContentApiSignals", () => {
  it("skips silently with a note when no api credentials are configured", async () => {
    const result = await collectContentApiSignals("project-test", input, {
      env: {},
    });

    expect(result.raw_documents).toHaveLength(0);
    expect(result.sources).toHaveLength(0);
    expect(result.notes[0]).toContain("跳过内容生态采集");
  });

  it("collects youtube signals as content_api raw documents", async () => {
    const requestedUrls: string[] = [];
    const fetcher: PublicCrawlerFetch = async (url) => {
      requestedUrls.push(url);
      return jsonResponse({
        items: [
          {
            id: { videoId: "abc123" },
            snippet: {
              title: "Best probiotics for dogs with sensitive stomach",
              description: "We compare top DTC brands for gut health.",
              channelTitle: "Pet Health Lab",
            },
          },
          { id: {}, snippet: { title: "missing video id" } },
        ],
      });
    };

    const result = await collectContentApiSignals("project-test", input, {
      env: { AGENT_FACTORY_YOUTUBE_API_KEY: "yt-key" },
      fetcher,
    });

    expect(
      requestedUrls[0]?.startsWith(
        "https://www.googleapis.com/youtube/v3/search",
      ),
    ).toBe(true);
    expect(result.raw_documents).toHaveLength(1);
    const document = result.raw_documents[0];
    expect(document?.url).toBe("https://www.youtube.com/watch?v=abc123");
    expect(document?.sourceQuality.sourceType).toBe("content_api");
    expect(document?.sourceQuality.acceptedForReport).toBe(true);
    expect(document?.databaseTargets).toContain("content_database");
    expect(document?.databaseTargets).toContain("pain_point_database");
    expect(result.extraction_jobs).toHaveLength(3);
    expect(result.sources[0]?.value).toBe(
      "https://www.youtube.com/watch?v=abc123",
    );
  });

  it("collects reddit signals with the oauth bearer token", async () => {
    let authorization = "";
    const fetcher: PublicCrawlerFetch = async (_url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      authorization = headers.Authorization ?? "";
      return jsonResponse({
        data: {
          children: [
            {
              data: {
                title: "My dog's soft stool finally improved",
                selftext: "After switching to a pumpkin probiotic...",
                subreddit: "DogAdvice",
                permalink: "/r/DogAdvice/comments/xyz/soft_stool/",
              },
            },
          ],
        },
      });
    };

    const result = await collectContentApiSignals("project-test", input, {
      env: { AGENT_FACTORY_REDDIT_ACCESS_TOKEN: "reddit-token" },
      fetcher,
    });

    expect(authorization).toBe("Bearer reddit-token");
    expect(result.raw_documents).toHaveLength(1);
    expect(result.raw_documents[0]?.url).toBe(
      "https://www.reddit.com/r/DogAdvice/comments/xyz/soft_stool/",
    );
    expect(result.raw_documents[0]?.extractedText).toContain(
      "pumpkin probiotic",
    );
  });

  it("keeps going when one platform call fails", async () => {
    const fetcher: PublicCrawlerFetch = async (url) => {
      if (url.includes("googleapis.com")) {
        return {
          ok: false,
          status: 403,
          text: async () => "",
          headers: { get: () => "" },
        };
      }

      return jsonResponse({
        data: {
          children: [
            {
              data: {
                title: "Probiotic recommendations?",
                selftext: "",
                subreddit: "pets",
                permalink: "/r/pets/comments/abc/probiotic/",
              },
            },
          ],
        },
      });
    };

    const result = await collectContentApiSignals("project-test", input, {
      env: {
        AGENT_FACTORY_YOUTUBE_API_KEY: "yt-key",
        AGENT_FACTORY_REDDIT_ACCESS_TOKEN: "reddit-token",
      },
      fetcher,
    });

    expect(
      result.notes.some((note) => note.includes("YouTube 官方 API 调用失败")),
    ).toBe(true);
    expect(result.raw_documents).toHaveLength(1);
    expect(result.raw_documents[0]?.url).toContain("reddit.com");
  });
});
