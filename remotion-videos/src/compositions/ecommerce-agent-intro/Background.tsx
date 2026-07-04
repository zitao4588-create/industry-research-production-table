import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { BRAND } from "./theme";

// 共享深色渐变背景 + 数据流粒子层
export const DarkGradientBg: React.FC<{ particleSeed?: number }> = ({
  particleSeed = 1,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // 缓慢流动的光带
  const t = frame * 0.01;
  const glowX = width * 0.5 + Math.sin(t) * width * 0.15;
  const glowY = height * 0.35 + Math.cos(t * 0.8) * height * 0.08;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${glowX}px ${glowY}px, ${BRAND.glow} 0%, transparent 45%), linear-gradient(160deg, ${BRAND.bgFrom} 0%, ${BRAND.bgTo} 100%)`,
      }}
    >
      {/* 细网格底纹 */}
      <GridOverlay />
      {/* 数据流粒子 */}
      <DataParticles seed={particleSeed} />
    </AbsoluteFill>
  );
};

const GridOverlay: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `linear-gradient(${BRAND.indigo}11 1px, transparent 1px), linear-gradient(90deg, ${BRAND.indigo}11 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
        opacity: 0.4,
      }}
    />
  );
};

const DataParticles: React.FC<{ seed: number }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // 伪随机粒子位置（基于 seed 稳定）
  const particles = Array.from({ length: 18 }, (_, i) => {
    const sx = (Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1;
    const sy = (Math.sin(i * 39.346 + seed * 11.135) * 12543.123) % 1;
    const x = (Math.abs(sx) * width);
    const y = (Math.abs(sy) * height);
    const speed = 0.3 + Math.abs(sx) * 0.5;
    const drift = Math.sin(frame * 0.02 + i) * 20;
    const py = (y + frame * speed) % (height + 60) - 30;
    const opacity = interpolate(
      Math.sin(frame * 0.03 + i * 1.3),
      [-1, 1],
      [0.15, 0.6],
    );
    const size = 2 + Math.abs(sy) * 3;
    const color = i % 3 === 0 ? BRAND.cyan : i % 3 === 1 ? BRAND.violet : BRAND.sky;
    return { x: x + drift, y: py, opacity, size, color, key: i };
  });

  return (
    <AbsoluteFill>
      {particles.map((p) => (
        <div
          key={p.key}
          style={{
            position: "absolute",
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            backgroundColor: p.color,
            opacity: p.opacity,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
