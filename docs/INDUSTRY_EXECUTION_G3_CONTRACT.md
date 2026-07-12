# Industry OS G3 本地分阶段运行契约

更新时间：2026-07-12
完成边界：L2 / 本地 C2；不接生产、不新增数据库、不调用 provider。

## 1. 阶段顺序

唯一顺序固定为：

1. `planning`
2. `breadth_scan`
3. `sampling`
4. `module_research`
5. `synthesis`
6. `reporting`

后续阶段不能越过未完成阶段。每个阶段在 checkpoint 中只能是 `pending`、`in_progress`、`completed` 或 `failed`。

## 2. Artifact contract

| 阶段 | 必需 artifact | G3 边界 |
| --- | --- | --- |
| planning | `industry_plan` | 冻结 Planner 输入和 plan |
| breadth_scan | `source_candidate_plan` | 只定义来源候选计划；候选不是证据 |
| sampling | `representative_sample_plan` | 定义样本、排除理由和未覆盖轴 |
| module_research | `module_results` | 为后续六模块保留独立结果契约 |
| synthesis | `claim_ledger` | 为 fact/signal/inference/hypothesis 保留账本契约 |
| reporting | `industry_report` | 生成报告引用；G3 fixture 明确不是行业报告 |

每个 artifact ref 必须使用安全相对路径、唯一文件路径和 `sha256:<64 hex>` 内容哈希。完成阶段缺少必需 artifact、路径越界、哈希非法或完成后 artifact 变化都会 fail-closed。

`industry_execution_manifest.v1` 在六阶段完成后生成，汇总各阶段 artifact 引用。它是新增的上位 execution manifest，不替换现有 `industry_research_delivery_manifest.v1`，旧 8 文件交付包保持兼容。

## 3. Checkpoint 与恢复

`industry_execution_checkpoint.v1` 记录：

- run/plan/input hash；
- revision、总状态和 next stage；
- 每阶段 attempt、开始/完成时间、artifact refs 和错误；
- 不需要数据库、不需要生产状态、live provider 调用为 0 的断言。

恢复规则：

- 所有 `completed` 阶段不可变并直接跳过；
- `pending` 从该阶段开始；
- 上次停在 `in_progress` 时先记为 `interrupted_execution`，只重试该阶段；
- `failed` 只重试失败阶段，后续阶段保持 `pending`；
- checkpoint schema、阶段顺序、completed 前缀、next stage 或 artifact 不一致时拒绝恢复。

本地 runner 每次 start/complete 后原子写入 checkpoint。artifact 已写入但 complete checkpoint 尚未落盘时，恢复会重写同一阶段，不影响已完成阶段。

## 4. 离线验证入口

完整运行：

```bash
pnpm execute:industry:fixture
```

受控暂停与恢复：

```bash
pnpm execute:industry:fixture -- --output outputs/industry-executions/skincare-g3-resume-proof --stop-after sampling
pnpm execute:industry:fixture -- --output outputs/industry-executions/skincare-g3-resume-proof
```

当前 proof 首轮在 sampling 后为 revision 6、`nextStage=module_research`；恢复完成后 revision 12，六阶段 attempt 均为 1，证明前三阶段没有重跑。完整 fixture 再次执行保持 revision 12，checkpoint 与 manifest SHA-256 不变。

fixture 下游文件统一声明 `contract_only_not_research_evidence`；report 明确不是护肤品行业报告，未伪造来源、样本、claim 或覆盖完成。

## 5. 未做

- 未实现 G4 来源发现、G5 代表性抽样、G7 模块研究或 G8 综合报告内容。
- 未修改现有生产 H5、public workflow、Supabase、zvec、n8n 或旧 8 文件包。
- 未新增数据库、migration、登录、支付、Docker 或基础设施。
- 未 commit、push、部署或调用任何 live API/provider/credits。
