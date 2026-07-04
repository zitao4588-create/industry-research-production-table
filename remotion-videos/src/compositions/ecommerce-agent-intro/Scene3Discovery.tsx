import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSansSC";
import { DarkGradientBg } from "./Background";
import { BRAND, CONTENT } from "./theme";
import { sceneCrossfade, fadeSlideUp, countUp, SearchIcon } from "./utils";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700", "800"],
  subsets: ["latin"],
});

export const Scene3Discovery: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const opacity = sceneCrossfade(frame, durationInFrames);

  // 顶部标题
  const title = fadeSlideUp(frame, 6, 18);

  // 输入框依次填入（20-70 帧）
  const inputs = CONTENT.inputs;
  const inputFill = (i: number) => {
    const start = 20 + i * 18;
    return interpolate(frame, [start, start + 14], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  };

  // 流程节点逐个弹入（70 帧后）
  const nodes = CONTENT.flowNodes;
  const nodeStart = 72;
  const nodeGap = 22;

  // 数据流连线光点（节点出现后流动）
  const lineProgress = (i: number) => {
    const start = nodeStart + (i + 1) * nodeGap;
    return interpolate(frame, [start, start + 20], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  };

  // 底部计数器（150 帧后跳动）
  const found = countUp(frame, CONTENT.foundCount, 150, 28);

  return (
    <AbsoluteFill style={{ opacity }}>
      <DarkGradientBg particleSeed={3} />

      <AbsoluteFill
        style={{
          flexDirection: "column",
          padding: "120px 70px 100px",
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
            marginBottom: 36,
          }}
        >
          自动发现<span style={{ color: BRAND.cyan }}>公开信息源</span>
        </div>

        {/* 输入框 */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 16,
            justifyContent: "center",
            marginBottom: 50,
          }}
        >
          {inputs.map((inp, i) => {
            const f = inputFill(i);
            return (
              <div
                key={inp}
                style={{
                  fontFamily,
                  fontSize: 28,
                  fontWeight: 700,
                  color: BRAND.textPrimary,
                  padding: "14px 28px",
                  borderRadius: 14,
                  border: `1.5px solid ${BRAND.indigo}88`,
                  background: `${BRAND.indigo}1a`,
                  opacity: interpolate(f, [0, 1], [0.4, 1]),
                  boxShadow: f > 0.5 ? `0 0 20px ${BRAND.glow}` : "none",
                }}
              >
                {inp}
              </div>
            );
          })}
        </div>

        {/* 流程节点（纵向排列，适合竖屏） */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0,
            flex: 1,
          }}
        >
          {nodes.map((node, i) => {
            const start = nodeStart + i * nodeGap;
            const s = spring({
              frame: frame - start,
              fps,
              config: { damping: 12, stiffness: 170 },
            });
            const o = interpolate(frame, [start, start + 10], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const lineP = lineProgress(i);
            return (
              <div
                key={node.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  opacity: o,
                }}
              >
                {/* 连线（到下一个节点，前 3 个） */}
                {i < nodes.length - 1 && (
                  <div
                    style={{
                      width: 2,
                      height: 46,
                      background: `${BRAND.indigo}33`,
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {/* 流动光点 */}
                    <div
                      style={{
                        position: "absolute",
                        left: -3,
                        top: 0,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: BRAND.cyan,
                        boxShadow: `0 0 12px ${BRAND.cyan}`,
                        transform: `translateY(${lineP * 46}px)`,
                        opacity: lineP > 0 && lineP < 1 ? 1 : 0.3,
                      }}
                    />
                  </div>
                )}
                {/* 节点卡片 */}
                <div
                  style={{
                    transform: `scale(${s})`,
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 18,
                    padding: "18px 32px",
                    borderRadius: 16,
                    border: `1px solid ${BRAND.cardBorder}`,
                    background: `linear-gradient(135deg, ${BRAND.cardBg}, ${BRAND.indigo}15)`,
                    boxShadow: `0 0 24px ${BRAND.glow}55`,
                    minWidth: 420,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: `${BRAND.cyan}22`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: `1px solid ${BRAND.cyan}55`,
                    }}
                  >
                    <SearchIcon size={24} color={BRAND.cyan} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div
                      style={{
                        fontFamily,
                        fontSize: 30,
                        fontWeight: 700,
                        color: BRAND.textPrimary,
                      }}
                    >
                      {node.label}
                    </div>
                    <div
                      style={{
                        fontFamily: "monospace",
                        fontSize: 22,
                        color: BRAND.textDim,
                        marginTop: 2,
                      }}
                    >
                      /{node.tag}
                    </div>
                  </div>
                  {/* 序号 */}
                  <div
                    style={{
                      marginLeft: "auto",
                      fontFamily: "monospace",
                      fontSize: 26,
                      color: BRAND.violet,
                      opacity: 0.7,
                    }}
                  >
                    0{i + 1}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 底部计数器 */}
        <div
          style={{
            marginTop: 30,
            textAlign: "center",
            opacity: interpolate(frame, [150, 168], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <span
            style={{
              fontFamily,
              fontSize: 32,
              fontWeight: 500,
              color: BRAND.textMuted,
            }}
          >
            发现{" "}
          </span>
          <span
            style={{
              fontFamily,
              fontSize: 56,
              fontWeight: 900,
              color: BRAND.cyan,
              textShadow: `0 0 20px ${BRAND.cyan}`,
            }}
          >
            {found}
          </span>
          <span
            style={{
              fontFamily,
              fontSize: 32,
              fontWeight: 500,
              color: BRAND.textMuted,
            }}
          >
            {" "}
            个候选 URL
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
