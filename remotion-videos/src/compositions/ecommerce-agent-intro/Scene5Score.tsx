import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSansSC";
import { DarkGradientBg } from "./Background";
import { BRAND, CONTENT } from "./theme";
import { sceneCrossfade, fadeSlideUp, countUp, TargetIcon } from "./utils";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700", "800", "900"],
  subsets: ["latin"],
});

export const Scene5Score: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const opacity = sceneCrossfade(frame, durationInFrames);

  // 顶部标题
  const title = fadeSlideUp(frame, 6, 18);

  // 评分 count-up（30-90 帧）
  const score = countUp(frame, CONTENT.opportunityScore, 30, 55);
  // 评分环弧形进度（30-90 帧）
  const ringProgress = interpolate(frame, [30, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 机会卡 spring 弹出（95 帧后）
  const cardScale = spring({
    frame: frame - 95,
    fps,
    config: { damping: 12, stiffness: 160 },
  });
  const cardO = interpolate(frame, [95, 108], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 报告卡片逐行刷出（115 帧后）
  const reportLines = [
    { type: "h", text: "# 竞品研究报告" },
    { type: "p", text: "## 已确认发现" },
    { type: "p", text: "- 换粮过渡期存在肠道不适痛点" },
    { type: "p", text: "- 益生菌品类搜索量环比 +18%" },
    { type: "p", text: "## 证据不足但可能成立" },
    { type: "p", text: "- 复合益生菌定价高于单品 2.3 倍" },
  ];

  // 环形参数
  const cx = 200;
  const cy = 200;
  const r = 150;
  const circumference = 2 * Math.PI * r;
  const arcLen = circumference * ringProgress;

  return (
    <AbsoluteFill style={{ opacity }}>
      <DarkGradientBg particleSeed={5} />

      <AbsoluteFill
        style={{
          flexDirection: "column",
          padding: "110px 60px 90px",
        }}
      >
        {/* 顶部标题 */}
        <div
          style={{
            fontFamily,
            fontSize: 46,
            fontWeight: 800,
            color: BRAND.textPrimary,
            opacity: title.opacity,
            transform: title.transform,
            textAlign: "center",
            marginBottom: 30,
          }}
        >
          机会评分 · 人工审核 ·{" "}
          <span style={{ color: BRAND.success }}>报告</span>
        </div>

        {/* 上半区：评分环 + 机会卡 */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 40,
            marginBottom: 36,
          }}
        >
          {/* 评分环 */}
          <div style={{ position: "relative", width: 400, height: 400 }}>
            <svg width="400" height="400" viewBox="0 0 400 400">
              {/* 底环 */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={`${BRAND.success}22`}
                strokeWidth="18"
              />
              {/* 进度环（逆时针从顶部开始） */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={BRAND.success}
                strokeWidth="18"
                strokeLinecap="round"
                strokeDasharray={`${arcLen} ${circumference}`}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ filter: `drop-shadow(0 0 12px ${BRAND.success})` }}
              />
              {/* 刻度点 */}
              {Array.from({ length: 40 }, (_, i) => {
                const a = (i / 40) * Math.PI * 2 - Math.PI / 2;
                const x1 = cx + Math.cos(a) * (r + 16);
                const y1 = cy + Math.sin(a) * (r + 16);
                const x2 = cx + Math.cos(a) * (r + 24);
                const y2 = cy + Math.sin(a) * (r + 24);
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={BRAND.success}
                    strokeWidth="2"
                    opacity={i / 40 < ringProgress ? 0.6 : 0.15}
                  />
                );
              })}
            </svg>
            {/* 中心数字 */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontFamily,
                  fontSize: 120,
                  fontWeight: 900,
                  color: BRAND.success,
                  textShadow: `0 0 30px ${BRAND.success}`,
                  lineHeight: 1,
                }}
              >
                {score}
              </span>
              <span
                style={{
                  fontFamily,
                  fontSize: 26,
                  fontWeight: 500,
                  color: BRAND.textMuted,
                  marginTop: 8,
                }}
              >
                综合评分
              </span>
            </div>
          </div>

          {/* 机会卡 */}
          <div
            style={{
              opacity: cardO,
              transform: `scale(${cardScale})`,
              padding: "28px 32px",
              borderRadius: 18,
              border: `1px solid ${BRAND.success}66`,
              background: `linear-gradient(150deg, ${BRAND.cardBg}, ${BRAND.success}15)`,
              boxShadow: `0 0 30px ${BRAND.success}33`,
              width: 360,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: `${BRAND.success}22`,
                  border: `1px solid ${BRAND.success}66`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <TargetIcon size={26} color={BRAND.success} />
              </div>
              <span
                style={{
                  fontFamily,
                  fontSize: 24,
                  fontWeight: 700,
                  color: BRAND.success,
                }}
              >
                机会 #01
              </span>
            </div>
            <div
              style={{
                fontFamily,
                fontSize: 34,
                fontWeight: 800,
                color: BRAND.textPrimary,
                lineHeight: 1.3,
              }}
            >
              {CONTENT.opportunityName}
            </div>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {["痛点驱动", "品类增长", "价格空间"].map((t) => (
                <span
                  key={t}
                  style={{
                    fontFamily,
                    fontSize: 22,
                    color: BRAND.cyan,
                    padding: "6px 14px",
                    borderRadius: 20,
                    border: `1px solid ${BRAND.cyan}44`,
                    background: `${BRAND.cyan}11`,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 报告卡片 */}
        <div
          style={{
            borderRadius: 18,
            border: `1px solid ${BRAND.cardBorder}`,
            background: `linear-gradient(160deg, ${BRAND.cardBg}, ${BRAND.indigo}10)`,
            padding: "26px 30px",
            boxShadow: `0 0 24px ${BRAND.glow}44`,
            flex: 1,
            overflow: "hidden",
          }}
        >
          {/* 报告顶部标签 */}
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 18,
              opacity: interpolate(frame, [110, 125], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {CONTENT.reportTags.map((tag, i) => (
              <span
                key={tag}
                style={{
                  fontFamily,
                  fontSize: 20,
                  fontWeight: 600,
                  color:
                    i === 0
                      ? BRAND.success
                      : i === 1
                        ? BRAND.cyan
                        : BRAND.danger,
                  padding: "5px 14px",
                  borderRadius: 16,
                  border: `1px solid currentColor`,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
          {/* 报告内容逐行刷出 */}
          <div style={{ fontFamily: "monospace" }}>
            {reportLines.map((line, i) => {
              const start = 120 + i * 10;
              const o = interpolate(frame, [start, start + 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const ty = interpolate(frame, [start, start + 14], [10, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const isH = line.type === "h";
              return (
                <div
                  key={i}
                  style={{
                    opacity: o,
                    transform: `translateY(${ty}px)`,
                    fontSize: isH ? 26 : 22,
                    fontWeight: isH ? 800 : 500,
                    color: isH ? BRAND.violet : BRAND.textMuted,
                    marginTop: i === 0 ? 0 : 6,
                  }}
                >
                  {line.text}
                </div>
              );
            })}
          </div>
          {/* 溯源小字 */}
          <div
            style={{
              marginTop: 18,
              fontFamily,
              fontSize: 20,
              color: BRAND.textDim,
              opacity: interpolate(frame, [155, 172], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {CONTENT.reportTrace}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
