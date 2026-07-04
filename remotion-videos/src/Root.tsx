import React from "react";
import { Composition } from "remotion";
import { EcommerceAgentIntro } from "./compositions/ecommerce-agent-intro/VideoComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ecommerce-agent-intro"
        component={EcommerceAgentIntro}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{}}
      />
    </>
  );
};
