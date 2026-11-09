import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ saved: new Map<string, unknown>(), fetchPage: vi.fn() }));

vi.mock("@/lib/storage", () => ({
  readSaved: vi.fn(async (key: string) => state.saved.get(key)),
  writeSaved: vi.fn(async (key: string, value: unknown) => { state.saved.set(key, value); }),
  removeSaved: vi.fn(async (key: string) => { state.saved.delete(key); }),
  savedKeys: vi.fn(async () => [...state.saved.keys()]),
  requestPersistentStorage: vi.fn(),
}));

vi.mock("@/lib/remote.functions", () => ({
  fetchPage: state.fetchPage,
  translateText: vi.fn(),
}));

import { deleteBook, getChapter, importBook, type Book } from "@/lib/novel";

const page = (text: string, nextUrl = "") => {
  const next = nextUrl ? `<a href="${nextUrl}">下一页</a>` : "";
  const html = `<html><body><article><p>${text}</p>${next}</article></body></html>`;
  const bytes = new TextEncoder().encode(html);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return { base64: btoa(binary), contentType: "text/html; charset=utf-8", finalUrl: "https://www.52shuku.net/yanqing/08_b/bkfNH.html" };
};

const book = (url = "https://www.52shuku.net/yanqing/08_b/bkfNH.html"): Book => ({
  id: "novel",
  url,
  title: "Novel",
  summary: "",
  chapters: [{ title: "Page 1", url }],
  addedAt: 1,
});

describe("chapter page boundaries", () => {
  beforeEach(() => {
    state.saved.clear();
    state.fetchPage.mockReset();
    state.fetchPage.mockResolvedValue(page("Only page one.", "bkfNH_2.html"));
  });
  it("deletes only the selected novel and its chapters and translation checkpoints", async () => {
    for (const key of ["book:novel", "ch:novel:0:single-page-v2", "translation:ch:novel:0:single-page-v2:google:model", "book:other", "ch:other:0:single-page-v2"]) state.saved.set(key, {});
    await deleteBook(book());
    expect([...state.saved.keys()]).toEqual(["book:other", "ch:other:0:single-page-v2"]);
  });

  it("imports a fuxsb numbered pager as page 1 (the book page) through the last page", async () => {
    const base = "https://www.fuxsb.com/xiandai/27729.html";
    const pager = `<ul><li><a>第1页</a></li><li><a href="/xiandai/27729_2.html">下一页</a></li><li><a>1</a></li>${[2, 3, 4].map((n) => `<li><a href="/xiandai/27729_${n}.html">${n}</a></li>`).join("")}</ul>`;
    const bytes = new TextEncoder().encode(`<html><head><meta property="og:novel:book_name" content="Story"></head><body>${pager}</body></html>`);
    state.fetchPage.mockResolvedValue({ base64: btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")), contentType: "text/html; charset=utf-8", finalUrl: base });
    const imported = await importBook(base);
    expect(imported.chapters).toEqual([
      { title: "第1页", url: base },
      { title: "第2页", url: "https://www.fuxsb.com/xiandai/27729_2.html" },
      { title: "第3页", url: "https://www.fuxsb.com/xiandai/27729_3.html" },
      { title: "第4页", url: "https://www.fuxsb.com/xiandai/27729_4.html" },
    ]);
  });

  it("loads only the selected page and does not follow its next-page link", async () => {
    const chapter = await getChapter(book(), 0);

    expect(chapter.paragraphs).toEqual(["Only page one."]);
    expect(state.fetchPage).toHaveBeenCalledTimes(1);
    expect(state.fetchPage).toHaveBeenCalledWith({ data: { url: book().chapters[0]?.url } });
  });

  it("ignores older cached entries that may contain merged continuation pages", async () => {
    state.saved.set("ch:novel:0", { title: "Page 1", paragraphs: ["Page one", "Page two"] });

    const chapter = await getChapter(book(), 0);

    expect(chapter.paragraphs).toEqual(["Only page one."]);
    expect(state.fetchPage).toHaveBeenCalledTimes(1);
  });

  it("removes the 52shuku bookmark notice and portal from newly fetched chapters", async () => {
    state.fetchPage.mockResolvedValue(page('The story continues.</p><p>Tips：如果觉得52书库不错，记得收藏唯一网址 https://www.52shuku.net/ 或推荐给朋友哦~拜托啦 (&gt;.&lt;)</p><p>传送门：|'));
    const chapter = await getChapter(book(), 0);
    expect(chapter.paragraphs).toEqual(["The story continues."]);
    expect(state.saved.get("ch:novel:0:single-page-v2")).toEqual(chapter);
  });

  it("cleans saved original and English footers without fetching or losing offline story text", async () => {
    state.saved.set("ch:novel:0:single-page-v2", {
      title: "Page 1",
      paragraphs: ["这是故事。", "如果觉得52书库不错，记得收藏网址或推荐给朋友哦~", "传送门：|"],
      translated: ["This is the story.", "Oh, friends, if you think 52shuku is good, remember to bookmark the website https://www.52shuku.net/ or recommend it to your friends~ Please (>.<)", "Portal: |"],
    });
    const chapter = await getChapter(book(), 0);
    expect(chapter.paragraphs).toEqual(["这是故事。"]);
    expect(chapter.translated).toEqual(["This is the story."]);
    expect(state.fetchPage).not.toHaveBeenCalled();
    expect(state.saved.get("ch:novel:0:single-page-v2")).toEqual(chapter);
  });
});