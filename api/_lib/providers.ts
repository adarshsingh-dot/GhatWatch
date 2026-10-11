// One adapter, one provider per deployment. Keys are read from the server's environment
// variables only. They are never sent to the browser, logged, or written anywhere.
// The SDKs are loaded only when a call is made, so a server with no key never loads them.
import type Anthropic from "@anthropic-ai/sdk";

export interface CompleteArgs {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}

export interface CompleteResult {
  text: string;
  latencyMs: number;
  usage?: { input?: number; output?: number };
}

export interface AIProvider {
  id: "claude" | "cerebras" | "mock";
  label: string;
  writerModel: string;
  auditorModel: string;
  complete(args: CompleteArgs): Promise<CompleteResult>;
}

type Env = Record<string, string | undefined>;

const KEY_PATTERN = /\b(sk-ant-[A-Za-z0-9_-]{8,}|csk-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{16,})/g;

/** Remove anything key-like from a message before it leaves the server. */
export function redact(message: string, env: Env = process.env): string {
  let out = message.replace(KEY_PATTERN, "[redacted]");
  for (const name of ["ANTHROPIC_API_KEY", "CEREBRAS_API_KEY"]) {
    const secret = env[name];
    if (secret && secret.length >= 8) out = out.split(secret).join("[redacted]");
  }
  return out;
}

function claude(apiKey: string, env: Env): AIProvider {
  return {
    id: "claude",
    label: "Claude",
    writerModel: env.ANTHROPIC_WRITER_MODEL || "claude-sonnet-5-5",
    auditorModel: env.ANTHROPIC_AUDITOR_MODEL || "claude-haiku-5-5",
    async complete({ model, system, user, maxTokens }) {
      const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
      const client = new AnthropicClient({ apiKey });
      const started = Date.now();
      // Sampling parameters (temperature) are not accepted by these models, so none are sent.
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      });
      if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
      if (res.stop_reason === "max_tokens") throw new Error("The model's answer was cut off.");
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return {
        text,
        latencyMs: Date.now() - started,
        usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
      };
    },
  };
}

function cerebras(apiKey: string, env: Env): AIProvider {
  const model = env.CEREBRAS_MODEL || "gpt-oss-120b";
  return {
    id: "cerebras",
    label: `Cerebras (${model})`,
    writerModel: model,
    auditorModel: model,
    async complete({ model: m, system, user, maxTokens }) {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey, baseURL: "https://api.cerebras.ai/v1" });
      const started = Date.now();
      const res = await client.chat.completions.create({
        model: m,
        max_completion_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      return {
        text: res.choices[0]?.message?.content ?? "",
        latencyMs: Date.now() - started,
        usage: { input: res.usage?.prompt_tokens, output: res.usage?.completion_tokens },
      };
    },
  };
}

/**
 * Keyless stand-in for local demos and tests (AI_PROVIDER=mock). It is not a model:
 * the writer echoes a tiny brief built from the facts, the auditor approves.
 * MOCK_BAD=1 makes the writer break the rules, to show the gate rejecting it.
 */
function mock(env: Env): AIProvider {
  return {
    id: "mock",
    label: "Mock writer (no model)",
    writerModel: "mock",
    auditorModel: "mock",
    async complete({ system, user }) {
      if (system.includes('"ok"')) return { text: '{"ok": true, "issues": []}', latencyMs: 1 };
      if (system.includes("pipe-separated")) return { text: "NONE", latencyMs: 1 };
      const facts = JSON.parse(user.slice(user.indexOf("{")));
      const top = (facts.ranked as Array<{ name: string; tier: string }>).slice(0, 3);
      const unranked = (facts.cannotBeRanked as Array<{ name: string }>).map((g) => g.name).join(", ") || "-";
      const lines = top.map((g, i) => `${i + 1}. ${g.name}: ${g.tier}`).join("\n");
      const bad = env.MOCK_BAD ? " The water is safe at 99 ghats." : "";
      const en = `MOCK BRIEF\n${lines}\nCannot be ranked: ${unranked}\nSuggestions only.${bad}`;
      const hi = `नमूना ब्रीफ\n${lines}\nरैंक नहीं: ${unranked}\nकेवल सुझाव।`;
      const summary = `${facts.dataset.ghats} ghats, ${facts.dataset.ranked} ranked.`;
      const summaryHi = `${facts.dataset.ghats} घाट, ${facts.dataset.ranked} रैंक किए गए।`;
      return {
        text: "```json\n" + JSON.stringify({ summary_en: summary, summary_hi: summaryHi, en, hi }) + "\n```",
        latencyMs: 1,
      };
    },
  };
}

/** Pick the provider from the environment. Returns null when no key is configured. */
export function getProvider(env: Env = process.env): AIProvider | null {
  const want = (env.AI_PROVIDER || "").toLowerCase();
  if (want === "mock") return mock(env);
  if (want === "cerebras") return env.CEREBRAS_API_KEY ? cerebras(env.CEREBRAS_API_KEY, env) : null;
  if (want === "claude") return env.ANTHROPIC_API_KEY ? claude(env.ANTHROPIC_API_KEY, env) : null;
  if (env.ANTHROPIC_API_KEY) return claude(env.ANTHROPIC_API_KEY, env);
  if (env.CEREBRAS_API_KEY) return cerebras(env.CEREBRAS_API_KEY, env);
  return null;
}

/** Models sometimes wrap JSON in code fences or add a sentence around it. Take the object only. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in the model's answer.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Ask for JSON, retry once if the answer cannot be parsed. */
export async function completeJson<T>(
  provider: AIProvider,
  args: CompleteArgs,
  isValid: (value: unknown) => value is T,
): Promise<{ value: T; latencyMs: number }> {
  let latencyMs = 0;
  let lastError = "Invalid answer.";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await provider.complete(args);
    latencyMs += res.latencyMs;
    try {
      const value = extractJson(res.text);
      if (isValid(value)) return { value, latencyMs };
      lastError = "The model's JSON did not have the expected fields.";
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastError);
}
