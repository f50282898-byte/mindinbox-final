"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, ArrowLeft, Pin } from "lucide-react";
import { type Note, type NoteCategory, type NoteColor } from "@/lib/journal/types";
import { COLOR_CLASSES, COLOR_LABELS, CATEGORY_LABELS, CATEGORY_ICONS } from "@/components/journal/design-tokens";

interface NoteDrawerProps {
  open: boolean;
  note?: Note;
  _isEditing: boolean;
  draft: {
    title: string;
    content: string;
    category: NoteCategory;
    color: NoteColor;
    imageUrl?: string;
  };
  setDraft: (v: {
    title: string;
    content: string;
    category: NoteCategory;
    color: NoteColor;
    imageUrl?: string;
  }) => void;
  onSave: () => void;
  onUpdate: () => void;
  onDelete?: () => void;
  onPin: (id: string) => void;
  onClose: () => void;
}

/** Background fill for each color circle — makes the choice visible at a glance. */
const COLOR_BG: Record<NoteColor, string> = {
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  indigo: "bg-indigo-500",
  slate: "bg-slate-400",
};

/** Compress an image file to a JPEG data URL capped at 1200px on the longest side. */
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const scale = Math.min(MAX / width, MAX / height);
        width *= scale;
        height *= scale;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas context unavailable"));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("failed to load image"));
    };
    img.src = url;
  });
}

export function NoteDrawer({
  open,
  note,
  _isEditing,
  draft,
  setDraft,
  onSave,
  onUpdate,
  onDelete,
  onPin,
  onClose,
}: NoteDrawerProps) {
  const titleRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (open && titleRef.current) {
      titleRef.current.focus();
    }
  }, [open]);

  const DrawerIcon = note ? CATEGORY_ICONS[note.category] : BookOpen;

  return (
    <div className={`fixed inset-0 z-40 flex ${open ? "translate-x-0" : "translate-x-full"} transition-transform duration-300`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-2xl h-full bg-white/[0.06] border-l border-white/10 backdrop-blur-xl flex flex-col shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-amber-400/90">
              <DrawerIcon className="size-4" />
            </div>
            <h3 className={`display-arabic text-sm font-bold ${note?.pinned ? "text-amber-400" : "text-ink-1"}`}>
              {note?.title ?? "ملاحظة جديدة"}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {note && (
              <button
                type="button"
                onClick={() => onPin(note.id)}
                aria-label={note.pinned ? "إزالة التثبيت" : "تثبيت"}
                className="size-7 rounded-full border border-white/10 p-1 text-ink-3 transition-colors hover:border-amber-500/40 hover:text-amber-400"
              >
                <Pin className="size-3" fill={note.pinned ? "currentColor" : "none"} />
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="إغلاق" className="size-7 rounded-full border border-white/10 p-1 text-ink-3 transition-colors hover:border-amber-500/40 hover:text-amber-400">
              <ArrowLeft className="size-3" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <form onSubmit={(e) => { e.preventDefault(); if (note) { onUpdate(); } else { onSave(); } }} className="flex flex-col gap-4">
            <label htmlFor="drawer-note-title" className="sr-only">عنوان الملاحظة</label>
            <input
              id="drawer-note-title"
              ref={titleRef}
              dir="auto"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="عنوان الملاحظة…"
              className="w-full border-b border-white/10 bg-transparent pb-1 text-lg font-bold text-ink-1 outline-none placeholder-zinc-500/40"
            />

            <div className="flex flex-wrap gap-2 mb-1">
              <label className="text-[10px] tracking-[0.15em] text-ink-3 uppercase font-medium">التصنيف</label>
              {Object.entries(CATEGORY_LABELS).map(([id, label]) => {
                const isActive = draft.category === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDraft({ ...draft, category: id as NoteCategory })}
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] transition-colors ${isActive ? "border-amber-500/40 bg-amber-500/10 text-amber-400" : "border-white/10 text-ink-3"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <label htmlFor="drawer-note-content" className="sr-only">محتوى الملاحظة</label>
            <textarea
              id="drawer-note-content"
              dir="auto"
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              rows={12}
              placeholder="اكتب فكرتك هنا… لا حدود للمساحة، تتسع لما تشاء."
              className="field w-full resize-none min-h-[240px] text-[0.95rem] leading-relaxed text-ink-1 placeholder-zinc-500/40"
            />

            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <span className="text-[10px] tracking-[0.15em] text-ink-3 uppercase font-medium">اللون</span>
              <div className="flex gap-2">
                {Object.entries(COLOR_CLASSES).map(([color, _cls]) => {
                  const isActive = draft.color === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setDraft({ ...draft, color: color as NoteColor })}
                      aria-label={COLOR_LABELS[color as NoteColor]}
                      className={`size-6 rounded-full border transition-colors ${COLOR_BG[color as NoteColor]} ${isActive ? "ring-2 ring-offset-1 ring-amber-500" : "border-white/10"}`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-white/5">
              <label className="block text-[10px] tracking-[0.15em] text-ink-3 uppercase font-medium mb-2">صورة مرفقة (اختياري)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
                  if (!allowedTypes.includes(file.type)) {
                    setUploadError("نوع الملف غير مدعوم. يُسمح فقط بصور JPEG أو PNG أو WEBP.");
                    return;
                  }
                  if (file.size > 5 * 1024 * 1024) {
                    setUploadError("حجم الصورة كبير جداً. الحد الأقصى 5 ميغابايت.");
                    return;
                  }
                  setUploadError(null);
                  void compressImage(file).then((dataUrl) =>
                    setDraft({ ...draft, imageUrl: dataUrl })
                  );
                }}
                className="block w-full text-xs text-ink-3 file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gold/10 file:text-gold-light" aria-hidden={true}
              />
              {uploadError && (
                <p className="mt-1 text-xs text-rose-400">{uploadError}</p>
              )}
              {((draft.imageUrl ?? note?.imageUrl) && (
                <div className="mt-3 aspect-video overflow-hidden rounded-xl border border-white/10 relative">
                  <img
                    src={draft.imageUrl ?? note!.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, imageUrl: undefined })}
                    aria-label="إزالة الصورة"
                    className="absolute top-2 right-2 size-6 rounded-full bg-black/60 backdrop-blur text-white hover:bg-black/80"
                  >
                    <span className="size-3.5">✕</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-white/10">
              <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs text-ink-3 hover:text-ink-1 transition-colors">إلغاء</button>
              {note && onDelete && (
                <button type="button" onClick={(e) => { e.preventDefault(); if (window.confirm("هل تريد حذف هذه الملاحظة نهائياً؟")) { onDelete(); onClose(); } }} className="px-5 py-2.5 text-xs text-rose-400 hover:text-rose-300 transition-colors">حذف</button>
              )}
              <button type="submit" disabled={!draft.title.trim() && !draft.content.trim()} className="btn-gold px-6 py-2.5 text-sm font-semibold disabled:opacity-35 disabled:cursor-not-allowed">{note ? "تحديث" : "حفظ"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
