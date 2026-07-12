# Industry OS G10 生产 Contract Canary 记录

更新时间：2026-07-13

## 结论

G2–G9 的 Industry OS contract-only 新链路已部署到轻量服务器生产，并完成一次零 provider、零 credits、零费用的受控浏览器 canary。技术完成等级为 **C3**。

这不是护肤品真实行业研究：结果仍是 G2–G8 contract fixture，页面、下载报告和 ledger 全部明确标记非行业事实；eligible external facts 为 0。未触发真实搜索、抓取、LLM、Supabase run 写入或 zvec index，不能据此标记 C4/C5 或商业化解冻。

## Git 与部署

- 本地基线：`main` / `065af432bd3b69fbb5108ef6c3c54207d5522269`，与 `origin/main` 同步。
- 提交：`094c857 feat: add industry research os contract flow`，63 files，10681 insertions / 32 deletions。
- push：`065af43..094c857 main -> main`。
- 用户历史 benchmark runner 未进入提交；提交前后 HEAD 与远端生产该文件 SHA-256 均为 `d57121cf4c3173dc9c5473a2c8670e3c801d409d31548ed0775002a2c410261d`，本地保留 diff 仍为 62 additions / 22 deletions。
- 部署源：`deploy.sh --execute` 的 HEAD 模式，不使用 `--worktree`。
- 远端备份：`/opt/playgamelab/industry-research/.deploy-backups/pre-094c857-20260712T171317Z.tar.gz`，约 1.4M。
- rsync 为非删除式，未同步 `.env.local`、生产 env、outputs、node_modules、`.next`、缓存或备份目录。

## 部署验收

- 本地 `pnpm check`：25 个测试文件、250 条测试全部通过；TypeScript 与 Biome 通过。
- 本地 `pnpm build`：Next.js 16.2.10 构建通过。
- 远端 `pnpm install --frozen-lockfile`：通过，无依赖变化。
- 远端 `pnpm build`：通过，`/industry-research` 和既有 API 路由完整。
- `pnpm server:doctor`：status=ok，13/13 checks ok。
- `pnpm supabase:doctor`：status=ok，4 张表可达，RLS 为 `deny_by_default_service_role_only`。
- 服务重启后 `systemctl is-active industry-research.service=active`。
- health 第一次在重启窗口返回 502，3 秒后第二次恢复 `status=ok`，部署脚本最终 exit 0。
- 本地与远端 `IndustryOsResult.tsx`、`actions.ts`、部署时 loop state 的 SHA-256 分别一致。

## 生产浏览器 Canary

- URL：`https://research.playgamelab.cn/industry-research?fixture=industry-os`。
- 输入页预填护肤品 / 中国大陆 / 2024-2026 / 研究目标；点击“开始研究”后成功进入结果页。
- 结果：6 阶段、11 行 coverage、9 个 contract samples、6 模块、13 ledger entries、0 eligible facts、13 contract-only entries、12 个编号章节、75 nodes / 93 edges。
- 页面醒目标记 `CONTRACT ONLY · 非行业事实`；下载 Markdown 约 17K，包含 12 个编号 H2、contract-only 声明和知识地图计数。
- 浏览器请求列表只有 1 个同源 server-action POST 200；无 Tavily、Firecrawl、LLM/provider、credits 或外部数据请求。
- 浏览器控制台 0 error / 0 warning。
- 360/390/430/1440px 均满足 `scrollWidth === innerWidth`，无横向溢出；截图保存在本地忽略目录 `output/playwright/`。
- 普通 `/industry-research` 入口没有第二模式选择器，也不会自动进入 fixture。

## 兼容与安全

- 已有生产 run `industry-research-2026-07-11T16-48-34-426Z` 分享链接继续进入 legacy report，未进入 Industry OS fixture。
- 无凭据访问 `/api/industry-research/runs` 返回 401。
- 公开 report API 返回 200，字段仅有 `input/reportMarkdown/runId/schemaVersion/summary`；不含 raw、内部路径、provider metadata 或 evidenceIds。
- 服务器内部带 key 下载已有 run 返回 200，key 只在服务器 shell 内存中加载且未输出。
- Supabase 最新 run 仍为 `industry-research-2026-07-11T16-48-34-426Z`；部署后本地 runs 目录无新增 canary run。
- zvec state mtime 仍为 `2026-07-05 01:44:59 +0800`，本轮未执行 index/backfill。
- 部署以来服务日志 provider/crawl/credits/429/fatal 匹配数 0，error/exception/failed 匹配数 0。

## 回滚状态

未触发回滚。若后续发现问题，以 `pre-094c857-20260712T171317Z.tar.gz` 为恢复点，恢复后重新 build/doctor/restart/health；不删除或重置生产数据。

## 下一权限门

G11 要求 1–3 名真实目标用户无现场指导完成核心流程。项目已有“取消真实卖家反馈/付费试单”的决定，因此在用户明确反转外联取消决定、授权 L5、选择联系对象/渠道并确认隐私与录屏边界前，不得启动招募或联系。

后续状态：2026-07-13 用户明确要求先跳过 G11，并要求三端全部可部署受版本控制文件保持一致；此前保留的 benchmark runner 历史 diff 随一致性提交同步，但未执行。G10 当时“runner 未进入 canary 部署”的记录仍是该次 canary 的真实历史事实。
