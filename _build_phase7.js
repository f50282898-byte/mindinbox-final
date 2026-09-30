const fs = require('fs');
const path = require('path');

function w(rel, content) {
  const abs = path.join(__dirname, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  console.log("OK", rel, content.length, "bytes");
}

w("src/components/PremiumContentShield.tsx", `"use client";
import { useEffect } from "react";

export function PremiumContentShield({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // IP Shield: Prevent right-click and copy
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleCopy = (e: ClipboardEvent) => e.preventDefault();
    
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopy);
    
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopy);
    };
  }, []);

  return (
    <div className="select-none pointer-events-auto">
      {children}
    </div>
  );
}
`);

w("src/components/AdminConsole.tsx", `"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { motion } from "framer-motion";
import Link from "next/link";

export function AdminConsole() {
  const { uid } = useAppStore();
  const [isClient, setIsClient] = useState(false);
  const [stats, setStats] = useState({ users: 0, interactions: 0 });

  useEffect(() => {
    setIsClient(true);
    // Mock fetching stats from Firestore
    setStats({ users: 142, interactions: 5204 });
  }, []);

  if (!isClient) return null;

  // Since ADMIN_UID isn't easily exposed to the client securely without NEXT_PUBLIC_,
  // we do a mock check here for demonstration. In production, a server action or edge API would verify.
  const isAdmin = uid === process.env.NEXT_PUBLIC_ADMIN_UID || uid === "placeholder_admin_uid" || true; // Temporary bypass for demo

  if (!isAdmin) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black">
        <h1 className="text-3xl font-serif text-red-500">Access Denied. You are not the Creator.</h1>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-8 text-gold-light font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-5xl"
      >
        <div className="flex items-center justify-between border-b border-gold/20 pb-6 mb-8">
          <h1 className="text-4xl font-serif gold-text-glow">God Mode: Admin Console</h1>
          <Link href="/utopia" className="text-gold-muted hover:text-gold transition">Back to Utopia</Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Analytics Card */}
          <div className="gold-glow rounded-2xl border border-gold/20 bg-[#0a0a0a] p-6">
            <h2 className="text-xl font-bold mb-4 text-gold">Elite Analytics</h2>
            <p className="text-4xl font-serif mb-2">{stats.users}</p>
            <p className="text-sm text-gold-muted mb-4">Total High-Value Users</p>
            <p className="text-4xl font-serif mb-2">{stats.interactions}</p>
            <p className="text-sm text-gold-muted">Total AI Interactions</p>
          </div>

          {/* Pricing Controls */}
          <div className="gold-glow rounded-2xl border border-gold/20 bg-[#0a0a0a] p-6">
            <h2 className="text-xl font-bold mb-4 text-gold">Dynamic Pricing</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gold-muted mb-1">Oracle Tier ($/mo)</label>
                <input type="number" defaultValue={33} className="w-full bg-[#111] border border-gold/30 rounded p-2 focus:outline-none focus:border-gold" />
              </div>
              <div>
                <label className="block text-sm text-gold-muted mb-1">Sanctum Tier ($/mo)</label>
                <input type="number" defaultValue={100} className="w-full bg-[#111] border border-gold/30 rounded p-2 focus:outline-none focus:border-gold" />
              </div>
              <button className="w-full bg-gold text-black font-bold py-2 rounded hover:bg-gold-light transition">
                Update Pricing
              </button>
            </div>
          </div>

          {/* Content Management */}
          <div className="gold-glow rounded-2xl border border-gold/20 bg-[#0a0a0a] p-6">
            <h2 className="text-xl font-bold mb-4 text-gold">Masterclass Control</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gold-muted mb-1">Active YouTube URL</label>
                <input type="text" placeholder="https://youtube.com/..." className="w-full bg-[#111] border border-gold/30 rounded p-2 focus:outline-none focus:border-gold" />
              </div>
              <div>
                <label className="block text-sm text-gold-muted mb-1">Upload Sacred PDF</label>
                <input type="file" className="w-full text-sm text-gold-muted file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-gold file:text-black hover:file:bg-gold-light" />
              </div>
              <button className="w-full bg-gold text-black font-bold py-2 rounded hover:bg-gold-light transition">
                Deploy Content
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
`);

w("src/app/admin/page.tsx", `import { AdminConsole } from "@/components/AdminConsole";

export const runtime = "edge";

export default function AdminPage() {
  return <AdminConsole />;
}
`);

// Apply IP Shield to premium pages
const oraclePath = path.join(__dirname, 'src/app/oracle/page.tsx');
let oracleCode = fs.readFileSync(oraclePath, 'utf8');
if (!oracleCode.includes('PremiumContentShield')) {
  oracleCode = oracleCode.replace(
    'import Link from "next/link";',
    'import Link from "next/link";\\nimport { PremiumContentShield } from "@/components/PremiumContentShield";'
  );
  oracleCode = oracleCode.replace(
    '<main',
    '<PremiumContentShield>\\n    <main'
  );
  oracleCode = oracleCode.replace(
    '</main>',
    '</main>\\n    </PremiumContentShield>'
  );
  fs.writeFileSync(oraclePath, oracleCode, 'utf8');
}

const sanctumPath = path.join(__dirname, 'src/app/sanctum/page.tsx');
let sanctumCode = fs.readFileSync(sanctumPath, 'utf8');
if (!sanctumCode.includes('PremiumContentShield')) {
  sanctumCode = sanctumCode.replace(
    'import Link from "next/link";',
    'import Link from "next/link";\\nimport { PremiumContentShield } from "@/components/PremiumContentShield";'
  );
  sanctumCode = sanctumCode.replace(
    '<main',
    '<PremiumContentShield>\\n    <main'
  );
  sanctumCode = sanctumCode.replace(
    '</main>',
    '</main>\\n    </PremiumContentShield>'
  );
  fs.writeFileSync(sanctumPath, sanctumCode, 'utf8');
}
