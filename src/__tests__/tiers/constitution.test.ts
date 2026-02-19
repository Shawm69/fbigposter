import { validateAgainstConstitution, checkDailyLimit } from "../../tiers/constitution";
import { makeConstitution } from "../fixtures";

describe("validateAgainstConstitution", () => {
  const constitution = makeConstitution();

  it("returns empty array for valid content", () => {
    const violations = validateAgainstConstitution(constitution, {
      caption: "Great workout today! #ad #sponsored",
      hashtags: ["#fitness", "#ad", "#sponsored"],
    });
    expect(violations).toEqual([]);
  });

  it("detects banned topic in caption", () => {
    const violations = validateAgainstConstitution(constitution, {
      caption: "Try your luck with gambling strategies #ad #sponsored",
      hashtags: ["#ad", "#sponsored"],
    });
    expect(violations).toContainEqual(
      expect.stringContaining("banned topic")
    );
  });

  it("detects banned topic case-insensitively", () => {
    const violations = validateAgainstConstitution(constitution, {
      caption: "TOBACCO is bad for you #ad #sponsored",
      hashtags: ["#ad", "#sponsored"],
    });
    expect(violations).toContainEqual(
      expect.stringContaining("banned topic")
    );
  });

  it("detects forbidden hashtag", () => {
    const violations = validateAgainstConstitution(constitution, {
      caption: "Check this out #ad #sponsored",
      hashtags: ["#followforfollow", "#ad", "#sponsored"],
    });
    expect(violations).toContainEqual(
      expect.stringContaining("Forbidden hashtag")
    );
  });

  it("detects forbidden hashtag case-insensitively and with/without #", () => {
    const violations = validateAgainstConstitution(constitution, {
      caption: "Check this out #ad #sponsored",
      hashtags: ["Like4Like", "#ad", "#sponsored"],
    });
    expect(violations).toContainEqual(
      expect.stringContaining("Forbidden hashtag")
    );
  });

  it("detects missing required disclosure", () => {
    const violations = validateAgainstConstitution(constitution, {
      caption: "Great workout today!",
      hashtags: ["#fitness"],
    });
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations).toContainEqual(
      expect.stringContaining("Missing required disclosure")
    );
  });

  it("returns multiple violations simultaneously", () => {
    const violations = validateAgainstConstitution(constitution, {
      caption: "Try gambling and tobacco products",
      hashtags: ["#followforfollow"],
    });
    // Should have: 2 banned topics + 1 forbidden hashtag + 2 missing disclosures
    expect(violations.length).toBeGreaterThanOrEqual(4);
  });

  it("handles empty caption and missing hashtags without crashing", () => {
    const violations = validateAgainstConstitution(constitution, {});
    // Should only flag missing disclosures, not crash
    expect(Array.isArray(violations)).toBe(true);
  });

  it("handles empty hashtags array without crashing", () => {
    const violations = validateAgainstConstitution(constitution, {
      caption: "",
      hashtags: [],
    });
    expect(Array.isArray(violations)).toBe(true);
  });
});

describe("checkDailyLimit", () => {
  const constitution = makeConstitution();
  // max_posts_per_day: { reels: 3, image_posts: 5, stories: 10 }

  it("returns true when under limit", () => {
    expect(checkDailyLimit(constitution, "reels", 1)).toBe(true);
  });

  it("returns false when at limit", () => {
    expect(checkDailyLimit(constitution, "reels", 3)).toBe(false);
  });

  it("returns false when over limit", () => {
    expect(checkDailyLimit(constitution, "reels", 5)).toBe(false);
  });

  it("works for image_posts pipeline", () => {
    expect(checkDailyLimit(constitution, "image_posts", 4)).toBe(true);
    expect(checkDailyLimit(constitution, "image_posts", 5)).toBe(false);
  });

  it("works for stories pipeline", () => {
    expect(checkDailyLimit(constitution, "stories", 9)).toBe(true);
    expect(checkDailyLimit(constitution, "stories", 10)).toBe(false);
  });
});
