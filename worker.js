// worker.js
// Cloudflare Worker na proxy papunta sa Anthropic API.
// Ang API key ay nakatago dito sa server side (secret), hindi kailanman
// lumalabas sa GitHub Pages site na public.

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

    // Simpleng safety cap para hindi maabuso ang key mo kung may
    // makahanap ng URL ng worker mo. Itinaas mula 2000 -> 8000 dahil
    // ang buong-chapter generation (9 sections, 5-10 pages) ay
    // nangangailangan ng mas malaking output budget kaysa dati,
    // kaya hindi na napuputol/na-truncate ang mga chapter.
    if (body.max_tokens && body.max_tokens > 8000) {
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
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
