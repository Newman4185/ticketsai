// TicketPromptAI — event ticket lookup powered by Google Gemini through the
// Netlify AI Gateway. No API keys are committed: Netlify injects the Gemini
// gateway credentials (GEMINI_API_KEY / GOOGLE_GEMINI_BASE_URL) at runtime and
// bills inference to the project's Netlify credits.
//
// Given a free-text request ("indie rock in Austin this weekend"), Gemini
// returns a structured list of events with venues, dates and ticket pricing.
// Results are AI-generated estimates, not a live box-office feed.

const MODEL = "gemini-2.5-flash";

// OpenAPI-subset schema Gemini must conform to. Forcing JSON output keeps the
// response machine-renderable instead of free-form prose.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "One friendly sentence describing what was found.",
    },
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Event or tour name." },
          headliner: { type: "string", description: "Main artist, team or act." },
          venue: { type: "string" },
          city: { type: "string", description: "City and region/country." },
          date: { type: "string", description: "Human-readable date, e.g. 'Sat, Aug 16 2025'." },
          time: { type: "string", description: "Local start time, e.g. '8:00 PM'." },
          category: {
            type: "string",
            enum: ["Concert", "Theatre", "Sports", "Comedy", "Festival", "Other"],
          },
          lowestPrice: { type: "number", description: "Lowest ticket price as a number." },
          highestPrice: { type: "number", description: "Highest ticket price as a number." },
          currency: { type: "string", description: "ISO currency code, e.g. 'USD'." },
          availability: {
            type: "string",
            enum: ["Plenty", "Limited", "Few left", "Sold out"],
          },
          tiers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Tier name, e.g. 'General Admission'." },
                price: { type: "number" },
              },
              required: ["name", "price"],
            },
          },
        },
        required: [
          "name",
          "venue",
          "city",
          "date",
          "category",
          "lowestPrice",
          "highestPrice",
          "currency",
          "availability",
        ],
      },
    },
  },
  required: ["summary", "events"],
};

const SYSTEM_PROMPT = `You are TicketPromptAI, an assistant that helps people discover live events and ticket pricing.
Given a user's request, return a realistic, plausible list of up to 6 matching events.
Use your knowledge of typical venues, touring patterns and market pricing to populate every field.
Prices must be realistic for the act, venue size and city. Vary availability and tiers naturally.
If the request is vague, infer sensible defaults and still return events.
If the request is clearly not about live events, return an empty events array and explain in the summary.`;

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) {
    return Response.json(
      { error: "Provide a non-empty `query` describing the events you want." },
      { status: 400 }
    );
  }

  const baseUrl = process.env.GOOGLE_GEMINI_BASE_URL;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!baseUrl || !apiKey) {
    return Response.json(
      {
        error:
          "AI Gateway is not configured yet. Ensure the project has a production deploy with AI features enabled.",
      },
      { status: 503 }
    );
  }

  try {
    const upstream = await fetch(
      `${baseUrl}/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: query }] }],
          generationConfig: {
            temperature: 0.8,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );

    if (!upstream.ok) {
      const detail = await upstream.text();
      return Response.json(
        { error: "Upstream AI request failed", detail },
        { status: upstream.status }
      );
    }

    const data = await upstream.json();
    const raw =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("") ?? "";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return Response.json(
        { error: "The model returned an unexpected response. Try rephrasing." },
        { status: 502 }
      );
    }

    return Response.json({
      summary: parsed.summary ?? "",
      events: Array.isArray(parsed.events) ? parsed.events : [],
      model: MODEL,
    });
  } catch (err) {
    return Response.json(
      { error: "Request failed", detail: String(err) },
      { status: 500 }
    );
  }
};

export const config = {
  path: "/api/events",
};
