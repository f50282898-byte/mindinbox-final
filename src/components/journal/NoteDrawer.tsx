"use client";

import { useEffect, useRef } from "react";
import { BookOpen, ArrowLeft, Pin } from "lucide-react";
import { type Note, type NoteCategory, type NoteColor } from "@/lib/journal/types";
import { COLOR_CLASSES, COLOR_LABELS, CATEGORY_LABELS, CATEGORY_ICONS } from "@/components/journal/design-tokens";

interface NoteDrawerProps {
  open: boolean;
  note?: Note;
  _isEditing: boolean;
  draft: { title: string; content: string; category: NoteCategory; color: NoteColor };
  setDraft: (v: { title: string; content: string; category: NoteCategory; color: NoteColor }) => void;
  onSave: () => void;
  onUpdate: () => void;
  onDelete?: () => void;
  onPin: (id: string) => void;
  onClose: () => void;
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
            <h3 className={`display-arabic text-sm font-bold ${note?.pinned ? "text-amber-400" : "text-zinc-100"}`}>
              {note?.title ?? "ملاحظة جديدة"}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {note && (
              <button
                type="button"
                onClick={() => onPin(note.id)}
                aria-label={note.pinned ? "إزالة التثبيت" : "تثبيت"}
                className="size-7 rounded-full border border-white/10 p-1 text-zinc-400/60 transition-colors hover:border-amber-500/40 hover:text-amber-400"
              >
                <Pin className="size-3" fill={note.pinned ? "currentColor" : "none"} />
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="إغلاق" className="size-7 rounded-full border border-white/10 p-1 text-zinc-400/60 transition-colors hover:border-amber-500/40 hover:text-amber-400">
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
              defaultValue={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="عنوان الملاحظة…"
              className="w-full border-b border-white/10 bg-transparent pb-1 text-lg font-bold text-zinc-100 outline-none placeholder-zinc-500/40"
            />

            <div className="flex flex-wrap gap-2 mb-1">
              <label className="text-[10px] tracking-[0.15em] text-zinc-500/60 uppercase font-medium">التصنيف</label>
              {Object.entries(CATEGORY_LABELS).map(([id, label]) => {
                const isActive = (note?.category ?? "all") === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDraft({ ...draft, category: id as NoteCategory })}
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] transition-colors ${isActive ? "border-amber-500/40 bg-amber-500/10 text-amber-400" : "border-white/10 text-zinc-400/60"}`}
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
              defaultValue={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              rows={12}
              placeholder="اكتب فكرتك هنا… لا حدود للمساحة، تتسع لما تشاء."
              className="field w-full resize-none min-h-[240px] text-[0.95rem] leading-relaxed text-zinc-200 placeholder-zinc-500/40"
            />

            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <span className="text-[10px] tracking-[0.15em] text-zinc-500/60 uppercase font-medium">اللون</span>
              <div className="flex gap-2">
                {Object.entries(COLOR_CLASSES).map(([color, _cls]) => {
                  const isActive = (note?.color ?? "amber") === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setDraft({ ...draft, color: color as NoteColor })}
                      aria-label={COLOR_LABELS[color as NoteColor]}
                      className={`size-6 rounded-full border transition-colors ${isActive ? "ring-2 ring-amber-500" : "border-white/10"}`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-white/5">
              <label className="block text-[10px] tracking-[0.15em] text-zinc-500/60 uppercase font-medium mb-2">صورة مرفقة (اختياري)</label>
              <input type="file" accept="image/*" className="block w-full text-xs text-zinc-400/60 file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-amber-500/10 file:text-amber-400" aria-hidden={true} />
              {note?.imageUrl && (
                <div className="mt-3 aspect-video overflow-hidden rounded-xl border border-white/10 relative">
                  <img src={note.imageUrl} alt="" className="w-full h-full object-cover" />
                  <button type="button" className="absolute top-2 right-2 size-6 rounded-full bg-black/60 backdrop-blur text-white hover:bg-black/80" aria-label="إزالة الصورة">
                    <span className="size-3.5">✕</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-white/10">
              <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">إلغاء</button>
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
