# Industry OS G12 统一 Benchmark 预注册 v1

状态：离线预注册已锁定，尚未获得 live benchmark 预算或执行授权。

## 决策边界

本 benchmark 只判断证据流水线是否可用、需要调整或暂时受阻，不判断行业、产品或商业模式应继续还是停止。G11 已由用户明确跳过，因此 C4 真实使用证据仍缺失；即使 5/5 技术通过，也不能仅凭 benchmark 标记 C5。

本轮离线准备不读取 `.env`，不调用 API、provider、credits、公开网页、生产服务、Supabase 或 zvec，费用为 ¥0。任何 live 运行、预算、API key 使用、商业解冻和最终继续/调整/停止决定都必须另行确认。

## 锁定样本与顺序

按以下顺序最多运行 5 个品类：

1. `pet-probiotics`：宠物肠胃益生菌
2. `dishwasher`：洗碗机
3. `japan-niche-skincare`：日本小众护肤品牌
4. `mens-electric-shaver`：男士电动剃须刀
5. `cat-water-fountain`：猫咪自动饮水机

不得加入或替换为 `skincare-broad-negative`。该标签仅是历史实验记录，不再具有产品判定效力。开始 live 运行后不得因结果好坏更换品类、顺序、阈值或评分权重。

## 单品类硬门槛与 100 分评分

任一硬门槛失败即该品类 FAIL；总分至少 70 仍不能覆盖硬门槛失败。

| 维度 | 权重 | 硬门槛 |
|---|---:|---|
| 可信来源覆盖与页面深度 | 30 | 至少 3 份可信文档、2 个独立域名、1 个深页 |
| 完整可证实结论比例 | 30 | 至少 70%，按完整 claim 和全部绑定 quote 计算 |
| 正文纯净度 | 15 | 中位残余噪音不高于 25%，任一文档不高于 50% |
| 决策可用性 | 10 | 至少 1 条完全支持、可行动的 finding |
| 运行稳定性 | 10 | 成功完成且不超过 300 秒 |
| 成本与请求纪律 | 5 | 实际人民币成本必须可核对且不超批准上限；单品类最多 32 个公开请求、3 个 LLM 请求、50 Firecrawl credits |

缺失成本数据按 FAIL 处理，不以“控制台尚未刷新”暂时加分。真实运行前必须把总预算、单品类人民币上限、provider、模型和 dashboard 核对方式写入新的权限请求；本预注册不替用户填写预算。

## Benchmark 早停规则与 pre/post-kill 隔离

统一通过目标为至少 3/5 品类 PASS。每个品类完成后按预注册顺序计算：若“当前 PASS 数 + 剩余未运行品类数 < 3”，立即触发 benchmark 早停规则，停止后续 live 调用以节省预算。早停只结束本次 benchmark，不代表停止产品或商业化。

典型情况是前三项 0/3 PASS，此时后两项不再运行。kill 后如未来另行授权探索，产物必须标记 `post_kill_exploratory`，不得并入 G12 统一分数、通过率或 C5 证据；只要混入，统一评估即记为预注册违规。

## 失败分类

- `technical_failure`：运行失败、超时或必要产物缺失。
- `source_coverage_failure`：可信文档、独立域名或深页不足。
- `claim_verifiability_failure`：完整可证实结论比例不足。
- `document_quality_failure`：残余噪音超过阈值。
- `decision_usability_failure`：没有完全支持的可行动 finding。
- `cost_or_request_cap_failure`：成本未知、超预算或请求/credits 超限。
- `preregistration_violation`：换样本、换顺序、使用禁用标签或混入 post-kill。
- `real_use_evidence_missing`：没有独立真实使用证据，不能进入 C5 最终判断。

## 统一证据流水线结论

- `evidence_pipeline_ready`：完整运行且至少 4/5 PASS。
- `evidence_pipeline_needs_adjustment`：完整运行且 2–3/5 PASS。
- `evidence_pipeline_blocked`：早停规则触发，或完整运行仅 0–1/5 PASS。
- `insufficient_benchmark_evidence`：尚未完整运行且尚未触发 kill rule。

输出同时固定写入 `decisionScope=evidence_pipeline_only` 与 `commercializationAssessment.status=not_evaluated`。只有真实用户需求、付费意愿、获客、留存和交付经济性证据，才有资格形成商业继续/调整/停止判断。

## 离线 runner

打印锁定计划（零网络、零 provider）：

```bash
pnpm benchmark:g12:prepare
```

对用户明确提供的本地 JSON 结果做离线评分：

```bash
pnpm benchmark:g12:prepare -- --input=/absolute/path/to/g12-results.json
```

runner 明确拒绝 `--execute`、`--live`、`--provider`、`--api-key` 和 `--credits`。live 采集器只有在预算与 provider 权限单独确认后才能设计或接线。
