# Codex 交接文档 · UI 统一版（单一简化模式 + 知识图谱）上线

> **更新时间**：2026-07-06
> **作者**：Claude Code（云端会话，无 SSH 权限）
> **状态**：代码已全部合并入 `origin/main`；Codex 已完成本机复核、生产部署与线上验证。根路由 `/` 已改为直接进入 `/industry-research`。
> **受众**：Codex / 接手部署与后续迭代的开发者
> **前置阅读**：`docs/CODEX_PRODUCTION_ROLLOUT_HANDOFF.md`（部署脚本用法、安全护栏、`lighthouse-lab` SSH 约定——本文档完全沿用其护栏，不重复）

---

## 0. 一句话总结

应用界面从「简化模式 + 高级模式」双轨合并为**唯一的 3 步式简化体验**（用户明确不要双模式），知识图谱升级为贯穿输入 → 运行 → 报告三屏的签名视觉元素；新增运行实时事件流、`?run=` 报告分享链接（含一个新的同源只读 API）、输入页去噪与移动端适配。后端工作流、安全模型、部署方式均未改变。

## 1. 我做了什么（5 个提交，`139d251..d09aae4`）

### 1.1 UI 统一：删除高级模式入口（`b794979`）

- `SimpleResearch.tsx`：移除 `advanced` state、右上角「高级模式」chip、失败页「切换到高级模式」链接。SimpleResearch 现在是唯一入口。
- **`IndustryResearchWorkbench.tsx` 仍在磁盘上但不可达**（无任何 import 路径）。这是刻意保留：如果确认永远不要控制台，可以连同 `components/EvidencePopover.tsx`、`components/micro.tsx`、`fixtures/` 一起清理（见 §4）。
- 知识图谱三屏角色：
  - 输入屏：`.sr-hero-viz` 氛围背景（径向 mask 渐隐、`pointer-events:none`）
  - 运行屏：复用 `.run-stage` 布局，`building` + `progress` 驱动节点随真实进度逐个点亮
  - 报告屏：300px 图谱横幅 + 证据/竞品/机会三个统计数，节点悬停显示各库真实条数

### 1.2 输入页去噪（`8c9b40f` 附近，含 `KnowledgeGraph` 小改）

- `KnowledgeGraph.tsx` 新增 `showLabels?: boolean`（默认 `true`，行为不变）；输入页背景图谱传 `false`，解决库名标签与标题文字叠加的问题。**这是对「ported verbatim」组件的唯一功能性扩展**，其余绘制逻辑未动。
- 文案收缩：删掉 hero 副标题段落；标题改为「输入一个品类，得到一份竞品研究报告」；新增三个示例品类 chips（点击填入输入框）；底部说明压缩为一行。

### 1.3 运行事件流 + 报告分享 + 移动端（`d09aae4`）

- **实时事件流**：运行屏进度条上方显示 `deriveRunState().logs` 最新 3 条（「发现信息源：…」「写入 竞品库：5 条」），CSS 渐隐（`.sr-feed`）。仅在 SSE 流式路径有数据；server action 兜底（`indeterminate`）时自动隐藏。
- **`?run=<runId>` 分享链接**：
  - 运行成功后从 `deliveryPackage.runId` 取 ID，`history.replaceState` 写入 URL；报告屏新增「复制链接」按钮。
  - 页面带 `?run=` 打开时进入**回放屏**（`ReplayScreen`）：只渲染已审核版/原始报告 Markdown + 项目信息，不重建九库明细。
  - **新 API**：`GET /api/industry-research/runs/[runId]/report`（`apps/studio/src/app/api/industry-research/runs/[runId]/report/route.ts`）。安全模型与 `run/stream` 完全一致——`validateRunStreamTokenRequest`（Host/Origin 白名单），**不要求内网 key**；只返回 `{runId, input 四字段, reportMarkdown}`，不暴露 raw documents、路径等。Supabase / 本地两种存储都兼容（两者 detail 字段一致）。
- **移动端**：`≤560px` 时 hero 标题降号、背景图谱收窄降透明度、运行屏 overlay/百分比缩小。390px 视口截图验证过。

