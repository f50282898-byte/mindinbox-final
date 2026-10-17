"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";

/**
 * Bottom Sheet — بطاقة منزلقة من الأسفل للهاتف المحمول.
 *
 * على سطح المكتب تُعرض المحتوى ضمن الصفحة كالمعتاد.
 * على الهاتف تنزلق البطاقة من الأسفل وتغطّي معظم الشاشة مع ترك جزء علوي
 * من الخلفية مرئياً، وكأنها جزء من نظام التشغيل الأصلي.
 *
 * usage: render BottomSheet with open/onClose props and children content
 */
export function BottomSheet({
  open,
  onClose,
  children,
  headerTitle,
  headerIcon,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  headerTitle?: string;
  headerIcon?: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // إغلاق عند النقر على الخلفية
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  // تفعيل تأثير التمرير عند الفتح
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setIsAnimating(true);
    } else {
      setIsAnimating(false);
      setTimeout(() => {
        document.body.style.overflow = "";
      }, 300);
    }
  }, [open]);

  if (!open && !isAnimating) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col ${
        open
          ? "translate-y-0 opacity-100 transition-all duration-300 ease-out"
          : "translate-y-full opacity-0 transition-all duration-200 ease-in"
      }`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={headerTitle || "بطاقة محتوى"}
    >
      {/* خلفية معتمة */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm z-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* بطاقة الورقة */}
      <div
        ref={sheetRef}
        className={`relative z-10 flex flex-col h-full max-h-[90vh] rounded-t-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-2xl transition-all duration-300 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* مقبض السحب */}
        <div
          className="mx-auto w-12 h-1.5 rounded-full bg-white/20 mt-3 mb-2"
          aria-hidden="true"
        />

        {/* رأس البطاقة */}
        {headerTitle && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.03]">
            <div className="flex items-center gap-2">
              {headerIcon && <span className="size-5 text-amber-400">{headerIcon}</span>}
              <h3 className="display-arabic font-bold text-zinc-100 text-sm">
                {headerTitle}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="size-8 rounded-full border border-white/10 text-zinc-400/60 hover:border-white/20 hover:text-zinc-100 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* محتوى البطاقة */}
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {/* تلميح السحب */}
        <div className="px-6 py-2 text-center">
          <span className="text-[10px] text-zinc-500/60 uppercase tracking-widest font-medium">
            اسحب للأسفل للإغلاق
          </span>
        </div>
      </div>
    </div>
  );
}
