import { describe, expect, it } from "vitest";
import { splitMarkdownSections } from "./report-sections";

describe("splitMarkdownSections", () => {
  it("keeps the preamble and splits h2 sections", () => {
    expect(
      splitMarkdownSections(
        "# 报告\n\n摘要文字\n\n## 机会\n- A\n\n## 下一步\n- B",
      ),
    ).toEqual([
      { title: "报告概览", markdown: "# 报告\n\n摘要文字" },
      { title: "机会", markdown: "- A" },
      { title: "下一步", markdown: "- B" },
    ]);
  });

  it("supports legacy markdown without h2 headings", () => {
    expect(splitMarkdownSections("一段旧报告")).toEqual([
      { title: "报告概览", markdown: "一段旧报告" },
    ]);
    expect(splitMarkdownSections("")).toEqual([]);
  });
});
