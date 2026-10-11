import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFacts, templateTexts } from "../src/lib/brief";
import { allowedNumbers, extractNumbers, runGate } from "../src/lib/gate";
import { mergeFiles, parseCsvText, readingState } from "../src/lib/parse";
import { analyse, isScorable, scoreSubset, severity, yearWeight } from "../src/lib/scoring";
import type { Reading } from "../src/types";

const csv = fs.readFileSync("data/bhopal_ghats_2023_2025.csv", "utf8");
const parsed = parseCsvText(csv, "bhopal_ghats_2023_2025.csv");
const analysis = analyse(parsed.readings);
const today = new Date(2026, 9, 11);
const facts = buildFacts(analysis, [parsed.file], today);
const texts = templateTexts(analysis, today);

function reading(over: Partial<Reading>): Reading {
  return {
    id: Math.random().toString(36),
    year: 2025,
    festival: "Durga",
    site: "Test ghat",
    waterBody: "Test lake",
    phase: "during",
    parameter: "Dissolved oxygen",
    scored: "DO",
    state: "value",
    value: 6,
    unit: "mg/l",
    valueAsPrinted: "6",
    siteAsPrinted: "Test ghat",
    confidence: "high",
    sourcePage: 1,
    sourceFile: "t.csv",
    origin: "csv",
    ...over,
  };
}

describe("golden counts from the participant guide", () => {
  const scorable = parsed.readings.filter(isScorable);
  it("reads all 1,524 rows with no errors", () => {
    expect(parsed.rowsRead).toBe(1524);
    expect(parsed.rowsAccepted).toBe(1524);
    expect(parsed.issues.filter((i) => i.level === "error")).toHaveLength(0);
  });
  it("DO: 116 readings with a number, 42 below 5", () => {
    const d = scorable.filter((r) => r.scored === "DO");
    expect(d).toHaveLength(116);
    expect(d.filter((r) => r.value < 5)).toHaveLength(42);
    expect(analysis.totals.doValid).toBe(116);
    expect(analysis.totals.doFail).toBe(42);
  });
  it("BOD: 112 readings with a number, 100 above 3", () => {
    const b = scorable.filter((r) => r.scored === "BOD");
    expect(b).toHaveLength(112);
    expect(b.filter((r) => r.value > 3)).toHaveLength(100);
  });
  it("Bairagarh DO was 0 four times, across 2023 and 2025", () => {
    const g = analysis.ghats.find((x) => x.key === "Bairagarh")!;
    expect(g.stats.do.zero).toBe(4);
    expect(g.tier).toBe("critical");
  });
  it("finds 7 ghats and the two missing Durga 2025 tables", () => {
    expect(analysis.ghats).toHaveLength(7);
    for (const key of ["Bairagarh", "Malikhedi"]) {
      expect(analysis.ghats.find((g) => g.key === key)!.coverage.missingTables).toEqual(["Durga 2025"]);
    }
  });
});

describe("benchmark", () => {
  it("the limits in config match CPCB Class B in the track pack file", async () => {
    const { LIMITS } = await import("../src/config");
    const rows = fs
      .readFileSync("data/cpcb_water_quality_criteria.csv", "utf8")
      .split(/\r?\n/)
      .map((l) => l.split(","))
      .filter((c) => c[0] === "B");
    const limit = (name: string) => rows.find((c) => c[2].startsWith(name))![4];
    expect(limit("Dissolved oxygen")).toBe(String(LIMITS.doMin));
    expect(limit("BOD")).toBe(String(LIMITS.bodMax));
    expect(limit("pH")).toBe(`${LIMITS.phMin}-${LIMITS.phMax}`);
  });
});

