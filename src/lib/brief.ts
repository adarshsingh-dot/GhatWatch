// Template summary and brief, generated from the same analysis objects the screen shows.
// Nothing here is typed by hand: every number is read from Analysis / GhatScore.
import { BENCHMARK_NAME, LIMITS, VISARJAN_DATE, VISARJAN_LABEL } from "../config";
import { en, type Strings } from "../i18n/en";
import { hi } from "../i18n/hi";
import type { ActionId, Analysis, BriefTexts, Facts, GhatScore } from "../types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function daysUntilVisarjan(today: Date): number {
  const target = new Date(`${VISARJAN_DATE}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

/** Show a reading the way it was measured: at most 2 decimals, no trailing zeros. */
export function fmt(n: number | null): string {
  return n === null ? "" : String(Math.round(n * 100) / 100);
}

export function doSentence(g: GhatScore, s: Strings): string {
  const d = g.stats.do;
  if (d.valid === 0) return "";
  if (d.zero > 0) return s.doZero(d.zero);
  if (d.fail > 0) return s.doLow(d.fail, d.valid, fmt(d.min));
  return s.doOk(d.valid);
}

export function bodSentence(g: GhatScore, s: Strings): string {
  const b = g.stats.bod;
  if (b.valid === 0) return "";
  return b.fail > 0 ? s.bodHigh(b.fail, b.valid, fmt(b.max)) : s.bodOk(b.valid);
}

export function coverageSentence(g: GhatScore, s: Strings): string {
  return s.coverage(s.confidence[g.confidence], g.coverage.valid, g.coverage.expected, g.coverage.missingTables);
}

/** The short reason shown on a ghat card. */
export function reasonText(g: GhatScore, s: Strings): string {
  return [doSentence(g, s), bodSentence(g, s), coverageSentence(g, s)].filter(Boolean).join(" ");
}

/** Extra lines for the detail view only. */
export function detailNotes(g: GhatScore, s: Strings): string[] {
  const out: string[] = [];
  if (g.stats.ph.out > 0) out.push(s.phOut(g.stats.ph.out, g.stats.ph.valid));
  if (g.stats.pre.fail > 0) out.push(s.preFail(g.stats.pre.fail, g.stats.pre.valid));
  if (g.tierChanges) out.push(s.tierChange);
  return out;
}

/** The one strongest number for a ghat, with its limit. */
export function strongestSentence(g: GhatScore, s: Strings): string {
  if (g.stats.do.fail > 0) return doSentence(g, s);
  if (g.stats.bod.fail > 0) return bodSentence(g, s);
  if (g.stats.ph.out > 0) return s.phOut(g.stats.ph.out, g.stats.ph.valid);
  return doSentence(g, s) || bodSentence(g, s);
}

export function insufficientText(g: GhatScore, s: Strings): string {
  return g.insufficient.map((c) => s.insufficient[c]).join("; ");
}

const ACTION_ORDER: ActionId[] = ["aeration", "cleaning", "ph", "test"];

function actionLines(a: Analysis, s: Strings): string[] {
  const lines: string[] = [];
  for (const id of ACTION_ORDER) {
    const names = a.ghats
      .filter((g) => g.actions.includes(id))
      .sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99))
      .map((g) => (s.lang === "hi" && g.keyHi ? g.keyHi : g.key));
    if (names.length) lines.push(`- ${s.action[id]}: ${names.join(", ")}`);
  }
  return lines;
}

export function templateBrief(a: Analysis, today: Date, s: Strings): string {
  const lines: string[] = [];
  lines.push(s.briefTitle);
  lines.push(s.prepared(formatDate(today), VISARJAN_LABEL));
  lines.push(s.basedOn(a.totals.readings, a.ghats.length, a.years[0], a.years[a.years.length - 1]));
  lines.push("");
  lines.push(s.priorityHead);
  a.ranked.slice(0, 3).forEach((g, i) => {
    const place = g.waterBody ? ` [${g.waterBody}]` : "";
    lines.push(
      `${i + 1}. ${s.ghatName(g.site, g.nameHi)}${place}: ${s.tier[g.tier!]}. ` +
        `${strongestSentence(g, s)} ${s.confidenceLabel(s.confidence[g.confidence])}`,
    );
  });
  lines.push("");
  lines.push(s.unrankedHead);
  if (a.unranked.length === 0) lines.push(s.unrankedNone(a.ghats.length));
  for (const g of a.unranked) lines.push(`- ${s.ghatName(g.site, g.nameHi)}: ${insufficientText(g, s)}`);
  lines.push("");
  lines.push(s.actionsHead);
  lines.push(...actionLines(a, s));
  lines.push("");
  lines.push(s.notShownHead);
  lines.push(s.notShown(a.totals.notSampled));
  if (a.totals.aiDraft > 0) lines.push(s.aiDraftNote(a.totals.aiDraft));
  lines.push("");
  lines.push(s.source(a.years.join(", ")));
  return lines.join("\n");
}

export function templateSummary(a: Analysis, s: Strings): string {
  const critical = a.ranked.filter((g) => g.tier === "critical");
  return s.inShort({
    ghats: a.ghats.length,
    ranked: a.ranked.length,
    unranked: a.unranked.length,
    critical: critical.length,
    criticalNames: critical.map((g) => (s.lang === "hi" && g.keyHi ? g.keyHi : g.key)).join(", "),
    doFail: a.totals.doFail,
    doValid: a.totals.doValid,
    bodFail: a.totals.bodFail,
    bodValid: a.totals.bodValid,
    notSampled: a.totals.notSampled,
  });
}

export function templateTexts(a: Analysis, today: Date): BriefTexts {
  return {
    summary_en: templateSummary(a, en),
    summary_hi: templateSummary(a, hi),
    en: templateBrief(a, today, en),
    hi: templateBrief(a, today, hi),
  };
}

/** The compact facts object. This is all a model is ever given, and what the gate checks against. */
export function buildFacts(a: Analysis, files: string[], today: Date): Facts {
  return {
    prepared: formatDate(today),
    visarjan: VISARJAN_LABEL,
    daysToVisarjan: daysUntilVisarjan(today),
    benchmark: { name: BENCHMARK_NAME, ...LIMITS },
    dataset: {
      files,
      readings: a.totals.readings,
      years: a.years,
      ghats: a.ghats.length,
      ranked: a.ranked.length,
      unranked: a.unranked.length,
      notSampled: a.totals.notSampled,
      belowDetectionLimit: a.totals.bdl,
      aiDraftReadings: a.totals.aiDraft,
      criticalGhats: a.ranked.filter((g) => g.tier === "critical").length,
      doReadings: a.totals.doValid,
      doBelowLimit: a.totals.doFail,
      bodReadings: a.totals.bodValid,
      bodAboveLimit: a.totals.bodFail,
    },
    ranked: a.ranked.map((g) => ({
      rank: g.rank!,
      rankMin: g.rankMin!,
      rankMax: g.rankMax!,
      name: g.site,
      nameHi: g.nameHi,
      waterBody: g.waterBody,
      tier: en.tier[g.tier!],
      riskScore: g.riskScore,
      dataConfidence: en.confidence[g.confidence],
      scoredReadings: g.coverage.valid,
      expectedReadings: g.coverage.expected,
      do: {
        readings: g.stats.do.valid,
        belowLimit: g.stats.do.fail,
        lowest: g.stats.do.min,
        zeroReadings: g.stats.do.zero,
        below1: g.stats.do.anoxic,
      },
      bod: { readings: g.stats.bod.valid, aboveLimit: g.stats.bod.fail, highest: g.stats.bod.max },
      ph: {
        readings: g.stats.ph.valid,
        outsideRange: g.stats.ph.out,
        lowest: g.stats.ph.min,
        highest: g.stats.ph.max,
      },
      afterOneWeek: { readings: g.stats.after.valid, outsideLimit: g.stats.after.fail },
      beforeImmersion: { readings: g.stats.pre.valid, outsideLimit: g.stats.pre.fail },
      missingTables: g.coverage.missingTables,
      suggestedActions: g.actions.map((id) => en.action[id]),
      mayBeTwoPlaces: g.ambiguous,
    })),
    cannotBeRanked: a.unranked.map((g) => ({
      name: g.site,
      nameHi: g.nameHi,
      why: insufficientText(g, en),
      scoredReadings: g.coverage.valid,
    })),
    source: `MPPCB immersion monitoring reports ${a.years.join(", ")}`,
  };
}

export function copyText(t: BriefTexts): string {
  return `${t.en}\n\n--------------------\n\n${t.hi}\n\n(${hi.hindiReview})`;
}
