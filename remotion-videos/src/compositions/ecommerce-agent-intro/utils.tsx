import { interpolate, spring } from "remotion";

// ============ 共享动画工具 ============

// 淡入 + 上滑入场
export const fadeSlideUp = (frame: number, start: number, duration = 20) => ({
  opacity: interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
  transform: `translateY(${interpolate(frame, [start, start + duration + 5], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })}px)`,
});

// 淡入 + 下滑入场
export const fadeSlideDown = (frame: number, start: number, duration = 20) => ({
  opacity: interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
  transform: `translateY(${interpolate(frame, [start, start + duration + 5], [-30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })}px)`,
});

// 淡入 + 左滑入场
export const fadeSlideLeft = (frame: number, start: number, duration = 20) => ({
  opacity: interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
  transform: `translateX(${interpolate(frame, [start, start + duration + 5], [50, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })}px)`,
});

// 错落入场（列表项）
export const staggerItem = (frame: number, index: number, gap = 12, duration = 20) => ({
  opacity: interpolate(frame, [index * gap, index * gap + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
  transform: `translateY(${interpolate(frame, [index * gap, index * gap + duration + 5], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })}px)`,
});

// 弹性缩放入场
export const springScale = (frame: number, fps: number, start: number) =>
  spring({
    frame: frame - start,
    fps,
    config: { damping: 12, stiffness: 180, mass: 0.8 },
  });

// count-up 数字动画
export const countUp = (
  frame: number,
  target: number,
  start: number,
  duration: number,
) =>
  Math.floor(
    target *
      interpolate(frame, [start, start + duration], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
  );

// 交叉淡入透明度（场景进入/退出）
export const sceneCrossfade = (
  frame: number,
  durationInFrames: number,
  fade = 15,
) => {
  const fadeIn = interpolate(frame, [0, fade], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - fade, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return Math.min(fadeIn, fadeOut);
};

// ============ 共享 SVG 图标 ============

// 数据库图标
export const DatabaseIcon: React.FC<{ size: number; color: string }> = ({
  size,
  color,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <ellipse cx="12" cy="5" rx="8" ry="3" stroke={color} strokeWidth="1.8" />
    <path
      d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"
      stroke={color}
      strokeWidth="1.8"
    />
    <path
      d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"
      stroke={color}
      strokeWidth="1.8"
    />
  </svg>
);

// 搜索图标
export const SearchIcon: React.FC<{ size: number; color: string }> = ({
  size,
  color,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="11" cy="11" r="7" stroke={color} strokeWidth="1.8" />
    <path d="m20 20-3.5-3.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

// 网站图标
export const GlobeIcon: React.FC<{ size: number; color: string }> = ({
  size,
  color,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
    <path
      d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9Z"
      stroke={color}
      strokeWidth="1.8"
    />
  </svg>
);

// 产品图标
export const BoxIcon: React.FC<{ size: number; color: string }> = ({
  size,
  color,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M3 7.5 12 3l9 4.5v9L12 21 3 16.5v-9Z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M3 7.5 12 12l9-4.5M12 12v9" stroke={color} strokeWidth="1.8" />
  </svg>
);

// 关键词标签图标
export const TagIcon: React.FC<{ size: number; color: string }> = ({
  size,
  color,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M3 7v4.5l7.5 7.5a2 2 0 0 0 2.8 0l5.7-5.7a2 2 0 0 0 0-2.8L11.5 3H7a4 4 0 0 0-4 4Z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <circle cx="7.5" cy="7.5" r="1.5" fill={color} />
  </svg>
);

// 痛点警告图标
export const AlertIcon: React.FC<{ size: number; color: string }> = ({
  size,
  color,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 3 2 20h20L12 3Z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M12 9v5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1.2" fill={color} />
  </svg>
);

// 内容文档图标
export const DocIcon: React.FC<{ size: number; color: string }> = ({
  size,
  color,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M5 3h9l5 5v13H5V3Z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M14 3v5h5M8 13h8M8 17h6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

// 机会图标（靶心/星）
export const TargetIcon: React.FC<{ size: number; color: string }> = ({
  size,
  color,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
    <circle cx="12" cy="12" r="5" stroke={color} strokeWidth="1.8" />
    <circle cx="12" cy="12" r="1.6" fill={color} />
  </svg>
);

// 周报图标
export const CalendarIcon: React.FC<{ size: number; color: string }> = ({
  size,
  color,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth="1.8" />
    <path d="M3 9h18M8 3v4M16 3v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

// 网站结构图标
export const SitemapIcon: React.FC<{ size: number; color: string }> = ({
  size,
  color,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="9" y="3" width="6" height="5" rx="1" stroke={color} strokeWidth="1.8" />
    <rect x="3" y="16" width="6" height="5" rx="1" stroke={color} strokeWidth="1.8" />
    <rect x="15" y="16" width="6" height="5" rx="1" stroke={color} strokeWidth="1.8" />
    <path d="M12 8v4M6 16v-2h12v2" stroke={color} strokeWidth="1.8" />
  </svg>
);

// 根据图标名取组件
export const getIcon = (
  name: string,
): React.FC<{ size: number; color: string }> => {
  const map: Record<string, React.FC<{ size: number; color: string }>> = {
    source: SearchIcon,
    competitor: GlobeIcon,
    structure: SitemapIcon,
    product: BoxIcon,
    keyword: TagIcon,
    pain: AlertIcon,
    content: DocIcon,
    opportunity: TargetIcon,
    weekly: CalendarIcon,
  };
  return map[name] ?? DatabaseIcon;
};
