# Industry OS G12 Live Benchmark 结果

日期：2026-07-13

状态：预注册 benchmark 早停规则已触发；证据流水线结论为 `evidence_pipeline_blocked`，商业化状态为 `not_evaluated`。

## 运行身份

- Run：`industry-os-g12-benchmark-v1-2026-07-13T03-26-39-782Z`
- 本地产物：`outputs/industry-research-benchmarks/industry-os-g12-benchmark-v1/industry-os-g12-benchmark-v1-2026-07-13T03-26-39-782Z/`
- 统一摘要 SHA-256：`d3111720a51f05985896aae67433203d6d1631b92b2fad45f72ef3d5a12b0f10`
- Scorecard SHA-256：`7682f4fe271108b7fba53a3a9544717fe486baff8686377d1249de4aa3e5c8f7`
- Provider：阿里云百炼 `kimi-k2.6`；搜索 Tavily；抓取 Firecrawl + 原生公开网页。
- 未使用 `skincare-broad-negative`，没有 post-kill 结果混入。

## 统一结果

| 顺序 | 品类 | 分数 | 结果 | 主要失败 |
|---:|---|---:|---|---|
| 1 | 宠物肠胃益生菌 | 0/100 | FAIL | 300 秒超时；来源、可证实结论、正文质量、可行动 finding 和成本可核对性均未通过 |
| 2 | 洗碗机 | 60/100 | FAIL | 3 份可信文档、2 域名、3 深页通过，但完整可证实结论 0，完全支持的可行动 finding 0 |
| 3 | 日本小众护肤品牌 | 15/100 | FAIL | 可信文档、独立域名和深页均为 0；完整可证实结论和可行动 finding 均为 0 |
| 4 | 男士电动剃须刀 | 未运行 | KILLED | 前三项 0/3 PASS 后已不可能达到至少 3/5 PASS |
| 5 | 猫咪自动饮水机 | 未运行 | KILLED | 同上 |

前三项 `0/3 PASS` 后，“当前 PASS + 剩余品类”最多只能达到 2，预注册早停规则正常触发。后两项不运行属于预注册内的完整执行结果，不是遗漏或额度中断。该规则只停止本次付费 benchmark 调用，不判断项目应停止。

## 请求、credits 与费用

- 公开请求：64 / 160。
- LLM 请求：5 / 15，全部请求模型为 `kimi-k2.6`。
- Tavily：6 / 10 次基础搜索。
- Firecrawl：按 endpoint 最坏情况保守预留 140 / 250 credits；响应未返回 `creditsUsed`，因此不能把响应报告的 0 当成实际零扣费。
- 3 个带 usage 的 LLM 响应加 Tavily pay-as-you-go 保守价格，可计算费用为 ¥0.724446。
- 宠物益生菌超时前的 2 个 LLM 请求没有返回 usage；按每次 ¥2 额外保守预留，完整费用上界为 **¥4.724446 / ¥10**。
- 因缺少这 2 次请求的精确 dashboard usage，宠物益生菌的成本硬门槛 fail-closed；没有用估算值替代“实际成本已确认”。
- 全程没有触发人民币、Firecrawl、公开请求、Tavily 或 LLM 次数上限。

## 结论边界

- 统一技术 benchmark 的证据流水线结论为 `evidence_pipeline_blocked`：当前自动采集与 claim 生成链路尚未达到稳定付费交付标准。
- 主要问题不是报告能否生成，而是完整可证实结论和可行动 finding 持续为 0；单个洗碗机来源覆盖通过仍不能覆盖 claim 门禁失败。
- 本 benchmark 没有测真实需求、付费意愿、获客、留存或交付毛利，因此商业化状态必须是 `not_evaluated`，不能生成停止商业化结论。
- G11 已由用户明确跳过，C4 真实使用证据缺失，因此本结果不能单独标记 C5。
- 本轮只写本地 benchmark 产物；未写生产 Supabase/zvec，未应用 migration，未部署、commit、push 或对外沟通。

## 建议

不再启动新的品类 benchmark。下一步复用表现最接近门槛的洗碗机产物，只修复 claim 完整性、quote 绑定和机会假设生成；报告应输出“证据缺口 + 下一验证动作”，而不是自动停止商业化。
