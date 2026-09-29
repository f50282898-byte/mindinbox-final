export const runtime = 'edge';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages } = body as any;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Messages array is required.' }), { status: 400 });
    }

    try {
      const formattedMessages = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));
      
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: formattedMessages })
      });
      
      if (!res.ok) throw new Error("Gemini failed");
      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return new Response(JSON.stringify({ success: true, result: content, provider: 'gemini' }), { status: 200 });
    } catch (e) {
      console.warn("Gemini Failed, falling back to Groq", e);
    }

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': "Bearer ${GROQ_API_KEY}",
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: messages
        })
      });
      if (!res.ok) throw new Error("Groq failed");
      const data = await res.json();
      return new Response(JSON.stringify({ success: true, result: data.choices[0].message.content, provider: 'groq' }), { status: 200 });
    } catch (e) {
      console.warn("Groq Failed, falling back to NVIDIA", e);
    }

    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': "Bearer ${NVIDIA_API_KEY}",
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'meta/llama3-70b-instruct',
          messages: messages,
          max_tokens: 1024
        })
      });
      if (!res.ok) throw new Error("NVIDIA failed");
      const data = await res.json();
      return new Response(JSON.stringify({ success: true, result: data.choices[0].message.content, provider: 'nvidia' }), { status: 200 });
    } catch (e) {
      console.error("All AI providers failed.", e);
      return new Response(JSON.stringify({ error: 'All AI providers are currently unavailable.' }), { status: 503 });
    }

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
}