describe("severity formulas (hand-computed)", () => {
  it("DO", () => {
    expect(severity("DO", 5)).toBe(0);
    expect(severity("DO", 0)).toBe(1);
    expect(severity("DO", 2.5)).toBeCloseTo(0.5);
  });
  it("BOD", () => {
    expect(severity("BOD", 3)).toBe(0);
    expect(severity("BOD", 30)).toBe(1);
    expect(severity("BOD", 6)).toBeCloseTo(Math.log10(2));
  });
  it("pH", () => {
    expect(severity("pH", 7)).toBe(0);
    expect(severity("pH", 9.25)).toBeCloseTo(0.5);
    expect(severity("pH", 5)).toBe(1);
  });
  it("year weights follow the latest year in the data", () => {
    expect(yearWeight(2025, 2025, false)).toBe(1);
    expect(yearWeight(2024, 2025, false)).toBeCloseTo(0.8);
    expect(yearWeight(2023, 2025, false)).toBeCloseTo(0.6);
    expect(yearWeight(2023, 2025, true)).toBe(1);
  });
  it("risk score for a small hand-worked set", () => {
    // DO 0 (s=1) and BOD 3 (s=0), same year: severity 0.5, exceedance 0.5, worst 1, no recovery term.
    const s = scoreSubset(
      [reading({ value: 0 }), reading({ parameter: "BOD", scored: "BOD", value: 3 })],
      2025,
    );
    expect(s.riskScore).toBeCloseTo(100 * (0.45 * 0.5 + 0.25 * 0.5 + 0.2 * 1));
  });
});

describe("missing is never clean", () => {
  it("marks blanks and report marks as not sampled", () => {
    for (const mark of ["", "*", "**", "_", "-"]) {
      expect(readingState(mark, "", mark).state).toBe("not_sampled");
    }
    expect(readingState("", "BDL", "BDL").state).toBe("BDL");
    expect(readingState("abc", "", "abc")).toMatchObject({ state: "not_sampled", unreadable: true });
  });
  it("a not-sampled or BDL reading changes no score", () => {
    const base = [
      reading({ value: 2 }),
      reading({ parameter: "BOD", scored: "BOD", value: 8 }),
      reading({ parameter: "pH", scored: "pH", value: 7 }),
    ];
    const withMissing = [
      ...base,
      reading({ phase: "after", state: "not_sampled", value: null }),
      reading({ phase: "pre", state: "BDL", value: null }),
    ];
    const a = scoreSubset(base, 2025);
    const b = scoreSubset(withMissing, 2025);
    expect(b.riskScore).toBe(a.riskScore);
    expect(b.stats.validTotal).toBe(a.stats.validTotal);
    expect(b.stats.notSampled).toBe(1);
    expect(b.stats.unscorable).toBe(1);
  });
  it("implausible numbers are flagged and not scored", () => {
    const p = parseCsvText("year,festival,site,phase,parameter,value\n2026,Durga,X ghat,during,pH,19\n", "x.csv");
    expect(p.readings[0].suspect).toBeTruthy();
    expect(p.issues.some((i) => i.code === "implausible_value")).toBe(true);
    expect(isScorable(p.readings[0])).toBe(false);
  });
});

describe("insufficient data", () => {
  it("a ghat with too few readings is never ranked", () => {
    const sparse = [reading({ site: "Sparse ghat", value: 9 }), reading({ site: "Sparse ghat", phase: "pre", value: 9 })];
    const a = analyse([...parsed.readings, ...sparse]);
    const g = a.ghats.find((x) => x.site === "Sparse ghat")!;
    expect(g.ranked).toBe(false);
    expect(g.rank).toBeNull();
    expect(g.tier).toBeNull();
    expect(a.unranked.map((x) => x.site)).toContain("Sparse ghat");
    expect(a.ranked.map((x) => x.site)).not.toContain("Sparse ghat");
    expect(g.actions).toContain("test");
  });
  it("a new near-zero oxygen reading moves a ghat into Critical and above lower tiers", () => {
    const fresh = reading({ site: "Prempura ghat", year: 2026, value: 0.4 });
    const a = analyse([...parsed.readings, fresh]);
    const g = a.ghats.find((x) => x.key === "Prempura")!;
    const criticalCount = a.ranked.filter((x) => x.tier === "critical").length;
    expect(g.tier).toBe("critical");
    expect(g.rank).toBeLessThanOrEqual(criticalCount);
    expect(analysis.ghats.find((x) => x.key === "Prempura")!.rank).toBe(7);
  });
  it("a file with the wrong columns is rejected whole", () => {
    const p = parseCsvText("a,b\n1,2\n", "bad.csv");
    expect(p.rowsAccepted).toBe(0);
    expect(p.issues[0].code).toBe("missing_columns");
  });
  it("a reading repeated in a second file is reported, not double counted", () => {
    const again = parseCsvText(csv.split("\n").slice(0, 4).join("\n"), "again.csv");
    const merged = mergeFiles([parsed, again]);
    expect(merged.readings).toHaveLength(1524);
    expect(merged.issues.filter((i) => i.code === "duplicate_across_files")).toHaveLength(3);
  });
});

