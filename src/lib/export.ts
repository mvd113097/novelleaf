import JSZip from "jszip";
import { bookTitle, type Book, type Chapter } from "./novel";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const body = (c: Chapter, english: boolean) => (english && c.translated?.length ? c.translated : c.paragraphs);
const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").slice(0, 80) || "book";

export function buildTxt(book: Book, chs: Chapter[], english: boolean) {
  const parts = [bookTitle(book), book.author ? `Author: ${book.author}` : "", "", book.summary, ""];
  chs.forEach((c) => parts.push("", c.title, "", ...body(c, english).map((p) => "　　" + p)));
  return { blob: new Blob([parts.join("\n")], { type: "text/plain;charset=utf-8" }), name: `${safe(bookTitle(book))}.txt` };
}

export async function buildEpub(book: Book, chs: Chapter[], english: boolean) {
  const zip = new JSZip();
  const uid = `urn:uuid:${book.id}`;
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  const page = (t: string, inner: string) => `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(t)}</title></head><body>${inner}</body></html>`;
  zip.file("OEBPS/intro.xhtml", page(bookTitle(book), `<h1>${esc(bookTitle(book))}</h1>${book.author ? `<p><i>${esc(book.author)}</i></p>` : ""}<p>${esc(book.summary)}</p>`));
  chs.forEach((c, i) => zip.file(`OEBPS/c${i}.xhtml`, page(c.title, `<h2>${esc(c.title)}</h2>${body(c, english).map((p) => `<p>${esc(p)}</p>`).join("")}`)));
  const items = chs.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join("");
  const spine = chs.map((_, i) => `<itemref idref="c${i}"/>`).join("");
  zip.file("OEBPS/content.opf", `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${uid}</dc:identifier><dc:title>${esc(bookTitle(book))}</dc:title><dc:language>${english ? "en" : "zh"}</dc:language>${book.author ? `<dc:creator>${esc(book.author)}</dc:creator>` : ""}<meta property="dcterms:modified">${new Date().toISOString().slice(0, 19)}Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="intro" href="intro.xhtml" media-type="application/xhtml+xml"/>${items}</manifest><spine><itemref idref="intro"/>${spine}</spine></package>`);
  zip.file("OEBPS/nav.xhtml", `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="intro.xhtml">${esc(bookTitle(book))}</a></li>${chs.map((c, i) => `<li><a href="c${i}.xhtml">${esc(c.title)}</a></li>`).join("")}</ol></nav></body></html>`);
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
  return { blob, name: `${safe(bookTitle(book))}.epub` };
}
