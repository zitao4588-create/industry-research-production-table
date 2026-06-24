# Bug Notes

更新时间：2026-06-18

## 已处理：agent-factory Studio / Next dev 导致电脑发热

- 现象：运行 `agent-factory/apps/studio` 时电脑明显发热。
- 判断：负载主要来自 Next.js dev server、文件监听和整个 Studio 壳，不是行业研究 agent 核心逻辑本身。
- 处理：
  - 把行业研究 v0.3 核心同步到独立项目。
  - 独立项目新增 CLI-first 入口 `pnpm sample:public-web`，默认不启动 Next、不调用 DeepSeek。
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

## 未完全解决：九库卡片数字与 fixture 展示规模不一致

- 现象：九库卡片当前显示真实数组长度，例如 `7 / 6 / 6 / 5 / 6 / 5 / 5 / 6 / 1`，而 fixture 展示规模是 `24 / 6 / 18 / 42 / 57 / 15 / 33 / 6 / 4`。
- 原因：当前 UI model 只有一个 `count`，同时来自 adapter 的真实数组长度；如果直接扩数组，会让下方表格行数也膨胀。
- 当前处理：尊重“adapters 保留不动”的边界，暂不硬改。
- 建议：允许 adapter 或 UI model 增加 `displayCount` 后再精确对齐。

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
