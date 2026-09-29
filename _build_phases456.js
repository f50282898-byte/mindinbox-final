// Node script to write Phase 4-6 components safely
const fs = require('fs');
const path = require('path');

function w(rel, content) {
  const abs = path.join(__dirname, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  console.log("OK", rel, content.length, "bytes");
}

w("src/components/LeadGenModal.tsx", `"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { auth, db } from "@/lib/firebase";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export function LeadGenModal() {
  const { freeInteractions, setTier } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const isVisible = isClient && freeInteractions >= 5;

  const handleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 14);

        await setDoc(userRef, {
          email: user.email,
          displayName: user.displayName,
          tier: "free",
          trialEnd: trialEndDate.toISOString(),
          createdAt: new Date().toISOString(),
        });
      } else {
        const data = userSnap.data();
        if (data.tier) {
          setTier(data.tier as any);
        }
      }
      
      router.push("/utopia");
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-obsidian/90 px-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="gold-glow relative w-full max-w-md overflow-hidden rounded-2xl border border-gold/30 bg-[#121212] p-8 text-center shadow-2xl"
          >
            <div className="absolute -top-10 -left-10 h-32 w-32 rounded-full bg-gold/10 blur-3xl" />
            
            <h2 className="gold-text-glow font-serif text-3xl text-gold-light">الدعوة الخاصة</h2>
            <p className="mt-4 text-sm leading-relaxed text-gold-muted/80">
              لقد استنفدت تفاعلاتك العابرة. الحكمة العميقة تتطلب التزاماً.
              <br />
              سجل الآن لتحصل على <strong>نسخة تجريبية لمدة 14 يوماً</strong> لفتح بوابة "المدينة الفاضلة".
            </p>

            <button
              onClick={handleLogin}
              disabled={loading}
              className="gold-glow mt-8 flex w-full items-center justify-center rounded-full bg-gold px-6 py-4 font-bold text-obsidian transition hover:bg-gold-light disabled:opacity-50"
            >
              {loading ? "جاري فتح البوابة..." : "قبول الدعوة (الدخول بحساب جوجل)"}
            </button>
            <p className="mt-4 text-[10px] text-gold-muted/40">
              بدخولك، أنت توافق على معاهدة الحكمة الخاصة بنا.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
`);

w("src/components/UtopiaUI.tsx", `"use client";
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
                className={\`flex \${msg.role === 'user' ? 'justify-end' : 'justify-start'}\`}
              >
                <div 
                  className={\`max-w-[85%] rounded-2xl p-5 leading-relaxed shadow-lg \${
                    msg.role === 'user' 
                      ? 'bg-gold text-obsidian rounded-br-sm' 
                      : 'gold-glow border border-gold/30 bg-[#121212] text-gold-light rounded-bl-sm font-serif'
                  }\`}
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
`);

w("src/app/utopia/page.tsx", `import { UtopiaUI } from "@/components/UtopiaUI";

export const runtime = "edge";

export default function UtopiaPage() {
  return (
    <main className="relative h-screen w-full overflow-hidden bg-obsidian">
      <UtopiaUI />
    </main>
  );
}
`);

// update layout to include LeadGenModal
const layoutPath = path.join(__dirname, 'src/app/layout.tsx');
const layoutCode = fs.readFileSync(layoutPath, 'utf8');
if (!layoutCode.includes('LeadGenModal')) {
  const newLayout = layoutCode
    .replace('import { GoldenCursor } from "@/components/GoldenCursor";', 'import { GoldenCursor } from "@/components/GoldenCursor";\\nimport { LeadGenModal } from "@/components/LeadGenModal";')
    .replace('<GoldenCursor />', '<GoldenCursor />\\n        <LeadGenModal />');
  fs.writeFileSync(layoutPath, newLayout, 'utf8');
}
