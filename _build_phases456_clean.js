const fs = require('fs');
const path = require('path');

function w(rel, content) {
  const abs = path.join(__dirname, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  console.log("OK", rel, content.length, "bytes");
}

// ── Lead Gen Modal ──
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
        if (data.tier) setTier(data.tier);
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
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 px-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="gold-glow relative w-full max-w-md overflow-hidden rounded-2xl border border-gold/30 bg-[#0a0a0a] p-8 text-center shadow-2xl"
          >
            <div className="absolute -top-10 -left-10 h-32 w-32 rounded-full bg-gold/10 blur-3xl" />
            <h2 className="gold-text-glow font-serif text-3xl text-gold-light">البوابة (The Gate)</h2>
            <p className="mt-4 text-sm leading-relaxed text-gold-muted/80">
              لقد استنفدت تفاعلاتك العابرة. الحكمة العميقة تتطلب التزاماً.
              <br />
              سجل الآن لتحصل على <strong>نسخة تجريبية لمدة 14 يوماً</strong> لفتح بوابة "المدينة الفاضلة".
            </p>
            <button
              onClick={handleLogin}
              disabled={loading}
              className="gold-glow mt-8 flex w-full items-center justify-center rounded-full bg-gold px-6 py-4 font-bold text-black transition hover:bg-gold-light disabled:opacity-50"
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

// ── Utopia UI (Chat) ──
w("src/components/UtopiaUI.tsx", `"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/lib/store";

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
      return; // Will trigger the LeadGenModal globally
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

  const revealSecret = () => {
    if (secretRevealed) return;
    setSecretRevealed(true);
    setMessages(prev => [...prev, { role: 'model', content: '✨ [السر الأكبر]: "إنك لا تسبح في النهر مرتين." - هرقليطس.' }]);
  };

  return (
    <div className="relative flex h-screen w-full flex-col md:flex-row bg-black overflow-hidden">
      {/* Background Deep Void */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_#111_0%,_#000_100%)]" />

      {/* Greek Columns Layer */}
      <div 
        className="absolute inset-0 z-10 opacity-20 mix-blend-screen bg-[url('/temple.jpg')] bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{ filter: 'invert(1) sepia(1) saturate(2) hue-rotate(330deg) brightness(0.7)' }}
      />

      <div 
        className="absolute top-10 left-10 z-20 h-6 w-6 cursor-pointer rounded-full bg-transparent"
        onClick={revealSecret}
      >
        <div className="absolute inset-0 animate-ping rounded-full bg-gold opacity-10" />
      </div>

      <div className="z-20 flex h-full w-full flex-col bg-black/60 backdrop-blur-md md:w-[600px] md:border-l md:border-gold/20 mx-auto">
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
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
                      ? 'bg-gold text-black rounded-br-sm' 
                      : 'gold-glow border border-gold/30 bg-[#0a0a0a] text-gold-light rounded-bl-sm font-serif'
                  }\`}
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

        <div className="border-t border-gold/20 bg-black/80 p-4 md:p-6">
          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="اطرح سؤالك الفلسفي..."
              className="w-full rounded-full border border-gold/30 bg-[#111] px-6 py-4 pr-14 text-gold-light placeholder-gold-muted/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="absolute right-2 flex h-10 w-10 items-center justify-center rounded-full bg-gold text-black transition hover:scale-105 disabled:opacity-50"
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
`);

w("src/app/utopia/page.tsx", `import { UtopiaUI } from "@/components/UtopiaUI";

export const runtime = "edge";

export default function UtopiaPage() {
  return (
    <main className="bg-black">
      <UtopiaUI />
    </main>
  );
}
`);

w("src/app/oracle/page.tsx", `import Link from "next/link";
export const runtime = "edge";

export default function OraclePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-black overflow-hidden p-6">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_rgba(212,175,55,0.05)_0%,_#000_70%)]" />
      <div className="z-10 max-w-2xl text-center gold-glow rounded-3xl border border-gold/20 bg-[#0a0a0a] p-12 backdrop-blur-xl">
        <h1 className="gold-text-glow font-serif text-4xl text-gold-light md:text-5xl">العرّاف (The Oracle)</h1>
        <p className="mt-6 text-lg leading-relaxed text-gold-muted/80">
          مرحباً بك في مستوى العرّاف. هنا يتم تحليل أفكارك اليومية وتقديم تقارير نفسية وفلسفية عميقة تعكس صدى وعيك.
        </p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row justify-center">
          <button className="rounded-full bg-gold px-8 py-3 text-black font-bold transition hover:bg-gold-light">
            استخراج تقرير اليوم
          </button>
          <Link href="/utopia" className="rounded-full border border-gold/50 px-8 py-3 text-gold transition hover:bg-gold/10">
            العودة للمدينة الفاضلة
          </Link>
        </div>
      </div>
    </main>
  );
}
`);

w("src/app/sanctum/page.tsx", `import Link from "next/link";
export const runtime = "edge";

export default function SanctumPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-black overflow-hidden p-6">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_rgba(212,175,55,0.08)_0%,_#000_80%)]" />
      <div className="z-10 w-full max-w-4xl text-center gold-glow rounded-3xl border border-gold/30 bg-[#0a0a0a] p-8 md:p-16 backdrop-blur-xl">
        <h1 className="gold-text-glow font-serif text-4xl text-gold-light md:text-6xl">المحراب (The Sanctum)</h1>
        <p className="mt-6 text-lg leading-relaxed text-gold-muted/80">
          أنت الآن في المحراب. الطبقة العليا من العقول المشتركة.
          <br/>
          استكشف الجلسات الحصرية (Masterclasses) ونقاشات مجتمع النخبة.
        </p>
        
        <div className="mt-12 aspect-video w-full rounded-2xl border-2 border-gold/20 bg-black flex items-center justify-center text-gold-muted/50 overflow-hidden relative">
          <div className="absolute inset-0 bg-[url('/temple.jpg')] bg-cover bg-center opacity-10 mix-blend-screen" style={{ filter: 'invert(1) sepia(1)' }} />
          <span>[YouTube Masterclass Embed Placeholder]</span>
        </div>

        <div className="mt-10 flex justify-center">
          <Link href="/utopia" className="rounded-full border border-gold/50 px-8 py-3 text-gold transition hover:bg-gold/10">
            العودة للمدينة الفاضلة
          </Link>
        </div>
      </div>
    </main>
  );
}
`);

// Inject LeadGenModal into layout.tsx globally
const layoutPath = path.join(__dirname, 'src/app/layout.tsx');
let layoutCode = fs.readFileSync(layoutPath, 'utf8');
if (!layoutCode.includes('LeadGenModal')) {
  layoutCode = layoutCode.replace(
    'import "./globals.css";',
    'import "./globals.css";\\nimport { LeadGenModal } from "@/components/LeadGenModal";'
  );
  layoutCode = layoutCode.replace(
    '{children}',
    '<LeadGenModal />\\n        {children}'
  );
  fs.writeFileSync(layoutPath, layoutCode, 'utf8');
}