describe("template brief and the gate", () => {
  it("every number in the template texts is in the computed facts", () => {
    const allowed = allowedNumbers(facts);
    for (const text of Object.values(texts)) {
      expect(extractNumbers(text).filter((n) => !allowed.has(n))).toEqual([]);
    }
  });
  it("the template passes the gate, English and Hindi", () => {
    expect(runGate(texts, facts)).toEqual({ ok: true, issues: [] });
  });
  it("the brief stays near one page", () => {
    expect(texts.en.split(/\s+/).length).toBeLessThan(260);
  });
  const codes = (t: typeof texts, audit?: Parameters<typeof runGate>[2]) =>
    runGate(t, facts, audit).issues.map((i) => i.code);
  it("rejects an invented number", () => {
    expect(codes({ ...texts, en: texts.en + "\nBOD rose by 87 percent." })).toContain("unsupported_number");
  });
  it("rejects 'safe' and 'clean' as claims, in both languages", () => {
    expect(codes({ ...texts, en: texts.en + "\nPrempura ghat is safe." })).toContain("forbidden_wording");
    expect(codes({ ...texts, summary_en: "The water is clean." })).toContain("forbidden_wording");
    expect(codes({ ...texts, hi: texts.hi + "\nयह घाट सुरक्षित है।" })).toContain("forbidden_wording");
  });
  it("rejects a causation claim", () => {
    expect(codes({ ...texts, en: texts.en + "\nImmersion caused low oxygen." })).toContain("forbidden_wording");
  });
  it("rejects a brief with the ghats out of order or missing", () => {
    const [first, second] = facts.ranked;
    const swapped = texts.en.replace(first.name, "@@").replace(second.name, first.name).replace("@@", second.name);
    expect(codes({ ...texts, en: swapped })).toContain("wrong_order");
  });
  it("rejects a brief that drops an unranked ghat", () => {
    const withUnranked = { ...facts, cannotBeRanked: [{ name: "Sparse ghat", nameHi: null, why: "x", scoredReadings: 2 }] };
    expect(runGate(texts, withUnranked).issues.map((i) => i.code)).toContain("missing_unranked");
  });
  it("rejects English and Hindi that carry different numbers", () => {
    expect(codes({ ...texts, hi: texts.hi.replace("1524", "7") })).toContain("en_hi_mismatch");
  });
  it("a rule-breaking writer is stopped by the gate even when the auditor approves", async () => {
    const { getProvider, extractJson } = await import("../api/_lib/providers");
    const bad = getProvider({ AI_PROVIDER: "mock", MOCK_BAD: "1" })!;
    const out = await bad.complete({ model: "mock", system: "writer", user: `FACTS:\n${JSON.stringify(facts)}`, maxTokens: 1 });
    const result = runGate(extractJson(out.text) as typeof texts, facts, { ok: true, issues: [] });
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["unsupported_number", "forbidden_wording"]));
    const good = getProvider({ AI_PROVIDER: "mock" })!;
    const ok = await good.complete({ model: "mock", system: "writer", user: `FACTS:\n${JSON.stringify(facts)}`, maxTokens: 1 });
    expect(runGate(extractJson(ok.text) as typeof texts, facts, { ok: true, issues: [] }).ok).toBe(true);
  });
  it("rejects when the auditor does not approve", () => {
    expect(codes(texts, { ok: false, issues: [{ type: "health_claim", quote: "x" }] })).toContain("auditor_rejected");
    expect(codes(texts, { ok: true, issues: [] })).toEqual([]);
  });
});
