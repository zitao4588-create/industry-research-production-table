"use client";
/* states.tsx — 非 happy-path 占位件(P0-B):骨架 shimmer 与空态。
   ErrorState 已由 Running 里的失败卡片承担,这里补 Skeleton 与 EmptyState。*/
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./components";

/** shimmer 骨架条。真实 run 期 / 数据加载前用它占位,避免空白。 */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      className="irp-skel"
      aria-hidden="true"
      style={{
        display: "inline-block",
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

/** 某库 0 条 / 表格为空时的友好空态(带原因和可选入口),而不是空白卡。 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div style={{ padding: "34px 22px", textAlign: "center" }}>
      <div style={{ display: "inline-flex", marginBottom: 10, color: "var(--muted)" }}>
        <Icon name="database" size={22} />
      </div>
      <div style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 4 }}>{title}</div>
      {hint && (
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--faint)" }}>{hint}</div>
      )}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

/** 表格为空时统一兜底:在 .table-wrap 里渲染空态。 */
export function EmptyTable({ label }: { label: string }) {
  return (
    <div className="table-wrap">
      <EmptyState
        title={`${label}暂无结果`}
        hint="该库本轮没有抽取到条目；真实模式下可补充公开 URL / CSV 后重试，或换更具体的行业、品类、市场再跑一次。"
      />
    </div>
  );
}
