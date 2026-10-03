"use client";

/**
 * Conversation storage — local-first, Firestore when signed in.
 *
 * Why local-first: a philosophical journal must work on a train. The local copy
 * is the source of truth for rendering and is written synchronously, so a reply
 * appears instantly and survives a dropped connection. Firestore is the sync
 * target, not the read path.
 *
 * Why that ordering matters for acceptance: a guest who signs up must keep their
 * conversations. Because the local copy was written *before* sign-up, the sync
 * queue still holds those conversations and pushes them to the new uid — no
 * migration step, nothing to lose.
 *
 * Local shape (one key, small):
 *   mindinbox-conversations/v1 → { conversations: Conversation[] }
 *
 * Firestore shape (data model v1):
 *   users/{uid}/conversations/{id}
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { create } from "zustand";
import { db, paths } from "@/lib/firebase";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Persona id for assistant turns. */
  personaId?: string;
  /** Provider that answered, for the discreet footnote. */
  via?: string;
  createdAt: number;
  /** False while a reply is still streaming or was cut short. */
  complete: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  personaId: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
  /** True once the server has accepted it. Local-only conversations sync later. */
  synced: boolean;
}

const STORAGE_KEY = "mindinbox-conversations/v1";
/** Keeps the payload small enough for localStorage without a quota error. */
const MAX_LOCAL = 60;

interface PersistedShape {
  conversations: Conversation[];
  /** Restored on load so a reload returns you to the thread you were reading. */
  activeId: string | null;
}

function readLocal(): { conversations: Conversation[]; activeId: string | null } {
  if (typeof window === "undefined") return { conversations: [], activeId: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { conversations: [], activeId: null };
    const parsed = JSON.parse(raw) as PersistedShape;
    if (!Array.isArray(parsed?.conversations)) {
      return { conversations: [], activeId: null };
    }
    const conversations = parsed.conversations.filter(
      (c): c is Conversation =>
        Boolean(c) && typeof c.id === "string" && Array.isArray(c.messages)
    );
    return { conversations, activeId: typeof parsed.activeId === "string" ? parsed.activeId : null };
  } catch {
    // Corrupt payload: start clean rather than crash on every render.
    return { conversations: [], activeId: null };
  }
}

function writeLocal(conversations: Conversation[], activeId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const slice = conversations
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_LOCAL);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        conversations: slice,
        // Only keep the pointer if that conversation survived the slice.
        activeId: slice.some((c) => c.id === activeId) ? activeId : null,
      } satisfies PersistedShape)
    );
  } catch {
    // Over quota or private mode. The in-memory copy still works for this tab.
  }
}

/** Derives a title from the first user message, without inventing content. */
export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "محادثة جديدة";
  const cut = clean.slice(0, 48);
  return clean.length > 48 ? `${cut}…` : cut;
}

interface ConversationsState {
  conversations: Conversation[];
  activeId: string | null;
  /** Guards against writing during hydration. */
  ready: boolean;

  hydrate: () => void;
  create: (personaId: string, firstMessage?: string) => Conversation;
  get: (id: string) => Conversation | undefined;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  setActive: (id: string | null) => void;
  appendMessage: (conversationId: string, message: ConversationMessage) => void;
  patchMessage: (
    conversationId: string,
    messageId: string,
    patch: Partial<ConversationMessage>
  ) => void;
  /** Pushes local-only conversations to Firestore for `uid`. */
  syncTo: (uid: string | null) => Promise<void>;
}

