"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { Send, Sparkles } from "lucide-react";

export function UtopiaUI() {
  const [messages, setMessages] = useState<{role: 'user'|'model', content: string}[]>([
    { role: 'model', content: 'أهلاً بك في المدينة الفاضلة. أنا حارسك الفلسفي. تساءل، وسأجيبك بلسان عظماء التاريخ.' }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [secretRevealed, setSecretRevealed] = useState(false);
  
  const { freeInteractions, increment, tier } = useAppStore();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    if (tier === 'free' && freeInteractions >= 5) {
      increment();
      return;
    }

    const userMsg = input;
    setInput("");
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      if (tier === 'free') {
        increment();
      }

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [...messages, { role: 'user', content: userMsg }] 
        })
      });

      const data = await res.json();
      if (data.ok) {
        setMessages(prev => [...prev, { role: 'model', content: data.text }]);
      } else {
        setMessages(prev => [...prev, { role: 'model', content: 'عذراً، تشوشت الرؤية قليلاً. هل يمكنك إعادة السؤال؟' }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'model', content: 'انقطع الاتصال بعالم المُثل. حاول مجدداً.' }]);
    } finally {
      setLoading(false);
    }
  };

  const revealSecret = () => {
    if (secretRevealed) return;
    setSecretRevealed(true);
    setMessages(prev => [...prev, { role: 'model', content: '✨ [السر الأكبر]: "إنك لا تسبح في النهر مرتين." - هرقليطس. لقد اكتشفت البصيرة الخفية للمدينة الفاضلة.' }]);
  };

  return (
    <div className="relative flex h-full w-full flex-col md:flex-row">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute inset-0 bg-[url('/temple.jpg')] bg-cover bg-center bg-no-repeat opacity-40 mix-blend-screen"
          style={{ filter: 'invert(1) sepia(1) saturate(3) hue-rotate(330deg)' }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#0B0B0B_80%)]" />
      </div>

      <div 
        className="absolute top-1/4 left-1/4 z-10 h-6 w-6 cursor-pointer rounded-full bg-transparent"
        onClick={revealSecret}
      >
        <div className="absolute inset-0 animate-ping rounded-full bg-gold opacity-10" />
      </div>

      <div className="z-10 flex h-[100dvh] w-full flex-col bg-obsidian/80 backdrop-blur-md md:h-full md:w-1/2 md:border-l md:border-gold/20">
        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6">
          <AnimatePresence>
            {messages.map((msg, i) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[85%] rounded-2xl p-5 leading-relaxed shadow-lg ${
                    msg.role === 'user' 
                      ? 'bg-gold text-obsidian rounded-br-sm' 
                      : 'gold-glow border border-gold/30 bg-[#121212] text-gold-light rounded-bl-sm font-serif'
                  }`}
                >
                  {msg.role === 'model' && <Sparkles className="mb-2 h-4 w-4 text-gold inline-block" />}
                  {msg.content}
                </div>
              </motion.div>
            ))}
            {loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="gold-glow border border-gold/30 bg-[#121212] text-gold-muted p-4 rounded-2xl rounded-bl-sm">
                  يتأمل...
                </div>
              </motion.div>
            )}
            <div ref={chatEndRef} />
          </AnimatePresence>
        </div>

        <div className="border-t border-gold/20 bg-obsidian p-4 md:p-6">
          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="اطرح سؤالك هنا..."
              className="w-full rounded-full border border-gold/30 bg-[#1a1a1a] px-6 py-4 pr-14 text-gold-light placeholder-gold-muted/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="absolute right-2 flex h-10 w-10 items-center justify-center rounded-full bg-gold text-obsidian transition hover:scale-105 disabled:opacity-50"
            >
              <Send className="h-5 w-5 rtl:-scale-x-100" />
            </button>
          </div>
        </div>
      </div>
      <div className="hidden h-full w-1/2 md:block" />
    </div>
  );
}
