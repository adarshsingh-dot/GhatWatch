import { describe, expect, it } from "vitest";
import { completeJson, extractJson, getProvider, redact, type AIProvider } from "../api/_lib/providers";
import { chunkPages, linesToReadings, matchSite, relevantPages, valueOnPage } from "../src/lib/pdfExtract";

// Built from pieces so that no key-shaped literal exists anywhere in the repo.
const FAKE_KEY = ["sk", "ant", "api03", "THISISNOTAREALKEY0123456789"].join("-");
const FAKE_CEREBRAS = ["csk", "abcdefgh12345678"].join("-");

describe("key hygiene", () => {
  it("redacts key-like strings and the configured key from messages", () => {
    const env = { ANTHROPIC_API_KEY: FAKE_KEY, CEREBRAS_API_KEY: "plain-secret-value-123" };
    const out = redact(`401 for ${FAKE_KEY} and plain-secret-value-123 and ${FAKE_CEREBRAS}`, env);
    expect(out).not.toContain(FAKE_KEY);
    expect(out).not.toContain("plain-secret-value-123");
    expect(out).not.toContain(FAKE_CEREBRAS);
  });
  it("returns no provider when no key is set, so the app keeps the template brief", () => {
    expect(getProvider({})).toBeNull();
    expect(getProvider({ AI_PROVIDER: "claude" })).toBeNull();
    expect(getProvider({ AI_PROVIDER: "cerebras" })).toBeNull();
  });
  it("picks the provider from the environment and nothing else changes", () => {
    expect(getProvider({ ANTHROPIC_API_KEY: FAKE_KEY })!.id).toBe("claude");
    expect(getProvider({ CEREBRAS_API_KEY: FAKE_CEREBRAS })!.id).toBe("cerebras");
    expect(getProvider({ AI_PROVIDER: "cerebras", ANTHROPIC_API_KEY: FAKE_KEY, CEREBRAS_API_KEY: FAKE_CEREBRAS })!.id).toBe("cerebras");
    expect(getProvider({ ANTHROPIC_API_KEY: FAKE_KEY })!.writerModel).toBe("claude-sonnet-5-5");
    expect(getProvider({ ANTHROPIC_API_KEY: FAKE_KEY })!.auditorModel).toBe("claude-haiku-5-5");
  });
});

describe("model output handling", () => {
  it("takes the JSON object out of fences and surrounding text", () => {
    expect(extractJson('Here you go:\n```json\n{"ok": true, "issues": []}\n```\nDone.')).toEqual({ ok: true, issues: [] });
    expect(() => extractJson("no json here")).toThrow();
  });
  it("retries once when the first answer is not JSON", async () => {
    let calls = 0;
    const flaky: AIProvider = {
      id: "mock",
      label: "flaky",
      writerModel: "m",
      auditorModel: "m",
      async complete() {
        calls++;
        return { text: calls === 1 ? "sorry" : '{"ok": true}', latencyMs: 5 };
      },
    };
    const isOk = (v: unknown): v is { ok: boolean } => typeof (v as { ok?: unknown })?.ok === "boolean";
    const res = await completeJson(flaky, { model: "m", system: "", user: "", maxTokens: 10 }, isOk);
    expect(res.value.ok).toBe(true);
    expect(calls).toBe(2);
  });
  it("the mock provider answers all three roles without a network call", async () => {
    const mock = getProvider({ AI_PROVIDER: "mock" })!;
    const facts = { dataset: { ghats: 1, ranked: 1 }, ranked: [{ name: "X ghat", tier: "High" }], cannotBeRanked: [] };
    const w = await mock.complete({ model: "mock", system: "writer", user: `FACTS:\n${JSON.stringify(facts)}`, maxTokens: 1 });
    expect((extractJson(w.text) as { en: string }).en).toContain("X ghat");
  });
});

describe("PDF reader checks", () => {
  const pages = [
    { page: 26, text: "Khatlapura Visarjanghat, Bhopal pH 6.98 7.63 8.08 D.Oxygen 4.2 3.1 5.0 BOD 6 12.4 8" },
    { page: 27, text: "Indore site pH 7.1 7.2 7.3" },
  ];
  it("keeps only pages about Bhopal with a scored test", () => {
    expect(relevantPages(pages).map((p) => p.page)).toEqual([26]);
  });
  it("a value must stand on the page as its own number", () => {
    expect(valueOnPage("7.63", pages[0].text)).toBe(true);
    expect(valueOnPage("7.6", pages[0].text)).toBe(false);
    expect(valueOnPage("7", pages[0].text)).toBe(false);
    expect(valueOnPage("6", pages[0].text)).toBe(true);
    expect(valueOnPage("12.4", pages[0].text)).toBe(true);
    expect(valueOnPage("2.4", pages[0].text)).toBe(false);
  });
  it("drops a value the model did not copy from the cited page, and never turns a mark into a pass", () => {
    const lines = [
      "2026|Durga|26|Khatlapura Visarjanghat, Bhopal|DO|4.2|9.9|*",
      "2026|Durga|26|Khatlapura Visarjanghat, Bhopal|BOD|6|12.4|8",
    ];
    const out = linesToReadings(lines, pages, "report.pdf");
    expect(out.issues.filter((i) => i.code === "pdf_value_not_on_page")).toHaveLength(1);
    expect(out.readings).toHaveLength(5);
    expect(out.readings.every((r) => r.origin === "pdf-ai" && r.site === "Khatlapura ghat")).toBe(true);
    const star = out.readings.find((r) => r.scored === "DO" && r.phase === "after")!;
    expect(star.state).toBe("not_sampled");
    expect(star.value).toBeNull();
  });
  it("matches printed site names to the standard ghat names", () => {
    expect(matchSite("Maalikhedi visarjan kund, Bhopal")).toBe("Malikhedi kund");
    expect(matchSite("Some new ghat, Bhopal")).toBe("Some new ghat, Bhopal");
  });
  it("sends every relevant page, in batches", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ page: i + 1, text: "Bhopal BOD 3" }));
    const chunks = chunkPages(many);
    expect(chunks.flat()).toHaveLength(30);
    expect(chunks.every((c) => c.length <= 12)).toBe(true);
  });
});