### 1.4 验证状态（本机，`next start` 生产构建）

- `pnpm check`（Biome + 85 个测试）全绿；`pnpm build` 全绿。
- Playwright 实测通过的链路：输入（示例 chip 填入）→ 真实 public_web 运行 → 报告 → URL 变 `?run=` → 新窗口打开分享链接 → 回放屏加载已审核报告。
- 注意：生产模式下同源校验依赖 Origin/Host 白名单。本机测试时用 `AGENT_FACTORY_ALLOWED_ORIGINS=http://localhost:3000` 起服务才能走通 SSE 与分享回放；**生产域名 `research.playgamelab.cn` 是代码里的默认白名单，线上无需额外配置**。

## 2. 没有改的东西（勿重复排查）

- 后端工作流（public_web / DeepSeek 抽取 / 周报 diff / zvec）、`run-core`、`run-security` 的既有函数、部署脚本、systemd/n8n 配置：**零改动**。
- 唯一的 API 面变化就是 §1.3 的新增只读端点；`runs/[runId]`（完整 detail）与 `download` 的内网 key 鉴权原样保留。

## 3. Codex 已执行的部署与线上验证

### D1 · 部署 `main` 到 lighthouse-lab（已完成）

```bash
git checkout main && git pull
bash deploy/lightweight-server/deploy.sh --dry-run   # 复核计划
bash deploy/lightweight-server/deploy.sh --execute
```

执行结果：

- 本地 `main` 与 `origin/main` 一致；Claude UI 基线已先部署，本轮追加根路由 redirect 收尾提交后继续部署最终版。
- `deploy.sh --dry-run` 复核通过；`deploy.sh --execute` 完成非删除式同步、远端 `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm server:doctor`、`pnpm supabase:doctor`、服务重启和公网 health 检查。
- 远端部署前备份由脚本自动写入 `.deploy-backups/pre-<commit>-<timestamp>.tar.gz`。

### D2 · 线上验证（已完成）

- `https://research.playgamelab.cn/api/health` 返回 `status=ok`、`runStorage=supabase_and_local_json_markdown`、`zvecCache=enabled`。
- `/industry-research` 线上页面为新版单一模式：无「高级模式」按钮，输入页有示例 chips 与图谱背景。
- 线上真实 run 验证：输入「剃须刀」生成 `industry-research-2026-07-06T06-34-55-939Z`，报告页出现「下载报告」「复制链接」，URL 自动变为 `?run=`。
- 分享回放验证：新页面打开 `?run=industry-research-2026-07-06T06-34-55-939Z`，能读取「来自运行记录」和已审核版报告，无需内部 key。
- 390px 移动端验证：`innerWidth=390`、`scrollWidth=390`、`hasHorizontalOverflow=false`。

### D3 · 待用户决策 / 可选项

| 项 | 说明 | 触发条件 |
|---|---|---|
| 清理死代码 | `IndustryResearchWorkbench.tsx`（1352 行）及其独占依赖已不可达；确认不要控制台后整体删除 | 用户确认 |
| K1–K3 外部 key | Brave/YouTube/Reddit key 接线，见旧 handoff §5，与本次 UI 无关，仍未做 | 用户注册 key |
| 回放屏增强 | 目前只回放报告 Markdown；如需竞品表/机会卡，需要在 report 端点里加 databases 摘要（注意最小暴露原则） | 有分享场景反馈后 |
| 首页 `/` | 已改为直接 redirect 到 `/industry-research` | 已完成 |

## 4. 已知边界

- 分享链接在**未部署/未配白名单的环境**（如临时预览机）会 403 → 前端已做降级：toast「没有找到这条运行记录，或当前环境未开放读取」后回到输入屏，不会白屏。
- 回放屏依赖 delivery package 持久化（`shouldPersistDeliveryPackage`，默认开启）；若某环境显式关闭持久化，运行完成后不会出现「复制链接」按钮（`runId` 为空），行为自动降级，无需处理。
- 云端会话期间产出过一个交互演示 Artifact（claude.ai 链接），数据为写死样本，**与生产无关**，后续讨论 UI 以线上环境为准。
