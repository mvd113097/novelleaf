import { createServerFn } from "@tanstack/react-start";

export const ALLOWED_HOSTS = ["52shuku.net", "52shuku.vip", "dmxs.org", "fuxsw.com", "fuxb.com", "fuxb.net", "fuxb.org", "fuxb.cc"];

function hostAllowed(url: string) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return ALLOWED_HOSTS.some((a) => h === a || h.endsWith("." + a)) || /(^|\.)fuxb/.test(h);
  } catch {
    return false;
  }
}

// Fetches raw page bytes; the browser decodes them (handles GBK sites) and parses.
export const fetchPage = createServerFn({ method: "POST" })
  .inputValidator((input: { url: string }) => {
    if (!input?.url || !/^https?:\/\//.test(input.url)) throw new Error("Invalid URL");
    return input;
  })
  .handler(async ({ data }) => {
    if (!hostAllowed(data.url)) throw new Error("Only 52shuku, dmxs and fuxb links are supported.");
    const res = await fetch(data.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
        Accept: "text/html,*/*",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`Site responded ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { base64: btoa(bin), contentType: res.headers.get("content-type") ?? "", finalUrl: res.url || data.url };
  });

export const translateText = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string }) => {
    if (typeof input?.text !== "string" || input.text.length > 12000) throw new Error("Invalid text");
    return input;
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Translation is not configured.");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a literary translator of Chinese web novels. Translate the user's Chinese text into fluent, natural English. Keep paragraph breaks (one blank line between paragraphs). Keep names consistent in pinyin. Output only the translation.",
          },
          { role: "user", content: data.text },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("Too many translation requests, please wait a moment.");
      if (res.status === 402) throw new Error("AI credits are used up for this workspace.");
      throw new Error(`Translation failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { text: json.choices?.[0]?.message?.content ?? "" };
  });
