// Chat endpoint backed by Google Gemini through the Netlify AI Gateway.
// No API keys required — Netlify injects the Gemini gateway credentials at
// runtime (GEMINI_API_KEY / GOOGLE_GEMINI_BASE_URL) and bills inference to
// your Netlify account credits.

const MODEL = "gemini-2.5-flash";

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

  const { prompt } = body ?? {};
  if (typeof prompt !== "string" || prompt.trim() === "") {
    return Response.json(
      { error: "Provide a non-empty `prompt` string." },
      { status: 400 }
    );
  }

  const baseUrl = process.env.GOOGLE_GEMINI_BASE_URL;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!baseUrl || !apiKey) {
    return Response.json(
      {
        error:
          "AI Gateway is not configured. Ensure the project has a production deploy with AI features enabled.",
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
          contents: [{ parts: [{ text: prompt }] }],
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
    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("") ?? "";

    return Response.json({ response: reply, model: MODEL });
  } catch (err) {
    return Response.json(
      { error: "Request failed", detail: String(err) },
      { status: 500 }
    );
  }
};

export const config = {
  path: "/api/chat",
};
