# Industry OS G9：单一产品流 UI 验收

更新时间：2026-07-12

## 完成范围

- 保留唯一产品入口 `/industry-research`，没有新增第二条产品路由或可见模式选择器。
- 输入区在原流程内增加市场/地区、时间范围和研究目标；原 `public_web_llm` 执行路径继续存在。
- 同路由本地验收开关 `?fixture=industry-os` 只组装 G2–G8 contract fixture，不读取 key/env，不访问网络、provider、credits、数据库或生产。
- 结果页展示研究坐标、六阶段、Industry Plan、11 行覆盖矩阵、代表性样本、六个研究模块、知识地图摘要与 12 章报告。
- fixture 全页明确标记 `CONTRACT ONLY · 非行业事实`；13 个移动折叠项由“报告概览”与编号 1–12 的正式章节组成。
- 旧 `?run=<id>` 回放仍进入原报告组件；本地验收只为当前 server 进程临时加入 localhost 白名单，没有写入 `.env` 或持久配置。

## 代码边界

- `apps/studio/src/app/industry-research/actions.ts`：新增纯本地 fixture action 与 UI payload。
- `apps/studio/src/app/industry-research/IndustryOsResult.tsx`：新增 Industry OS 结果视图。
- `apps/studio/src/app/industry-research/SimpleResearch.tsx`：在原状态机内接线坐标输入、fixture 与结果页，保留普通执行和回放分支。
- `apps/studio/src/app/industry-research/industry-os-ui.test.tsx`：验证本地 payload 与服务端渲染表面。
- `apps/studio/src/app/globals.css`：补充桌面/移动响应式样式。

## 验收证据

- G9 专项测试：2/2 通过。
- `pnpm check`：25 个测试文件、250 条测试全部通过；TypeScript 与 Biome 通过。
- `pnpm build`：Next.js 16.2.10 构建通过，`/industry-research` 仍是唯一产品页；沙箱内首次失败仅因 Google Fonts 网络边界，获准联网后同一构建通过。
- Playwright 完整流程：输入页点击“开始研究”后可达 `data-testid=industry-os-result`；6 个阶段、6 个模块和 12 章标题均可见。
- 360/390/430/1440px：四个视口均满足 `document.documentElement.scrollWidth === window.innerWidth`，无横向溢出。
- 390px 与 1440px 视觉截图已人工检查；控制台 0 error、0 warning。
- 普通入口仍有开始研究按钮且没有模式选择器；已有 run `v03-public-web-smoke-2026-07-06T08-13-09-864Z` 成功进入旧报告页，未进入 Industry OS fixture。
- `git diff --check` 与密钥模式扫描通过；历史 benchmark runner diff 保持 62 additions / 22 deletions。

## 完成等级与下一权限门

G9 达到本地 **C2 / L2**。未 commit、push、部署、写生产或调用 provider/credits。

下一步 G10 是受控生产 canary。只读侦察可在 L1 进行，但 push、部署、生产 env、服务重启、生产调用、backfill/index 或费用均需要用户明确授予 L4；Loop 已在该权限门暂停。
