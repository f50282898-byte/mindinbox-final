"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";

type Entry = {
  id: string;
  text: string;
  createdAt: any;
};

export function DailyTracker() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!auth?.currentUser || !db) return;
    
    const q = query(
      collection(db, `users/${auth.currentUser.uid}/thoughts`),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Entry[];
      setEntries(fetched);
    });

    return () => unsubscribe();
  }, [auth?.currentUser]);

  const handleAdd = async () => {
    if (!input.trim() || !auth?.currentUser || !db) return;
    
    setLoading(true);
    try {
      await addDoc(collection(db, `users/${auth.currentUser.uid}/thoughts`), {
        text: input,
        createdAt: serverTimestamp()
      });
      setInput("");
    } catch (e) {
      console.error("Failed to add thought", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="z-20 flex h-[85vh] w-full lg:w-1/3 flex-col rounded-3xl border border-gold/20 bg-[#0a0a0a]/80 backdrop-blur-md p-6">
      <h2 className="font-serif text-2xl text-gold-light mb-2">متتبع الوعي</h2>
      <p className="text-sm text-gold-muted mb-6">دوّن أفكارك وعاداتك اليومية</p>
      
      {!auth?.currentUser ? (
        <div className="flex-1 flex items-center justify-center text-gold-muted/50 text-sm text-center">
          سجل دخولك لتفعيل متتبع الوعي الفلسفي.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 mb-6">
            <textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="بماذا تفكر الآن؟"
              className="w-full rounded-xl border border-gold/20 bg-black p-4 text-gold-light focus:border-gold focus:outline-none resize-none h-24"
            />
            <button 
              onClick={handleAdd}
              disabled={loading}
              className="w-full rounded-xl bg-gold/10 border border-gold/50 py-3 text-gold hover:bg-gold hover:text-black transition-all disabled:opacity-50"
            >
              {loading ? 'يحفظ...' : 'حفظ الفكرة'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {entries.map((entry) => (
              <div key={entry.id} className="border-l-2 border-gold/50 pl-4 py-2">
                <p className="text-gold-light text-sm">{entry.text}</p>
                <span className="text-xs text-gold-muted/60">
                  {entry.createdAt?.toDate ? entry.createdAt.toDate().toLocaleDateString('ar-EG') : 'الآن'}
                </span>
              </div>
            ))}
            {entries.length === 0 && (
              <p className="text-center text-gold-muted/40 mt-10 text-sm">لم تسجل أي أفكار بعد.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
