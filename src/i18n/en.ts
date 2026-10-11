import type { ActionId, Confidence, InsufficientCode, Tier } from "../types";

export interface Strings {
  lang: "en" | "hi";
  tier: Record<Tier, string>;
  confidence: Record<Confidence, string>;
  action: Record<ActionId, string>;
  actionWhy: Record<ActionId, string>;
  insufficient: Record<InsufficientCode, string>;
  ghatName(site: string, nameHi: string | null): string;
  doZero(n: number): string;
  doLow(fail: number, valid: number, min: string): string;
  doOk(valid: number): string;
  bodHigh(fail: number, valid: number, max: string): string;
  bodOk(valid: number): string;
  phOut(out: number, valid: number): string;
  preFail(fail: number, valid: number): string;
  coverage(conf: string, valid: number, expected: number, missing: string[]): string;
  tierChange: string;
  twoPlaces: string;
  briefTitle: string;
  prepared(date: string, visarjan: string): string;
  basedOn(readings: number, ghats: number, y0: number, y1: number): string;
  priorityHead: string;
  confidenceLabel(conf: string): string;
  unrankedHead: string;
  unrankedNone(n: number): string;
  actionsHead: string;
  notShownHead: string;
  notShown(notSampled: number): string;
  aiDraftNote(n: number): string;
  source(years: string): string;
  summaryTitle: string;
  inShortHead: string;
  inShort(a: {
    ghats: number;
    ranked: number;
    unranked: number;
    critical: number;
    criticalNames: string;
    doFail: number;
    doValid: number;
    bodFail: number;
    bodValid: number;
    notSampled: number;
  }): string;
  col: { rank: string; ghat: string; tier: string; confidence: string; readings: string; action: string };
  rankRange(rank: number, min: number, max: number): string;
  dataChecksHead: string;
  dataChecks(files: number, readings: number, notSampled: number, bdl: number, warnings: number): string;
  hindiReview: string;
  aiLabel(provider: string): string;
}

export const en: Strings = {
  lang: "en",
  tier: {
    critical: "Critical",
    high: "High",
    moderate: "Moderate",
    lower: "Lower concern in sampled readings",
  },
  confidence: { high: "High", medium: "Medium", low: "Low" },
  action: {
    aeration: "Aeration priority",
    cleaning: "Cleaning / organic waste removal priority",
    ph: "Re-check pH",
    test: "Test before visarjan",
  },
  actionWhy: {
    aeration: "Suggested because dissolved oxygen was below 5 mg/l in at least one reading.",
    cleaning: "Suggested because BOD was above 3 mg/l during or after immersion.",
    ph: "Suggested because pH was outside 6.5 to 8.5 in at least one reading.",
    test: "Suggested because there are too few readings to judge this ghat.",
  },
  insufficient: {
    fewReadings: "fewer than 6 usable readings",
    noDuringDO: "no dissolved oxygen reading during immersion",
    noDuringBOD: "no BOD reading during immersion",
  },
  ghatName: (site) => site,
  doZero: (n) => `Dissolved oxygen was 0 mg/l in ${n} reading${n === 1 ? "" : "s"} (limit: 5 or more).`,
  doLow: (fail, valid, min) =>
    `Dissolved oxygen was below the 5 mg/l limit in ${fail} of ${valid} readings (lowest ${min} mg/l).`,
  doOk: (valid) =>
    `Dissolved oxygen was within the limit in ${valid === 1 ? "the only reading" : `all ${valid} readings`}.`,
  bodHigh: (fail, valid, max) =>
    `BOD was above the 3 mg/l limit in ${fail} of ${valid} readings (highest ${max} mg/l).`,
  bodOk: (valid) => `BOD was within the limit in ${valid === 1 ? "the only reading" : `all ${valid} readings`}.`,
  phOut: (out, valid) => `pH was outside 6.5 to 8.5 in ${out} of ${valid} readings.`,
  preFail: (fail, valid) =>
    `Already outside the limit before immersion in ${fail} of ${valid} pre-immersion readings.`,
  coverage: (conf, valid, expected, missing) =>
    `Data coverage: ${conf.toLowerCase()} (${valid} of ${expected} expected readings` +
    (missing.length ? `; no table in the report for ${missing.join(", ")}` : "") +
    ").",
  tierChange: "The tier changes between scoring methods, so treat this rank as a close call.",
  twoPlaces: "May be two different places. Confirm with BMC before acting.",
  briefTitle: "VISARJAN GHAT WATCH, BHOPAL: OFFICER BRIEF",
  prepared: (date, visarjan) => `Prepared: ${date}. Durga visarjan: ${visarjan}.`,
  basedOn: (readings, ghats, y0, y1) =>
    `Based on ${readings} uploaded readings at ${ghats} ghats, ${y0 === y1 ? y0 : `${y0} to ${y1}`}.`,
  priorityHead: "PRIORITY GHATS (ranked on past water tests)",
  confidenceLabel: (conf) => `Data confidence: ${conf.toLowerCase()}.`,
  unrankedHead: "CANNOT BE RANKED: TEST BEFORE VISARJAN",
  unrankedNone: (n) => `None. All ${n} ghats had enough readings to rank.`,
  actionsHead: "SUGGESTED ACTIONS (suggestions only; the officer decides)",
  notShownHead: "WHAT THIS DOES NOT SHOW",
  notShown: (notSampled) =>
    `Sampled readings only; ${notSampled} readings were not sampled and are not counted as passing. ` +
    `No health conclusions. The benchmark is CPCB Class B (outdoor bathing), which is our assumption. ` +
    `Units are assumed; the reports print none.`,
  aiDraftNote: (n) =>
    `${n} readings were read from a PDF by an AI model; confirm them against the report before acting.`,
  source: (years) => `Source: MPPCB immersion monitoring reports ${years}.`,
  summaryTitle: "Visarjan Ghat Watch, Bhopal: summary for the officer",
  inShortHead: "In short",
  inShort: (a) =>
    `${a.ghats} ghats were found in the uploaded readings; ${a.ranked} could be ranked and ${a.unranked} could not. ` +
    (a.critical > 0
      ? `${a.critical} ${a.critical === 1 ? "is" : "are"} in the Critical tier: ${a.criticalNames}. `
      : "") +
    `Across all ghats, dissolved oxygen was below the 5 mg/l limit in ${a.doFail} of ${a.doValid} readings ` +
    `and BOD was above the 3 mg/l limit in ${a.bodFail} of ${a.bodValid} readings. ` +
    `${a.notSampled} readings were not sampled; they are shown as missing and are not counted as passing.`,
  col: {
    rank: "Rank",
    ghat: "Ghat",
    tier: "Tier",
    confidence: "Data confidence",
    readings: "What the readings show",
    action: "Suggested action",
  },
  rankRange: (rank, min, max) => (min === max ? `${rank}` : `${rank} (range ${min} to ${max} across methods)`),
  dataChecksHead: "Checks on the uploaded files",
  dataChecks: (files, readings, notSampled, bdl, warnings) =>
    `${files} file${files === 1 ? "" : "s"}, ${readings} readings accepted. ${notSampled} not sampled, ` +
    `${bdl} below detection limit, ${warnings} warning${warnings === 1 ? "" : "s"} raised.`,
  hindiReview: "",
  aiLabel: (provider) => `Wording by ${provider}; every number checked by code.`,
};