export const useConversations = create<ConversationsState>()((set, get) => ({
  conversations: [],
  activeId: null,
  ready: false,

  hydrate: () => {
    if (get().ready) return;
        const loaded = readLocal();
    // Restore the pointer so a reload returns to the thread being read rather
    // than dumping the visitor back on the picker.
    set({
      conversations: loaded.conversations,
      activeId:
        loaded.activeId && loaded.conversations.some((c) => c.id === loaded.activeId)
          ? loaded.activeId
          : null,
      ready: true,
    });
  },

  create: (personaId, firstMessage) => {
    const now = Date.now();
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title: firstMessage ? titleFrom(firstMessage) : "محادثة جديدة",
      personaId,
      messages: [],
      createdAt: now,
      updatedAt: now,
      synced: false,
    };
    set((s) => {
      const next = [conversation, ...s.conversations];
      writeLocal(next, conversation.id);
      return { conversations: next, activeId: conversation.id };
    });
    return conversation;
  },

  get: (id) => get().conversations.find((c) => c.id === id),

  rename: (id, title) =>
    set((s) => {
      const next = s.conversations.map((c) =>
        c.id === id ? { ...c, title: title.trim() || c.title, updatedAt: Date.now() } : c
      );
      writeLocal(next, s.activeId);
      return { conversations: next };
    }),

  remove: (id) =>
    set((s) => {
      const next = s.conversations.filter((c) => c.id !== id);
      const activeId = s.activeId === id ? null : s.activeId;
      writeLocal(next, activeId);
      return { conversations: next, activeId };
    }),

  setActive: (activeId) =>
    set((s) => {
      writeLocal(s.conversations, activeId);
      return { activeId };
    }),

  appendMessage: (conversationId, message) =>
    set((s) => {
      const next = s.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const messages = [...c.messages, message];
        return {
          ...c,
          // Name the conversation after the user's own first words, once.
          title:
            c.title === "محادثة جديدة" && message.role === "user"
              ? titleFrom(message.content)
              : c.title,
          messages,
          updatedAt: Date.now(),
          synced: false,
        };
      });
      writeLocal(next, s.activeId);
      return { conversations: next };
    }),

  patchMessage: (conversationId, messageId, patch) =>
    set((s) => {
      const next = s.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
          updatedAt: Date.now(),
          // A patch during streaming must not mark it synced.
          synced: patch.complete ? c.synced : false,
        };
      });
      writeLocal(next, s.activeId);
      return { conversations: next };
    }),

  /**
   * Pushes anything not yet in Firestore, then subscribes to remote changes.
   *
   * The push comes first and is unconditional: this is what carries a guest's
   * conversations across sign-up, since they were written locally under the
   * pre-auth uid and are marked `synced: false`.
   */
  syncTo: async (uid) => {
    const state = get();

    if (!uid || !db) {
      // Signed out: everything stays local.
      return;
    }

    const pending = state.conversations.filter((c) => !c.synced);
    for (const conversation of pending) {
      try {
        const ref = doc(db, `${paths.userConversations(uid)}/${conversation.id}`);
        await setDoc(
          ref,
          {
            title: conversation.title,
            personaId: conversation.personaId,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            messages: conversation.messages.slice(-60),
          },
          { merge: true }
        );
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversation.id ? { ...c, synced: true } : c
          ),
        }));
      } catch {
        // Leave it pending; the next sync retries. Never lose a conversation to
        // a failed write.
      }
    }

    // Live mirror, so another device's changes appear here.
    const col = collection(db, paths.userConversations(uid));
    const q = query(col, orderBy("updatedAt", "desc"));
    onSnapshot(
      q,
      (snap) => {
        const remote = snap.docs.map((d) => {
          const data = d.data() as Partial<Conversation>;
          return {
            id: d.id,
            title: data.title ?? "محادثة",
            personaId: data.personaId ?? "plato",
            messages: Array.isArray(data.messages) ? (data.messages as ConversationMessage[]) : [],
            createdAt: data.createdAt ?? 0,
            updatedAt: data.updatedAt ?? 0,
            synced: true,
          } satisfies Conversation;
        });

        set((s) => {
          // Merge rather than replace: local unsynced work must survive.
          // The map is widened explicitly — `remote` entries are narrowed to
          // `synced: true` by the `satisfies` above, but local ones are not.
          const byId = new Map<string, Conversation>();
          for (const c of remote) byId.set(c.id, c);
          for (const local of s.conversations) {
            if (!byId.has(local.id) && !local.synced) byId.set(local.id, local);
          }
          const merged = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
          writeLocal(merged, s.activeId);
          return { conversations: merged };
        });
      },
      () => undefined
    );
  },
}));

/** Deletes a conversation from Firestore. Local removal happens separately. */
export async function deleteRemote(uid: string, conversationId: string): Promise<void> {
  if (!db) return;
  try {
    await deleteDoc(doc(db, `${paths.userConversations(uid)}/${conversationId}`));
  } catch {
    // Local removal already happened; the remote copy will be retried by a
    // future delete or pruned by the user's own account deletion.
  }
}

/** Renames in Firestore. */
export async function renameRemote(
  uid: string,
  conversationId: string,
  title: string
): Promise<void> {
  if (!db) return;
  try {
    await updateDoc(doc(db, `${paths.userConversations(uid)}/${conversationId}`), {
      title,
      updatedAt: Date.now(),
    });
  } catch {
    // Non-fatal: the local name is what the user sees.
  }
}

/** First load of a conversation list for a uid, used when local is empty. */
export async function fetchRemote(uid: string): Promise<Conversation[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(query(collection(db, paths.userConversations(uid))));
    return snap.docs.map((d) => {
      const data = d.data() as Partial<Conversation>;
      const conversation: Conversation = {
        id: d.id,
        title: data.title ?? "محادثة",
        personaId: data.personaId ?? "plato",
        messages: Array.isArray(data.messages) ? (data.messages as ConversationMessage[]) : [],
        createdAt: data.createdAt ?? 0,
        updatedAt: data.updatedAt ?? 0,
        synced: true,
      };
      return conversation;
    });
  } catch {
    return [];
  }
}

/** Re-exported so callers do not need a second import for the common case. */
export { where };
