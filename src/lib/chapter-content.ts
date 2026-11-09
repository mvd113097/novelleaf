/** Only strip the known 52shuku footer, never ordinary mentions in the story. */
export function cleanChapterParagraphs(paragraphs: string[], url: string): string[] {
  let host: string;
  try { host = new URL(url).hostname; } catch { return paragraphs; }
  if (!/(^|\.)52shuku\.(net|com)$/i.test(host)) return paragraphs;

  const isNotice = (text: string) => {
    const namesSite = /52\s*(?:shuku|书库)|五二书库/i.test(text);
    const chineseNotice = /(?:如果|觉得).*?(?:不错|好).*?(?:收藏|推荐给朋友)/.test(text);
    const englishNotice = /(?:if you think|if you (?:like|enjoy)|if .*?(?:good|great)).*?(?:bookmark|recommend .*?friends)/i.test(text);
    return namesSite && (chineseNotice || englishNotice);
  };
  const isPortal = (text: string) => /^(?:传送门|portal)\s*[:：]?\s*[|｜]*\s*$/i.test(text.trim());
  let end = paragraphs.length;
  // Walk only the footer so story paragraphs containing these words stay intact.
  while (end > 0) {
    const text = paragraphs[end - 1];
    if (text === undefined || (!isNotice(text) && !isPortal(text))) break;
    end--;
  }
  return end === paragraphs.length ? paragraphs : paragraphs.slice(0, end);
}