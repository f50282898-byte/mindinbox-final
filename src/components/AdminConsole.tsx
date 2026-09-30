"use client";

import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from "firebase/auth";
import { addDoc, collection, doc, getCountFromServer, getDocs, onSnapshot, query, setDoc, Timestamp, where } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { auth, db, firebaseConfigured, storage } from "@/lib/firebase";

type SiteAd = { headline: string; detail: string; href: string };
type LibraryItem = { title: string; summary: string; videoUrl: string; filePath: string };
type AnalyticsEvent = { type?: string; createdAt?: string };

const emptyItem: LibraryItem = { title: "", summary: "", videoUrl: "", filePath: "" };

export function AdminConsole() {
  const [uid, setUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [oraclePrice, setOraclePrice] = useState("$33");
  const [sanctumPrice, setSanctumPrice] = useState("$100+");
  const [ads, setAds] = useState<SiteAd[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [item, setItem] = useState<LibraryItem>(emptyItem);
  const [analytics, setAnalytics] = useState<AnalyticsEvent[]>([]);
  const [profileCounts, setProfileCounts] = useState({ all: 0, paid: 0 });
  const [sessionMinutes, setSessionMinutes] = useState(0);
  const [uploading, setUploading] = useState(false);
  const adminUid = process.env.NEXT_PUBLIC_ADMIN_UID;
  const authorized = Boolean(uid && adminUid && uid === adminUid);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }
    return onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!authorized || !db) return;
    const unsubscribers = [
      onSnapshot(doc(db, "siteConfig", "pricing"), (snapshot) => {
        const data = snapshot.data();
        if (typeof data?.oracle === "string") setOraclePrice(data.oracle);
        if (typeof data?.sanctum === "string") setSanctumPrice(data.sanctum);
      }, () => setError("Pricing read denied. Verify Firebase admin custom claims and Firestore rules.")),
      onSnapshot(doc(db, "siteConfig", "ads"), (snapshot) => {
        const items = snapshot.data()?.items;
        if (Array.isArray(items)) setAds(items as SiteAd[]);
      }, () => setError("Ad read denied. Verify Firebase admin custom claims and Firestore rules.")),
      onSnapshot(doc(db, "siteConfig", "library"), (snapshot) => {
        const items = snapshot.data()?.items;
        if (Array.isArray(items)) setLibrary(items as LibraryItem[]);
      }, () => setError("Library read denied. Verify Firebase admin custom claims and Firestore rules.")),
    ];

    void getDocs(collection(db, "analyticsEvents")).then((snapshot) => {
      setAnalytics(snapshot.docs.map((record) => record.data() as AnalyticsEvent));
    }).catch(() => setError("Analytics read denied. Verify admin claims and Firestore rules."));
    void Promise.all([
      getCountFromServer(collection(db, "users")),
      getCountFromServer(query(collection(db, "users"), where("subscriptionTier", "in", ["oracle", "sanctum"]))),
    ]).then(([allProfiles, paidProfiles]) => {
      setProfileCounts({ all: allProfiles.data().count, paid: paidProfiles.data().count });
    }).catch(() => setError("Membership analytics read denied. Verify admin claims and Firestore rules."));
    void getDocs(query(
      collection(db, "analyticsSessions"),
      where("updatedAt", ">=", Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000))),
    )).then((snapshot) => {
      const seconds = snapshot.docs.reduce((total, record) => total + Number(record.data().durationSeconds ?? 0), 0);
      setSessionMinutes(Math.round(seconds / 60));
    }).catch(() => setError("Session analytics read denied. Verify admin claims and Firestore rules."));

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [authorized]);

  const metrics = useMemo(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const activeEvents = analytics.filter((event) => Date.parse(event.createdAt ?? "") >= dayAgo);
    const users = new Set(activeEvents.map((event) => (event as AnalyticsEvent & { uid?: string }).uid).filter(Boolean));
    const interactions = analytics.filter((event) => event.type === "ai_interaction").length;
    const signups = analytics.filter((event) => event.type === "signup").length;
    const conversion = profileCounts.all ? `${Math.round((profileCounts.paid / profileCounts.all) * 100)}%` : "0%";
    return { active: users.size, interactions, signups, conversion, sessionMinutes };
  }, [analytics, profileCounts, sessionMinutes]);

  const savePricing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!db || !authorized) return;
    try {
      await setDoc(doc(db, "siteConfig", "pricing"), { oracle: oraclePrice.trim(), sanctum: sanctumPrice.trim(), updatedAt: new Date().toISOString() });
      setNotice("Membership display pricing saved.");
      setError("");
    } catch {
      setError("Could not save pricing. Check admin claims and Firestore rules.");
    }
  };

  const saveAds = async () => {
    if (!db || !authorized) return;
    try {
      await setDoc(doc(db, "siteConfig", "ads"), { items: ads, updatedAt: new Date().toISOString() });
      setNotice("Membership notes saved.");
      setError("");
    } catch {
      setError("Could not save membership notes. Check admin claims and Firestore rules.");
    }
  };

  const saveLibraryItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!db || !authorized || !item.title.trim()) return;
    try {
      await setDoc(doc(db, "siteConfig", "library"), { items: [...library, item], updatedAt: new Date().toISOString() });
      setItem(emptyItem);
      setNotice("Library item published.");
      setError("");
    } catch {
      setError("Could not publish library item. Check admin claims and Firestore rules.");
    }
  };

  const removeLibraryItem = async (index: number) => {
    if (!db || !authorized) return;
    const nextLibrary = library.filter((_, itemIndex) => itemIndex !== index);
    try {
      await setDoc(doc(db, "siteConfig", "library"), { items: nextLibrary, updatedAt: new Date().toISOString() });
      setLibrary(nextLibrary);
      setNotice("Library item removed.");
      setError("");
    } catch {
      setError("Could not remove this item. Check admin claims and Firestore rules.");
    }
  };

  const uploadFile = async (file?: File) => {
    if (!file || !authorized || !storage) return;
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const fileRef = ref(storage, `premium-library/${Date.now()}-${safeName}`);
      await uploadBytes(fileRef, file, { contentType: file.type });
      setItem((current) => ({ ...current, filePath: fileRef.fullPath }));
      setNotice("File uploaded. Save the library item to publish it.");
      setError("");
    } catch {
      setError("Upload failed. Check Storage admin rules and file limits.");
    } finally {
      setUploading(false);
    }
  };

  const signInAsAdmin = async () => {
    if (!auth) return;
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      setError("");
    } catch {
      setError("Sign-in was not completed. Try again with the designated administrator account.");
    }
  };

  if (!authReady) return <main className="member-state">Checking administrator access…</main>;
  if (!authorized) {
    return (
      <main className="member-state">
        <p className="eyebrow">PRIVATE CONSOLE</p>
        <h1>Administrator access only.</h1>
        <p>{!firebaseConfigured ? "Firebase is not configured." : !adminUid ? "Set NEXT_PUBLIC_ADMIN_UID to enable the administrator account." : "Sign in with the designated administrator account."}</p>
        {firebaseConfigured && adminUid && !uid && <button className="button-primary" onClick={() => void signInAsAdmin()} type="button">Sign in with Google</button>}
        {error && <p className="workspace-notice">{error}</p>}
      </main>
    );
  }

  return (
    <main className="admin-console">
      <header className="admin-header"><a className="app-wordmark" href="/">Mind in a Box</a><span>ADMINISTRATION / {uid}</span></header>
      <p className="eyebrow">PRIVATE CONSOLE</p>
      <h1>Steward the sanctuary.</h1>
      <section className="analytics-strip" aria-label="Platform analytics">
        <div><small>ACTIVE, 24H</small><strong>{metrics.active}</strong></div>
        <div><small>AI INTERACTIONS</small><strong>{metrics.interactions}</strong></div>
        <div><small>NEW ACCOUNTS</small><strong>{metrics.signups}</strong></div>
        <div><small>PAID MEMBERS / ACCOUNTS</small><strong>{metrics.conversion}</strong></div>
        <div><small>TRACKED MINUTES, 24H</small><strong>{metrics.sessionMinutes}</strong></div>
      </section>

      <section className="admin-section">
        <h2>Membership display</h2>
        <form className="admin-form two-col" onSubmit={savePricing}>
          <label>The Oracle price display<input maxLength={50} onChange={(event) => setOraclePrice(event.target.value)} value={oraclePrice} /></label>
          <label>The Sanctum price display<input maxLength={50} onChange={(event) => setSanctumPrice(event.target.value)} value={sanctumPrice} /></label>
          <button className="button-primary" type="submit">Save pricing</button>
        </form>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading"><h2>Membership notes</h2><button className="button-quiet" onClick={() => setAds((current) => [...current, { headline: "", detail: "", href: "/#access" }])} type="button">Add note</button></div>
        {ads.map((ad, index) => <div className="admin-ad-row" key={index}>
          <label>Headline<input maxLength={100} onChange={(event) => setAds((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, headline: event.target.value } : value))} value={ad.headline} /></label>
          <label>Detail<input maxLength={180} onChange={(event) => setAds((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, detail: event.target.value } : value))} value={ad.detail} /></label>
          <button aria-label="Remove membership note" className="remove-button" onClick={() => setAds((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button">×</button>
        </div>)}
        <button className="button-primary" onClick={() => void saveAds()} type="button">Save notes</button>
      </section>

      <section className="admin-section">
        <h2>Books & masterclasses</h2>
        <form className="admin-form" onSubmit={saveLibraryItem}>
          <label>Title<input maxLength={120} onChange={(event) => setItem((current) => ({ ...current, title: event.target.value }))} required value={item.title} /></label>
          <label>Summary<textarea maxLength={600} onChange={(event) => setItem((current) => ({ ...current, summary: event.target.value }))} rows={2} value={item.summary} /></label>
          <label>YouTube URL<input onChange={(event) => setItem((current) => ({ ...current, videoUrl: event.target.value }))} placeholder="https://www.youtube.com/embed/..." type="url" value={item.videoUrl} /></label>
          <label>Upload study material<input accept="application/pdf" disabled={uploading || !storage} onChange={(event) => void uploadFile(event.target.files?.[0])} type="file" /></label>
          {item.filePath && <p className="workspace-notice">PDF uploaded and ready to publish.</p>}
          <button className="button-primary" disabled={uploading || !item.title.trim()} type="submit">{uploading ? "Uploading…" : "Publish library item"}</button>
        </form>
        <ul className="admin-library-list">{library.map((entry, index) => <li key={`${entry.title}-${index}`}><span>{entry.title}</span><button aria-label={`Remove ${entry.title}`} className="remove-button" onClick={() => void removeLibraryItem(index)} type="button">×</button></li>)}</ul>
      </section>
      <p aria-live="polite" className="workspace-notice">{error || notice}</p>
    </main>
  );
}
