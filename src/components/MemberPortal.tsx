"use client";

import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { getBlob, ref } from "firebase/storage";
import { useEffect, useState, type FormEvent } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { useAppStore } from "@/lib/store";
import { PremiumContentShield } from "@/components/PremiumContentShield";

type RequiredTier = "oracle" | "sanctum";
type LibraryItem = { title: string; videoUrl?: string; filePath?: string; summary?: string };
type CommunityPost = { id: string; authorName: string; text: string; createdAt?: { toDate?: () => Date } };

function safeYouTubeEmbed(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
      if (url.pathname.startsWith("/embed/")) return url.toString();
      if (url.pathname === "/watch") {
        const videoId = url.searchParams.get("v");
        return videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` : null;
      }
    }
    if (host === "youtu.be") {
      const videoId = url.pathname.slice(1);
      return videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function MemberPortal({ requiredTier }: { requiredTier: RequiredTier }) {
  const { uid, tier, setIdentity, setTier } = useAppStore();
  const [checked, setChecked] = useState(false);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [message, setMessage] = useState("");
  const [downloadRequest, setDownloadRequest] = useState<{ path: string; title: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>([]);
  const [communityDraft, setCommunityDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const permitted = requiredTier === "oracle" ? tier === "oracle" || tier === "sanctum" : tier === "sanctum";

  useEffect(() => {
    if (!auth) {
      setChecked(true);
      return;
    }
    return onAuthStateChanged(auth, async (user) => {
      setIdentity(user?.uid ?? null);
      if (!user || !db) {
        setChecked(true);
        return;
      }
      try {
        const profile = await getDoc(doc(db, "users", user.uid));
        const subscriptionTier = profile.data()?.subscriptionTier;
        if (subscriptionTier === "oracle" || subscriptionTier === "sanctum") setTier(subscriptionTier);
        const library = await getDoc(doc(db, "siteConfig", "library"));
        const records = library.data()?.items;
        if (Array.isArray(records)) setItems(records as LibraryItem[]);
      } catch {
        setMessage("Membership details could not be refreshed. Check your connection and try again.");
      } finally {
        setChecked(true);
      }
    });
  }, [setIdentity, setTier]);

  useEffect(() => {
    if (!downloadRequest || !storage) return;
    let cancelled = false;
    setDownloading(true);
    void getBlob(ref(storage, downloadRequest.path)).then((blob) => {
      if (cancelled) return;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${downloadRequest.title.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]/g, "-")}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }).catch(() => {
      setMessage("This study file is unavailable or your membership does not include it.");
    }).finally(() => {
      if (!cancelled) {
        setDownloading(false);
        setDownloadRequest(null);
      }
    });
    return () => { cancelled = true; };
  }, [downloadRequest, storage]);

  useEffect(() => {
    if (requiredTier !== "sanctum" || tier !== "sanctum" || !uid || !db) return;
    const postsQuery = query(collection(db, "communityPosts"), orderBy("createdAt", "desc"), limit(40));
    return onSnapshot(postsQuery, (snapshot) => {
      setCommunityPosts(snapshot.docs.map((post) => ({ id: post.id, ...post.data() }) as CommunityPost));
    }, () => setMessage("The Sanctum circle could not be loaded. Check membership and connection."));
  }, [requiredTier, tier, uid]);

  const publishPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = communityDraft.trim();
    const user = auth?.currentUser;
    if (!text || !user || !db || tier !== "sanctum" || posting) return;
    setPosting(true);
    try {
      await addDoc(collection(db, "communityPosts"), {
        uid: user.uid,
        authorName: user.displayName ?? "Sanctum member",
        text,
        createdAt: serverTimestamp(),
      });
      setCommunityDraft("");
      setMessage("Your reflection has been shared with the circle.");
    } catch {
      setMessage("Your post could not be shared. Please try again.");
    } finally {
      setPosting(false);
    }
  };

  if (!checked) return <main className="member-state">Opening your library…</main>;
  if (!uid || !permitted) {
    return (
      <main className="member-state">
        <p className="eyebrow">MEMBERSHIP ACCESS</p>
        <h1>{requiredTier === "oracle" ? "The Oracle" : "The Sanctum"}</h1>
        <p>This library is available to its members. Sign in with the account attached to your membership.</p>
        <a className="button-primary" href="/#access">Review membership <span aria-hidden="true">↗</span></a>
        {message && <p className="workspace-notice">{message}</p>}
      </main>
    );
  }

  return (
    <main className="member-library">
      <a className="app-wordmark" href="/">Mind in a Box <span>عقل في صندوق</span></a>
      <p className="eyebrow">{requiredTier === "sanctum" ? "THE INNER CIRCLE" : "THE DAILY PRACTICE"}</p>
      <h1>{requiredTier === "sanctum" ? "The Sanctum" : "The Oracle"}</h1>
      <p className="member-intro">A considered collection for continued study.</p>
      <PremiumContentShield>
        {requiredTier === "sanctum" && (
          <section className="sanctum-welcome">
            <h2>Sanctum circle</h2>
            <p>A private room for considered questions and shared study.</p>
            <form className="community-form" onSubmit={publishPost}>
              <label className="sr-only" htmlFor="community-post">Share a reflection with the circle</label>
              <textarea id="community-post" maxLength={1200} onChange={(event) => setCommunityDraft(event.target.value)} placeholder="Offer a thought to the circle…" rows={3} value={communityDraft} />
              <button className="entry-submit" disabled={!communityDraft.trim() || posting} type="submit">{posting ? "Sharing…" : "Share with the circle"}</button>
            </form>
            <div aria-live="polite" className="community-feed">
              {communityPosts.length ? communityPosts.map((post) => (
                <article className="community-post" key={post.id}>
                  <p>{post.text}</p>
                  <small>{post.authorName}{post.createdAt?.toDate ? ` · ${post.createdAt.toDate().toLocaleDateString()}` : ""}</small>
                </article>
              )) : <p className="empty-journal">The circle is quiet. Begin the conversation.</p>}
            </div>
          </section>
        )}
        {items.length ? <div className="library-grid">{items.map((item, index) => (
          <article className="library-item" key={`${item.title}-${index}`}>
            <h2>{item.title}</h2>
            {item.summary && <p>{item.summary}</p>}
            {item.videoUrl && safeYouTubeEmbed(item.videoUrl) && <div className="video-frame"><iframe allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" src={safeYouTubeEmbed(item.videoUrl)!} title={item.title} /></div>}
            {item.filePath && <button className="plan-link file-download" disabled={downloading} onClick={() => setDownloadRequest({ path: item.filePath!, title: item.title })} type="button">{downloading ? "Preparing file…" : "Download study material"} <span aria-hidden="true">↓</span></button>}
          </article>
        ))}</div> : <p className="empty-journal">Your next study will appear here.</p>}
      </PremiumContentShield>
      <p aria-live="polite" className="workspace-notice">{message}</p>
    </main>
  );
}
