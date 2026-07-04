import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSansSC";
import { loadFont as loadGrot } from "@remotion/google-fonts/SpaceGrotesk";
import { DarkGradientBg } from "./Background";
import { BRAND, CONTENT } from "./theme";
import { sceneCrossfade, fadeSlideUp } from "./utils";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700", "900"],
  subsets: ["latin"],
});
const { fontFamily: grot } = loadGrot("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});

export const Scene2Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const opacity = sceneCrossfade(frame, durationInFrames);

  // 数据流粒子汇聚（0-40 帧从四周向中心）
  const converge = interpolate(frame, [0, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const particles = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    const farR = 700;
    const nearR = interpolate(converge, [0, 1], [farR, 0]);
    const x = 540 + Math.cos(angle) * nearR;
    const y = 760 + Math.sin(angle) * nearR * 0.6;
    const o = interpolate(converge, [0, 0.7, 1], [0.8, 0.9, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const color = i % 2 === 0 ? BRAND.cyan : BRAND.violet;
    return { x, y, o, color, i, size: 4 + (i % 3) };
  });

  // Logo 图形弹出（35 帧后）
  const logoScale = spring({
    frame: frame - 35,
    fps,
    config: { damping: 11, stiffness: 140, mass: 0.9 },
  });

  // 主标题 spring 弹出（55 帧后）
  const titleScale = spring({
    frame: frame - 55,
    fps,
    config: { damping: 13, stiffness: 170 },
  });
  const titleO = interpolate(frame, [55, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 副标题淡入上滑（80 帧后）
  const sub = fadeSlideUp(frame, 80, 22);

  // 顶部标签 + 底部光带
  const topTag = interpolate(frame, [10, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Logo 呼吸脉冲
  const pulse = 1 + Math.sin(frame * 0.08) * 0.04;

  return (
    <AbsoluteFill style={{ opacity }}>
      <DarkGradientBg particleSeed={2} />

      {/* 汇聚粒子 */}
      {particles.map((p) => (
        <div
          key={p.i}
          style={{
            position: "absolute",
            left: p.x - p.size / 2,
            top: p.y - p.size / 2,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            backgroundColor: p.color,
            opacity: p.o,
            boxShadow: `0 0 ${p.size * 4}px ${p.color}`,
          }}
        />
      ))}

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          padding: "0 60px",
        }}
      >
        {/* 顶部平台标签 */}
        <div
          style={{
            fontFamily: grot,
            fontSize: 26,
            fontWeight: 500,
            color: BRAND.cyan,
            opacity: topTag,
            letterSpacing: 3,
            marginBottom: 50,
            padding: "8px 24px",
            borderRadius: 24,
            border: `1px solid ${BRAND.cyan}55`,
            background: `${BRAND.cyan}11`,
          }}
        >
          {CONTENT.platform}
        </div>

        {/* Logo 图形：数据网格圆环 + 中心节点 */}
        <div
          style={{
            transform: `scale(${logoScale * pulse})`,
            marginBottom: 50,
            position: "relative",
            width: 220,
            height: 220,
          }}
        >
          <svg width="220" height="220" viewBox="0 0 220 220">
            {/* 外环 */}
            <circle
              cx="110"
              cy="110"
              r="100"
              fill="none"
              stroke={BRAND.violet}
              strokeWidth="2"
              opacity="0.4"
            />
            {/* 网格连线 */}
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              const x = 110 + Math.cos(a) * 100;
              const y = 110 + Math.sin(a) * 100;
              return (
                <line
                  key={i}
                  x1="110"
                  y1="110"
                  x2={x}
                  y2={y}
                  stroke={BRAND.indigo}
                  strokeWidth="1"
                  opacity="0.3"
                />
              );
            })}
            {/* 外环节点 */}
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              const x = 110 + Math.cos(a) * 100;
              const y = 110 + Math.sin(a) * 100;
              const c = i % 3 === 0 ? BRAND.cyan : i % 3 === 1 ? BRAND.violet : BRAND.sky;
              return <circle key={i} cx={x} cy={y} r="5" fill={c} />;
            })}
            {/* 中心节点 */}
            <circle cx="110" cy="110" r="26" fill={BRAND.violet} opacity="0.25" />
            <circle cx="110" cy="110" r="16" fill={BRAND.violet} />
            <circle cx="110" cy="110" r="8" fill={BRAND.textPrimary} />
          </svg>
        </div>

        {/* 主标题 */}
        <div
          style={{
            fontFamily,
            fontSize: 72,
            fontWeight: 900,
            color: BRAND.textPrimary,
            textAlign: "center",
            opacity: titleO,
            transform: `scale(${titleScale})`,
            textShadow: `0 0 40px ${BRAND.glow}`,
            lineHeight: 1.2,
          }}
        >
          {CONTENT.product}
        </div>

        {/* 副标题 */}
        <div
          style={{
            fontFamily,
            fontSize: 34,
            fontWeight: 500,
            color: BRAND.cyan,
            textAlign: "center",
            marginTop: 28,
            opacity: sub.opacity,
            transform: sub.transform,
            letterSpacing: 1,
          }}
        >
          {CONTENT.reveal}
        </div>
      </AbsoluteFill>

      {/* 底部流动光带 */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, transparent, ${BRAND.cyan}, ${BRAND.violet}, transparent)`,
          opacity: interpolate(frame, [20, 50], [0, 0.8], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
    </AbsoluteFill>
  );
};
