# Industry OS G5 代表性抽样契约

更新时间：2026-07-12
完成边界：L2 / 本地 C2；只验证抽样契约，不宣称真实护肤品样本已经完成。

## 1. 抽样输入与资格

G5 新增 `industry_representative_sample_plan.v1`。抽样输入必须绑定 G4 `sourceCandidateId`，并同时满足：

- 来源候选为 `eligible_candidate` 且 `public_no_auth_or_cost`；
- sampling candidate 为 `validated_for_sampling`，并记录 validation basis；
- 来源角色获准支持对应关系：竞品、供应链、渠道、内容或商业模式类比；
- axis assignments 全部存在于 G2 Planner；
- 直接竞品至少有 taxonomy 和人群归属；
- business-model analogy 的 sample type 与 relationship 必须一致。

未验证、来源缺失、来源被阻断、角色不匹配、未知轴或类比类型错误都会进入 `excludedCandidates`，并保留明确原因。

## 2. 选择算法

- 选择按新增覆盖贡献进行确定性贪心：taxonomy、价格带、渠道、商业模式和人群权重高于补充轴。
- 同分时只使用稳定 `entityId`，不读取搜索 rank，也不依赖输入顺序。
- 每个选中样本记录 source candidate bindings、selection reason、axis assignments、population segments、coverage contribution 和 selection order。
- business-model analogy 可补商业模式覆盖，但永远不进入 `competitorSampleIds`。

## 3. 覆盖门

覆盖门复用 Planner 最低要求：

- 每个 taxonomy item 至少 1 个样本；
- 覆盖 3 个价格带；
- 覆盖至少 3 个渠道；
- 覆盖至少 3 个商业模式；
- 至少 2 个明确人群 segment。

通过后只允许进入 `module_research`；`synthesisAllowed` 在 G5 始终为 false。覆盖不足时 `nextStageAllowed=null`，不得开始模块研究或综合判断。

## 4. 两类离线产物

运行入口：

```bash
pnpm sample:industry:fixture
```

### 当前 G4 官方池

`official-only-sample-plan.json` 使用真实 G4 的 7 个监管/统计候选，不添加竞品实体：

- selected samples = 0；
- 24 个规划轴仍未覆盖；
- gate = `blocked_insufficient_coverage`；
- next stage = null；
- synthesis = false；
- 连续两次 SHA-256：`56628c619255a77bc1fd384f757d1b34ca9083975697198e5a7b5b96ff58eca0`。

这证明系统不会把监管/统计来源伪装成护肤品竞品。

### Contract fixture

`contract-fixture-sample-plan.json` 使用明确标注为虚构 contract-only 的多轴候选：

- selected samples = 6；其中 direct competitors 3、business-model analogy 1；
- analogy 与 competitor 交集为 0；
- taxonomy 5/5、价格带 3/3、渠道 4/3、商业模式 4/3、人群 3/2；
- gate = pass，只允许进入 module research；synthesis = false；
- 所有样本有来源绑定和选择理由；
- 连续两次 SHA-256：`121f371f87ea8e1f3f11a34b970b608447ae4e648b6e657432b290b59a689c44`。

## 5. 验证

专项测试覆盖：多轴选择、搜索排序/输入顺序无关、类比隔离、未验证候选排除、来源角色错配、官方池 fail-closed、单品牌覆盖不足、未知轴阻断、G3 sampling artifact 接线和确定性序列化。

最终 `pnpm check` 为 21 个测试文件、206 条测试通过；`git diff --check` 与 secret pattern 审计通过。未运行网络、provider、API key、credits、数据库、生产或部署。
