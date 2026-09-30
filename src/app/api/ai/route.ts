import { NextResponse } from 'next/server';

export const runtime = 'edge';

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const NVIDIA_KEY = process.env.NVIDIA_API_KEY;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body?.messages;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }

    // 1. Gemini Fallback
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: messages.map((m: any) => ({
              role: m.role === "user" ? "user" : "model",
              parts: [{ text: m.content }]
            }))
          })
        }
      );
      if (geminiRes.ok) {
        const data = await geminiRes.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return NextResponse.json({ ok: true, text, via: "gemini" });
      }
    } catch (e) { console.warn("Gemini Failed"); }

    // 2. Groq Fallback
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3-70b-8192",
          messages: messages.map((m: any) => ({ role: m.role === "model" ? "assistant" : m.role, content: m.content }))
        })
      });
      if (groqRes.ok) {
        const data = await groqRes.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return NextResponse.json({ ok: true, text, via: "groq" });
      }
    } catch (e) { console.warn("Groq Failed"); }

    // 3. NVIDIA Fallback
    try {
      const nvidiaRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${NVIDIA_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "meta/llama-3.1-70b-instruct",
          max_tokens: 1024,
          messages: messages.map((m: any) => ({ role: m.role === "model" ? "assistant" : m.role, content: m.content }))
        })
      });
      if (nvidiaRes.ok) {
        const data = await nvidiaRes.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return NextResponse.json({ ok: true, text, via: "nvidia" });
      }
    } catch (e) { console.error("All AI Failed"); }

    return NextResponse.json({ error: "All AI providers unavailable" }, { status: 503 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}
