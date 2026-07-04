import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSansSC";
import { DarkGradientBg } from "./Background";
import { BRAND, CONTENT } from "./theme";
import { sceneCrossfade, fadeSlideUp, getIcon } from "./utils";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700", "800", "900"],
  subsets: ["latin"],
});

export const Scene4Databases: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const opacity = sceneCrossfade(frame, durationInFrames);

  // 顶部标题
  const title = fadeSlideUp(frame, 6, 18);

  const dbs = CONTENT.databases;

  // 中心核心脉冲
  const pulse = 1 + Math.sin(frame * 0.1) * 0.06;

  // 网格布局：3 列 × 3 行
  const cardW = 270;
  const cardH = 190;
  const gap = 24;
  const gridW = cardW * 3 + gap * 2;

  return (
    <AbsoluteFill style={{ opacity }}>
      <DarkGradientBg particleSeed={4} />

      <AbsoluteFill
        style={{
          flexDirection: "column",
          padding: "120px 60px 100px",
        }}
      >
        {/* 顶部标题 */}
        <div
          style={{
            fontFamily,
            fontSize: 48,
            fontWeight: 800,
            color: BRAND.textPrimary,
            opacity: title.opacity,
            transform: title.transform,
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          自动建立<span style={{ color: BRAND.violet }}>九类</span>行业数据库
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 26,
            fontWeight: 500,
            color: BRAND.textMuted,
            textAlign: "center",
            marginBottom: 50,
            opacity: interpolate(frame, [20, 38], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          一次建好 · 可复用 · 可追踪
        </div>

        {/* 3×3 网格 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(3, ${cardW}px)`,
            gridTemplateRows: `repeat(3, ${cardH}px)`,
            gap,
            justifyContent: "center",
          }}
        >
          {dbs.map((db, i) => {
            const start = 30 + i * 12;
            const s = spring({
              frame: frame - start,
              fps,
              config: { damping: 12, stiffness: 160, mass: 0.8 },
            });
            const o = interpolate(frame, [start, start + 10], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const Icon = getIcon(db.icon);
            const accent =
              i % 3 === 0
                ? BRAND.cyan
                : i % 3 === 1
                  ? BRAND.violet
                  : BRAND.sky;
            return (
              <div
                key={db.name}
                style={{
                  opacity: o,
                  transform: `scale(${s})`,
                  borderRadius: 18,
                  border: `1px solid ${accent}55`,
                  background: `linear-gradient(150deg, ${BRAND.cardBg}, ${accent}12)`,
                  boxShadow: `0 0 24px ${accent}33, inset 0 1px 0 ${accent}22`,
                  padding: "22px 20px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* 顶部图标 */}
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: `${accent}22`,
                    border: `1px solid ${accent}55`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={28} color={accent} />
                </div>
                {/* 名称 */}
                <div
                  style={{
                    fontFamily,
                    fontSize: 30,
                    fontWeight: 700,
                    color: BRAND.textPrimary,
                    marginTop: 10,
                  }}
                >
                  {db.name}
                </div>
                {/* 计数 */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily,
                      fontSize: 52,
                      fontWeight: 900,
                      color: accent,
                      textShadow: `0 0 16px ${accent}88`,
                      lineHeight: 1,
                    }}
                  >
                    {db.count}
                  </span>
                  <span
                    style={{
                      fontFamily,
                      fontSize: 22,
                      color: BRAND.textDim,
                    }}
                  >
                    条
                  </span>
                </div>
                {/* 角标编号 */}
                <div
                  style={{
                    position: "absolute",
                    top: 14,
                    right: 16,
                    fontFamily: "monospace",
                    fontSize: 18,
                    color: BRAND.textDim,
                    opacity: 0.6,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
              </div>
            );
          })}
        </div>

        {/* 底部统计条 */}
        <div
          style={{
            marginTop: 50,
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            gap: 40,
            opacity: interpolate(frame, [140, 160], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {[
            { label: "信息源", value: 8 },
            { label: "竞品", value: 6 },
            { label: "机会", value: 6 },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontFamily,
                  fontSize: 44,
                  fontWeight: 900,
                  color: BRAND.cyan,
                }}
              >
                {s.value}
              </span>
              <span
                style={{
                  fontFamily,
                  fontSize: 22,
                  color: BRAND.textMuted,
                }}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
