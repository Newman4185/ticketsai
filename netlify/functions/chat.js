// Chat endpoint backed by Netlify AI Gateway.
// No API keys required — Netlify injects the gateway credentials at runtime
// (NETLIFY_AI_GATEWAY_BASE_URL / NETLIFY_AI_GATEWAY_KEY) and bills inference
// to your Netlify account credits.

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

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

  // Accept either a single `prompt` string or a full `messages` array.
  const { prompt, messages, system } = body ?? {};

  let chatMessages;
  if (Array.isArray(messages) && messages.length > 0) {
    chatMessages = messages;
  } else if (typeof prompt === "string" && prompt.trim() !== "") {
    chatMessages = [{ role: "user", content: prompt }];
  } else {
    return Response.json(
      { error: "Provide a non-empty `prompt` string or a `messages` array." },
      { status: 400 }
    );
  }

  const baseUrl = process.env.NETLIFY_AI_GATEWAY_BASE_URL;
  const apiKey = process.env.NETLIFY_AI_GATEWAY_KEY;
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
    const upstream = await fetch(`${baseUrl}/anthropic/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        ...(system ? { system } : {}),
        messages: chatMessages,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return Response.json(
        { error: "Upstream AI request failed", detail },
        { status: upstream.status }
      );
    }

    const data = await upstream.json();
    const reply = Array.isArray(data.content)
      ? data.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("")
      : "";

    return Response.json({ reply, model: MODEL });
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
