"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, 
  Activity, 
  Eye, 
  Key, 
  Settings, 
  Menu, 
  X 
} from "lucide-react";

const NAV_ITEMS = [
  { name: "المدينة الفاضلة", href: "/utopia", icon: Home },
  { name: "العرّاف", href: "/oracle", icon: Eye },
  { name: "المحراب", href: "/sanctum", icon: Key },
  { name: "الإدارة", href: "/god-mode-admin", icon: Settings },
];

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => setIsOpen(!isOpen);

  if (pathname === "/") return null;

  if (!isMobile) {
    return (
      <motion.nav 
        initial={{ width: 80 }}
        animate={{ width: isOpen ? 260 : 80 }}
        className="fixed top-0 right-0 z-50 h-screen border-l border-gold/10 bg-black/40 backdrop-blur-xl transition-all duration-300"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
      >
        <div className="flex h-full flex-col justify-between py-10">
          <div className="flex flex-col items-center gap-8 px-4">
            <div className="gold-glow flex h-12 w-12 items-center justify-center rounded-full border border-gold/30 bg-black text-gold-light">
              <span className="font-serif text-xl font-bold">ع</span>
            </div>
            
            <div className="flex w-full flex-col gap-2">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link 
                    key={item.name} 
                    href={item.href}
                    className={"group relative flex items-center gap-4 rounded-xl px-4 py-3 transition-all duration-300 " + (isActive ? 'bg-gold/10 text-gold-light' : 'text-gold-muted hover:bg-gold/5 hover:text-gold')}
                  >
                    <item.icon className={"h-6 w-6 flex-shrink-0 " + (isActive ? 'text-gold-light drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]' : '')} />
                    <AnimatePresence>
                      {isOpen && (
                        <motion.span
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          className="whitespace-nowrap font-serif text-lg tracking-wide"
                        >
                          {item.name}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </motion.nav>
    );
  }

  return (
    <>
      <div className="fixed top-4 right-4 z-50 rounded-full border border-gold/20 bg-black/60 p-2 backdrop-blur-md">
        <button onClick={toggleSidebar} className="text-gold-light">
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: "-100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "-100%" }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/95 backdrop-blur-3xl"
          >
            <div className="flex flex-col items-center gap-8">
              {NAV_ITEMS.map((item, idx) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <Link 
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-4 font-serif text-3xl text-gold-muted transition-colors hover:text-gold-light"
                  >
                    <item.icon className="h-8 w-8" />
                    <span>{item.name}</span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-gold/10 bg-black/80 px-2 py-4 backdrop-blur-lg">
        {NAV_ITEMS.map((item) => (
          <Link key={item.name} href={item.href} className={"flex flex-col items-center gap-1 " + (pathname === item.href ? 'text-gold-light' : 'text-gold-muted')}>
            <item.icon className="h-6 w-6" />
            <span className="text-[10px]">{item.name}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
