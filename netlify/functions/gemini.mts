import type { Context } from '@netlify/functions'
import { GoogleGenAI } from '@google/genai'

// Zero-config: the SDK auto-detects the Netlify AI Gateway environment
// variables (GEMINI_API_KEY + GOOGLE_GEMINI_BASE_URL) that Netlify injects
// into every server-side compute context. No API key management required.
const ai = new GoogleGenAI({})

const SYSTEM_PROMPT =
  'You are TicketsAI, a helpful support assistant. Answer the user clearly and concisely. ' +
  'If a question is about a support ticket or issue, help triage it, suggest next steps, and ask for any missing details.'

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  let prompt: string
  try {
    const body = await req.json()
    prompt = body?.prompt
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!prompt || typeof prompt !== 'string') {
    return Response.json({ error: 'A non-empty "prompt" string is required.' }, { status: 400 })
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { systemInstruction: SYSTEM_PROMPT },
    })

    return Response.json({ response: response.text })
  } catch (err) {
    console.error('AI Gateway request failed:', err)
    return Response.json(
      { error: 'The AI request failed. Please try again.' },
      { status: 502 },
    )
  }
}

export const config = {
  path: '/api/chat',
}
