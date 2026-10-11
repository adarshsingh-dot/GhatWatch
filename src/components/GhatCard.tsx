import { LIMITS, REPORT_URLS } from "../config";
import { en } from "../i18n/en";
import { detailNotes, fmt, insufficientText, reasonText } from "../lib/brief";
import { fails } from "../lib/scoring";
import type { Analysis, Festival, GhatScore, Phase, Reading, ScoredParam, Tier } from "../types";

const TIER_ICON: Record<Tier, string> = { critical: "▲▲", high: "▲", moderate: "◆", lower: "●" };
const PHASES: Phase[] = ["pre", "during", "after"];
const PARAMS: ScoredParam[] = ["DO", "BOD", "pH"];
const LIMIT_TEXT: Record<ScoredParam, string> = {
  DO: `${LIMITS.doMin} or more`,
  BOD: `${LIMITS.bodMax} or less`,
  pH: `${LIMITS.phMin} to ${LIMITS.phMax}`,
};

function cellText(r: Reading): string {
  if (r.state === "not_sampled") return "not sampled";
  if (r.state !== "value") return r.state;
  return fmt(r.value);
}

function resultText(r: Reading): { text: string; cls: string } {
  if (r.state === "not_sampled") return { text: "Missing", cls: "missing" };
  if (r.state !== "value" || r.value === null) return { text: "Not scored", cls: "missing" };
  if (r.suspect) return { text: `Not scored: ${r.suspect}`, cls: "missing" };
  return fails(r.scored!, r.value) ? { text: "✗ Outside limit", cls: "fail" } : { text: "✓ Within limit", cls: "pass" };
}

function SourceLink({ r }: { r: Reading }) {
  if (r.sourcePage === null) return <span>{r.sourceFile}</span>;
  const url = r.origin === "csv" ? REPORT_URLS[r.year] : undefined;
  const label = `p. ${r.sourcePage}`;
  return url ? (
    <a href={`${url}#page=${r.sourcePage}`} target="_blank" rel="noreferrer">
      {r.year} report, {label}
    </a>
  ) : (
    <span>
      {r.sourceFile}, {label}
    </span>
  );
}

