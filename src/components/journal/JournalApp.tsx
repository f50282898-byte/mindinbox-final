"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Plus,
  Trash2,
  Edit3,
  Pin,
  Search,
  BookOpen,
  Sparkles,
  Brain,
  Heart,
  Clock,
  Target,
  CheckCheck,
  RotateCw,
} from "lucide-react";
import { AiConsentSwitch } from "@/components/journal/AiConsentSwitch";
import { NoteDrawer } from "@/components/journal/NoteDrawer";
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  COLOR_CLASSES,
} from "@/components/journal/design-tokens";
import { useJournal } from "@/lib/journal/store";
import { type Note, type NoteCategory, type NoteColor } from "@/lib/journal/types";
import { useSession } from "@/lib/session";

const ICON_VARIANTS = [Sparkles, Brain, Heart, Clock, Target, Pin, RotateCw, CheckCheck];

interface NoteDraft {
  title: string;
  content: string;
  category: NoteCategory;
  color: NoteColor;
  imageUrl?: string;
}

export function JournalApp() {
  const { uid } = useSession();

  const hydrate = useJournal((s) => s.hydrate);
  const ready = useJournal((s) => s.ready);
  const notes = useJournal((s) => s.notes);
  const syncing = useJournal((s) => s.syncing);
  const syncError = useJournal((s) => s.syncError);
  const addNote = useJournal((s) => s.addNote);
  const updateNote = useJournal((s) => s.updateNote);
  const deleteNote = useJournal((s) => s.deleteNote);
  const togglePinNote = useJournal((s) => s.togglePinNote);
  const flush = useJournal((s) => s.flush);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!ready || !uid) return;
    void flush(uid);
  }, [ready, uid, flush]);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<NoteCategory>("all");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [newNoteDraft, setNewNoteDraft] = useState<NoteDraft>({
    title: "",
    content: "",
    category: "all",
    color: "amber",
    imageUrl: undefined,
  });
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const up = () => setOffline(false);
    const down = () => setOffline(true);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const pinnedCount = useMemo(() => notes.filter((n) => n.pinned).length, [notes]);

  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => {
        if (activeCategory !== "all" && n.category !== activeCategory) return false;
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;
        const haystack = `${n.title} ${n.content}`.toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
        return b.updatedAt - a.updatedAt;
      });
  }, [notes, searchQuery, activeCategory]);

  const selectedNote = notes.find((n) => n.id === selectedNoteId);

  const draftRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const createNote = useCallback(() => {
    const now = Date.now();
    const note: Note = {
      id: crypto.randomUUID(),
      title: newNoteDraft.title.trim() || "ملاحظة جديدة",
      content: newNoteDraft.content.trim(),
      category: newNoteDraft.category,
      color: newNoteDraft.color,
      imageUrl: newNoteDraft.imageUrl,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    addNote(note);
    setNewNoteDraft({ title: "", content: "", category: "all", color: "amber", imageUrl: undefined });
    setSelectedNoteId(note.id);
    setIsDrawerOpen(true);
  }, [addNote, newNoteDraft]);

  const saveDraft = useCallback(() => {
    if (draftRef.current) clearTimeout(draftRef.current);
    draftRef.current = setTimeout(() => {
      if (editingNote) {
        updateNote(editingNote.id, {
          title: newNoteDraft.title,
          content: newNoteDraft.content,
          category: newNoteDraft.category,
          color: newNoteDraft.color,
        });
      }
    }, 800);
  }, [editingNote, newNoteDraft, updateNote]);

  useEffect(() => {
    saveDraft();
  }, [saveDraft, newNoteDraft]);

  const handleDelete = useCallback((id: string) => {
    if (!window.confirm("هل تريد حذف هذه الملاحظة نهائياً؟")) return;
    deleteNote(id);
    if (selectedNoteId === id) {
      setSelectedNoteId(null);
      setIsDrawerOpen(false);
    }
  }, [deleteNote, selectedNoteId]);

  const handlePin = useCallback((id: string) => {
    togglePinNote(id);
  }, [togglePinNote]);

  return (
    <div className="relative flex flex-col h-[calc(100vh-5rem)] overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-white/[0.04] backdrop-blur-md z-20">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" aria-hidden="true" />
            <input
              type="search"
              placeholder="ابحث في ملاحظاتك…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="field w-full pl-9 pr-4 py-2.5 text-xs text-zinc-200 placeholder-zinc-500/60"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setNewNoteDraft({ title: "", content: "", category: "all", color: "amber", imageUrl: undefined });
              setEditingNote(null);
              setIsDrawerOpen(true);
            }}
            className="flex shrink-0 items-center justify-center size-9 rounded-full border border-white/10 bg-white/[0.04] text-zinc-300 transition-colors hover:border-amber-500/30 hover:text-amber-400 hover:bg-amber-500/5"
            aria-label="ملاحظة جديدة"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {syncError ? (
            <span className="text-[0.65rem] text-zinc-400/70">محفوظ على جهازك</span>
          ) : syncing ? (
            <span className="text-[0.65rem] text-zinc-400/70">يحفظ…</span>
          ) : null}
          {offline && (
            <span className="text-[0.65rem] text-amber-400/80">لا يوجد اتصال</span>
          )}
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-1 px-4 py-2 border-b border-white/10 bg-white/[0.03] overflow-x-auto scrollbar-hide">
        {Object.entries(CATEGORY_LABELS).map(([id, label]) => {
          const active = activeCategory === id;
          const Icon = CATEGORY_ICONS[id as NoteCategory];
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-pressed={active}
              onClick={() => setActiveCategory(id as NoteCategory)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                  : "border-white/10 text-zinc-400/60 hover:border-white/20 hover:text-zinc-200"
              }`}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-x-hidden overflow-y-auto px-4 py-3" style={{ scrollbarWidth: "none" }}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <h2 className="display-arabic text-sm font-semibold text-gold-light">
              مفكرتي الخاصة
            </h2>
            <span className="text-xs text-gold-muted/60">
              {notes.length} ملاحظة{pinnedCount > 0 ? ` · ${pinnedCount} مثبت` : ""}
            </span>
          </div>

          {filteredNotes.length === 0 && searchQuery && (
            <p className="ml-auto text-xs text-gold-muted/60">لا توجد نتائج</p>
          )}
        </div>

        {filteredNotes.length === 0 && !searchQuery && (
          <div className="flex flex-col items-center justify-center h-full min-h-[40vh] px-6 text-center">
            <BookOpen className="size-16 mb-4 text-zinc-600/40" aria-hidden="true" />
            <h3 className="display-arabic text-lg font-bold text-zinc-200 mb-2">
              لا توجد ملاحظات بعد
            </h3>
            <p className="display-arabic text-sm text-zinc-400/70 max-w-xs mx-auto">
              ابدأ بكتابة أول فكرة، تأمل، أو مقتطف. كل ملاحظة تُحفظ فوراً على جهازك
              وتتم مزامنتها عند العودة للاتصال.
            </p>
            <button type="button" onClick={createNote} className="mt-6 btn-gold px-8 py-3 text-sm font-semibold">
              <span>ملاحظة أولى</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              isActive={selectedNoteId === note.id}
              onSelect={() => {
                setSelectedNoteId(note.id);
                setEditingNote(null);
                setNewNoteDraft({
                  title: note.title,
                  content: note.content,
                  category: note.category,
                  color: note.color,
                });
                setIsDrawerOpen(true);
              }}
              onPin={() => handlePin(note.id)}
              onDelete={handleDelete}
              onEdit={() => {
                setEditingNote(note);
                setNewNoteDraft({
                  title: note.title,
                  content: note.content,
                  category: note.category,
                  color: note.color,
                });
                setIsDrawerOpen(true);
              }}
            />
          ))}
        </div>
      </div>

      <NoteDrawer
        open={isDrawerOpen}
        note={selectedNote ?? undefined}
        _isEditing={!!editingNote}
        draft={newNoteDraft}
        setDraft={setNewNoteDraft}
        onSave={createNote}
        onUpdate={() => {
          if (editingNote) {
            updateNote(editingNote.id, {
              title: newNoteDraft.title,
              content: newNoteDraft.content,
              category: newNoteDraft.category,
              color: newNoteDraft.color,
              imageUrl: newNoteDraft.imageUrl,
            });
            setEditingNote(null);
            setIsDrawerOpen(false);
          }
        }}
        onDelete={editingNote ? () => handleDelete(editingNote.id) : undefined}
        onPin={togglePinNote}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedNoteId(null);
          setEditingNote(null);
          setNewNoteDraft({ title: "", content: "", category: "all", color: "amber", imageUrl: undefined });
        }}
      />

      <div className="fixed bottom-4 right-4 z-30">
        <AiConsentSwitch />
      </div>
    </div>
  );
}

function NoteCard({
  note,
  isActive,
  onSelect,
  onPin,
  onDelete,
  onEdit,
}: {
  note: Note;
  isActive: boolean;
  onSelect: () => void;
  onPin: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: () => void;
}) {
  const Icon = ICON_VARIANTS[note.id.length % ICON_VARIANTS.length];
  const colorClass = COLOR_CLASSES[note.color];
  const isPinned = note.pinned;

  return (
    <article
      className={`group relative rounded-2xl border p-4 cursor-pointer transition-all duration-200 ${colorClass} ${isActive ? "ring-1 ring-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.12)]" : "hover:border-amber-500/40 hover:shadow-2xl hover:-translate-y-1"}`}
      onClick={onSelect}
    >
      {isPinned && (
        <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] text-amber-400/80">
          <Pin className="size-3.5" /> مثبت
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <div className="flex size-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-amber-400/90">
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <span className="display-latin text-[10px] tracking-[0.18em] text-zinc-500/70 uppercase font-medium">
          {CATEGORY_LABELS[note.category]}
        </span>
      </div>

      {note.imageUrl && (
        <div className="mb-3 aspect-video overflow-hidden rounded-xl border border-white/10">
          <img
            src={note.imageUrl}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}

      <h3 className={`display-arabic mb-1.5 text-sm font-bold ${isPinned ? "text-amber-400" : "text-zinc-100"} leading-tight line-clamp-2`}>
        {note.title}
      </h3>

      <p className="display-arabic mb-3 text-xs leading-relaxed text-zinc-400/70 line-clamp-3">
        {note.content || "لا يوجد محتوى بعد."}
      </p>

      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500/60">
            {new Date(note.updatedAt).toLocaleDateString("ar-SA", {
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>
        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPin(note.id);
            }}
            aria-label={isPinned ? "إزالة التثبيت" : "تثبيت"}
            className="size-7 rounded-full border border-white/10 p-1 text-zinc-400/60 transition-colors hover:border-amber-500/40 hover:text-amber-400 hover:bg-amber-500/5"
          >
            <Pin className="size-3" fill={isPinned ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="تعديل"
            className="size-7 rounded-full border border-white/10 p-1 text-zinc-400/60 transition-colors hover:border-amber-500/40 hover:text-amber-400"
          >
            <Edit3 className="size-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(note.id);
            }}
            aria-label="حذف"
            className="size-7 rounded-full border border-white/10 p-1 text-zinc-400/60 transition-colors hover:border-rose-500/40 hover:text-rose-400"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>

      <span className="sr-only">{note.title}</span>
    </article>
  );
}

export default JournalApp;
