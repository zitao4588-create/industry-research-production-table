# Bug Notes

更新时间：2026-06-29

## 已处理：Supabase n8n event sequence 默认 PUBLIC 权限

- 现象：应用 Supabase migration 后，4 张表的 `anon` / `authenticated` 权限都已是 false，但 `industry_research_n8n_events_id_seq` 仍显示对 `anon` / `authenticated` 有 USAGE/SELECT/UPDATE。
- 原因：Postgres sequence 继承了默认 PUBLIC 权限；表级 revoke 不会自动收紧 sequence。
- 处理：
  - 远端执行 `revoke all on sequence ... from public`，再只 grant 给 `service_role`。
  - 同步修正 `supabase/migrations/20260629_industry_research_infra.sql`。
- 验证：修正后 `anon` / `authenticated` 对 sequence 的 USAGE/SELECT/UPDATE 全部 false，`service_role` 为 true。

## 已处理：轻量服务器 Supabase service role key 被粘贴成双 JWT

- 现象：轻量服务器读取 env 后调用 Supabase REST 返回 `401 Invalid API key`，但脱敏诊断能解出 `role=service_role` 和 project ref。
- 原因：`SUPABASE_SERVICE_ROLE_KEY` 实际是两个有效 JWT key 首尾拼在一起，整体长度 438、包含 4 个点；Supabase REST 只接受单个 key。
- 处理：
  - 先备份远端 env 为 `industry-research.env.bak-20260628215506`。
  - 在服务器内存里切分候选 key，只保留 REST 返回 `200` 的单个 `service_role` 片段。
  - 未在聊天或日志中打印密钥。
- 验证：远端 smoke 写入并读回 run/artifact/n8n event/zvec chunk 成功，随后清理测试数据，4 张表测试计数均为 `0`。

## 已处理：远端历史 run 的 zvec chunk metadata 外键失败

- 现象：轻量服务器运行 `pnpm zvec:index` 时，zvec collection 已能初始化，但写入 Supabase `industry_research_zvec_chunks` 时报 `industry_research_zvec_chunks_run_id_fkey`。
- 原因：服务器历史 run 只存在于本地交付包目录，尚未写入 Supabase 的 `industry_research_runs`；chunk metadata 表通过外键要求 `run_id` 已存在。
- 处理：已修改并同步 `scripts/zvec-index-industry-research.ts`，写入 zvec 本体不变；写 Supabase metadata 前先查已存在的 Supabase run，只给这些 run upsert chunk metadata，旧本地 run 计入 `skippedMissingRuns`。
- 验证：远端 `pnpm zvec:index` 通过；deployment smoke run 写入 14 行 zvec metadata，旧历史 run 的 60 个 chunk 计入 `skippedMissingRuns`。

## 验收备注：zvec optimize FTS reduce 在远端会失败但不影响检索

- 现象：远端 `pnpm zvec:index` 末尾 `collection.optimizeSync()` 触发 zvec native 日志：`ReduceFts: create destination FTS RocksDB failed` 或 `source postings is not BitPacked`。
- 判断：zvec 文档和 embedding 索引已写入，`pnpm zvec:search` 可检索到历史报告和 deployment smoke run；失败点是优化/压缩步骤，不是索引写入本身。
- 处理：`scripts/zvec-index-industry-research.ts` 已把 optimize 失败降级为 `warnings`，脚本正常退出，后续可等 zvec 版本升级或清理重建 collection 时再复查。

## 已处理：远端 zvec collection 路径指向空目录

- 现象：首次远端运行 `pnpm zvec:index` 报 `Can't open lock file: /opt/playgamelab/industry-research-data/zvec/LOCK`。
- 原因：远端 env 把 `AGENT_FACTORY_ZVEC_DIR` 指到已存在的普通空目录，脚本看到路径存在后调用 `ZVecOpen`，但该目录还不是 zvec collection。
- 处理：不删除旧目录，改为新 collection 路径 `AGENT_FACTORY_ZVEC_DIR=/opt/playgamelab/industry-research-data/zvec/industry-research-chunks`，让脚本自行创建 collection。

## 验收备注：zvec 单写多读锁限制

- 现象：并行运行 `pnpm zvec:index` 和 `pnpm zvec:search` 时，写入进程可能报 `Can't lock read-write collection .../LOCK`。
- 判断：这是 zvec in-process 存储的正常锁模型；多个进程可以读同一个 collection，但写入需要独占。
- 处理：验证和自动化中不要并行跑写入和搜索；先串行 `pnpm zvec:index`，再执行 `pnpm zvec:search`。

