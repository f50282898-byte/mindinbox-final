export const runtime = "edge";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const NVIDIA_KEY = process.env.NVIDIA_API_KEY;

export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages: { role: string; content: string }[] };
    if (!messages?.length) return Response.json({ error: "messages[] required" }, { status: 400 });

    // Gemini
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: messages.map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] })) }) }
      );
      if (!r.ok) throw new Error("gemini");
      const d = await r.json();
      const t = d.candidates?.[0]?.content?.parts?.[0]?.text;
      if (t) return Response.json({ ok: true, text: t, via: "gemini" });
      throw new Error("empty");
    } catch { /* next */ }

    // Groq
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "llama3-70b-8192", messages }),
      });
      if (!r.ok) throw new Error("groq");
      const d = await r.json();
      const t = d.choices?.[0]?.message?.content;
      if (t) return Response.json({ ok: true, text: t, via: "groq" });
      throw new Error("empty");
    } catch { /* next */ }

    // NVIDIA
    try {
      const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${NVIDIA_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "meta/llama3-70b-instruct", messages, max_tokens: 1024 }),
      });
      if (!r.ok) throw new Error("nvidia");
      const d = await r.json();
      const t = d.choices?.[0]?.message?.content;
      if (t) return Response.json({ ok: true, text: t, via: "nvidia" });
      throw new Error("empty");
    } catch { /* all failed */ }

    return Response.json({ error: "All AI providers unavailable" }, { status: 503 });
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Internal error" }, { status: 500 });
  }
}
