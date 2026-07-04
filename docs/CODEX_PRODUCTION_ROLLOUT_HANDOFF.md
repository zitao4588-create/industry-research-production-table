# Codex 交接文档 · 生产上线三部曲 + 外部凭据接入

> **更新时间**：2026-07-05
> **受众**：Codex / 接手生产上线的开发者
> **性质**：研究价值阶段（`docs/CODEX_RESEARCH_VALUE_HANDOFF.md` 的 P0–P3）已由 Claude Code 于 2026-07-05 全部完成并推送 `origin/main`；Claude Code 的自动模式权限策略禁止其 SSH 生产服务器，剩余的**生产侧动作**全部整理在本文档。
> **授权说明（重要）**：用户已明确授权在本文档范围内通过 SSH（host 别名 `lighthouse-lab`，登录用户 `ubuntu`）执行部署、n8n 导入和验证。这**覆盖** `CODEX_RESEARCH_VALUE_HANDOFF.md` §3.6「不要主动 SSH」的旧纪律——但授权范围仅限本文档列出的脚本与命令；护栏见 §2，任何一步失败即停、记 `BUG_NOTES.md`，不做清单外的服务器改动。

---

## 0. 当前状态快照（2026-07-05，动手前先核对）

已完成、**不要重做**：

- `origin/main` = `a77d519`（`7c07af5` 研究价值阶段 + `a77d519` 部署脚本）。分批抽取、搜索 provider、robots/配额/礼貌控制、内容 API 适配器、跨 run diff 周报、历史上下文回灌、n8n 周报 workflow JSON、run-security 单测、三个部署脚本，全部在这两个提交里。
- 本机验证：`pnpm check`（84 测试）与 `pnpm build` 全绿；两次真实 DeepSeek run 证明九库填充 + 周报 diff 循环可用（`outputs/industry-research-runs/pet-probiotics-dtc-2026-07-04T16-50-36-292Z/`）。
- 本机 `.env.local` 已配置可用的 DeepSeek 官方 API（`AGENT_FACTORY_LLM_*` 三个变量）。**这是 R2 的数据源，不要提交、不要打印。**

未完成（本文档范围）：

- 生产服务器还在旧代码（`703e41a` 时代 + 部分 UI 同步），env 无 `AGENT_FACTORY_LLM_*`，n8n 无周报 workflow。
- 公网 `https://research.playgamelab.cn/api/health` 于 2026-07-05 确认 `status=ok`（部署前基线）。
- Brave/YouTube/Reddit key 未注册（用户动作，见 §5）。

前置阅读：`AGENTS.md`、`DECISIONS.md` 2026-07-05 各条、`deploy/lightweight-server/README.md`「一键脚本」节、`BUG_NOTES.md`（重点：远端目录不是 git 仓库、sudo env 加载坑、`SUPABASE_SERVICE_ROLE_KEY` 双 JWT 粘贴事故、`ssh lighthouse-lab` 而不是 root@domain）。

## 1. 任务总览（严格按顺序）

| # | 任务 | 依赖 |
|---|------|------|
| R1 | 只读侦察（含无密码 sudo 确认） | — |
| R2 | `configure-llm-env.sh`：写 DeepSeek env 到服务器 | R1 |
| R3 | `deploy.sh`：部署 `a77d519` | R1 |
| R4 | 生产 LLM 复核（`verify:9router`，一次廉价 DeepSeek 调用） | R2+R3 |
| R5 | n8n 周报 workflow 导入 + smoke | R3 |
| R6 | 服务器 zvec 增量索引 | R3 |
| R7 | 文档回写 + commit + push | R1–R6 |
| K1–K3 | 外部 key 接线（等用户注册后） | 用户提供 key |
| U1 | 真实用户验证准备 | R4 |

## 2. 安全护栏（不可违反）

