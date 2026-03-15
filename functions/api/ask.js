function bindingStatus(env) {
  const hasAI = !!(env && env.AI && typeof env.AI.run === "function");
  const hasKV = !!(env && env.LIMITS);
  const hasASSETS = !!(env && env.ASSETS && typeof env.ASSETS.fetch === "function");
  return { hasAI, hasKV, hasASSETS };
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// Open this in your browser to confirm bindings are attached:
// https://YOUR-SITE.pages.dev/api/ask
export async function onRequestGet(context) {
  const { env } = context;
  return json(200, { ok: true, version: "v8.4.1-portfolio", ...bindingStatus(env), botKeyRequired: !!env.PROTOTYPE_KEY });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const LIMIT = 5;
  const TZ = "America/Los_Angeles";

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const question = (body?.question || "").toString().trim();
  const prototypeKey = (body?.prototypeKey || "").toString().trim();

  if (!question) return json(400, { error: "Missing question." });

  // Gate the AI feature behind its own access key (separate from the site access key).
  // If PROTOTYPE_KEY is set in Cloudflare env vars, callers must provide it.
  if (env.PROTOTYPE_KEY && prototypeKey !== env.PROTOTYPE_KEY) {
    return json(401, {
      error: "KweenBee access key required (or incorrect). Enter the KweenBee access key and try again.",
    });
  }

  const status = bindingStatus(env);

  if (!status.hasAI) {
    return json(500, {
      error: "Workers AI binding not found.",
      detail:
        "In Cloudflare Pages → your project → Settings → Bindings, add a Workers AI binding named AI. " +
        "Make sure you add it to the SAME environment (Production vs Preview) as the deployment you’re viewing, then redeploy.",
      hint:
        "Tip: Open /api/ask in your browser. It should show hasAI:true. If it says false, the binding is not attached to this environment.",
      status,
    });
  }

  // date key in America/Los_Angeles
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const limitKey = `limit:${prototypeKey || "no-key"}:${dateStr}`;

  let used = 0;
  if (status.hasKV) {
    const existing = await env.LIMITS.get(limitKey);
    used = existing ? parseInt(existing, 10) || 0 : 0;

    if (used >= LIMIT) {
      return json(429, { error: `Daily limit reached (${LIMIT} questions/day).`, limit: LIMIT, remaining: 0 });
    }

    used += 1;
    await env.LIMITS.put(limitKey, String(used), { expirationTtl: 60 * 60 * 48 });
  }

  // Load chunks from static asset (chunks.json)
  let chunks = [];
  try {
    const url = new URL("/chunks.json", request.url);
    const assetResp = status.hasASSETS ? await env.ASSETS.fetch(new Request(url)) : await fetch(url.toString());
    const data = await assetResp.json();
    chunks = data?.chunks || [];
  } catch {
    chunks = [];
  }

  function tokenize(s) {
    return (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/g)
      .filter((w) => w.length >= 3);
  }

  const qTokens = tokenize(question);
  const qSet = new Set(qTokens);

  function scoreChunk(c) {
    const text = (c?.text || "").toLowerCase();
    let score = 0;
    for (const t of qSet) if (text.includes(t)) score += 2;

    const title = (c?.title || "").toLowerCase();
    for (const t of qSet) if (title.includes(t)) score += 3;

    const label = (c?.label || "").toLowerCase();
    for (const t of qSet) if (label.includes(t)) score += 2;

    return score;
  }

  const ranked = chunks
    .map((c) => ({ c, s: scoreChunk(c) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 6)
    .map((x) => x.c);

  const contextText = ranked
    .map((c, idx) => {
      const header = `${idx + 1}) ${c.section ? c.section + " — " : ""}${c.label} ${c.title}`;
      return `${header}\n${c.text}`;
    })
    .join("\n\n");

  const system = [
    "You are an assistant helping answer questions about Evergreen Mobility's Personnel Policies and Procedures.",
    "Answer using ONLY the provided policy excerpts.",
    "If the answer is not in the excerpts, say you couldn't find it in the policy.",
    "Be concise and practical.",
    "When you cite policy support, include section numbers like [1.2] or [4.5].",
  ].join(" ");

  const user = ["Question:", question, "", "Policy excerpts:", contextText || "(No excerpts available.)"].join("\n");

  let answerText = "";
  try {
    const result = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 700,
    });

    // Workers AI responses differ slightly by model/version.
    answerText = (result?.response || result?.output_text || result?.result || "").toString().trim();
  } catch (err) {
    return json(500, {
      error: "AI request failed.",
      detail: String(err?.message || err),
      hint:
        "If hasAI:true at /api/ask, open Cloudflare Pages → Functions → Logs to see the exact error. " +
        "Also confirm Workers AI is enabled for your account and the binding is attached to the environment you’re using.",
      status,
    });
  }

  const remaining = Math.max(0, LIMIT - used);
  return json(200, { answer: answerText || "No answer returned.", limit: LIMIT, remaining });
}