/** Year x festival x phase grid: the honesty visual. Missing cells are hatched, never blank or green. */
function CoverageMatrix({ readings, festivalYears }: { readings: Reading[]; festivalYears: string[] }) {
  const find = (fy: string, phase: Phase, p: ScoredParam) =>
    readings.find((r) => `${r.festival} ${r.year}` === fy && r.phase === phase && r.scored === p);
  return (
    <div className="scroll-x">
      <table className="matrix">
        <thead>
          <tr>
            <th rowSpan={2}>Festival</th>
            {PHASES.map((ph) => (
              <th key={ph} colSpan={3}>
                {ph}
              </th>
            ))}
          </tr>
          <tr>{PHASES.flatMap((ph) => PARAMS.map((p) => <th key={ph + p}>{p}</th>))}</tr>
        </thead>
        <tbody>
          {festivalYears.map((fy) => {
            const hasTable = readings.some((r) => `${r.festival} ${r.year}` === fy);
            return (
              <tr key={fy}>
                <th scope="row">{fy}</th>
                {hasTable ? (
                  PHASES.flatMap((ph) =>
                    PARAMS.map((p) => {
                      const r = find(fy, ph, p);
                      if (!r) return <td key={ph + p} className="cell missing" title="No row">–</td>;
                      const res = resultText(r);
                      return (
                        <td key={ph + p} className={`cell ${res.cls}`} title={res.text}>
                          {r.state === "not_sampled" ? "NS" : cellText(r)}
                          {res.cls === "fail" ? " ✗" : ""}
                        </td>
                      );
                    }),
                  )
                ) : (
                  <td colSpan={9} className="cell notable">
                    No table in report
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">✗ = outside the Class B limit. NS = not sampled (hatched). Missing is never counted as a pass.</p>
    </div>
  );
}

function OtherTests({ readings }: { readings: Reading[] }) {
  const names = [...new Set(readings.filter((r) => r.scored === null).map((r) => r.parameter))];
  if (names.length === 0) return null;
  return (
    <details className="sub">
      <summary>Other tests (no Class B limit set)</summary>
      <table className="plain">
        <thead>
          <tr>
            <th>Test</th>
            <th>Highest value (unit assumed)</th>
            <th>Readings</th>
            <th>BDL</th>
            <th>Not sampled</th>
          </tr>
        </thead>
        <tbody>
          {names.map((name) => {
            const rs = readings.filter((r) => r.parameter === name);
            const vals = rs.filter((r) => r.value !== null);
            const top = vals.reduce<Reading | null>((m, r) => (m === null || r.value! > m.value! ? r : m), null);
            return (
              <tr key={name}>
                <td>{name}</td>
                <td>{top ? `${fmt(top.value)} ${top.unit}` : "–"}</td>
                <td>{vals.length}</td>
                <td>{rs.filter((r) => r.state === "BDL" || r.state === "ND").length}</td>
                <td>{rs.filter((r) => r.state === "not_sampled").length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

function ReadingsTable({ readings }: { readings: Reading[] }) {
  const order: Record<Phase, number> = { pre: 0, during: 1, after: 2 };
  const rows = readings
    .filter((r) => r.scored !== null)
    .sort(
      (a, b) =>
        b.year - a.year ||
        a.festival.localeCompare(b.festival) ||
        order[a.phase] - order[b.phase] ||
        a.parameter.localeCompare(b.parameter),
    );
  return (
    <details className="sub">
      <summary>All {rows.length} DO, BOD and pH readings with source pages</summary>
      <div className="scroll-x">
        <table className="plain">
          <thead>
            <tr>
              <th>Year</th>
              <th>Festival</th>
              <th>Phase</th>
              <th>Test</th>
              <th>Value (unit assumed)</th>
              <th>Limit</th>
              <th>Result</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const res = resultText(r);
              return (
                <tr key={r.id}>
                  <td>{r.year}</td>
                  <td>{r.festival}</td>
                  <td>{r.phase}</td>
                  <td>{r.scored}</td>
                  <td className={r.state === "value" ? "" : "cell missing"}>
                    {cellText(r)} {r.state === "value" ? r.unit : ""}
                    {r.confidence === "medium" ? <span title="Site matched with medium confidence"> ◐</span> : null}
                    {r.origin === "pdf-ai" ? <span className="tag draft">AI-read</span> : null}
                  </td>
                  <td>{LIMIT_TEXT[r.scored!]}</td>
                  <td className={res.cls}>{res.text}</td>
                  <td>
                    <SourceLink r={r} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Split({ g }: { g: GhatScore }) {
  const part = (f: Festival) => {
    const s = g.split[f];
    if (!s) return `${f}: no readings`;
    return `${f} readings only: risk score ${s.riskScore}${s.tier ? `, ${en.tier[s.tier]}` : ", too few readings to rank"}`;
  };
  return (
    <p className="banner warn">
      ⚠ {en.twoPlaces} Ganesh tables print this site as a kund and Durga tables as a lake ghat. {part("Ganesh")}.{" "}
      {part("Durga")}.
    </p>
  );
}

export function GhatCard({ g, readings, analysis }: { g: GhatScore; readings: Reading[]; analysis: Analysis }) {
  return (
    <article className={`card ${g.tier ?? "unranked"}`}>
      <header className="card-head">
        <div className="rank" aria-label={g.ranked ? `Rank ${g.rank}` : "Not ranked"}>
          {g.ranked ? g.rank : "?"}
        </div>
        <div className="card-title">
          <h3>{g.site}</h3>
          <p className="muted">
            {g.waterBody}
            {g.ranked && g.rankMin !== g.rankMax ? ` · rank ${g.rankMin} to ${g.rankMax} across scoring methods` : ""}
            {g.ranked && g.rankMin === g.rankMax ? " · same rank under all scoring methods" : ""}
          </p>
        </div>
      </header>
      <p className="badges">
        {g.tier ? (
          <span className={`badge tier-${g.tier}`}>
            {TIER_ICON[g.tier]} {en.tier[g.tier]}
          </span>
        ) : (
          <span className="badge tier-unranked">? Cannot be ranked</span>
        )}
        <span className="badge conf">Data confidence: {en.confidence[g.confidence]}</span>
        {g.ranked ? <span className="badge conf">Risk score {g.riskScore} / 100</span> : null}
        {g.aiDraftCount > 0 ? <span className="badge draft">{g.aiDraftCount} AI-read readings</span> : null}
      </p>
      <p className="reason">
        {g.ranked ? reasonText(g, en) : `Not ranked: ${insufficientText(g, en)}. ${reasonText(g, en)}`}
      </p>
      <ul className="actions">
        {g.actions.map((id) => (
          <li key={id} title={en.actionWhy[id]}>
            <strong>{en.action[id]}</strong>
            <span className="muted"> {en.actionWhy[id]}</span>
          </li>
        ))}
      </ul>
      <details className="detail">
        <summary>Show every number behind this {g.ranked ? "rank" : "ghat"}</summary>
        {g.ambiguous ? <Split g={g} /> : null}
        {detailNotes(g, en).map((n) => (
          <p key={n} className="note">
            {n}
          </p>
        ))}
        <CoverageMatrix readings={readings} festivalYears={analysis.festivalYears} />
        <ReadingsTable readings={readings} />
        <OtherTests readings={readings} />
      </details>
    </article>
  );
}
