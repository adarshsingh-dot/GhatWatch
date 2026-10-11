// Deterministic gate. A model's words are shown only if every check here passes.
// The auditor model is a second look; this file is the authority.
import { KNOWN_GHATS } from "../config";
import type { AuditResult, BriefTexts, Facts, GateIssue, GateResult } from "../types";

const TEXT_KEYS: Array<keyof BriefTexts> = ["summary_en", "summary_hi", "en", "hi"];
const MAX_CHARS = 4000;

export const FORBIDDEN_EN =
  /\b(safe|safer|safely|unsafe|clean|cleaner|unclean|healthy|unhealthy|disease|diseases|cause|causes|caused|causing)\b/i;
export const FORBIDDEN_HI = ["सुरक्षित", "स्वच्छ", "बीमारी", "रोग"];

/** Numbers in running text. List markers such as "1." at the start of a line are not data. */
export function extractNumbers(text: string): number[] {
  const withoutMarkers = text.replace(/^[ \t]*\d{1,2}[.)](?=\s)/gm, "");
  return (withoutMarkers.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** Every number a brief may contain: exactly the numbers present in the facts. */
export function allowedNumbers(facts: Facts): Set<number> {
  // File names are labels, not data: digits inside them must not become allowed numbers.
  const withoutFileNames = { ...facts, dataset: { ...facts.dataset, files: [] } };
  return new Set(extractNumbers(JSON.stringify(withoutFileNames)));
}

function findForbidden(text: string): string | null {
  const m = text.match(FORBIDDEN_EN);
  if (m) return m[0];
  const n = text.normalize("NFC");
  return FORBIDDEN_HI.find((w) => n.includes(w)) ?? null;
}

function keysFor(name: string): string[] {
  const known = KNOWN_GHATS.find((g) => g.site === name);
  const first = name.split(/[\s(/,]+/).filter(Boolean)[0] ?? name;
  return known ? [known.key, known.keyHi] : [first];
}

function firstIndex(text: string, name: string): number {
  const hay = text.normalize("NFC").toLowerCase();
  const hits = keysFor(name)
    .map((k) => hay.indexOf(k.normalize("NFC").toLowerCase()))
    .filter((i) => i >= 0);
  return hits.length ? Math.min(...hits) : -1;
}

export function runGate(brief: BriefTexts, facts: Facts, audit?: AuditResult | null): GateResult {
  const issues: GateIssue[] = [];
  const allowed = allowedNumbers(facts);

  for (const key of TEXT_KEYS) {
    const text = brief[key];
    if (typeof text !== "string" || text.trim().length === 0 || text.length > MAX_CHARS) {
      issues.push({ code: "empty", where: key, detail: "Text is missing or too long." });
      continue;
    }
    if (/[०-९]/.test(text)) {
      issues.push({ code: "devanagari_digits", where: key, detail: "Numerals must stay 0-9." });
    }
    const bad = [...new Set(extractNumbers(text).filter((n) => !allowed.has(n)))];
    if (bad.length) {
      issues.push({
        code: "unsupported_number",
        where: key,
        detail: `Not in the computed facts: ${bad.join(", ")}`,
      });
    }
    const word = findForbidden(text);
    if (word) issues.push({ code: "forbidden_wording", where: key, detail: `Uses "${word}".` });
  }

  for (const key of ["en", "hi"] as const) {
    const text = brief[key] ?? "";
    const positions = facts.ranked.slice(0, 3).map((g) => firstIndex(text, g.name));
    const ordered = positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1]));
    if (!ordered) {
      issues.push({ code: "wrong_order", where: key, detail: "Top ghats are missing or not in rank order." });
    }
    for (const g of facts.cannotBeRanked) {
      if (firstIndex(text, g.name) < 0) {
        issues.push({ code: "missing_unranked", where: key, detail: `"${g.name}" is not listed as unranked.` });
      }
    }
  }

  const sameNumbers = (a: string, b: string) => {
    const x = new Set(extractNumbers(a ?? ""));
    const y = new Set(extractNumbers(b ?? ""));
    return x.size === y.size && [...x].every((n) => y.has(n));
  };
  if (!sameNumbers(brief.en, brief.hi)) {
    issues.push({ code: "en_hi_mismatch", where: "hi", detail: "English and Hindi briefs carry different numbers." });
  }
  if (!sameNumbers(brief.summary_en, brief.summary_hi)) {
    issues.push({
      code: "en_hi_mismatch",
      where: "summary_hi",
      detail: "English and Hindi summaries carry different numbers.",
    });
  }

  if (audit !== undefined && (audit === null || audit.ok !== true)) {
    const quotes = (audit?.issues ?? []).map((i) => `${i.type}: ${i.quote}`).join(" | ");
    issues.push({ code: "auditor_rejected", where: "audit", detail: quotes || "Auditor did not approve." });
  }

  return { ok: issues.length === 0, issues };
}
