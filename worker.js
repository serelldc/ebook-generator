// worker.js
// Cloudflare Worker proxy papunta sa Google Gemini API.
//
// Tumatanggap ito ng Anthropic-format na request (galing sa index.html)
// at isinasalin papuntang Gemini format, at ibinabalik ang sagot sa
// Anthropic format din - kaya hindi na kailangang baguhin ang index.html.
//
// MAHALAGA: ang API key ay HINDI dapat nasa file na ito.
// I-set ito bilang Cloudflare SECRET na may pangalang GEMINI_API_KEY:
//   Workers -> (worker mo) -> Settings -> Variables and Secrets
//   -> Add -> Type: Secret -> Name: GEMINI_API_KEY

export default {
  async fetch(request, env) {
    // Mga origin na pinapayagan.
    // "null" = kapag binuksan ang index.html mula sa file:// (local testing).
    // TANGGALIN ang "null" at localhost kapag live na ang site sa GitHub Pages.
    const ALLOWED_ORIGINS = [
      "https://serelldc.github.io",
      "null",
      "http://localhost:8000",
      "http://127.0.0.1:8000",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ];

    // Palitan kung gusto mo ng ibang Gemini model.
    // Buksan ang worker URL sa browser (GET) para makita ang listahan ng
    // mga model na available sa key mo.
    const GEMINI_MODEL = "gemini-2.5-flash";

    const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

    const origin = request.headers.get("Origin") || "";
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    const json = (obj, status) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const fail = (message, status) => json({ error: { message } }, status);

    // --- Preflight ---
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // --- Health check / listahan ng models ---
    // Buksan lang ang worker URL sa browser para i-verify ang setup.
    if (request.method === "GET") {
      if (!env.GEMINI_API_KEY) {
        return json(
          {
            ok: false,
            hasKey: false,
            hint: "Walang GEMINI_API_KEY secret na naka-set sa worker.",
            yourOrigin: origin || "(wala)",
          },
          200
        );
      }
      let models = null;
      let listError = null;
      try {
        const r = await fetch(`${API_BASE}/models?key=${env.GEMINI_API_KEY}`);
        const d = await r.json();
        if (d.models) {
          models = d.models
            .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
            .map((m) => m.name.replace("models/", ""));
        } else {
          listError = d.error ? d.error.message : "Walang models sa sagot.";
        }
      } catch (e) {
        listError = e.message;
      }
      return json(
        {
          ok: true,
          hasKey: true,
          configuredModel: GEMINI_MODEL,
          modelIsAvailable: models ? models.includes(GEMINI_MODEL) : null,
          availableModels: models,
          listError,
          yourOrigin: origin || "(wala)",
          originAllowed: ALLOWED_ORIGINS.includes(origin),
        },
        200
      );
    }

    if (request.method !== "POST") {
      return fail("Method not allowed", 405);
    }

    if (!env.GEMINI_API_KEY) {
      return fail(
        "Walang GEMINI_API_KEY na naka-set sa worker secrets. Idagdag ito sa Cloudflare: Settings -> Variables and Secrets -> Add -> Secret.",
        500
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (err) {
      return fail("Invalid JSON body", 400);
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) {
      return fail("Walang messages sa request body.", 400);
    }

    // --- Anthropic format -> Gemini format ---
    const contents = messages.map((m) => {
      const text =
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
          ? m.content.map((b) => (typeof b === "string" ? b : b.text || "")).join("\n")
          : String(m.content || "");
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text }],
      };
    });

    // Safety cap para hindi maabuso ang key.
    let maxTokens = Number(body.max_tokens) || 4500;
    if (maxTokens > 8000) maxTokens = 8000;

    const geminiBody = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 1,
      },
    };

    // Kapag structured JSON ang hinihingi ng app, i-on ang JSON mode ng Gemini
    // para mas maaasahan ang parsing. Hinahanap ang marker na ipinapadala
    // ng index.html sa mga JSON na tawag.
    const lastText = contents[contents.length - 1].parts[0].text || "";
    if (lastText.includes("Ibalik LAMANG ang JSON object")) {
      geminiBody.generationConfig.responseMimeType = "application/json";
    }

    // --- Tawag sa Gemini ---
    let geminiRes, data;
    try {
      geminiRes = await fetch(
        `${API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiBody),
        }
      );
      data = await geminiRes.json();
    } catch (err) {
      return fail("Hindi maabot ang Gemini API: " + err.message, 502);
    }

    if (!geminiRes.ok) {
      const msg = (data && data.error && data.error.message) || "Hindi kilalang error";
      if (geminiRes.status === 429) {
        return fail(
          "Naubos ang Gemini quota (429). " +
            msg +
            " | Tip: may per-minute at per-day na limit ang free tier. Maghintay ng ilang minuto, o mag-enable ng billing sa Google AI Studio.",
          429
        );
      }
      if (geminiRes.status === 404) {
        return fail(
          `Walang model na "${GEMINI_MODEL}" para sa key mo. Buksan ang worker URL sa browser para makita ang listahan ng available models. | ${msg}`,
          404
        );
      }
      return fail(`Gemini error ${geminiRes.status}: ${msg}`, geminiRes.status);
    }

    // --- Gemini format -> Anthropic format ---
    const candidate = (data.candidates || [])[0];

    if (!candidate) {
      const block = data.promptFeedback && data.promptFeedback.blockReason;
      return fail(
        block
          ? `Binlock ng Gemini ang prompt (${block}). Subukang baguhin ang pananalita ng target audience.`
          : "Walang isinagot ang Gemini.",
        502
      );
    }

    const text = ((candidate.content && candidate.content.parts) || [])
      .map((p) => p.text || "")
      .join("")
      .trim();

    if (!text) {
      return fail(
        `Walang laman ang sagot ng Gemini (finishReason: ${candidate.finishReason || "wala"}).`,
        502
      );
    }

    return json(
      {
        content: [{ type: "text", text }],
        stop_reason: candidate.finishReason === "MAX_TOKENS" ? "max_tokens" : "end_turn",
        model: GEMINI_MODEL,
      },
      200
    );
  },
};