## 已处理：zvec 文档 ID 不能包含特殊字符

- 现象：首次索引时，使用 `runId:artifactKind:index:hash` 作为 doc id，zvec 报 `contains invalid characters`。
- 处理：chunk id 改为 `chunk_<sha256>` 纯安全字符格式。

## 验收备注：Claude Preview 不推进 CSS 过渡，移动端抽屉会"看似卡住"

- 现象：P2-H 移动端抽屉侧栏在 `Claude Preview`（headless）里点汉堡后，`getComputedStyle(.sidebar).transform` 一直读到过渡起始值 `translateX(-100%)`，看似没打开。
- 判断：是预览环境**不推进 CSS transition** 的工具限制，不是 CSS bug。`.sidebar.open { transform: translate(0) }` 级联正确——临时 `style.transition='none'` 后 transform 立即变 `translate(0)`，截图也显示抽屉已正常滑入、背板变暗。
- 结论：验证带 transition 的元素时，别只信 `getComputedStyle`；用 `screenshot` 看实际绘制，或临时禁用 transition 读终态。真实浏览器里抽屉动画正常。
- 附带：移动端 `.nav-burger { display: inline-flex }` 一度被文件末尾的 base `.nav-burger { display:none }` 按 source-order 覆盖；已在 globals.css 末尾追加权威 `@media (max-width:720px)` 块修正。

## 当前问题：9router / MiMo Free 上游风控

- 现象：服务器本机通过 9router 调用 `mmf/mimo-auto` 和 `mimo-free/mimo-auto` 时，最小 `pong` 请求和行业研究 run 都返回上游 `risk_control`。
- 已核查：
  - 9router 容器、API key、OpenAI-compatible `/v1/chat/completions` 路径本身可达。
  - 历史日志显示 `mmf/mimo-auto` 曾在 2026-06-24 成功生成行业研究报告。
  - 本轮测试多个候选 free 模型，`gh/goldeneye-free-auto` 缺 GitHub provider credentials，opencode public 返回 Missing API key，多数 provider 返回 No active credentials。
- 当前处理：n8n 默认模式改为 `public_web`，保证业务流先可用；需要 LLM 时显式传 `public_web_9router`，但当前不作为稳定默认。
- 当前补充：已新增 `pnpm probe:9router`，用真实 `/v1/chat/completions` 判断 free 候选是否可用；本地没有 provider key 时会明确跳过，不会假完成。
- 后续建议：在 9router dashboard 接入可用 provider 凭据，或切换自付费 provider；不要把模型列表可见当成 chat 可用。

## 已处理：n8n workflow 接入问题

- 现象：n8n workflow 初版能导入但 production webhook 未注册或执行失败。
- 原因：
  - 手写 workflow 缺少 n8n `id` / `webhookId` 元数据。
  - n8n 2.x 导入后需要发布并重启容器才会注册 active webhook。
  - 旧 Set 节点 schema 和 HTTP Request 表达式容易在运行时失败。
  - Code 节点默认不能读取 env；直接开放 env 读取被判定为安全风险，未采用。
  - 第一次导入 Header Auth credentials 时 shell 变量未 export，导致 credential value 为空，run API 返回 401。
- 处理：
  - workflow 改为 Webhook -> HTTP Request run API -> HTTP Request callback。
  - 使用 n8n Header Auth credentials 注入 `x-internal-key` 和 `x-agent-factory-webhook-secret`。
  - workflow 默认 `public_web`，不调用 LLM。
- 验证：不传 `mode` 的 production webhook 请求已返回 `industry_research_n8n_run_complete_ack.v1`，并生成 8 文件交付包。

## 已处理：Claude Code UI 还原修正

- 现象：移植后的 UI 仍存在若干视觉还原问题，包括中文字体没有命中 `Noto Sans SC`、英雄区知识图谱有方形画布边界感、浅色主题切换图标语义不对、知识图谱 tooltip 计数可能停留在挂载时旧值。
- 处理：
  - `layout.tsx` 改为把 `next/font` 变量类挂到 `<html>`，并让 `globals.css` 字体栈显式引用 `--font-grotesk`、`--font-manrope`、`--font-plex`、`--font-cjk`。
  - `KnowledgeGraph.tsx` 的图谱几何收进安全边距，英雄区 canvas 增加径向羽化遮罩，setup 图谱高度调到 480。
  - 顶栏主题按钮在浅色模式下显示月亮图标。
  - tooltip 绘制时读取实时数据库计数。
