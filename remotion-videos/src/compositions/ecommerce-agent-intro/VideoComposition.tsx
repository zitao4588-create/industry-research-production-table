import { AbsoluteFill, Sequence } from "remotion";
import { Scene1Hook } from "./Scene1Hook";
import { Scene2Reveal } from "./Scene2Reveal";
import { Scene3Discovery } from "./Scene3Discovery";
import { Scene4Databases } from "./Scene4Databases";
import { Scene5Score } from "./Scene5Score";
import { Scene6CTA } from "./Scene6CTA";
import { TIMING } from "./theme";

export const EcommerceAgentIntro: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0E27" }}>
      <Sequence from={0} durationInFrames={TIMING.scene1} name="痛点 Hook">
        <Scene1Hook />
      </Sequence>
      <Sequence
        from={TIMING.scene1}
        durationInFrames={TIMING.scene2}
        name="产品亮相"
      >
        <Scene2Reveal />
      </Sequence>
      <Sequence
        from={TIMING.scene1 + TIMING.scene2}
        durationInFrames={TIMING.scene3}
        name="自动发现信息源"
      >
        <Scene3Discovery />
      </Sequence>
      <Sequence
        from={TIMING.scene1 + TIMING.scene2 + TIMING.scene3}
        durationInFrames={TIMING.scene4}
        name="九类数据库"
      >
        <Scene4Databases />
      </Sequence>
      <Sequence
        from={TIMING.scene1 + TIMING.scene2 + TIMING.scene3 + TIMING.scene4}
        durationInFrames={TIMING.scene5}
        name="机会评分报告"
      >
        <Scene5Score />
      </Sequence>
      <Sequence
        from={
          TIMING.scene1 +
          TIMING.scene2 +
          TIMING.scene3 +
          TIMING.scene4 +
          TIMING.scene5
        }
        durationInFrames={TIMING.scene6}
        name="CTA 收尾"
      >
        <Scene6CTA />
      </Sequence>
    </AbsoluteFill>
  );
};
