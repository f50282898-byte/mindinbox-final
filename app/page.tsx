'use client';

import { useAppStore } from '@/lib/store';
import { loginWithGoogle, logoutUser } from '@/lib/authService';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function HomePage() {
  const { user, subscriptionTier } = useAppStore();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Mind in a Box",
    "operatingSystem": "Web",
    "applicationCategory": "EducationalApplication",
    "description": "An interactive, intellectually deep digital entity powered by Edge AI. Consult the minds of ancient philosophers."
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-obsidian text-gold-light text-center">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <motion.h1 
        className="text-6xl font-serif text-gold mb-8 drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
      >
        Mind in a Box (عقل في صندوق)
      </motion.h1>
      
      <motion.div 
        className="p-12 border border-gold-dark rounded-xl bg-obsidian-light max-w-2xl w-full shadow-[0_0_40px_rgba(212,175,55,0.05)]"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, delay: 0.3 }}
      >
        {user ? (
          <>
            <h2 className="text-3xl font-serif text-gold mb-4">
              The Journey Continues
            </h2>
            <p className="text-xl mb-6">
              Welcome, {user.email || user.displayName}.
            </p>
            <div className="inline-block px-4 py-2 bg-gold/10 text-gold border border-gold rounded-full text-sm font-bold tracking-widest uppercase mb-8">
              Tier: {subscriptionTier}
            </div>
            
            <div className="flex gap-4 justify-center">
              <Link href="/utopia" className="px-8 py-3 bg-gradient-to-r from-gold-dark to-gold text-black font-bold uppercase tracking-widest rounded hover:scale-105 transition-transform">
                Enter Utopia
              </Link>
              {subscriptionTier === 'sanctum' || subscriptionTier === 'inner_sanctum' ? (
                <Link href="/sanctum" className="px-8 py-3 border border-gold text-gold font-bold uppercase tracking-widest rounded hover:bg-gold hover:text-black transition-colors">
                  The Sanctum
                </Link>
              ) : null}
            </div>

            <button 
              onClick={logoutUser}
              className="mt-12 text-sm opacity-50 hover:opacity-100 hover:text-white transition-opacity"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <h2 className="text-3xl font-serif text-gold mb-6">Unveil the Infinite</h2>
            <p className="mb-10 text-lg opacity-80 leading-relaxed">
              Log in to claim your 14-Day Free Trial. Consult the greatest philosophical minds in history, track your intellectual progression, and discover the secrets hidden within.
            </p>
            <div className="flex gap-4 justify-center">
              <button 
                onClick={loginWithGoogle}
                className="px-8 py-4 bg-gradient-to-r from-gold-dark to-gold text-black font-bold uppercase tracking-widest rounded hover:scale-105 transition-transform shadow-[0_0_20px_rgba(212,175,55,0.4)]"
              >
                Sign In With Google
              </button>
              <Link href="/utopia" className="px-8 py-4 border border-gold text-gold font-bold uppercase tracking-widest rounded hover:bg-gold hover:text-black transition-colors">
                Free Trial (5 Uses)
              </Link>
            </div>
          </>
        )}
      </motion.div>
    </main>
  );
}
