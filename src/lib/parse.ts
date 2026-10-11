import Papa from "papaparse";
import type { Festival, ParsedFile, Phase, Reading, ReadingState, ScoredParam, ValidationIssue } from "../types";

export const REQUIRED_COLUMNS = ["year", "festival", "site", "phase", "parameter", "value"] as const;

const SCORED_ALIASES: Record<string, { name: string; scored: ScoredParam }> = {
  ph: { name: "pH", scored: "pH" },
  "dissolved oxygen": { name: "Dissolved oxygen", scored: "DO" },
  do: { name: "Dissolved oxygen", scored: "DO" },
  "d.o.": { name: "Dissolved oxygen", scored: "DO" },
  "d.o": { name: "Dissolved oxygen", scored: "DO" },
  "d.oxygen": { name: "Dissolved oxygen", scored: "DO" },
  bod: { name: "BOD", scored: "BOD" },
  "b.o.d.": { name: "BOD", scored: "BOD" },
  "b.o.d": { name: "BOD", scored: "BOD" },
  "bod (5 days 20c)": { name: "BOD", scored: "BOD" },
};

/** Marks the reports print where no sample was taken. A blank cell means the same. */
const NOT_SAMPLED_MARKS = new Set(["", "*", "**", "_", "-", "--", "—", "na", "n/a", "nil", "not sampled"]);
const BDL_MARKS = new Set(["bdl", "below detection limit"]);
const ND_MARKS = new Set(["nd", "not detected"]);

export function canonicalParameter(raw: string): { name: string; scored: ScoredParam | null } {
  const hit = SCORED_ALIASES[raw.trim().toLowerCase()];
  return hit ?? { name: raw.trim(), scored: null };
}

/**
 * Decide what a cell means. A reading is only ever "value" when a plain number was printed.
 * Anything unreadable becomes not_sampled, so it can never count as a pass.
 */
export function readingState(
  value: string,
  flag: string,
  asPrinted: string,
): { state: ReadingState; value: number | null; unreadable: boolean } {
  const v = value.trim();
  const marks = [flag, asPrinted, v].map((s) => s.trim().toLowerCase());
  if (marks.some((m) => BDL_MARKS.has(m))) return { state: "BDL", value: null, unreadable: false };
  if (marks.some((m) => ND_MARKS.has(m))) return { state: "ND", value: null, unreadable: false };
  if (v !== "" && /^-?\d+(\.\d+)?$/.test(v)) return { state: "value", value: Number(v), unreadable: false };
  const known = NOT_SAMPLED_MARKS.has(v.toLowerCase());
  return { state: "not_sampled", value: null, unreadable: !known };
}

function implausible(scored: ScoredParam | null, value: number): string | undefined {
  if (value < 0) return "negative value";
  if (scored === "pH" && value > 14) return "pH above 14";
  if (scored === "DO" && value > 20) return "DO above 20 mg/l";
  if (scored === "BOD" && value > 500) return "BOD above 500 mg/l";
  return undefined;
}

const FESTIVALS: Record<string, Festival> = { ganesh: "Ganesh", durga: "Durga" };
const PHASES: Record<string, Phase> = { pre: "pre", before: "pre", during: "during", after: "after", post: "after" };

export function readingKey(r: Pick<Reading, "site" | "year" | "festival" | "phase" | "parameter">): string {
  return [r.site, r.year, r.festival, r.phase, r.parameter].join("|");
}

