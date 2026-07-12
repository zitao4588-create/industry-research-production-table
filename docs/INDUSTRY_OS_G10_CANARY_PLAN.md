# Industry OS G10 受控生产 Canary 计划

更新时间：2026-07-13

## 目标与真实性边界

本次只验证 G2–G9 的 **contract-only Industry OS 产品链路** 能在轻量服务器生产环境完成输入、运行、结果展示、报告下载和响应式回归。它不是护肤品真实行业研究，不生成或宣称外部行业事实，不将 contract fixture 写入 Supabase、zvec 或旧 8 文件交付包。

完成后最多证明 Industry OS 新 UI/契约达到生产技术 C3；不能写成真实用户 C4、业务 C5、完整行业报告已交付或商业化解冻。

## 授权与部署范围

- 用户已明确授权 G10 L4。
- 允许：整理并提交 G1–G10 范围代码/文档、push `main`、生产备份、非删除式部署、远端 install/build/doctor、服务重启、health 和浏览器/API 只读验收。
- 部署源使用已提交 `HEAD`，不使用 `--worktree`；因此不会带入保留中的 benchmark runner 62 additions / 22 deletions。
- 不允许：migration、Supabase backfill/smoke 写入、zvec index、n8n workflow 变更、真实用户联系或 G12 benchmark。

## 请求、费用与停止规则

- 搜索请求上限：0。
- Firecrawl/页面抓取请求上限：0。
- LLM/provider 调用上限：0。
- API key/credits 消耗：0。
- 费用上限：人民币 ¥0。
- 只允许浏览器访问同源 `/industry-research?fixture=industry-os`，由本地 server action 组装已审计的 G2–G8 contract fixture。

立即停止并执行回滚评估的条件：

1. 浏览器或服务日志出现 Tavily、Firecrawl、LLM/provider、credits 或外部数据请求；
2. fixture 未明确显示 `CONTRACT ONLY · 非行业事实`、eligible facts 不为 0，或 contract-only entries 不为 13；
3. build、server doctor、Supabase doctor、systemd active、health 或旧回放兼容任一失败；
4. 未鉴权内部 API 不再返回 401，或公开报告接口泄露 raw/path/provider metadata；
5. 部署范围包含 `.env.local`、生产 env、outputs、node_modules、缓存或保留中的 benchmark runner diff；
6. 发现需要 migration、backfill/index、生产数据修复或付费/live provider 调用。

## 顺序验收

1. 本地 `pnpm check`、`pnpm build`、`git diff --check`、secret/部署范围审计。
2. 只提交明确的 Industry OS 与相关证据门禁代码/文档，保留 benchmark runner diff 未提交。
3. push `origin/main`，运行 `deploy.sh --dry-run` 并确认预览，再执行 HEAD 部署；脚本先生成远端 tar 备份且 rsync 不删除文件。
4. 远端 install/build、server doctor、Supabase doctor、服务重启、公网 health。
5. Playwright 生产 contract canary：输入页 → 开始研究 → 结果页；核对六阶段、11 行 coverage、六模块、13 ledger entries、0 eligible、13 contract-only、12 章和 75 nodes / 93 edges。
6. 360/390/430/1440px 无横向溢出；报告 Markdown 下载成功。
7. 旧 `?run=` 分享回放继续进入 legacy report；未带凭据内部 runs API 保持 401。
8. 只读核对生产日志没有本次 provider/crawl 调用；明确 Supabase/zvec 状态为本次未写入。

## 回滚

- 部署脚本生成 `.deploy-backups/pre-<sha>-<timestamp>.tar.gz`。
- 若需回滚：停止继续 canary，记录失败证据，恢复部署前 tar 内容，重新 build/doctor/restart/health；不通过删除生产数据或重置数据库回滚。
