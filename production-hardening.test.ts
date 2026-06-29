import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("industry research production hardening contracts", () => {
  it("keeps CI on install, check, and build", async () => {
    const ci = await readFile(
      new URL(".github/workflows/ci.yml", import.meta.url),
      "utf8",
    );

    expect(ci).toContain("pnpm install --frozen-lockfile");
    expect(ci).toContain("pnpm check");
    expect(ci).toContain("pnpm build");
  });

  it("keeps the n8n workflow on the four-state event contract", async () => {
    const workflow = JSON.parse(
      await readFile(
        new URL("workflows/n8n/industry-research-intake.json", import.meta.url),
        "utf8",
      ),
    ) as {
      nodes: Array<{ name: string; parameters?: Record<string, unknown> }>;
    };
    const jsonBody = workflow.nodes
      .map((node) => String(node.parameters?.jsonBody ?? ""))
      .join("\n");

    for (const status of ["queued", "running", "completed", "failed"]) {
      expect(jsonBody).toContain(`status: '${status}'`);
    }
  });
});