1. **密钥零暴露**：任何 key/secret 不回显到终端输出、不写入 Git、不落服务器临时文件；跨机传输只走 ssh stdin 管道（脚本已实现）。
2. **改前必备份**：env 文件、n8n workflow 都先备份（脚本已内置）；rsync 永不带 `--delete`。
3. **失败即停**：任何一步非预期输出，停止后续步骤，把现象/原因/处理记入 `BUG_NOTES.md`，不要带病继续。
4. **成本边界**：LLM 调用仅限 R4 与 K 系验证中列出的命令；不要循环重试烧额度。
5. **生产 Supabase 只做只读核查**；不写测试数据（R5 的 smoke run 是业务链路自然写入，不算）。
6. 服务器上的操作只限 `/opt/playgamelab/industry-research`、`/opt/playgamelab/industry-research-data`、n8n 容器和 systemd 服务；不动其他服务。

## 3. 生产上线任务（R1–R7）

### R1 · 只读侦察

```bash
ssh -o BatchMode=yes -o ConnectTimeout=8 lighthouse-lab '
  hostname; whoami;
  sudo -n true && echo sudo-nopasswd-ok || echo sudo-needs-password;
  systemctl is-active industry-research.service;
  sudo -n ls -la /opt/playgamelab/industry-research/industry-research.env;
  sudo -n grep -c "^AGENT_FACTORY_LLM_" /opt/playgamelab/industry-research/industry-research.env || echo no-llm-vars;
  docker ps --format "{{.Names}}" | grep -i n8n;
  df -h /opt | tail -1'
```

- 验收：`sudo-nopasswd-ok`（**关键**：R2 靠管道传 key，若 sudo 要密码会吞掉 stdin，必须先确认）；service `active`；env 存在且 `no-llm-vars`（若已有 LLM 行数 >0，先 `sudo grep '^AGENT_FACTORY_LLM_' <env> | sed 's/=.*/=***/'` 看是哪几个，避免重复写入——configure 脚本本身幂等，可直接跑）；拿到 n8n 容器名（R5 用）；磁盘余量 >2G。
- 失败处理：`sudo-needs-password` → 停，让用户配置 NOPASSWD 或亲自执行 R2；ssh 不可达 → 核对 `~/.ssh/config` 的 `lighthouse-lab` 条目（见 BUG_NOTES 2026-06-29）。

### R2 · 写 DeepSeek env（configure-llm-env.sh）

```bash
bash deploy/lightweight-server/configure-llm-env.sh --dry-run    # 复核计划
bash deploy/lightweight-server/configure-llm-env.sh --execute
```

- 脚本行为：备份 `industry-research.env.bak-<ts>`（保留 root:600）→ 逐变量 `sed 删旧行 + tee -a 追加`（幂等）→ 校验 `AGENT_FACTORY_LLM_` 行数 = 3。
- 验收：脚本输出 `行数：3`；不出现任何 key 明文。
- 回滚：`ssh lighthouse-lab 'sudo cp -p <env>.bak-<ts> <env>'`。
- 注意：写完 env 不需要单独重启服务——R3 的 deploy.sh 末尾会 restart。

### R3 · 部署（deploy.sh）

```bash
bash deploy/lightweight-server/deploy.sh --dry-run    # 重点看 rsync 预览：不应出现 env / node_modules / outputs
bash deploy/lightweight-server/deploy.sh --execute
```

- 脚本行为：git archive HEAD → 远端 `sudo tar` 备份到 `.deploy-backups/pre-<sha>-<ts>.tar.gz` → 非删除式 rsync（排除清单对齐 DECISIONS 2026-06-29）→ `pnpm install --frozen-lockfile`（本轮无新依赖，应很快）→ `pnpm build` → doctor（登录 shell 内 `sudo cat env` 后 eval，变量只进内存）→ `systemctl restart` → 公网 health。
- 验收：build 成功；`server:doctor` / `supabase:doctor` 通过；service `active`；health 返回 `status=ok` 且 `llmDefaultSafeForProduction` 相关字段反映新 env；`curl -s https://research.playgamelab.cn/industry-research | head -c 200` 返回 200 页面。
- 已知风险与对策：
  - doctor 的 `eval $(sudo cat env)` 写法是 2026-07-05 新改的（旧写法 `sudo -u ubuntu source` 读不了 root:600，见 DECISIONS）；若 eval 因 env 里有特殊字符报错，按 BUG_NOTES 2026-06-29 的旧方法手动导出后单独跑 doctor，并把修复回写到脚本。
  - 远端 pnpm/node 版本沿用上轮部署（node 22 / pnpm 10），无需变更。
  - 部署不同步 `remotion-videos/`、`.claude/` 等（排除清单里）。

