import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSansSC";
import { loadFont as loadGrot } from "@remotion/google-fonts/SpaceGrotesk";
import { DarkGradientBg } from "./Background";
import { BRAND, CONTENT } from "./theme";
import { sceneCrossfade, fadeSlideUp } from "./utils";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700", "800", "900"],
  subsets: ["latin"],
});
const { fontFamily: grot } = loadGrot("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});

export const Scene6CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const opacity = sceneCrossfade(frame, durationInFrames);

  // 中心光晕扩散
  const glowScale = interpolate(frame, [0, 40], [0.3, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowO = interpolate(frame, [0, 30, 100, 120], [0, 0.6, 0.6, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 品牌名 spring 弹出
  const brandScale = spring({
    frame: frame - 18,
    fps,
    config: { damping: 12, stiffness: 150 },
  });
  const brandO = interpolate(frame, [18, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 英文副标题
  const subEn = fadeSlideUp(frame, 42, 18);

  // 特性标签逐行
  const features = CONTENT.features;

  // 域名条
  const domainO = interpolate(frame, [85, 102], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 散开粒子（收尾）
  const scatter = interpolate(frame, [90, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scatterParticles = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    const dist = interpolate(scatter, [0, 1], [0, 600]);
    const x = 540 + Math.cos(angle) * dist;
    const y = 960 + Math.sin(angle) * dist;
    const color = i % 2 === 0 ? BRAND.cyan : BRAND.violet;
    return { x, y, color, i };
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      <DarkGradientBg particleSeed={6} />

      {/* 中心光晕 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 540px 880px, ${BRAND.violet}55 0%, transparent 35%)`,
          opacity: glowO,
          transform: `scale(${glowScale})`,
        }}
      />

      {/* 散开粒子 */}
      {scatterParticles.map((p) => (
        <div
          key={p.i}
          style={{
            position: "absolute",
            left: p.x - 3,
            top: p.y - 3,
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: p.color,
            opacity: scatter > 0 ? 0.7 : 0,
            boxShadow: `0 0 16px ${p.color}`,
          }}
        />
      ))}

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          padding: "0 70px",
        }}
      >
        {/* 顶部小标签 */}
        <div
          style={{
            fontFamily: grot,
            fontSize: 24,
            fontWeight: 500,
            color: BRAND.cyan,
            letterSpacing: 4,
            marginBottom: 40,
            opacity: interpolate(frame, [0, 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          INDUSTRY RESEARCH
        </div>

        {/* 品牌名 */}
        <div
          style={{
            fontFamily,
            fontSize: 78,
            fontWeight: 900,
            color: BRAND.textPrimary,
            textAlign: "center",
            opacity: brandO,
            transform: `scale(${brandScale})`,
            textShadow: `0 0 50px ${BRAND.glow}`,
            lineHeight: 1.2,
          }}
        >
          {CONTENT.platform}
        </div>

        {/* 英文副标题 */}
        <div
          style={{
            fontFamily: grot,
            fontSize: 30,
            fontWeight: 500,
            color: BRAND.violet,
            textAlign: "center",
            marginTop: 18,
            opacity: subEn.opacity,
            transform: subEn.transform,
            letterSpacing: 2,
          }}
        >
          {CONTENT.platformEn}
        </div>

        {/* 特性标签 */}
        <div
          style={{
            marginTop: 70,
            display: "flex",
            flexDirection: "column",
            gap: 20,
            alignItems: "center",
          }}
        >
          {features.map((f, i) => {
            const start = 58 + i * 10;
            const o = interpolate(frame, [start, start + 16], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const ty = interpolate(frame, [start, start + 18], [20, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={f}
                style={{
                  fontFamily,
                  fontSize: 32,
                  fontWeight: 600,
                  color: BRAND.textPrimary,
                  opacity: o,
                  transform: `translateY(${ty}px)`,
                  padding: "14px 40px",
                  borderRadius: 32,
                  border: `1px solid ${BRAND.cardBorder}`,
                  background: `linear-gradient(135deg, ${BRAND.cardBg}, ${BRAND.indigo}15)`,
                  boxShadow: `0 0 20px ${BRAND.glow}33`,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background:
                      i === 0 ? BRAND.cyan : i === 1 ? BRAND.violet : BRAND.success,
                    boxShadow: `0 0 12px currentColor`,
                  }}
                />
                {f}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* 底部域名条 */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: domainO,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 14,
            padding: "14px 36px",
            borderRadius: 30,
            border: `1px solid ${BRAND.cyan}55`,
            background: `${BRAND.cyan}11`,
            fontFamily: grot,
            fontSize: 28,
            fontWeight: 500,
            color: BRAND.cyan,
            letterSpacing: 1,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: BRAND.success,
              boxShadow: `0 0 12px ${BRAND.success}`,
            }}
          />
          {CONTENT.domain}
        </div>
      </div>
    </AbsoluteFill>
  );
};
