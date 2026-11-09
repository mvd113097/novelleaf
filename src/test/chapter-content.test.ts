import { describe, expect, it } from "vitest";
import { cleanChapterParagraphs } from "@/lib/chapter-content";

const url = "https://www.52shuku.net/yanqing/novel_1.html";

describe("52shuku footer removal", () => {
  it("keeps narrative uses of friends, bookmarks and portals", () => {
    const story = ["Oh, friends, the portal is open!", "She bookmarked 52shuku before leaving.", "He stepped through the portal."];
    expect(cleanChapterParagraphs(story, url)).toEqual(story);
  });

  it("does not apply site-specific cleanup to other novel sources", () => {
    expect(cleanChapterParagraphs(["Story", "Portal: |"], "https://dmxs.org/novel/1.html")).toEqual(["Story", "Portal: |"]);
  });

  it("removes a standalone portal footer without removing the preceding story", () => {
    expect(cleanChapterParagraphs(["Story", "Portal: |"], url)).toEqual(["Story"]);
  });
});