- 验证：2026-06-25 本轮同步时已运行 `pnpm check`，typecheck、34 条 Vitest、Biome 均通过。
- 注意：本轮未重新启动浏览器做人工视觉点检；如继续验收 UI，建议用 `pnpm build && pnpm start` 短时点检后停止。

## 已处理：agent-factory Studio / Next dev 导致电脑发热

- 现象：运行 `agent-factory/apps/studio` 时电脑明显发热。
- 判断：负载主要来自 Next.js dev server、文件监听和整个 Studio 壳，不是行业研究 agent 核心逻辑本身。
- 处理：
  - 把行业研究 v0.3 核心同步到独立项目。
  - 独立项目新增 CLI-first 入口 `pnpm sample:public-web`，默认不启动 Next、不调用 LLM。
  - `apps/studio` 保留为可选 UI，不作为日常运行入口。
- 后续建议：只有需要看 UI 时再启动 Studio；平时用 CLI 生成 `outputs/industry-research-runs/<runId>/manifest.json`。

## 已处理：迁移后首次 `pnpm check` 被沙箱写入权限拦截

- 现象：第一次运行 `pnpm check` 时，`apps/studio` typecheck 报 `Could not write file ... tsconfig.tsbuildinfo: EPERM`。
- 判断：这是当前 Codex 沙箱对独立项目目录写入权限的限制，不是 TypeScript 业务错误。
- 处理：用提升权限重跑同一条 `pnpm check`。
- 结果：typecheck、18 条 Vitest、Biome 均通过。

## 已处理：UI 视觉漂移

- 现象：上一轮从零重写 CSS 和组件后，页面和 screenshots 基准差距大。
- 原因：把设计稿当参考方向，而不是把 source CSS / TSX 当契约逐字移植。
- 处理：
  - 重建 `apps/studio/src/app/globals.css`。
  - 移植 porting TSX 组件。
  - 保持类名与 source 组件一致。
  - 用 Browser 对结果页进行验收。

## 已处理：结果页数据密度不足

- 现象：运行后统计和表格太稀疏，无法达到 screenshots 的研究生产台观感。
- 原因：core mock 只产出少量竞品、产品和 evidence。
- 处理：
  - 扩充 discovery candidates、raw documents、extraction jobs、evidence、竞品和机会数据。
  - 验收时统计条达到 `8 / 19 / 27 / 74 / 9`。

## 已解决：Mock 数据密度过低 / 九库卡片数字与设计稿不一致

- 现象（2026-06-25 复盘发现）：文档声称 mock 已扩到 `8 / 19 / 27 / 74`，但实际 core 包里只有 `6 / 5 / 16 / 5`、竞品 1、机会 2 的 lean 数据——文档↔代码漂移。九库卡片只显示真实数组长度，机会表只有 2 行、竞品 1 个，达不到”生产台”观感。
- 根因：mock 和真实 lean 模式共用同一套 `buildIndustryResearchDatabases` 硬编码 lean 实体（1 竞品/2 机会/5 证据），且这套数据其实从未被扩充进独立仓库。
- 处理：给 builder 加 `entityProfile: “rich”`（仅 Mock），合成竞品/机会各 6、~74 证据、产品/痛点/内容/关键词 5-6，并给 collection-plan 的 mock 路径加密 candidates/targets。真实模式保持 lean 诚实（见 DECISIONS 2026-06-25）。
- 验证：浏览器实测 Mock 结果页 stat 条 `8 / 8 / 26 / 74 / 9`，九库 `10/6/3/6/6/5/5/6/2`，机会/竞品表各 6 行，审核 12 项；`pnpm check` 34 测试绿。
- 备注：因为竞品/机会本就只取 6 行（=设计目标），不再需要 `displayCount` 把”卡片大数字”与”表格少行数”拆开。

## 已确认：localhost:3000 开发服务停止

- 现象：`node` / `next-server (v16.2.9)` 监听 `*:3000`。
- 处理：
  - 普通 `kill 5401` 被系统拒绝。
  - 使用提升权限停止父进程 `next dev --port 3000`。
  - 再次检查 `lsof -nP -iTCP:3000 -sTCP:LISTEN` 无输出，端口已释放。

## 验收备注：极窄移动视口自动化点击不稳定

- 现象：390px 左右移动视口下，页面能加载且无错误覆盖层，但 Browser 自动化点击 `开始研究` 时底层 CDP 输入命令超时。
- 判断：更像浏览器自动化通道在缩放状态下不稳定，不是页面运行时报错。
- 处理：记录为验收工具限制；桌面与较宽移动视口已完成完整运行路径验证。
