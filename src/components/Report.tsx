import { VISARJAN_LABEL } from "../config";
import { en, type Strings } from "../i18n/en";
import { hi } from "../i18n/hi";
import { bodSentence, doSentence, formatDate, insufficientText } from "../lib/brief";
import type { Analysis, BriefTexts } from "../types";

interface Props {
  analysis: Analysis;
  texts: BriefTexts;
  lang: "en" | "hi";
  today: Date;
  fileCount: number;
  warningCount: number;
  /** Provider label when the wording came from a model and passed the gate; null for the template. */
  aiProvider: string | null;
}

function Footer({ s, aiProvider }: { s: Strings; aiProvider: string | null }) {
  return (
    <p className="pdf-foot">
      {aiProvider ? s.aiLabel(aiProvider) : ""} {s.lang === "hi" ? s.hindiReview : ""}
    </p>
  );
}

/** The officer summary plus the English and Hindi briefs, one A4 page each. Used for PDF and print. */
export function Report({ analysis: a, texts, lang, today, fileCount, warningCount, aiProvider }: Props) {
  const s = lang === "hi" ? hi : en;
  return (
    <>
      <section className="pdf-page" lang={lang}>
        <h1>{s.summaryTitle}</h1>
        <p className="pdf-meta">{s.prepared(formatDate(today), VISARJAN_LABEL)}</p>
        <h2>{s.inShortHead}</h2>
        <p>{lang === "hi" ? texts.summary_hi : texts.summary_en}</p>

        <h2>{s.priorityHead}</h2>
        <table className="pdf-table">
          <thead>
            <tr>
              <th>{s.col.rank}</th>
              <th>{s.col.ghat}</th>
              <th>{s.col.tier}</th>
              <th>{s.col.readings}</th>
              <th>{s.col.action}</th>
            </tr>
          </thead>
          <tbody>
            {a.ranked.map((g) => (
              <tr key={g.site}>
                <td>{s.rankRange(g.rank!, g.rankMin!, g.rankMax!)}</td>
                <td>
                  <strong>{s.ghatName(g.site, g.nameHi)}</strong>
                  {g.waterBody ? <div className="pdf-sub">{g.waterBody}</div> : null}
                  {g.ambiguous ? <div className="pdf-sub">{s.twoPlaces}</div> : null}
                </td>
                <td>
                  {s.tier[g.tier!]}
                  <div className="pdf-sub">{s.confidenceLabel(s.confidence[g.confidence])}</div>
                </td>
                <td>
                  {doSentence(g, s)} {bodSentence(g, s)}
                </td>
                <td>{g.actions.map((id) => s.action[id]).join("; ")}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>{s.unrankedHead}</h2>
        {a.unranked.length === 0 ? (
          <p>{s.unrankedNone(a.ghats.length)}</p>
        ) : (
          <ul>
            {a.unranked.map((g) => (
              <li key={g.site}>
                <strong>{s.ghatName(g.site, g.nameHi)}</strong>: {insufficientText(g, s)}
              </li>
            ))}
          </ul>
        )}

        <h2>{s.dataChecksHead}</h2>
        <p>{s.dataChecks(fileCount, a.totals.readings, a.totals.notSampled, a.totals.bdl, warningCount)}</p>

        <h2>{s.notShownHead}</h2>
        <p>
          {s.notShown(a.totals.notSampled)} {a.totals.aiDraft > 0 ? s.aiDraftNote(a.totals.aiDraft) : ""}
        </p>
        <p className="pdf-meta">{s.source(a.years.join(", "))}</p>
        <Footer s={s} aiProvider={aiProvider} />
      </section>

      <section className="pdf-page" lang="en">
        <pre className="pdf-brief">{texts.en}</pre>
        <Footer s={en} aiProvider={aiProvider} />
      </section>

      <section className="pdf-page" lang="hi">
        <pre className="pdf-brief">{texts.hi}</pre>
        <Footer s={hi} aiProvider={aiProvider} />
      </section>
    </>
  );
}
