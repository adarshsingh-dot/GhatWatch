// Data contract shared by the upload pipeline, the UI, the brief and the AI gate.

export type Festival = "Ganesh" | "Durga";
export type Phase = "pre" | "during" | "after";
export type ScoredParam = "DO" | "BOD" | "pH";
/** "value" = a number was printed. BDL / ND = very low, not zero, not missing. */
export type ReadingState = "value" | "BDL" | "ND" | "not_sampled";

export interface Reading {
  id: string;
  year: number;
  festival: Festival;
  site: string;
  waterBody: string;
  phase: Phase;
  parameter: string;
  /** Set only for the three parameters that have a Class B limit. */
  scored: ScoredParam | null;
  state: ReadingState;
  value: number | null;
  unit: string;
  valueAsPrinted: string;
  siteAsPrinted: string;
  confidence: "high" | "medium";
  sourcePage: number | null;
  sourceFile: string;
  /** "pdf-ai" rows were read out of a PDF by a model and are a draft until a person checks them. */
  origin: "csv" | "pdf-ai";
  /** Set when the number is implausible (for example pH 19). Shown, never scored. */
  suspect?: string;
}

export interface ValidationIssue {
  level: "error" | "warning" | "info";
  file: string;
  row?: number;
  code: string;
  message: string;
}

export interface ParsedFile {
  file: string;
  rowsRead: number;
  rowsAccepted: number;
  readings: Reading[];
  issues: ValidationIssue[];
}

export type Tier = "critical" | "high" | "moderate" | "lower";
export type Confidence = "high" | "medium" | "low";
export type ActionId = "aeration" | "cleaning" | "ph" | "test";
export type VariantId = "default" | "equalYears" | "durgaOnly" | "worstCase";
export type InsufficientCode = "fewReadings" | "noDuringDO" | "noDuringBOD";

export interface ParamStats {
  do: { valid: number; fail: number; min: number | null; zero: number; anoxic: number };
  bod: { valid: number; fail: number; max: number | null; failDuringAfter: number };
  ph: { valid: number; out: number; min: number | null; max: number | null };
  after: { valid: number; fail: number };
  pre: { valid: number; fail: number };
  validTotal: number;
  failTotal: number;
  /** Scored-parameter readings that exist as rows but have no usable number. */
  notSampled: number;
  /** BDL / ND / implausible readings on a scored parameter: shown, not scored. */
  unscorable: number;
}

export interface SubsetScore {
  riskScore: number;
  severity: number;
  exceedance: number;
  worst: number;
  recoveryFail: number | null;
  stats: ParamStats;
  insufficient: InsufficientCode[];
  tier: Tier | null;
}

export interface GhatScore extends SubsetScore {
  site: string;
  /** Short distinctive name used to find the ghat inside brief text. */
  key: string;
  nameHi: string | null;
  keyHi: string | null;
  waterBody: string;
  ranked: boolean;
  rank: number | null;
  rankMin: number | null;
  rankMax: number | null;
  variantRanks: Record<VariantId, number | null>;
  tierChanges: boolean;
  confidence: Confidence;
  coverage: {
    valid: number;
    expected: number;
    ratio: number;
    tables: number;
    totalTables: number;
    missingTables: string[];
  };
  actions: ActionId[];
  /** Some rows matched this ghat with medium confidence: it may be two places. */
  ambiguous: boolean;
  split: Record<Festival, SubsetScore | null>;
  aiDraftCount: number;
}

export interface Analysis {
  ghats: GhatScore[];
  ranked: GhatScore[];
  unranked: GhatScore[];
  festivalYears: string[];
  years: number[];
  latestYear: number;
  totals: {
    readings: number;
    notSampled: number;
    bdl: number;
    suspect: number;
    aiDraft: number;
    doValid: number;
    doFail: number;
    bodValid: number;
    bodFail: number;
  };
}

/** The only thing a model ever sees. Every number in it was computed by code. */
export interface Facts {
  prepared: string;
  visarjan: string;
  daysToVisarjan: number;
  benchmark: { name: string; doMin: number; bodMax: number; phMin: number; phMax: number };
  dataset: {
    files: string[];
    readings: number;
    years: number[];
    ghats: number;
    ranked: number;
    unranked: number;
    notSampled: number;
    belowDetectionLimit: number;
    aiDraftReadings: number;
    criticalGhats: number;
    doReadings: number;
    doBelowLimit: number;
    bodReadings: number;
    bodAboveLimit: number;
  };
  ranked: Array<{
    rank: number;
    rankMin: number;
    rankMax: number;
    name: string;
    nameHi: string | null;
    waterBody: string;
    tier: string;
    riskScore: number;
    dataConfidence: string;
    scoredReadings: number;
    expectedReadings: number;
    do: { readings: number; belowLimit: number; lowest: number | null; zeroReadings: number; below1: number };
    bod: { readings: number; aboveLimit: number; highest: number | null };
    ph: { readings: number; outsideRange: number; lowest: number | null; highest: number | null };
    afterOneWeek: { readings: number; outsideLimit: number };
    beforeImmersion: { readings: number; outsideLimit: number };
    missingTables: string[];
    suggestedActions: string[];
    mayBeTwoPlaces: boolean;
  }>;
  cannotBeRanked: Array<{ name: string; nameHi: string | null; why: string; scoredReadings: number }>;
  source: string;
}

export interface BriefTexts {
  summary_en: string;
  summary_hi: string;
  en: string;
  hi: string;
}

export interface GateIssue {
  code:
    | "unsupported_number"
    | "forbidden_wording"
    | "wrong_order"
    | "missing_unranked"
    | "en_hi_mismatch"
    | "devanagari_digits"
    | "auditor_rejected"
    | "empty";
  where: keyof BriefTexts | "audit";
  detail: string;
}

export interface GateResult {
  ok: boolean;
  issues: GateIssue[];
}

export interface AuditResult {
  ok: boolean;
  issues: Array<{ type: string; quote: string }>;
}

export interface AiBriefResponse {
  provider: string;
  writerModel: string;
  auditorModel: string;
  brief: BriefTexts;
  audit: AuditResult;
  latencyMs: { writer: number; auditor: number };
}
