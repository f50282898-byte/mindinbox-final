"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

type PointerPosition = { x: number; y: number };

export function UtopiaHero() {
  const [pointer, setPointer] = useState<PointerPosition>({ x: -100, y: -100 });
  const [cursorVisible, setCursorVisible] = useState(false);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      setPointer({ x: event.clientX, y: event.clientY });
      setCursorVisible(true);
    };
    const handlePointerLeave = () => setCursorVisible(false);

    window.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  return (
    <main className="utopia-shell">
      <div aria-hidden="true" className="utopia-grain" />
      <div aria-hidden="true" className="utopia-horizon" />
      <div aria-hidden="true" className="utopia-colonnade">
        {[0, 1, 2, 3, 4].map((column) => (
          <span className="utopia-column" key={column} />
        ))}
      </div>

      <motion.div
        aria-hidden="true"
        className="golden-cursor"
        animate={{ x: pointer.x - 7, y: pointer.y - 7, opacity: cursorVisible ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 24, mass: 0.3 }}
      />

      <section className="utopia-content">
        <motion.p
          className="utopia-kicker"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
        >
          A PLACE FOR THE INNER LIFE
        </motion.p>

        <motion.h1
          className="utopia-title"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
        >
          عقل في صندوق
        </motion.h1>

        <motion.p
          className="utopia-subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.8 }}
          dir="ltr"
        >
          Mind in a Box
        </motion.p>

        <motion.div
          aria-hidden="true"
          className="utopia-rule"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: 1 }}
        />

        <motion.p
          className="utopia-invitation"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.1 }}
        >
          ادخل إلى مساحةٍ أهدأ للفكر
        </motion.p>
      </section>

      <span aria-hidden="true" className="utopia-coordinate" dir="ltr">
        37° 58′ 17″ N&nbsp; / &nbsp;23° 43′ 36″ E
      </span>
    </main>
  );
}
