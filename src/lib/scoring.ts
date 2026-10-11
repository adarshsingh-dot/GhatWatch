// Pure scoring functions. No I/O. Every number shown anywhere in the tool comes from here.
import {
  ANOXIC_BELOW,
  CONFIDENCE_CUTS,
  KNOWN_GHATS,
  LIMITS,
  MIN_VALID_READINGS,
  PARAM_WEIGHTS,
  RISK_WEIGHTS,
  TIER_CUTS,
  YEAR_FLOOR,
  YEAR_STEP,
} from "../config";
import type {
  ActionId,
  Analysis,
  Confidence,
  Festival,
  GhatScore,
  InsufficientCode,
  ParamStats,
  Reading,
  ScoredParam,
  SubsetScore,
  Tier,
  VariantId,
} from "../types";

/** Severity of one reading against its Class B limit. 0 = within the limit, 1 = worst. */
export function severity(param: ScoredParam, v: number): number {
  if (param === "DO") return v >= LIMITS.doMin ? 0 : Math.min(1, (LIMITS.doMin - v) / LIMITS.doMin);
  if (param === "BOD") return v <= LIMITS.bodMax ? 0 : Math.min(1, Math.log10(v / LIMITS.bodMax));
  const d = v < LIMITS.phMin ? LIMITS.phMin - v : v > LIMITS.phMax ? v - LIMITS.phMax : 0;
  return Math.min(1, d / 1.5);
}

export function fails(param: ScoredParam, v: number): boolean {
  return severity(param, v) > 0;
}

/** A reading can be scored only if it is a plausible printed number on DO, BOD or pH. */
export function isScorable(r: Reading): r is Reading & { scored: ScoredParam; value: number } {
  return r.scored !== null && r.state === "value" && r.value !== null && !r.suspect;
}

export function yearWeight(year: number, latestYear: number, equal: boolean): number {
  if (equal) return 1;
  return Math.max(YEAR_FLOOR, 1 - YEAR_STEP * (latestYear - year));
}

export function tierFor(riskScore: number, anoxic: number): Tier {
  if (anoxic > 0 || riskScore >= TIER_CUTS.critical) return "critical";
  if (riskScore >= TIER_CUTS.high) return "high";
  if (riskScore >= TIER_CUTS.moderate) return "moderate";
  return "lower";
}

