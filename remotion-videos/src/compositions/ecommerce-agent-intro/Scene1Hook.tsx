import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSansSC";
import { DarkGradientBg } from "./Background";
import { BRAND, CONTENT } from "./theme";
import { sceneCrossfade } from "./utils";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700", "900"],
  subsets: ["latin"],
});

export const Scene1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const opacity = sceneCrossfade(frame, durationInFrames);

  // 散乱网页碎片（前 60 帧飘动，60-110 帧收拢）
  const shards = Array.from({ length: 7 }, (_, i) => {
    const angle = (i / 7) * Math.PI * 2;
    const baseX = 540 + Math.cos(angle) * 380;
    const baseY = 960 + Math.sin(angle) * 520;
    const wobble = Math.sin(frame * 0.05 + i) * 12;
    // 收拢动画
    const gather = interpolate(frame, [60, 108], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const cx = 540;
    const cy = 960;
    const x = interpolate(gather, [0, 1], [baseX + wobble, cx]);
    const y = interpolate(gather, [0, 1], [baseY + wobble, cy]);
    const rot = interpolate(gather, [0, 1], [angle * 40, 0]);
    const sOpacity = interpolate(frame, [0, 15, 100, 112], [0, 0.7, 0.7, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const scale = interpolate(gather, [0, 1], [1, 0.2]);
    return { x, y, rot, sOpacity, scale, i };
  });

  // 主文案 typewriter（35 帧后开始）
  const fullText = CONTENT.hook;
  const painIdx = fullText.indexOf(CONTENT.hookPain);
  const typeStart = 30;
  const typeSpeed = 1.2;
  const charCount = Math.min(
    Math.floor((frame - typeStart) / typeSpeed),
    fullText.length,
  );
  const typed = fullText.slice(0, Math.max(0, charCount));
  const painRevealed = charCount >= painIdx + CONTENT.hookPain.length;

  // 副文案三行（85 帧后逐行）
  const subItems = CONTENT.hookSub;

  return (
    <AbsoluteFill style={{ opacity }}>
      <DarkGradientBg particleSeed={1} />

      {/* 散乱网页碎片 */}
      {shards.map((s) => (
        <div
          key={s.i}
          style={{
            position: "absolute",
            left: s.x - 80,
            top: s.y - 50,
            width: 160,
            height: 100,
            opacity: s.sOpacity,
            transform: `rotate(${s.rot}deg) scale(${s.scale})`,
            background: `linear-gradient(135deg, ${BRAND.cardBg}, rgba(34,211,238,0.08))`,
            border: `1px solid ${BRAND.cardBorder}`,
            borderRadius: 10,
            backdropFilter: "blur(4px)",
          }}
        >
          <div style={{ padding: 10 }}>
            <div style={{ height: 6, width: "60%", background: BRAND.cyan, opacity: 0.5, borderRadius: 3 }} />
            <div style={{ height: 4, width: "85%", background: BRAND.textMuted, opacity: 0.3, borderRadius: 2, marginTop: 8 }} />
            <div style={{ height: 4, width: "70%", background: BRAND.textMuted, opacity: 0.3, borderRadius: 2, marginTop: 5 }} />
            <div style={{ height: 4, width: "50%", background: BRAND.textMuted, opacity: 0.3, borderRadius: 2, marginTop: 5 }} />
          </div>
        </div>
      ))}

      {/* 主文案 */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          padding: "0 70px",
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: 64,
            fontWeight: 800,
            color: BRAND.textPrimary,
            textAlign: "center",
            lineHeight: 1.35,
            textShadow: `0 0 30px ${BRAND.glow}`,
            minHeight: 180,
          }}
        >
          {typed.split(CONTENT.hookPain).map((part, idx, arr) => (
            <span key={idx}>
              {part}
              {idx < arr.length - 1 && (
                <span
                  style={{
                    color: painRevealed ? BRAND.danger : BRAND.textPrimary,
                    textShadow: painRevealed
                      ? `0 0 24px ${BRAND.danger}`
                      : `0 0 30px ${BRAND.glow}`,
                  }}
                >
                  {CONTENT.hookPain}
                </span>
              )}
            </span>
          ))}
          {/* 光标 */}
          {charCount < fullText.length && charCount > 0 && (
            <span
              style={{
                color: BRAND.cyan,
                opacity: interpolate(
                  Math.sin(frame * 0.3),
                  [-1, 1],
                  [0.3, 1],
                ),
              }}
            >
              |
            </span>
          )}
        </div>

        {/* 副文案三行 */}
        <div
          style={{
            marginTop: 60,
            display: "flex",
            gap: 24,
            flexDirection: "row",
          }}
        >
          {subItems.map((item, i) => {
            const start = 86 + i * 8;
            const o = interpolate(frame, [start, start + 16], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const ty = interpolate(frame, [start, start + 18], [18, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={item}
                style={{
                  fontFamily,
                  fontSize: 30,
                  fontWeight: 500,
                  color: BRAND.textMuted,
                  opacity: o,
                  transform: `translateY(${ty}px)`,
                  padding: "10px 22px",
                  borderRadius: 30,
                  border: `1px solid ${BRAND.cardBorder}`,
                  background: BRAND.cardBg,
                }}
              >
                {item}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
