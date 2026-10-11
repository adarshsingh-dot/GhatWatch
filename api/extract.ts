// POST /api/extract  { fileName, cover, pages: [{ page, text }] }  ->  { provider, model, lines }
// A model copies printed DO / BOD / pH values out of PDF page text. The browser then checks
// that each copied value really appears on the cited page, and a person reviews the rows
// before they are used.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { READER_SYSTEM } from "./_lib/prompts.js";
import { getProvider, redact } from "./_lib/providers.js";

export const config = { maxDuration: 300 };

// Keep in step with PDF_CHUNK in src/lib/pdfExtract.ts, which sends smaller batches than this.
const MAX_PAGES = 30;
const MAX_CHARS = 120_000;

interface Body {
  fileName?: unknown;
  cover?: unknown;
  pages?: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const body = (req.body ?? {}) as Body;
  const pages = Array.isArray(body.pages)
    ? (body.pages as Array<{ page?: unknown; text?: unknown }>).filter(
        (p) => Number.isInteger(p?.page) && typeof p?.text === "string",
      )
    : [];
  const total = pages.reduce((n, p) => n + (p.text as string).length, 0);
  if (pages.length === 0 || pages.length > MAX_PAGES || total > MAX_CHARS) {
    return res.status(400).json({ error: "bad_request" });
  }

  const provider = getProvider();
  if (!provider) return res.status(503).json({ error: "ai_not_configured" });

  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 200) : "report.pdf";
  const cover = typeof body.cover === "string" ? body.cover.slice(0, 2000) : "";
  const user =
    `File name: ${fileName}\n\n[COVER PAGE, for the report year only]\n${cover}\n\n` +
    pages.map((p) => `[PAGE ${p.page}]\n${p.text}`).join("\n\n");

  try {
    const out = await provider.complete({
      model: provider.writerModel,
      system: READER_SYSTEM,
      user,
      maxTokens: 16000,
    });
    const lines = out.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.split("|").length === 8);
    return res.status(200).json({ provider: provider.label, model: provider.writerModel, lines });
  } catch (e) {
    return res.status(502).json({ error: "ai_failed", detail: redact(e instanceof Error ? e.message : String(e)) });
  }
}
