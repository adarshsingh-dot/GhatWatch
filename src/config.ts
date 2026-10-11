// Single place for limits, weights, dates and report links. Change values here only.

export const VISARJAN_DATE = "2026-10-20";
export const VISARJAN_LABEL = "20 Oct 2026";

/** CPCB Class B, outdoor bathing (organised). Our benchmark, and our assumption. */
export const LIMITS = { doMin: 5, bodMax: 3, phMin: 6.5, phMax: 8.5 } as const;
export const BENCHMARK_NAME = "CPCB Class B (outdoor bathing)";

export const PARAM_WEIGHTS = { DO: 0.4, BOD: 0.4, pH: 0.2 } as const;
/** Latest year in the data weighs 1.0; each earlier year 0.2 less, never below 0.2. */
export const YEAR_STEP = 0.2;
export const YEAR_FLOOR = 0.2;

export const RISK_WEIGHTS = { severity: 0.45, exceedance: 0.25, worst: 0.2, recovery: 0.1 } as const;

/** Tier cut-offs on the 0-100 risk score. Any DO reading below 1 mg/l is Critical regardless. */
export const TIER_CUTS = { critical: 50, high: 35, moderate: 20 } as const;
export const ANOXIC_BELOW = 1;

export const CONFIDENCE_CUTS = { high: 0.75, medium: 0.4 } as const;
export const MIN_VALID_READINGS = 6;

/** Official MPPCB reports. Linked only, never fetched. */
export const REPORT_URLS: Record<number, string> = {
  2025: "https://www.mppcb.mp.gov.in/proc/mon/Ganesh_and_Durga_visarjan_report-2025.pdf",
  2024: "https://www.mppcb.mp.gov.in/proc/mon/Ganesh_and_Durga_visarjan_report-2024.pdf",
  2023: "https://www.mppcb.mp.gov.in/proc/mon/Idol_immer._Report_23_CPCB.pdf",
};

export interface KnownGhat {
  site: string;
  key: string;
  nameHi: string;
  keyHi: string;
}

/** Hindi names NEED NATIVE-SPEAKER REVIEW BEFORE USE. */
export const KNOWN_GHATS: KnownGhat[] = [
  { site: "Khatlapura ghat", key: "Khatlapura", nameHi: "खटलापुरा घाट", keyHi: "खटलापुरा" },
  { site: "Bairagarh (Sant Hirdaram) kund", key: "Bairagarh", nameHi: "बैरागढ़ (संत हिरदाराम) कुंड", keyHi: "बैरागढ़" },
  { site: "Prempura ghat", key: "Prempura", nameHi: "प्रेमपुरा घाट", keyHi: "प्रेमपुरा" },
  { site: "Rani Kamlapati ghat / Kamla Park kund", key: "Kamlapati", nameHi: "रानी कमलापति घाट / कमला पार्क कुंड", keyHi: "कमलापति" },
  { site: "Hathaikheda dam / kund", key: "Hathaikheda", nameHi: "हथाईखेड़ा डैम / कुंड", keyHi: "हथाईखेड़ा" },
  { site: "Malikhedi kund", key: "Malikhedi", nameHi: "मालीखेड़ी कुंड", keyHi: "मालीखेड़ी" },
  { site: "Shahpura lake ghat", key: "Shahpura", nameHi: "शाहपुरा झील घाट", keyHi: "शाहपुरा" },
];
