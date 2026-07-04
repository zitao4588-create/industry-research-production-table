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

  it("keeps the weekly rerun workflow secret-free, inactive by default, and pointed at the intake webhook", async () => {
    const raw = await readFile(
      new URL(
        "workflows/n8n/industry-research-weekly-rerun.json",
        import.meta.url,
      ),
      "utf8",
    );
    const workflow = JSON.parse(raw) as {
      active: boolean;
      nodes: Array<{ type: string; parameters?: Record<string, unknown> }>;
    };

    expect(workflow.active).toBe(false);
    expect(
      workflow.nodes.some((node) => node.type.endsWith("scheduleTrigger")),
    ).toBe(true);
    expect(raw).toContain("/webhook/industry-research/intake");
    expect(raw).toContain("'public_web'");
    expect(raw).not.toMatch(/x-internal-key|webhook-secret|api[_-]?key/i);
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
