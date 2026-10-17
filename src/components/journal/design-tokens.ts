import { BookOpen, Brain, MessageSquare, Target, CheckCheck } from "lucide-react";
import { type NoteCategory, type NoteColor } from "@/lib/journal/types";

export const CATEGORY_LABELS: Record<NoteCategory, string> = {
  all: "جميع الملاحظات",
  philosophical: "تأملات فلسفية",
  chat: "مقتطفات من الحوار",
  goals: "أهداف وعادات",
  habits: "تتبّع العادات",
};

export const CATEGORY_ICONS: Record<NoteCategory, React.ElementType> = {
  all: BookOpen,
  philosophical: Brain,
  chat: MessageSquare,
  goals: Target,
  habits: CheckCheck,
};

export const COLOR_CLASSES: Record<NoteColor, string> = {
  amber: "bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20",
  emerald: "bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20",
  rose: "bg-gradient-to-br from-rose-500/10 to-rose-500/5 border-rose-500/20",
  indigo: "bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border-indigo-500/20",
  slate: "bg-gradient-to-br from-slate-500/10 to-slate-500/5 border-slate-500/20",
};

export const COLOR_LABELS: Record<NoteColor, string> = {
  amber: "ذهبي",
  emerald: "زمردي",
  rose: "وردي",
  indigo: "نيلي",
  slate: "رمادي",
};
