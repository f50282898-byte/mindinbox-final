"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { auth } from "@/lib/firebase";
import type { SiteContent, NavItem } from "@/lib/admin/site-schema";

/**
 * The site builder: reorder, toggle, rename → preview → publish → undo.
 *
 * ## Why the editor never writes to `published`
 *
 * Every edit goes into a local draft, and the draft is saved to `siteContent/draft` —
 * a document the public site never reads. Only «انشر» moves it, and only after the
 * server has re-validated it and checked the version lock. So a half-finished
 * reordering is invisible to readers, which is the difference between a CMS and a way
 * to break a website.
 *
 * ## Why a version conflict reloads instead of merging
 *
 * Two admins, two tabs, both publish. The server refuses the second. The console does
 * not attempt to merge two orderings of a sidebar — there is no correct merge — it
 * reloads and tells the admin what happened.
 *
 * ## Keyboard dragging is not a nicety here
 *
 * `KeyboardSensor` with `sortableKeyboardCoordinates` means the sidebar can be
 * reordered with Space, arrows, Space. The whole console is operable without a mouse,
 * which is also the cheapest way to find out whether the layout makes sense.
 */
export function SiteBuilder() {
  const [draft, setDraft] = useState<SiteContent | null>(null);
  const [publishedVersion, setPublishedVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // A 6px threshold so a click on the row's button is not read as the start of a drag.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = useCallback(async () => {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
    if (!token) return;
    try {
      const res = await fetch("/api/admin/site", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        setNotice("تعذّر تحميل المسودة.");
        return;
      }
      const data = (await res.json()) as { ok: boolean; content: SiteContent };
      setDraft(data.content);
      setPublishedVersion(data.content.version);
      setDirty(false);
    } catch {
      setNotice("تعذّر تحميل المسودة.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const authed = useCallback(async (): Promise<string | null> => {
    const user = auth?.currentUser;
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }, []);

  /* ── Publish ───────────────────────────────────────────────────────────────
     Sends the draft first, then publishes with the version it loaded. If the
     publish is refused for a conflict, the draft is still saved — the admin's work
     is not lost, only the publish. */
  const publish = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    setNotice(null);

    const token = await authed();
    if (!token) {
      setBusy(false);
      setNotice("انتهت الجلسة. سجّل الدخول من جديد.");
      return;
    }

    try {
      const save = await fetch("/api/admin/site", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: draft, loadedVersion: publishedVersion }),
      });
      if (!save.ok) {
        const data = (await save.json().catch(() => ({}))) as { issues?: string[] };
        setNotice(
          data.issues?.length
            ? `المسودة غير صالحة: ${data.issues[0]}`
            : "تعذّر حفظ المسودة."
        );
        return;
      }

      const res = await fetch("/api/admin/site/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ expectedVersion: publishedVersion }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        version?: number;
        error?: string;
        currentVersion?: number;
      };

      if (!res.ok || !data.ok) {
        if (data.error === "version_conflict") {
          setNotice(
            `نُشر شيء آخر (النسخة ${data.currentVersion}). مسودتك محفوظة؛ أعد التحميل ثم انشر.`
          );
        } else {
          setNotice("تعذّر النشر.");
        }
        return;
      }

      setPublishedVersion(data.version ?? publishedVersion + 1);
      setDraft((d) => (d ? { ...d, version: data.version ?? d.version, publishedAt: Date.now() } : d));
      setDirty(false);
      setNotice("نُشر.");
    } catch {
      setNotice("تعذّر النشر.");
    } finally {
      setBusy(false);
    }
  }, [draft, publishedVersion, authed]);

  const undo = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    const token = await authed();
    if (!token) {
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/admin/site/undo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setNotice("لا توجد نسخة سابقة محفوظة.");
        return;
      }
      await load();
      setNotice("أُعيدت النسخة السابقة.");
    } catch {
      setNotice("تعذّر التراجع.");
    } finally {
      setBusy(false);
    }
  }, [authed, load]);

  const reorderNav = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      if (!d) return d;
      const from = d.nav.findIndex((n) => n.id === active.id);
      const to = d.nav.findIndex((n) => n.id === over.id);
      if (from < 0 || to < 0) return d;
      return { ...d, nav: arrayMove(d.nav, from, to) };
    });
    setDirty(true);
  }, []);

  const toggle = useCallback((id: NavItem["id"]) => {
    setDraft((d) =>
      d ? { ...d, nav: d.nav.map((n) => (n.id === id ? { ...n, visible: !n.visible } : n)) } : d
    );
    setDirty(true);
  }, []);

  const rename = useCallback((id: NavItem["id"], lang: "ar" | "en", value: string) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            nav: d.nav.map((n) => (n.id === id ? { ...n, label: { ...n.label, [lang]: value } } : n)),
          }
        : d
    );
    setDirty(true);
  }, []);

  const visibleNav = useMemo(() => draft?.nav.filter((n) => n.visible) ?? [], [draft]);

  if (!draft) {
    return (
      <p role="status" className="text-sm text-gold-muted/70">
        جارٍ التحميل…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-gold-muted/60">
          النسخة المنشورة: {publishedVersion} {dirty ? "— مسودة غير منشورة" : ""}
        </p>
        <button
          type="button"
          onClick={publish}
          disabled={busy}
          className="rounded-lg border border-accent-solid/60 px-4 py-2 text-sm text-accent-solid disabled:opacity-40"
        >
          {busy ? "جارٍ…" : "انشر"}
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={busy}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm text-gold-muted disabled:opacity-40"
        >
          تراجع
        </button>
      </div>

      {notice && (
        <p role="status" className="text-sm text-gold-light">
          {notice}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="mb-2 text-xs text-gold-muted">ترتيب الشريط (اسحب أو استخدم الأسهم)</h3>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderNav}>
            <SortableContext
              items={draft.nav.map((n) => n.id)}
              strategy={rectSortingStrategy}
            >
              <ul className="flex flex-col gap-2">
                {draft.nav.map((item) => (
                  <SortableNavRow
                    key={item.id}
                    item={item}
                    onToggle={() => toggle(item.id)}
                    onRename={(lang, value) => rename(item.id, lang, value)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </section>

        <section>
          <h3 className="mb-2 text-xs text-gold-muted">معاينة حيّة</h3>
          <iframe
            title="معاينة الموقع"
            src="/?preview=1"
            className="h-[420px] w-full rounded-xl border border-white/10 bg-black"
          />
          <p className="mt-2 text-xs text-gold-muted/60">
            المعاينة تحمّل الصفحة الحقيقية. ما تراه في «ترتيب الشريط» هو ما سيظهر بعد
            النشر، لا ما هو منشور الآن.
          </p>
          <ul className="mt-3 flex flex-col gap-1 text-xs text-gold-muted/70">
            {visibleNav.length === 0 ? (
              <li>كل عناصر التنقّل مخفية — الموقع بلا شريط.</li>
            ) : (
              visibleNav.map((n) => <li key={n.id}>• {n.label.ar}</li>)
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

function SortableNavRow({
  item,
  onToggle,
  onRename,
}: {
  item: NavItem;
  onToggle: () => void;
  onRename: (lang: "ar" | "en", value: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/30 p-2 ${
        isDragging ? "opacity-70" : ""
      }`}
    >
      <button
        type="button"
        // These are the drag handles, and they are buttons so they are focusable and
        // operable by keyboard. `aria-label` says what they do rather than naming the row.
        aria-label={`اسحب ${item.label.ar}`}
        className="cursor-grab px-1 text-gold-muted/60"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>

      <span dir="ltr" className="text-xs text-gold-muted/50">
        {item.id}
      </span>

      <label className="sr-only" htmlFor={`ar-${item.id}`}>
        الاسم بالعربية
      </label>
      <input
        id={`ar-${item.id}`}
        dir="rtl"
        value={item.label.ar}
        onChange={(e) => onRename("ar", e.target.value)}
        className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-sm text-gold-light outline-none focus:border-accent-solid/60"
      />

      <label className="sr-only" htmlFor={`en-${item.id}`}>
        الاسم بالإنجليزية
      </label>
      <input
        id={`en-${item.id}`}
        dir="ltr"
        value={item.label.en}
        onChange={(e) => onRename("en", e.target.value)}
        className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-sm text-gold-light outline-none focus:border-accent-solid/60"
      />

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={item.visible}
        className="rounded border border-white/15 px-2 py-1 text-xs text-gold-muted"
      >
        {item.visible ? "مخفي" : "ظاهر"}
      </button>
    </li>
  );
}