export function confidenceFor(ratio: number): Confidence {
  if (ratio >= CONFIDENCE_CUTS.high) return "high";
  if (ratio >= CONFIDENCE_CUTS.medium) return "medium";
  return "low";
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Score one set of readings (one ghat, or one ghat restricted to a festival). */
export function scoreSubset(readings: Reading[], latestYear: number, equalYears = false): SubsetScore {
  const stats: ParamStats = {
    do: { valid: 0, fail: 0, min: null, zero: 0, anoxic: 0 },
    bod: { valid: 0, fail: 0, max: null, failDuringAfter: 0 },
    ph: { valid: 0, out: 0, min: null, max: null },
    after: { valid: 0, fail: 0 },
    pre: { valid: 0, fail: 0 },
    validTotal: 0,
    failTotal: 0,
    notSampled: 0,
    unscorable: 0,
  };
  let weighted = 0;
  let weightSum = 0;
  let worst = 0;
  let duringDO = 0;
  let duringBOD = 0;

  for (const r of readings) {
    if (r.scored === null) continue;
    if (!isScorable(r)) {
      // Missing is never clean: these add nothing to any numerator or denominator.
      if (r.state === "not_sampled") stats.notSampled++;
      else stats.unscorable++;
      continue;
    }
    const s = severity(r.scored, r.value);
    const failed = s > 0;
    const w = PARAM_WEIGHTS[r.scored] * yearWeight(r.year, latestYear, equalYears);
    weighted += w * s;
    weightSum += w;
    worst = Math.max(worst, s);
    stats.validTotal++;
    if (failed) stats.failTotal++;
    if (r.phase === "after") {
      stats.after.valid++;
      if (failed) stats.after.fail++;
    }
    if (r.phase === "pre") {
      stats.pre.valid++;
      if (failed) stats.pre.fail++;
    }
    if (r.scored === "DO") {
      stats.do.valid++;
      if (failed) stats.do.fail++;
      if (r.value === 0) stats.do.zero++;
      if (r.value < ANOXIC_BELOW) stats.do.anoxic++;
      stats.do.min = stats.do.min === null ? r.value : Math.min(stats.do.min, r.value);
      if (r.phase === "during") duringDO++;
    } else if (r.scored === "BOD") {
      stats.bod.valid++;
      if (failed) stats.bod.fail++;
      if (failed && r.phase !== "pre") stats.bod.failDuringAfter++;
      stats.bod.max = stats.bod.max === null ? r.value : Math.max(stats.bod.max, r.value);
      if (r.phase === "during") duringBOD++;
    } else {
      stats.ph.valid++;
      if (failed) stats.ph.out++;
      stats.ph.min = stats.ph.min === null ? r.value : Math.min(stats.ph.min, r.value);
      stats.ph.max = stats.ph.max === null ? r.value : Math.max(stats.ph.max, r.value);
    }
  }

  const severityScore = weightSum > 0 ? weighted / weightSum : 0;
  const exceedance = stats.validTotal > 0 ? stats.failTotal / stats.validTotal : 0;
  const recoveryFail = stats.after.valid >= 2 ? stats.after.fail / stats.after.valid : null;
  const riskScore = round1(
    100 *
      (RISK_WEIGHTS.severity * severityScore +
        RISK_WEIGHTS.exceedance * exceedance +
        RISK_WEIGHTS.worst * worst +
        RISK_WEIGHTS.recovery * (recoveryFail ?? 0)),
  );

  const insufficient: InsufficientCode[] = [];
  if (stats.validTotal < MIN_VALID_READINGS) insufficient.push("fewReadings");
  if (duringDO === 0) insufficient.push("noDuringDO");
  if (duringBOD === 0) insufficient.push("noDuringBOD");

  return {
    riskScore,
    severity: severityScore,
    exceedance,
    worst,
    recoveryFail,
    stats,
    insufficient,
    tier: insufficient.length ? null : tierFor(riskScore, stats.do.anoxic),
  };
}

function actionsFor(s: SubsetScore, confidence: Confidence): ActionId[] {
  const out: ActionId[] = [];
  if (s.stats.do.fail > 0 || s.stats.do.anoxic > 0) out.push("aeration");
  if (s.stats.bod.failDuringAfter > 0) out.push("cleaning");
  if (s.stats.ph.out > 0) out.push("ph");
  if (s.insufficient.length > 0 || confidence === "low") out.push("test");
  return out;
}

function siteKey(site: string): string {
  return site.split(/[\s(/,]+/).filter(Boolean)[0] ?? site;
}

const VARIANTS: VariantId[] = ["default", "equalYears", "durgaOnly", "worstCase"];

/** Rank value for one ghat under one method, or null when that method cannot rank it. */
function variantValue(readings: Reading[], latestYear: number, v: VariantId): { value: number; tier: Tier } | null {
  const subset = v === "durgaOnly" ? readings.filter((r) => r.festival === "Durga") : readings;
  const s = scoreSubset(subset, latestYear, v === "equalYears");
  if (s.insufficient.length || s.tier === null) return null;
  return { value: v === "worstCase" ? s.worst * 100 : s.riskScore, tier: s.tier };
}

export function analyse(readings: Reading[]): Analysis {
  const years = [...new Set(readings.map((r) => r.year))].sort((a, b) => a - b);
  const latestYear = years[years.length - 1] ?? new Date().getFullYear();
  const fyKey = (r: Reading) => `${r.festival} ${r.year}`;
  const festivalYears = [...new Set(readings.map(fyKey))].sort(
    (a, b) => Number(a.slice(-4)) - Number(b.slice(-4)) || b.localeCompare(a),
  );

  const bySite = new Map<string, Reading[]>();
  for (const r of readings) {
    const list = bySite.get(r.site);
    if (list) list.push(r);
    else bySite.set(r.site, [r]);
  }

  const ghats: GhatScore[] = [];
  const variantValues = new Map<string, Record<VariantId, { value: number; tier: Tier } | null>>();

  for (const [site, rs] of bySite) {
    const base = scoreSubset(rs, latestYear);
    const tablesHere = new Set(rs.map(fyKey));
    const expected = tablesHere.size * 9; // 3 phases x 3 scored parameters per festival-year table
    const ratio = expected > 0 ? Math.min(1, base.stats.validTotal / expected) : 0;
    const confidence = confidenceFor(ratio);
    const known = KNOWN_GHATS.find((g) => g.site.toLowerCase() === site.toLowerCase());
    const split = {} as Record<Festival, SubsetScore | null>;
    for (const f of ["Ganesh", "Durga"] as Festival[]) {
      const sub = rs.filter((r) => r.festival === f);
      split[f] = sub.length ? scoreSubset(sub, latestYear) : null;
    }
    variantValues.set(
      site,
      Object.fromEntries(VARIANTS.map((v) => [v, variantValue(rs, latestYear, v)])) as Record<
        VariantId,
        { value: number; tier: Tier } | null
      >,
    );
    ghats.push({
      ...base,
      site,
      key: known?.key ?? siteKey(site),
      nameHi: known?.nameHi ?? null,
      keyHi: known?.keyHi ?? null,
      waterBody: rs.find((r) => r.waterBody)?.waterBody.replace(/\s*\(as printed.*\)$/i, "") ?? "",
      ranked: base.insufficient.length === 0,
      rank: null,
      rankMin: null,
      rankMax: null,
      variantRanks: { default: null, equalYears: null, durgaOnly: null, worstCase: null },
      tierChanges: false,
      confidence,
      coverage: {
        valid: base.stats.validTotal,
        expected,
        ratio,
        tables: tablesHere.size,
        totalTables: festivalYears.length,
        missingTables: festivalYears.filter((fy) => !tablesHere.has(fy)),
      },
      actions: actionsFor(base, confidence),
      ambiguous: rs.some((r) => r.confidence === "medium" && r.origin === "csv"),
      split,
      aiDraftCount: rs.filter((r) => r.origin === "pdf-ai").length,
    });
  }

  // Rank under each method. Only ghats that the default method can rank get ranks at all.
  const rankable = ghats.filter((g) => g.ranked);
  // Tier comes first, then the score, so a ghat that is Critical because of a near-zero
  // oxygen reading is never listed below a ghat in a lower tier.
  const tierOrder: Record<Tier, number> = { critical: 0, high: 1, moderate: 2, lower: 3 };
  for (const v of VARIANTS) {
    const order = rankable
      .filter((g) => variantValues.get(g.site)![v] !== null)
      .sort(
        (a, b) =>
          (v === "worstCase"
            ? 0
            : tierOrder[variantValues.get(a.site)![v]!.tier] - tierOrder[variantValues.get(b.site)![v]!.tier]) ||
          variantValues.get(b.site)![v]!.value - variantValues.get(a.site)![v]!.value ||
          b.riskScore - a.riskScore ||
          a.site.localeCompare(b.site),
      );
    order.forEach((g, i) => (g.variantRanks[v] = i + 1));
  }
  for (const g of rankable) {
    const ranks = VARIANTS.map((v) => g.variantRanks[v]).filter((n): n is number => n !== null);
    g.rank = g.variantRanks.default;
    g.rankMin = Math.min(...ranks);
    g.rankMax = Math.max(...ranks);
    const tiers = (["default", "equalYears", "durgaOnly"] as VariantId[])
      .map((v) => variantValues.get(g.site)![v]?.tier)
      .filter(Boolean);
    g.tierChanges = new Set(tiers).size > 1;
  }

  const ranked = rankable.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const unranked = ghats.filter((g) => !g.ranked).sort((a, b) => a.site.localeCompare(b.site));
  const scorable = readings.filter(isScorable);
  const count = (p: ScoredParam, failed?: boolean) =>
    scorable.filter((r) => r.scored === p && (failed === undefined || fails(p, r.value) === failed)).length;

  return {
    ghats,
    ranked,
    unranked,
    festivalYears,
    years,
    latestYear,
    totals: {
      readings: readings.length,
      notSampled: readings.filter((r) => r.state === "not_sampled").length,
      bdl: readings.filter((r) => r.state === "BDL" || r.state === "ND").length,
      suspect: readings.filter((r) => r.suspect).length,
      aiDraft: readings.filter((r) => r.origin === "pdf-ai").length,
      doValid: count("DO"),
      doFail: count("DO", true),
      bodValid: count("BOD"),
      bodFail: count("BOD", true),
    },
  };
}
