import { useMemo, useRef, useState } from "react";
import { GhatCard } from "./components/GhatCard";
import { Report } from "./components/Report";
import { BENCHMARK_NAME, VISARJAN_LABEL } from "./config";
import { hi } from "./i18n/hi";
import { buildFacts, copyText, daysUntilVisarjan, templateTexts } from "./lib/brief";
import { runGate } from "./lib/gate";
import { mergeFiles, parseCsvText } from "./lib/parse";
import { downloadPdf } from "./lib/pdf";
import { chunkPages, linesToReadings, readPdfText, relevantPages } from "./lib/pdfExtract";
import { analyse } from "./lib/scoring";
import type { AiBriefResponse, GateResult, ParsedFile, Reading } from "./types";

type AiState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "passed"; response: AiBriefResponse }
  | { status: "rejected"; response: AiBriefResponse; gate: GateResult }
  | { status: "unavailable"; message: string };

type OutputTab = "summary" | "en" | "hi";

async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; detail: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok || data === null) return { ok: false, status: res.status, detail: data?.detail ?? data?.error ?? "" };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, detail: "" };
  }
}

const AI_OFF = "The AI service is not set up on this server, so the brief written by code is used. Nothing is missing from it.";

export default function App() {
  const today = useMemo(() => new Date(), []);
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [drafts, setDrafts] = useState<ParsedFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ai, setAi] = useState<AiState>({ status: "idle" });
  const [useAi, setUseAi] = useState(true);
  const [tab, setTab] = useState<OutputTab>("summary");
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const merged = useMemo(() => mergeFiles(files), [files]);
  const analysis = useMemo(() => (merged.readings.length ? analyse(merged.readings) : null), [merged]);
  const bySite = useMemo(() => {
    const map = new Map<string, Reading[]>();
    for (const r of merged.readings) map.set(r.site, [...(map.get(r.site) ?? []), r]);
    return map;
  }, [merged]);
  const facts = useMemo(
    () => (analysis ? buildFacts(analysis, files.map((f) => f.file), today) : null),
    [analysis, files, today],
  );
  const template = useMemo(() => (analysis ? templateTexts(analysis, today) : null), [analysis, today]);
  const aiPassed = ai.status === "passed";
  const texts = aiPassed && useAi ? ai.response.brief : template;
  const aiProvider = aiPassed && useAi ? ai.response.provider : null;
  const warnings = merged.issues.filter((i) => i.level !== "info");

  function addParsed(parsed: ParsedFile) {
    setFiles((prev) => [...prev.filter((f) => f.file !== parsed.file), parsed]);
    setAi({ status: "idle" });
  }

  async function handlePdf(file: File) {
    setBusy(`Reading the text of ${file.name}…`);
    const pages = await readPdfText(file);
    if (pages.reduce((n, p) => n + p.text.length, 0) < 200) {
      setNotice(`${file.name} has no readable text (it may be a scan). Upload the readings as a CSV instead.`);
      return;
    }
    const relevant = relevantPages(pages);
    if (relevant.length === 0) {
      setNotice(`${file.name}: no page mentions Bhopal together with DO, BOD or pH.`);
      return;
    }
    const lines: string[] = [];
    const chunks = chunkPages(relevant);
    for (let i = 0; i < chunks.length; i++) {
      setBusy(`AI reader is copying readings from ${file.name} (part ${i + 1} of ${chunks.length})…`);
      const res = await postJson<{ lines: string[] }>("/api/extract", {
        fileName: file.name,
        cover: pages[0]?.text ?? "",
        pages: chunks[i],
      });
      if (!res.ok) {
        setNotice(
          res.status === 503 || res.status === 404 || res.status === 0
            ? `Reading PDFs needs the AI service, which is not set up on this server. Upload the readings as a CSV instead.`
            : `The AI reader failed on ${file.name}${res.detail ? ` (${res.detail})` : ""}. Nothing was added.`,
        );
        return;
      }
      lines.push(...res.data.lines);
    }
    const draft = linesToReadings(lines, pages, file.name);
    if (draft.readings.length === 0) {
      setNotice(`${file.name}: the AI reader found no readings that could be confirmed on the page.`);
      return;
    }
    setDrafts((prev) => [...prev.filter((d) => d.file !== file.name), draft]);
  }

  async function handleFiles(list: FileList | File[]) {
    setNotice(null);
    for (const file of Array.from(list)) {
      try {
        if (/\.pdf$/i.test(file.name)) await handlePdf(file);
        else if (/\.(csv|txt)$/i.test(file.name)) addParsed(parseCsvText(await file.text(), file.name));
        else setNotice(`${file.name} was not read. Upload a .csv in the template layout, or a report .pdf.`);
      } catch {
        setNotice(`${file.name} could not be read.`);
      }
    }
    setBusy(null);
  }

  async function loadSample() {
    setNotice(null);
    setBusy("Loading the 2023 to 2025 readings…");
    const name = "bhopal_ghats_2023_2025.csv";
    const res = await fetch(`${import.meta.env.BASE_URL}sample/${name}`);
    addParsed(parseCsvText(await res.text(), name));
    setBusy(null);
  }

  async function writeWithAi() {
    if (!facts) return;
    setAi({ status: "running" });
    const res = await postJson<AiBriefResponse>("/api/brief", { facts });
    if (!res.ok) {
      const off = res.status === 503 || res.status === 404 || res.status === 0;
      setAi({
        status: "unavailable",
        message: off ? AI_OFF : `The AI service failed${res.detail ? ` (${res.detail})` : ""}. The brief written by code is used.`,
      });
      return;
    }
    const gate = runGate(res.data.brief, facts, res.data.audit);
    setUseAi(true);
    setAi(gate.ok ? { status: "passed", response: res.data } : { status: "rejected", response: res.data, gate });
  }

  async function copyBrief() {
    if (!texts) return;
    await navigator.clipboard.writeText(copyText(texts));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function savePdf() {
    if (!reportRef.current) return;
    setBusy("Preparing the PDF…");
    try {
      await downloadPdf(reportRef.current, `visarjan-ghat-watch-${today.toISOString().slice(0, 10)}.pdf`);
    } catch {
      setNotice("The PDF could not be created here. Use Print and choose 'Save as PDF'.");
    }
    setBusy(null);
  }

  const days = daysUntilVisarjan(today);
  const step = (done: boolean, running = false) => (running ? "running" : done ? "done" : "todo");

  return (
    <>
      <div className="screen">
        <header className="top">
          <h1>Visarjan Ghat Watch, Bhopal</h1>
          <p className="countdown">
            {days > 0 ? `${days} days to Durga visarjan (${VISARJAN_LABEL})` : `Durga visarjan: ${VISARJAN_LABEL}`}
          </p>
          <p className="context">
            NGT has banned immersion in the Upper and Lower Lakes (Free Press Journal, 26 Feb 2026). This ranking
            describes past water tests at these ghats, not whether a ghat is open for immersion.
          </p>
        </header>

        <main>
          <section className="panel">
            <h2>1. Upload water-test readings</h2>
            <div
              className={`drop ${dragging ? "over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void handleFiles(e.dataTransfer.files);
              }}
            >
              <p>
                <strong>Drop files here</strong> or choose them. CSV in the template layout is checked and scored by
                code. An MPPCB report PDF is read by AI and must be reviewed by you before it is used.
              </p>
              <div className="row">
                <button className="primary" onClick={() => inputRef.current?.click()} disabled={busy !== null}>
                  Choose CSV or PDF files
                </button>
                <button onClick={() => void loadSample()} disabled={busy !== null}>
                  Use the 2023 to 2025 MPPCB readings
                </button>
                <a className="linkbtn" href={`${import.meta.env.BASE_URL}TEMPLATE.csv`} download>
                  Download template CSV
                </a>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.txt,.pdf"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {busy ? <p className="banner info" role="status">⏳ {busy}</p> : null}
            {notice ? <p className="banner warn" role="alert">⚠ {notice}</p> : null}

            {files.length > 0 ? (
              <ul className="files">
                {files.map((f) => (
                  <li key={f.file}>
                    <span>
                      <strong>{f.file}</strong>: {f.rowsAccepted} of {f.rowsRead} rows accepted
                      {f.readings[0]?.origin === "pdf-ai" ? " (AI-read from PDF, reviewed by you)" : ""}
                    </span>
                    <button
                      className="small"
                      onClick={() => {
                        setFiles((prev) => prev.filter((x) => x.file !== f.file));
                        setAi({ status: "idle" });
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {drafts.map((d) => (
              <DraftReview
                key={d.file}
                draft={d}
                onUse={() => {
                  addParsed(d);
                  setDrafts((prev) => prev.filter((x) => x.file !== d.file));
                }}
                onDiscard={() => setDrafts((prev) => prev.filter((x) => x.file !== d.file))}
              />
            ))}

            {merged.issues.length > 0 ? (
              <details className="sub" open={merged.issues.some((i) => i.level === "error")}>
                <summary>
                  {merged.issues.filter((i) => i.level === "error").length} errors, {warnings.length -
                    merged.issues.filter((i) => i.level === "error").length}{" "}
                  warnings found in the files
                </summary>
                <ul className="issues">
                  {merged.issues.slice(0, 200).map((i, n) => (
                    <li key={n} className={i.level}>
                      <strong>{i.level}</strong> · {i.file}
                      {i.row ? `, row ${i.row}` : ""}: {i.message}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>

          {analysis && facts && texts ? (
            <>
              <ol className="pipeline" aria-label="What happens to the uploaded files">
                <li className={step(true)}>Check files<small>code</small></li>
                <li className={step(true)}>Score and rank<small>code</small></li>
                <li className={step(ai.status === "passed" || ai.status === "rejected", ai.status === "running")}>
                  Writer<small>AI</small>
                </li>
                <li className={step(ai.status === "passed" || ai.status === "rejected", ai.status === "running")}>
                  Auditor<small>AI</small>
                </li>
                <li className={ai.status === "rejected" ? "failed" : step(ai.status === "passed")}>
                  Number check<small>code</small>
                </li>
              </ol>

              <section className="panel">
                <h2>2. Ghats ranked by past water tests</h2>
                <p className="muted">
                  {analysis.totals.readings} readings, {analysis.ghats.length} ghats, {analysis.years.join(", ")}.
                  Compared with {BENCHMARK_NAME}: DO 5 mg/l or more, BOD 3 mg/l or less, pH 6.5 to 8.5. This benchmark
                  is our assumption. {analysis.totals.notSampled} readings were not sampled and are never counted as
                  passing.
                </p>
                {analysis.ranked.map((g) => (
                  <GhatCard key={g.site} g={g} readings={bySite.get(g.site) ?? []} analysis={analysis} />
                ))}
                <h3 className="unranked-head">Cannot be ranked: test before visarjan</h3>
                {analysis.unranked.length === 0 ? (
                  <p className="muted">None. All {analysis.ghats.length} ghats had enough readings to rank.</p>
                ) : (
                  analysis.unranked.map((g) => (
                    <GhatCard key={g.site} g={g} readings={bySite.get(g.site) ?? []} analysis={analysis} />
                  ))
                )}
              </section>

              <section className="panel">
                <h2>3. Summary and brief</h2>
                <div className="row">
                  <button className="primary" onClick={() => void writeWithAi()} disabled={ai.status === "running"}>
                    {ai.status === "running" ? "AI is writing and checking…" : "Write the summary and brief with AI"}
                  </button>
                  {aiPassed ? (
                    <label className="toggle">
                      <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> Use the
                      AI wording
                    </label>
                  ) : null}
                </div>
                {ai.status === "idle" ? (
                  <p className="muted">
                    Showing the version written by code. The AI step is optional: it rewrites the words only, and
                    every number it uses is checked against the computed readings before you see it.
                  </p>
                ) : null}
                {ai.status === "unavailable" ? <p className="banner info">ℹ {ai.message}</p> : null}
                {ai.status === "passed" ? (
                  <p className="banner ok">
                    ✓ Written by {ai.response.provider}, numbers checked by code. Writer {ai.response.writerModel} (
                    {(ai.response.latencyMs.writer / 1000).toFixed(1)} s), auditor {ai.response.auditorModel} (
                    {(ai.response.latencyMs.auditor / 1000).toFixed(1)} s).
                  </p>
                ) : null}
                {ai.status === "rejected" ? (
                  <div className="banner warn">
                    <p>
                      ✗ The AI text from {ai.response.provider} did not pass the checks, so it is not shown. The
                      version written by code is used.
                    </p>
                    <ul>
                      {ai.gate.issues.map((i, n) => (
                        <li key={n}>
                          {i.code.replace(/_/g, " ")} ({i.where}): {i.detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="tabs" role="tablist">
                  {(["summary", "en", "hi"] as OutputTab[]).map((t) => (
                    <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                      {t === "summary" ? "Officer summary" : t === "en" ? "Brief: English" : "Brief: हिंदी"}
                    </button>
                  ))}
                </div>
                {tab === "summary" ? (
                  <div className="output">
                    <div className="row">
                      <span className="muted">Summary language:</span>
                      <button className={`small ${lang === "en" ? "on" : ""}`} onClick={() => setLang("en")}>English</button>
                      <button className={`small ${lang === "hi" ? "on" : ""}`} onClick={() => setLang("hi")}>हिंदी</button>
                    </div>
                    <p className="lead" lang={lang}>{lang === "hi" ? texts.summary_hi : texts.summary_en}</p>
                    <p className="muted">
                      The PDF holds this summary with the full ranked table, then the English brief and the Hindi
                      brief, one page each.
                    </p>
                  </div>
                ) : (
                  <div className="output">
                    <pre className="brief" lang={tab}>{tab === "en" ? texts.en : texts.hi}</pre>
                    {tab === "hi" ? <p className="banner info">ℹ {hi.hindiReview} (Hindi text needs review by a Hindi speaker before use.)</p> : null}
                  </div>
                )}
                <div className="row">
                  <button className="primary" onClick={() => void savePdf()} disabled={busy !== null}>
                    Download PDF
                  </button>
                  <button onClick={() => void copyBrief()}>{copied ? "Copied ✓" : "Copy brief as text (English + Hindi)"}</button>
                  <button onClick={() => window.print()}>Print</button>
                </div>
              </section>
            </>
          ) : (
            <section className="panel empty">
              <p>
                Upload readings to see the ghats ranked, the reason for each rank, and a one-page brief in English and
                Hindi that you can forward or print.
              </p>
            </section>
          )}
        </main>
        <footer className="foot">
          Readings are compared with limits only. This tool makes no health conclusions and does not say what immersion
          did to the water. Source: MPPCB immersion monitoring reports.
        </footer>
      </div>

      {analysis && texts ? (
        <div className="print-area" ref={reportRef} aria-hidden="true">
          <Report
            analysis={analysis}
            texts={texts}
            lang={lang}
            today={today}
            fileCount={files.length}
            warningCount={warnings.length}
            aiProvider={aiProvider}
          />
        </div>
      ) : null}
    </>
  );
}

function DraftReview({ draft, onUse, onDiscard }: { draft: ParsedFile; onUse: () => void; onDiscard: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="draft-box">
      <h3>Review needed: {draft.file}</h3>
      <p>
        An AI model copied these {draft.readings.length} DO, BOD and pH values from the PDF. Code confirmed that each
        number is printed on the page shown, but it cannot confirm the value sits in the right row. Open the PDF and
        check them before use. Other tests in the PDF were not read.
      </p>
      {draft.issues.length > 0 ? (
        <ul className="issues">
          {draft.issues.map((i, n) => (
            <li key={n} className={i.level}>{i.message}</li>
          ))}
        </ul>
      ) : null}
      <div className="scroll-x tall">
        <table className="plain">
          <thead>
            <tr>
              <th>Page</th>
              <th>Site as printed</th>
              <th>Matched ghat</th>
              <th>Year</th>
              <th>Festival</th>
              <th>Phase</th>
              <th>Test</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {draft.readings.map((r) => (
              <tr key={r.id}>
                <td>{r.sourcePage}</td>
                <td>{r.siteAsPrinted}</td>
                <td>{r.site}</td>
                <td>{r.year}</td>
                <td>{r.festival}</td>
                <td>{r.phase}</td>
                <td>{r.scored}</td>
                <td className={r.state === "value" ? "" : "cell missing"}>
                  {r.state === "value" ? r.valueAsPrinted : r.state === "not_sampled" ? "not sampled" : r.state}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> I have checked these
        rows against the PDF
      </label>
      <div className="row">
        <button className="primary" disabled={!checked} onClick={onUse}>Use these readings</button>
        <button onClick={onDiscard}>Discard</button>
      </div>
    </div>
  );
}
