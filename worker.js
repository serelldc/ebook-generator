// worker.js
// Cloudflare Worker na proxy papunta sa Anthropic API.
// Ang API key ay nakatago dito sa server side (secret), hindi kailanman
// lumalabas sa public na site.

export default {
  async fetch(request, env) {
    // Mga origin na pinapayagan.
    // - Ang production GitHub Pages site mo.
    // - "null" = kapag binuksan mo ang index.html nang diretso mula sa file:// (local testing).
    // - localhost = kapag gumamit ka ng local server (hal. python3 -m http.server).
    // TANGGALIN ang "null" at ang mga localhost entry kapag live na ang site,
    // para hindi magamit ng kahit sino ang API key mo.
    const ALLOWED_ORIGINS = [
      "https://serelldc.github.io",
      "null",
      "http://localhost:8000",
      "http://127.0.0.1:8000",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ];

    const origin = request.headers.get("Origin") || "";
    const allowOrigin = ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0];

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    const json = (obj, status) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // Preflight request ng browser
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check - para matingnan mo sa browser kung buhay ang worker
    if (request.method === "GET") {
      return json(
        {
          ok: true,
          hasKey: Boolean(env.ANTHROPIC_API_KEY),
          yourOrigin: origin || "(wala)",
          originAllowed: ALLOWED_ORIGINS.includes(origin),
        },
        200
      );
    }

    if (request.method !== "POST") {
      return json({ error: { message: "Method not allowed" } }, 405);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json(
        { error: { message: "Walang ANTHROPIC_API_KEY na naka-set sa worker secrets." } },
        500
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (err) {
      return json({ error: { message: "Invalid JSON body" } }, 400);
    }

    // Safety cap - mataas na para kasya ang buong chapter (humihingi ang app ng 4500).
    if (!body.max_tokens || body.max_tokens > 8000) {
      body.max_tokens = 8000;
    }

    try {
      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      const data = await anthropicRes.text();

      return new Response(data, {
        status: anthropicRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return json({ error: { message: err.message } }, 500);
    }
  },
};
