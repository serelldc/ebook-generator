// worker.js
// Cloudflare Worker na proxy papunta sa Google Gemini API.
// Ang API key ay nakatago dito sa server side (secret), hindi kailanman
// lumalabas sa GitHub Pages site na public.
//
// Gumagamit ng Gemini API dahil FREE ang tier nito (walang billing/credit
// card na kailangan) - kunin ang key sa aistudio.google.com/apikey at
// ilagay bilang secret na "GEMINI_API_KEY" sa Settings > Variables and
// Secrets ng Worker na ito.

export default {
  async fetch(request, env) {
    // PALITAN ito ng eksaktong URL ng GitHub Pages mo.
    // Kung gusto mong tumakbo din sa localhost habang tine-test, dagdagan
    // na lang ng kondisyon sa baba.
    const ALLOWED_ORIGIN = "https://serelldc.github.io";

    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Preflight request ng browser
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (err) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default model kung wala munang binigay ang client.
    const model = body.model || "gemini-3.5-flash";

    // Simpleng safety cap para hindi maabuso ang key mo kung may
    // makahanap ng URL ng worker mo. Ang buong-chapter generation
    // (9 sections, 5-10 pages) ay nangangailangan ng mas malaking
    // output budget, kaya hindi na napuputol/na-truncate ang mga chapter.
    const generationConfig = body.generationConfig || {};
    if (generationConfig.maxOutputTokens && generationConfig.maxOutputTokens > 8000) {
      generationConfig.maxOutputTokens = 8000;
    }

    const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    // Simpleng retry-with-backoff para sa 429 (Too Many Requests) mula sa
    // libreng tier ng Gemini. Habang marami pang gumagamit nang sabay-sabay,
    // sinusubukan munang hintayin at ulitin ang request bago tuluyang
    // sumuko at ibalik ang error sa client. Hindi nito tinatanggal ang
    // pang-araw-araw na quota (RPD) pero nakakatulong ito sa pansamantalang
    // per-minute (RPM) bursts.
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = [0, 4000, 9000]; // walang hintay sa 1st try, tapos 4s, 9s

    try {
      let googleRes;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (BACKOFF_MS[attempt]) await sleep(BACKOFF_MS[attempt]);

        googleRes = await fetch(googleUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: body.contents,
            generationConfig,
          }),
        });

        if (googleRes.status !== 429) break; // success o ibang klaseng error, huwag na ulitin
      }

      const data = await googleRes.text();

      return new Response(data, {
        status: googleRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
