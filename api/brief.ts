// POST /api/brief  { facts }  ->  { provider, writerModel, auditorModel, brief, audit, latencyMs }
// Two model calls: a writer, then a separate auditor with a fresh context.
// The browser runs the deterministic gate on the result before showing any of it.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { AuditResult, BriefTexts } from "../src/types.js";
import { AUDITOR_SYSTEM, WRITER_SYSTEM } from "./_lib/prompts.js";
import { completeJson, getProvider, redact } from "./_lib/providers.js";

export const config = { maxDuration: 120 };

const MAX_FACTS_CHARS = 40_000;

function isBrief(v: unknown): v is BriefTexts {
  const o = v as Record<string, unknown> | null;
  return !!o && ["summary_en", "summary_hi", "en", "hi"].every((k) => typeof o[k] === "string" && o[k] !== "");
}

function isAudit(v: unknown): v is AuditResult {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o.ok === "boolean" && Array.isArray(o.issues);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const facts = (req.body as { facts?: unknown } | undefined)?.facts;
  const factsJson = facts && typeof facts === "object" ? JSON.stringify(facts) : "";
  if (!factsJson || factsJson.length > MAX_FACTS_CHARS) return res.status(400).json({ error: "bad_request" });

  const provider = getProvider();
  if (!provider) return res.status(503).json({ error: "ai_not_configured" });

  try {
    const writer = await completeJson(
      provider,
      { model: provider.writerModel, system: WRITER_SYSTEM, user: `FACTS:\n${factsJson}`, maxTokens: 8000 },
      isBrief,
    );
    const brief: BriefTexts = {
      summary_en: writer.value.summary_en,
      summary_hi: writer.value.summary_hi,
      en: writer.value.en,
      hi: writer.value.hi,
    };
    const auditor = await completeJson(
      provider,
      {
        model: provider.auditorModel,
        system: AUDITOR_SYSTEM,
        user: `FACTS:\n${factsJson}\n\nBRIEF:\n${JSON.stringify(brief)}`,
        maxTokens: 4000,
      },
      isAudit,
    );
    return res.status(200).json({
      provider: provider.label,
      writerModel: provider.writerModel,
      auditorModel: provider.auditorModel,
      brief,
      audit: { ok: auditor.value.ok, issues: auditor.value.issues.slice(0, 20) },
      latencyMs: { writer: writer.latencyMs, auditor: auditor.latencyMs },
    });
  } catch (e) {
    return res.status(502).json({ error: "ai_failed", detail: redact(e instanceof Error ? e.message : String(e)) });
  }
}