/** Turn plain row objects (from a CSV or from the PDF reader) into validated readings. */
export function rowsToReadings(
  rows: Array<Record<string, string>>,
  file: string,
  origin: Reading["origin"] = "csv",
): ParsedFile {
  const issues: ValidationIssue[] = [];
  const readings: Reading[] = [];
  const seen = new Set<string>();

  rows.forEach((raw, i) => {
    const rowNo = i + 2; // header is row 1
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) row[k.trim().toLowerCase()] = String(v ?? "").trim();

    const year = Number(row.year);
    const festival = FESTIVALS[(row.festival ?? "").toLowerCase()];
    const phase = PHASES[(row.phase ?? "").toLowerCase()];
    const site = row.site ?? "";
    const problems: string[] = [];
    if (!Number.isInteger(year) || year < 2000 || year > 2100) problems.push(`year "${row.year}"`);
    if (!festival) problems.push(`festival "${row.festival}"`);
    if (!phase) problems.push(`phase "${row.phase}"`);
    if (!site) problems.push("empty site");
    if (!row.parameter) problems.push("empty parameter");
    if (problems.length) {
      issues.push({ level: "error", file, row: rowNo, code: "bad_row", message: `Row skipped: ${problems.join(", ")}.` });
      return;
    }

    const param = canonicalParameter(row.parameter);
    const cell = readingState(row.value ?? "", row.flag ?? "", row.value_as_printed ?? "");
    const page = Number(row.source_page);
    const reading: Reading = {
      id: `${file}#${rowNo}`,
      year,
      festival,
      site,
      waterBody: row.water_body ?? "",
      phase,
      parameter: param.name,
      scored: param.scored,
      state: cell.state,
      value: cell.value,
      unit: row.unit_assumed ?? "",
      valueAsPrinted: row.value_as_printed || row.value || "",
      siteAsPrinted: row.site_as_printed || site,
      confidence: origin === "pdf-ai" || (row.site_match_confidence ?? "").toLowerCase() === "medium" ? "medium" : "high",
      sourcePage: Number.isInteger(page) && page > 0 ? page : null,
      sourceFile: file,
      origin,
    };

    if (cell.unreadable) {
      issues.push({
        level: "warning",
        file,
        row: rowNo,
        code: "unreadable_value",
        message: `"${row.value}" is not a number. Treated as not sampled, not as a pass (${site}, ${param.name}).`,
      });
    }
    if (reading.value !== null) {
      const why = implausible(param.scored, reading.value);
      if (why) {
        reading.suspect = why;
        issues.push({
          level: "warning",
          file,
          row: rowNo,
          code: "implausible_value",
          message: `${param.name} = ${reading.value} at ${site} (${year} ${festival}, ${phase}): ${why}. Shown but not scored.`,
        });
      }
    }
    if (param.scored && (cell.state === "BDL" || cell.state === "ND")) {
      issues.push({
        level: param.scored === "DO" ? "warning" : "info",
        file,
        row: rowNo,
        code: "bdl_on_scored",
        message:
          `${param.name} printed as ${cell.state} at ${site} (${year} ${festival}, ${phase}). Not scored.` +
          (param.scored === "DO" ? " For dissolved oxygen this means very low oxygen, the opposite of a pass." : ""),
      });
    }

    const key = readingKey(reading);
    if (seen.has(key)) {
      issues.push({
        level: "warning",
        file,
        row: rowNo,
        code: "duplicate",
        message: `Duplicate reading for ${site}, ${year} ${festival}, ${phase}, ${param.name}. First one kept.`,
      });
      return;
    }
    seen.add(key);
    readings.push(reading);
  });

  return { file, rowsRead: rows.length, rowsAccepted: readings.length, readings, issues };
}

export function parseCsvText(text: string, file: string): ParsedFile {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const columns = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length) {
    return {
      file,
      rowsRead: parsed.data.length,
      rowsAccepted: 0,
      readings: [],
      issues: [
        {
          level: "error",
          file,
          code: "missing_columns",
          message: `Not read: missing column(s) ${missing.join(", ")}. Use the template CSV layout.`,
        },
      ],
    };
  }
  const result = rowsToReadings(parsed.data, file);
  for (const e of parsed.errors.slice(0, 5)) {
    result.issues.push({ level: "warning", file, row: (e.row ?? 0) + 2, code: "csv_format", message: e.message });
  }
  return result;
}

/** Merge files in upload order. A reading already present in an earlier file is kept; the later one is reported. */
export function mergeFiles(files: ParsedFile[]): { readings: Reading[]; issues: ValidationIssue[] } {
  const readings: Reading[] = [];
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, Reading>();
  for (const f of files) {
    issues.push(...f.issues);
    for (const r of f.readings) {
      const key = readingKey(r);
      const first = seen.get(key);
      if (first) {
        issues.push({
          level: "warning",
          file: f.file,
          code: "duplicate_across_files",
          message: `${r.site}, ${r.year} ${r.festival}, ${r.phase}, ${r.parameter} is already in ${first.sourceFile}. The first file's reading is used.`,
        });
        continue;
      }
      seen.set(key, r);
      readings.push(r);
    }
  }
  return { readings, issues };
}