### R4 · 生产 LLM 复核

```bash
ssh lighthouse-lab "set -a; eval \"\$(sudo cat /opt/playgamelab/industry-research/industry-research.env | grep -v '^#' | grep '=')\"; set +a; cd /opt/playgamelab/industry-research && pnpm verify:9router"
```

- 验收：输出 JSON `usesLocalFallback=false`、`contentLength > 1000`、title 含 `deepseek-v4-flash`。这是一次真实 DeepSeek 调用（成本几分钱人民币级）。
- 失败处理：`未配置 ... API Key` → R2 没生效（检查 env 行、重启后 systemd 是否加载）；DeepSeek 返回 401 → key 粘贴问题，对照本机 `.env.local`（**不要打印两边的值**，比对 `wc -c` 长度即可）。

### R5 · n8n 周报 workflow 导入 + smoke

```bash
N8N_CONTAINER=<R1 拿到的容器名> bash deploy/lightweight-server/import-weekly-workflow.sh --dry-run
N8N_CONTAINER=<容器名> bash deploy/lightweight-server/import-weekly-workflow.sh --execute
```

- 脚本行为：`n8n export:workflow --all` 备份 → 导入 `industryResearchWeeklyRerun`（新 id，不覆盖 intake）→ `update:workflow --active=true` → 重启容器 → `n8n execute --id=...` 手动 smoke（触发一次真实 `public_web` run，不调 LLM）。
- 导入前可按需编辑 JSON 里 `Subscription List` Code 节点的订阅清单（当前内置宠物益生菌样例，首跑保持默认即可）。
- 验收：
  1. smoke 执行返回成功；
  2. 服务器 shell 内验证新 run（key 不出服务器）：`ssh lighthouse-lab "set -a; eval \"\$(sudo cat <env> | grep -v '^#' | grep '=')\"; set +a; curl -fsS -H \"x-internal-key: \$AGENT_FACTORY_INTERNAL_API_KEY\" http://127.0.0.1:3010/api/industry-research/runs | head -c 600"` 应出现分钟级新 run；
  3. 该 run 的 `report.md` 有「本期新增与变化」节（周报 diff 生产首验；若这是该品类在服务器上的第一次 run，应为「本期为基线」）；
  4. n8n UI 执行记录里 intake workflow 有对应四态执行。
- 已知风险：该 n8n 版本 CLI 若无 `update:workflow` 子命令，改用 UI 手动激活（导入后在 UI publish + activate），把差异记 BUG_NOTES；`n8n execute` 对 Schedule Trigger workflow 的手动执行如果不触发下游，改为直接 `curl -X POST https://n8n.playgamelab.cn/webhook/industry-research/intake -H 'content-type: application/json' -d '<订阅清单第一项的 JSON>'` 做等价 smoke。
- 回滚：`docker exec <n8n> n8n update:workflow --id=industryResearchWeeklyRerun --active=false`；备份在容器 `/home/node/.n8n/workflow-backups/`。

### R6 · zvec 增量索引

```bash
ssh lighthouse-lab "set -a; eval \"\$(sudo cat <env> | grep -v '^#' | grep '=')\"; set +a; cd /opt/playgamelab/industry-research && pnpm zvec:index && pnpm zvec:search --query=weekly"
```

- 验收：`upsertedChunkCount > 0`（R5 的新 run 被索引）、`warnings=[]`（默认不跑 optimize）；search 能命中新 run。
- 注意：单写锁，不要与其他 zvec 进程并行。

