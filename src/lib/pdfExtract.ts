// PDF upload path. The browser pulls the text layer out of the PDF, a model copies the
// DO / BOD / pH values into lines, and the code below keeps only values that literally
// appear on the cited page. Rows from here are a draft until a person has checked them.
import { KNOWN_GHATS } from "../config";
import type { ParsedFile, ValidationIssue } from "../types";
import { rowsToReadings } from "./parse";

export interface PdfPage {
  page: number;
  text: string;
}

const SITE_ALIASES: Array<{ site: string; aliases: string[] }> = [
  { site: "Khatlapura ghat", aliases: ["khatlapura"] },
  { site: "Bairagarh (Sant Hirdaram) kund", aliases: ["bairagarh", "hirdaram"] },
  { site: "Prempura ghat", aliases: ["prempura"] },
  { site: "Rani Kamlapati ghat / Kamla Park kund", aliases: ["kamlapati", "kamla park"] },
  { site: "Hathaikheda dam / kund", aliases: ["hathaikheda"] },
  { site: "Malikhedi kund", aliases: ["malikhedi", "maalikhedi"] },
  { site: "Shahpura lake ghat", aliases: ["shahpura"] },
];

export function matchSite(printed: string): string {
  const p = printed.toLowerCase();
  const hit = SITE_ALIASES.find((s) => s.aliases.some((a) => p.includes(a)));
  return hit && KNOWN_GHATS.some((g) => g.site === hit.site) ? hit.site : printed.trim();
}

/** Batch size per request to /api/extract. Every relevant page is sent; none are dropped. */
export const PDF_CHUNK = { pages: 12, chars: 60_000 };

export function chunkPages(pages: PdfPage[]): PdfPage[][] {
  const chunks: PdfPage[][] = [];
  let current: PdfPage[] = [];
  let chars = 0;
  for (const p of pages) {
    const page = { page: p.page, text: p.text.slice(0, PDF_CHUNK.chars) };
    if (current.length && (current.length >= PDF_CHUNK.pages || chars + page.text.length > PDF_CHUNK.chars)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(page);
    chars += page.text.length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Pages worth sending: they mention Bhopal and at least one of the three scored tests. */
export function relevantPages(pages: PdfPage[]): PdfPage[] {
  return pages.filter((p) => /bhopal/i.test(p.text) && /(B\.?O\.?D|D\.?\s?Oxygen|Dissolved\s+Oxygen|\bpH\b)/i.test(p.text));
}

/** True when the printed value stands on the page as its own token (not inside a longer number). */
export function valueOnPage(value: string, pageText: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\d.])${escaped}($|[^\\d.]|\\.(?!\\d))`).test(pageText);
}

const TESTS: Record<string, string> = { ph: "pH", do: "Dissolved oxygen", bod: "BOD" };

/**
 * Turn the model's lines into readings.
 * A numeric value that is not found on its cited page is dropped and reported.
 */
export function linesToReadings(lines: string[], pages: PdfPage[], file: string): ParsedFile {
  const textByPage = new Map(pages.map((p) => [p.page, p.text]));
  const rows: Array<Record<string, string>> = [];
  const issues: ValidationIssue[] = [];

  for (const line of lines) {
    const [year, festival, pageStr, sitePrinted, test, pre, during, after] = line.split("|").map((s) => s.trim());
    const parameter = TESTS[test.toLowerCase()];
    const pageText = textByPage.get(Number(pageStr));
    if (!parameter || pageText === undefined) {
      issues.push({ level: "warning", file, code: "pdf_line_skipped", message: `Line skipped (unknown test or page): ${line}` });
      continue;
    }
    for (const [phase, printed] of [["pre", pre], ["during", during], ["after", after]] as const) {
      const isNumber = /^-?\d+(\.\d+)?$/.test(printed);
      if (isNumber && !valueOnPage(printed, pageText)) {
        issues.push({
          level: "warning",
          file,
          code: "pdf_value_not_on_page",
          message: `Dropped: ${parameter} ${phase} = ${printed} for "${sitePrinted}" is not printed on page ${pageStr}.`,
        });
        continue;
      }
      rows.push({
        year,
        festival,
        site: matchSite(sitePrinted),
        phase,
        parameter,
        value: isNumber ? printed : "",
        value_as_printed: printed,
        unit_assumed: parameter === "pH" ? "" : "mg/l",
        site_as_printed: sitePrinted,
        source_page: pageStr,
      });
    }
  }

  const result = rowsToReadings(rows, file, "pdf-ai");
  return { ...result, issues: [...issues, ...result.issues] };
}

/** Read the text layer of every page. Runs in the browser; pdf.js is loaded only when a PDF is dropped. */
export async function readPdfText(file: File): Promise<PdfPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str + (item.hasEOL ? "\n" : " ");
    }
    pages.push({ page: n, text: text.replace(/[ \t]+/g, " ").trim() });
  }
  return pages;
}
