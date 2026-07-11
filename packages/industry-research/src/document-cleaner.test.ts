import { describe, expect, it } from "vitest";
import { cleanDocumentText } from "./document-cleaner";

describe("cleanDocumentText", () => {
  it("removes markdown image targets, navigation, repeated CTAs, and legal boilerplate", () => {
    const result = cleanDocumentText({
      format: "markdown",
      maxTextLength: 12_000,
      text: [
        "[Skip to content](https://brand.example/#main)",
        "# Probiotic Daily",
        "![Probiotic jar](https://cdn.example/probiotic.png)",
        "Dog-specific probiotics and prebiotic fiber for smoother digestion.",
        "[Shop NowShop Now](https://brand.example/products/probiotic)",
        "Rated 4.8 out of 5 from 573 reviews. Sale price $19.99.",
        "One-time Discount Get up to 30% off + Free Shipping Sign Up",
        "Privacy Policy | Cookie Settings | Terms of Service",
        "Facebook Instagram YouTube LinkedIn",
      ].join("\n"),
    });

    expect(result.originalText).toContain("https://cdn.example/probiotic.png");
    expect(result.cleanedText).toContain(
      "Dog-specific probiotics and prebiotic fiber",
    );
    expect(result.cleanedText).toContain("573 reviews");
    expect(result.cleanedText).toContain("$19.99");
    expect(result.cleanedText).not.toContain("cdn.example");
    expect(result.cleanedText).not.toContain("Skip to content");
    expect(result.cleanedText).not.toContain("Privacy Policy");
    expect(result.cleanedText).not.toContain("Shop NowShop Now");
    expect(result.cleanedText).not.toContain("One-time Discount");
    expect(result.audit.removedSegments.length).toBeGreaterThan(0);
    expect(result.audit.removedSegments.map((item) => item.reason)).toEqual(
      expect.arrayContaining([
        "navigation",
        "image_target",
        "footer",
        "privacy_legal",
      ]),
    );
    expect(result.audit.residualNoiseRatio).toBeLessThanOrEqual(0.25);
  });

  it("removes structural navigation, cookie, and footer blocks from native html", () => {
    const result = cleanDocumentText({
      format: "html",
      maxTextLength: 12_000,
      text: [
        "<html><head><title>方太洗碗机</title></head><body>",
        "<nav>首页 所有产品 服务支持 联系我们</nav>",
        '<section class="cookie-consent">我们使用 Cookie 改善体验 同意</section>',
        "<main><h1>方太新一代洗碗机</h1>",
        "<p>水槽、嵌入式与台嵌三种安装形态。</p>",
        '<a href="/chanpin/1661/">查看该品类</a></main>',
        "<footer>关于方太 隐私政策 沪ICP备 服务热线</footer>",
        "</body></html>",
      ].join(""),
    });

    expect(result.cleanedText).toContain("方太新一代洗碗机");
    expect(result.cleanedText).toContain("水槽、嵌入式与台嵌");
    expect(result.cleanedText).not.toContain("Cookie");
    expect(result.cleanedText).not.toContain("隐私政策");
    expect(result.cleanedText).not.toContain("所有产品 服务支持");
    expect(result.audit.removedSegments.map((item) => item.reason)).toEqual(
      expect.arrayContaining(["navigation", "privacy_legal", "footer"]),
    );
  });

  it("cleans known legacy one-line privacy and browser-extension failures", () => {
    const result = cleanDocumentText({
      format: "text",
      maxTextLength: 12_000,
      text: [
        "方太隐私声明 欢迎您使用方太官网！我们如何共享、转让、公开披露您的个人信息。",
        "我同意我的个人信息将按照《方太隐私协议》向第三方提供 不同意 同意 请勾选方太隐私协议",
        "方太新一代洗碗机 独创智慧净洗科技 洗菜·洗碗·洗锅",
        "www.example.com is blocked This page has been blocked by an extension",
        "Try disabling your extensions. ERR_BLOCKED_BY_CLIENT Reload",
      ].join(" "),
    });

    expect(result.cleanedText).toContain("方太新一代洗碗机");
    expect(result.cleanedText).not.toContain("方太隐私声明");
    expect(result.cleanedText).not.toContain("个人信息将按照");
    expect(result.cleanedText).not.toContain("ERR_BLOCKED_BY_CLIENT");
    expect(result.audit.removedSegments.map((item) => item.reason)).toEqual(
      expect.arrayContaining(["privacy_legal", "crawler_error"]),
    );
  });

  it("deduplicates long repeated menu runs without deleting product descriptions", () => {
    const repeatedMenu =
      "护肤 卸妆 洁面 化妆水 保湿液 乳液 面霜 精华液 面膜 眼霜 防晒 身体护理";
    const result = cleanDocumentText({
      format: "text",
      maxTextLength: 12_000,
      text: `${repeatedMenu} 精选品牌 SHISEIDO 男士 专为男性肌肤设计 ${repeatedMenu}`,
    });

    expect(result.cleanedText).toContain("SHISEIDO 男士");
    expect(result.cleanedText).toContain("专为男性肌肤设计");
    expect(result.cleanedText.match(/护肤 卸妆/g)).toHaveLength(1);
    expect(result.audit.removedSegments.map((item) => item.reason)).toContain(
      "duplicate_template",
    );
  });

  it("removes a known product-site footer suffix while retaining brand descriptions", () => {
    const result = cleanDocumentText({
      format: "text",
      maxTextLength: 12_000,
      text: [
        "SHISEIDO 男士 专为男性肌肤设计，维持角质层屏障功能。",
        "产品搜索 首页 资生堂日本 官方产品介绍网站 关注 资生堂日本",
        "© Shiseido China Co.,Ltd. 关于我们 沪ICP备10203872号-7",
      ].join(" "),
    });

    expect(result.cleanedText).toContain("SHISEIDO 男士");
    expect(result.cleanedText).not.toContain("© Shiseido");
    expect(result.cleanedText).not.toContain("ICP备");
    expect(result.audit.removedSegments.map((item) => item.reason)).toContain(
      "footer",
    );
  });
});
