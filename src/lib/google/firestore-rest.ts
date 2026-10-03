/**
 * Server-side Firestore access over REST, authorised with a service-account
 * access token from `src/lib/google/token.ts`.
 *
 * Used for the writes the browser Client SDK must never be trusted with:
 * `subscriptions`, `usage`, `grants`, `metrics`, and the cascade delete on
 * account removal. Also used to *read* `admins/{uid}` when deciding admin
 * rights, because the definition of admin is "that document exists" — a fact
 * only the server can be sure the caller is not asserting for themselves.
 *
 * Edge-safe: Web `fetch` only, no SDK, no Node built-ins.
 */

import { getAccessToken, serviceProjectId } from "@/lib/google/token";
import { log } from "@/lib/log";

const FIRESTORE_BASE = "https://firestore.googleapis.com/v1";

export class FirestoreAdminError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FirestoreAdminError";
    this.status = status;
  }
}

/** Firestore document paths are `a/b/c`; collections are `a/b/{doc}/c`. */
function segments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

async function adminFetch(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<unknown> {
  const token = await getAccessToken();
  const project = serviceProjectId();
  if (!token || !project) {
    throw new FirestoreAdminError("server credentials unavailable", 503);
  }

  const url = `${FIRESTORE_BASE}/projects/${project}/databases/(default)/documents/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token.token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    // Status and path only — a response body can echo field values.
    log.error("firestore_rest_failed", { method, path, status: res.status });
    throw new FirestoreAdminError(`firestore ${method} failed`, res.status);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Firestore REST field values need explicit types; build them from plain JSON. */
export function firestoreValue(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, firestoreValue(v)])
        ),
      },
    };
  }
  throw new FirestoreAdminError(`unsupported firestore value: ${typeof value}`, 400);
}

function firestoreFields(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, firestoreValue(v)]));
}

/** Reads a document. Returns `null` when it does not exist. */
export async function getDocument<T = Record<string, unknown>>(
  path: string
): Promise<T | null> {
  const raw = await adminFetch("GET", path);
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as { fields?: Record<string, { stringValue?: string }> };

  // Unwrap the Firestore wire format back to plain JSON.
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(doc.fields ?? {})) {
    out[key] = unwrap(val);
  }
  return out as T;
}

function unwrap(v: Record<string, unknown>): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) {
    const arr = (v.arrayValue as { values?: Record<string, unknown>[] } | undefined)?.values ?? [];
    return arr.map(unwrap);
  }
  if ("mapValue" in v) {
    const map = (v.mapValue as { fields?: Record<string, Record<string, unknown>> } | undefined)
      ?.fields ?? {};
    return Object.fromEntries(Object.entries(map).map(([k, val]) => [k, unwrap(val)]));
  }
  return null;
}

/** Creates or replaces a document. */
export async function setDocument(path: string, data: Record<string, unknown>): Promise<void> {
  await adminFetch("PATCH", path, { fields: firestoreFields(data) });
}

/**
 * Lists documents under a collection path.
 *
 * `collectionPath` is the collection, e.g. `users/{uid}/days`. Paginates via
 * `pageToken` because an unbounded list is a memory risk on the edge.
 */
export async function listDocuments(
  collectionPath: string,
  maxPages = 20
): Promise<Array<{ name: string; data: Record<string, unknown> }>> {
  const out: Array<{ name: string; data: Record<string, unknown> }> = [];
  let pageToken: string | undefined;

  for (let i = 0; i < maxPages; i += 1) {
    const token = await getAccessToken();
    const project = serviceProjectId();
    if (!token || !project) throw new FirestoreAdminError("server credentials unavailable", 503);

    const url = new URL(
      `${FIRESTORE_BASE}/projects/${project}/databases/(default)/documents/${collectionPath}`
    );
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${token.token}` },
    });
    if (!res.ok) {
      log.error("firestore_list_failed", { collectionPath, status: res.status });
      throw new FirestoreAdminError("firestore list failed", res.status);
    }

    const json = (await res.json()) as {
      documents?: Array<{ name: string; fields?: Record<string, Record<string, unknown>> }>;
      nextPageToken?: string;
    };

    for (const doc of json.documents ?? []) {
      const fields = doc.fields ?? {};
      out.push({
        name: doc.name.split("/").pop() ?? "",
        data: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, unwrap(v)])),
      });
    }

    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }

  return out;
}

/** Deletes a document. Missing documents are not an error. */
export async function deleteDocument(path: string): Promise<void> {
  await adminFetch("DELETE", path);
}

/** Deletes every subcollection document under a parent document. */
export async function deleteSubcollections(
  parentPath: string,
  subcollections: string[]
): Promise<void> {
  const seg = segments(parentPath);
  for (const sub of subcollections) {
    const collectionPath = `${parentPath}/${sub}`;
    const docs = await listDocuments(collectionPath);
    for (const doc of docs) {
      await deleteDocument(`${collectionPath}/${doc.name}`);
    }
  }
  // Referenced so the helper is not silently unused.
  void seg;
}
