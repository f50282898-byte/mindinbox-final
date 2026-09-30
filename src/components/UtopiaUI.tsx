"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/lib/store";

export function UtopiaUI() {
  const [messages, setMessages] = useState<{role: 'user'|'model', content: string}[]>([
    { role: 'model', content: 'أهلاً بك في المدينة الفاضلة. أنا حارسك الفلسفي. تساءل، وسأجيبك بلسان عظماء التاريخ.' }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [trackerInput, setTrackerInput] = useState("");
  
  const { freeInteractions, increment, tier, addEntry, entries } = useAppStore();
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
      if (tier === 'free') increment();

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, { role: 'user', content: userMsg }] })
      });

      const data = await res.json();
      if (data.ok) {
        setMessages(prev => [...prev, { role: 'model', content: data.text }]);
      } else {
        setMessages(prev => [...prev, { role: 'model', content: 'عذراً، تشوشت الرؤية قليلاً.' }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'model', content: 'انقطع الاتصال بعالم المُثل.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEntry = () => {
    if (!trackerInput.trim()) return;
    addEntry({
      id: Math.random().toString(),
      kind: "thought",
      text: trackerInput,
      createdAt: new Date().toISOString()
    });
    setTrackerInput("");
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col lg:flex-row bg-[radial-gradient(ellipse_at_top_right,_#1a1a1a_0%,_#000_100%)] overflow-hidden p-4 lg:p-8 gap-8">
      
      <div className="z-20 flex h-[85vh] w-full lg:w-2/3 flex-col rounded-3xl border border-gold/20 bg-black/40 backdrop-blur-md shadow-2xl">
        <div className="border-b border-gold/10 p-6 flex justify-between items-center">
          <div>
            <h1 className="font-serif text-3xl text-gold-light gold-text-glow">اسأل الحكيم</h1>
            <p className="text-sm text-gold-muted mt-1">تأملات فلسفية مدعومة بالذكاء الاصطناعي</p>
          </div>
          <div className="h-10 w-10 rounded-full border border-gold/30 flex items-center justify-center text-gold">👁</div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <AnimatePresence>
            {messages.map((msg, i) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={i}
                className={"flex " + (msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div 
                  className={"max-w-[85%] rounded-2xl p-5 leading-relaxed shadow-lg " + (msg.role === 'user' ? 'bg-gold text-black rounded-br-sm' : 'gold-glow border border-gold/30 bg-[#0a0a0a] text-gold-light rounded-bl-sm font-serif text-lg')}
                >
                  {msg.content}
                </div>
              </motion.div>
            ))}
            {loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="gold-glow border border-gold/30 bg-[#0a0a0a] text-gold-muted p-4 rounded-2xl rounded-bl-sm">
                  يتأمل...
                </div>
              </motion.div>
            )}
            <div ref={chatEndRef} />
          </AnimatePresence>
        </div>

        <div className="border-t border-gold/10 bg-black/60 p-6 rounded-b-3xl">
          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="اطرح سؤالك الفلسفي..."
              className="w-full rounded-full border border-gold/30 bg-[#111] px-6 py-4 pr-16 text-gold-light placeholder-gold-muted/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition-all"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="absolute right-2 flex h-12 w-12 items-center justify-center rounded-full bg-gold text-black transition hover:scale-105 disabled:opacity-50"
            >
              ➤
            </button>
          </div>
        </div>
      </div>

      <div className="z-20 flex h-[85vh] w-full lg:w-1/3 flex-col rounded-3xl border border-gold/20 bg-[#0a0a0a]/80 backdrop-blur-md p-6">
        <h2 className="font-serif text-2xl text-gold-light mb-2">متتبع الوعي</h2>
        <p className="text-sm text-gold-muted mb-6">دوّن أفكارك وعاداتك اليومية</p>
        
        <div className="flex flex-col gap-3 mb-6">
          <textarea 
            value={trackerInput}
            onChange={(e) => setTrackerInput(e.target.value)}
            placeholder="بماذا تفكر الآن؟"
            className="w-full rounded-xl border border-gold/20 bg-black p-4 text-gold-light focus:border-gold focus:outline-none resize-none h-24"
          />
          <button 
            onClick={handleAddEntry}
            className="w-full rounded-xl bg-gold/10 border border-gold/50 py-3 text-gold hover:bg-gold hover:text-black transition-all"
          >
            حفظ الفكرة
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {entries.map((entry) => (
            <div key={entry.id} className="border-l-2 border-gold/50 pl-4 py-2">
              <p className="text-gold-light text-sm">{entry.text}</p>
              <span className="text-xs text-gold-muted/60">{new Date(entry.createdAt).toLocaleDateString('ar-EG')}</span>
            </div>
          ))}
          {entries.length === 0 && (
            <p className="text-center text-gold-muted/40 mt-10 text-sm">لم تسجل أي أفكار بعد.</p>
          )}
        </div>
      </div>

    </div>
  );
}