### R7 · 文档回写 + 提交

- `PROJECT_CONTEXT.md`「当前真实状态」+「验证结果」加 2026-07-05 生产上线节：R2–R6 每步的实际输出要点（runId、行数、health、verify 数字）。
- `TODO.md`：勾掉生产部署与 n8n 导入两项；`BUG_NOTES.md` 记录途中踩的任何坑。
- 本文档顶部加「状态同步」注明完成时间。
- commit + push `origin/main`（用户已授权直接推 main；提交信息按仓库惯例）。

## 4. 部署后回归清单（R7 前快速过一遍）

- [ ] 公网 health `status=ok`，`/industry-research` 200
- [ ] 未带凭据访问 `/api/industry-research/runs` 返回 401（安全边界未回退）
- [ ] R5 的新 run 可通过 download API 下载（带内部 key，服务器 shell 内验证）
- [ ] Supabase 只读核查：run/artifact 表有 R5 新 run 记录（可用 `pnpm supabase:doctor`；不写数据）
- [ ] `systemctl is-active industry-research.service` = active，`journalctl -u industry-research.service -n 20` 无异常堆栈

## 5. 外部凭据接线（K1–K3，等用户注册）

注册是用户动作（绑定账号/支付信息，不可代办）。用户提供 key 后，Codex 负责接线与验证：

| Key | 注册处（给用户） | env 变量 | 接线后验证 |
|-----|-----------------|----------|-----------|
| K1 Brave（或 Serper） | brave.com/search/api（free 档也要绑卡）/ serper.dev | `AGENT_FACTORY_SEARCH_PROVIDER=brave\|serper` + `AGENT_FACTORY_SEARCH_API_KEY` | 跑 `pnpm sample:deepseek`，报告合规边界节应出现 `provider=brave`（而非 duckduckgo_html） |
| K2 YouTube Data API v3 | console.cloud.google.com → 启用 API → 创建 API key | `AGENT_FACTORY_YOUTUBE_API_KEY` | 同上，`content_database` 应出现 YouTube 平台条目、`sourceQualitySummary.bySourceType.content_api > 0` |
| K3 Reddit | reddit.com/prefs/apps 建 script app → client_credentials 换 token | `AGENT_FACTORY_REDDIT_ACCESS_TOKEN` | 同上，pain_point/content 库出现 Reddit 来源；注意 token 会过期，记录获取方式供续期 |

接线位置：本机 `.env.local` + 服务器 env（复用 `configure-llm-env.sh` 的模式：备份 → sed 删旧行 → tee -a，或扩展该脚本支持变量清单参数）。验证 run 用本机跑即可，不必每个 key 都动生产。

## 6. U1 · 真实用户验证准备（P4，用户主导）

- 样品：R5 产出的生产 run 报告，或本机 `outputs/industry-research-runs/pet-probiotics-dtc-2026-07-04T16-50-36-292Z/report.md`（九库全满 + 周报 diff 的版本）。
- 建议流程：让 1–3 个电商卖家提供各自真实品类（industry/category/market + 可选竞品 URL）→ 用 `https://research.playgamelab.cn/industry-research` 简化 UI 或 intake webhook 各跑一轮 → 交付报告 → 只问一个问题：「这份报告你愿意付多少钱？」
- Codex 的职责边界：保证 run 成功与质量（失败就修），不代替用户做访谈。

## 7. 验证命令速查

```bash
# 本机
pnpm check && pnpm build
bash deploy/lightweight-server/deploy.sh --dry-run
# 服务器（env 变量只进登录 shell 内存）
ssh lighthouse-lab "set -a; eval \"\$(sudo cat /opt/playgamelab/industry-research/industry-research.env | grep -v '^#' | grep '=')\"; set +a; cd /opt/playgamelab/industry-research && pnpm server:doctor && pnpm supabase:doctor"
curl -fsS https://research.playgamelab.cn/api/health
```
