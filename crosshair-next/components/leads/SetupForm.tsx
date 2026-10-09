"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

interface Initial {
  productName: string;
  senderName: string;
  icp: string;
  competitors: string[];
  keywords: string[];
  forumUrls: string[];
  crawlUrls: string[];
}

function normaliseUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

function ChipList({
  items,
  onRemove,
}: {
  items: string[];
  onRemove: (i: number) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="my-2 text-[13px]" style={{ color: "var(--color-muted)" }}>
        None yet.
      </p>
    );
  }
  return (
    <div className="my-2 flex flex-wrap gap-2">
      {items.map((item, i) => (
        <span
          key={item}
          className="inline-flex items-center gap-1.5 rounded-full border py-1 pr-1.5 pl-3 text-[13px]"
          style={{ background: "var(--color-raise)", borderColor: "var(--color-line)" }}
        >
          {item}
          <button
            type="button"
            aria-label={`Remove ${item}`}
            onClick={() => onRemove(i)}
            className="grid h-5 w-5 place-items-center rounded-full"
            style={{ background: "var(--color-line)", color: "var(--color-muted)" }}
          >
            &times;
          </button>
        </span>
      ))}
    </div>
  );
}

export function SetupForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [productName, setProductName] = useState(initial.productName);
  const [senderName, setSenderName] = useState(initial.senderName);
  const [icp, setIcp] = useState(initial.icp);
  const [competitors, setCompetitors] = useState(initial.competitors);
  const [keywords, setKeywords] = useState(initial.keywords);
  const [newCompetitor, setNewCompetitor] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [forumUrls, setForumUrls] = useState(initial.forumUrls);
  const [crawlUrls, setCrawlUrls] = useState(initial.crawlUrls);
  const [newForum, setNewForum] = useState("");
  const [newCrawl, setNewCrawl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  function addUrl(raw: string, list: string[], set: (v: string[]) => void, clear: () => void) {
    const url = normaliseUrl(raw);
    if (!url) {
      setUrlError("Enter a full public URL, e.g. https://community.example.com");
      return;
    }
    setUrlError(null);
    if (!list.includes(url)) set([...list, url].slice(0, 10));
    clear();
  }
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Please sign in again.");

      const { data: member, error: memberErr } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", auth.user.id)
        .limit(1)
        .maybeSingle();
      if (memberErr) throw memberErr;
      if (!member) throw new Error("No workspace found for this account.");

      const { error: err } = await supabase
        .from("orgs")
        .update({
          product_name: productName.trim() || "My product",
          sender_name: senderName.trim() || "Alex",
          icp,
          competitors,
          keywords,
          forum_urls: forumUrls,
          crawl_urls: crawlUrls,
        })
        .eq("id", member.org_id);
      if (err) throw err;
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ch-card">
      <h2 className="ch-label mb-2">Your product</h2>

      <label htmlFor="product" className="mt-3 mb-1 block text-[13px] font-semibold">
        Name
      </label>
      <input
        id="product"
        className="ch-input"
        value={productName}
        onChange={(e) => setProductName(e.target.value)}
      />

      <label htmlFor="sender" className="mt-3 mb-1 block text-[13px] font-semibold">
        Sign emails as
      </label>
      <input
        id="sender"
        className="ch-input"
        value={senderName}
        onChange={(e) => setSenderName(e.target.value)}
        placeholder="Your first name"
      />

      <label htmlFor="icp" className="mt-3 mb-1 block text-[13px] font-semibold">
        Target customer
      </label>
      <textarea
        id="icp"
        rows={5}
        className="ch-input"
        value={icp}
        onChange={(e) => setIcp(e.target.value)}
        placeholder="Who buys this, company size, industries, and who is a poor fit."
      />
      <p className="mt-1 text-[12px]" style={{ color: "var(--color-muted)" }}>
        Read by the model when it rates fit.
      </p>

      <h3 className="ch-label mt-5">Competitors to watch</h3>
      <ChipList items={competitors} onRemove={(i) => setCompetitors(competitors.filter((_, x) => x !== i))} />
      <div className="flex gap-2">
        <input
          className="ch-input"
          value={newCompetitor}
          onChange={(e) => setNewCompetitor(e.target.value)}
          placeholder="Add a competitor"
          aria-label="Add a competitor"
        />
        <button
          type="button"
          className="ch-btn"
          onClick={() => {
            const v = newCompetitor.trim();
            if (v && !competitors.includes(v)) setCompetitors([...competitors, v]);
            setNewCompetitor("");
          }}
        >
          Add
        </button>
      </div>

      <h3 className="ch-label mt-5">Complaint words to look for</h3>
      <ChipList items={keywords} onRemove={(i) => setKeywords(keywords.filter((_, x) => x !== i))} />
      <div className="flex gap-2">
        <input
          className="ch-input"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          placeholder="e.g. slow dashboards"
          aria-label="Add a keyword"
        />
        <button
          type="button"
          className="ch-btn"
          onClick={() => {
            const v = newKeyword.trim();
            if (v && !keywords.includes(v)) setKeywords([...keywords, v]);
            setNewKeyword("");
          }}
        >
          Add
        </button>
      </div>

      <h3 className="ch-label mt-5">Discourse forums (Lead Finder)</h3>
      <p className="mt-1 text-[12px]" style={{ color: "var(--color-muted)" }}>
        Public community forums that run on Discourse, e.g. a competitor&apos;s community site.
      </p>
      <ChipList items={forumUrls} onRemove={(i) => setForumUrls(forumUrls.filter((_, x) => x !== i))} />
      <div className="flex gap-2">
        <input
          className="ch-input"
          value={newForum}
          onChange={(e) => setNewForum(e.target.value)}
          placeholder="https://community.example.com"
          aria-label="Add a forum URL"
        />
        <button type="button" className="ch-btn" onClick={() => addUrl(newForum, forumUrls, setForumUrls, () => setNewForum(""))}>
          Add
        </button>
      </div>

      <h3 className="ch-label mt-5">Pages to crawl (Lead Finder)</h3>
      <p className="mt-1 text-[12px]" style={{ color: "var(--color-muted)" }}>
        Public pages Crawlee visits, plus same-site links one level deep. robots.txt is honoured.
      </p>
      <ChipList items={crawlUrls} onRemove={(i) => setCrawlUrls(crawlUrls.filter((_, x) => x !== i))} />
      <div className="flex gap-2">
        <input
          className="ch-input"
          value={newCrawl}
          onChange={(e) => setNewCrawl(e.target.value)}
          placeholder="https://example.com/feedback"
          aria-label="Add a page to crawl"
        />
        <button type="button" className="ch-btn" onClick={() => addUrl(newCrawl, crawlUrls, setCrawlUrls, () => setNewCrawl(""))}>
          Add
        </button>
      </div>
      {urlError ? (
        <p className="mt-2 text-[13px]" role="alert" style={{ color: "var(--color-coral)" }}>
          {urlError}
        </p>
      ) : null}

      <div className="mt-5 flex items-center gap-3">
        <button type="button" className="ch-btn ch-btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {saved ? (
          <span className="text-[13px]" style={{ color: "var(--color-mint)" }}>
            Saved.
          </span>
        ) : null}
      </div>

      {error ? (
        <p
          className="mt-3 rounded-[9px] px-3 py-2 text-sm"
          role="alert"
          style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
