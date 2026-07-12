# Industry OS G4 来源候选规划契约

更新时间：2026-07-12
完成边界：L1/L2 / 本地 C2；候选不是证据，不更新 evidence coverage。

## 1. 结果

G4 新增 `industry_source_candidate_plan.v1`，把 G2 的来源角色政策和覆盖矩阵接到 G3 的 `breadth_scan/source_candidate_plan` artifact contract。

每个候选显式记录：

- source role 与允许支持的 claim roles；
- 可服务的研究模块；
- coverage row、axis type 和 axis item assignments；
- 优先级与发现方式；
- URL 规范化结果、公开访问/登录/cookie/key/credits/paywall/captcha/私人数据状态；
- 预计公网请求数、候选状态、阻断原因和重复来源绑定；
- 固定的 `candidate_not_evidence` 状态。

## 2. Fail-closed 规则

- 非 HTTP(S)、需要登录/cookie/API key/credits、付费墙、验证码或私人数据的候选直接 blocked。
- URL 去除 tracking 参数、fragment，规范 host/path/query 后再去重；重复项不能重复占配额。
- 来源角色只映射 Planner 授权的 claim role、研究模块和覆盖行。品牌官网不能支持市场规模、消费者需求或商业盈利。
- 候选池有全局数量、计划公网请求、单角色、单 hostname 和品牌控制来源占比上限。
- 品牌官网与官方店必须由非品牌来源数量支撑；没有非品牌来源时不能独占候选池。
- 候选数量达到覆盖目标时只标记 `candidate_target_met_not_evidence`；不足时保持 `blocked_candidate_gap`。两者都不修改 Planner 的真实 evidence coverage。

## 3. 无额度公开发现适配

`sourceCandidateInputsFromNoKeyPublicDiscovery` 只把调用方已取得的公开搜索结果规范为候选输入，记录 query 和 result rank。它本身不发请求、不抓正文、不读取环境变量，也不接 Tavily、Firecrawl、Amazon 或 provider。

当前离线 runner 使用 G2 已审计的 7 个官方公开 seed：4 个 regulator、3 个 government statistics。结果为：

- candidates 7，eligible 7；
- 7 个候选全部有 claim roles、module、coverage axis assignments 和 `public_no_auth_or_cost`；
- 11 行覆盖中 1 行达到候选最低门槛但仍不是 evidence，10 行保持 blocked；
- planned public requests 7，实际 live public requests 0；
- provider calls 0，credits 0；
- 连续两次产物 SHA-256 均为 `46a153dca6cf5b011ff0f5711bfc425f73b6ce894eacb71c2908dd4b382a8c9a`。

运行入口：

```bash
pnpm plan:industry:sources
```

## 4. 自动化验证

专项测试覆盖：

- 7 个官方 seed 映射；
- source role → claim/module/axis 授权；
- URL 规范化与去重；
- 登录、cookie、key、credits、付费墙、验证码和私人数据阻断；
- 非公开 URL 与负请求预算阻断；
- 品牌控制来源占比；
- 单角色、单 hostname 和计划请求预算；
- candidate coverage 与 evidence coverage 隔离；
- no-key public discovery 纯函数适配；
- G3 breadth_scan artifact 接线；
- 确定性序列化和 0 provider/credits 断言。

最终 `pnpm check` 为 20 个测试文件、196 条测试通过；`git diff --check` 和 secret pattern 审计通过。

## 5. G2–G4 三 Goal 复盘

- 范围未漂移：G2 校准 Planner，G3 建执行 checkpoint，G4 只填 breadth-scan 候选契约；没有提前进入真实采集、抽样或综合报告。
- 测试仍覆盖真实门禁：不仅验证 happy path，也验证品牌垄断、受限访问、预算、重复、损坏 checkpoint 和 evidence 隔离。
- 上下文已经增长，但 `docs/industry-os-loop-state.json`、本 handoff 与逐 Goal 文档足以恢复；继续 G5 时只加载 Planner、source candidate、execution contract 和最新 checkpoint，不重读旧生产历史。
- 旧 benchmark runner 62/22 diff、生产 H5、Supabase/zvec/n8n 和旧 8 文件包均未修改。

## 6. 未做

- 未执行搜索、抓取、正文提取、来源验证或 evidence 生成。
- 未使用 Tavily、Firecrawl、Amazon、API key、cookie、登录态或任何 credits。
- 未选择代表性竞品；这属于 G5。
- 未 commit、push、部署或写生产。
