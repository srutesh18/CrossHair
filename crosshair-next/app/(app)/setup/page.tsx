import { Topbar } from "@/components/ui/Topbar";
import { ErrorState } from "@/components/ui/States";
import { SetupForm } from "@/components/leads/SetupForm";
import { DocsManager, type DocRow } from "@/components/leads/DocsManager";
import { requireSession } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface OrgRow {
  id: string;
  product_name: string;
  sender_name: string;
  icp: string;
  competitors: string[];
  keywords: string[];
  forum_urls: string[];
  crawl_urls: string[];
}

export default async function SetupPage() {
  let org: OrgRow | null = null;
  let docs: DocRow[] = [];
  let error: string | null = null;

  try {
    const { supabase, orgId } = await requireSession();
    const { data, error: err } = await supabase
      .from("orgs")
      .select("id, product_name, sender_name, icp, competitors, keywords, forum_urls, crawl_urls")
      .eq("id", orgId)
      .maybeSingle();
    if (err) throw new Error(err.message);
    org = data as OrgRow | null;

    const { data: docRows, error: docErr } = await supabase
      .from("docs")
      .select("id, title, slug, doc_chunks(count)")
      .order("title");
    if (docErr) throw new Error(docErr.message);
    docs = (docRows ?? []).map((d) => ({
      id: d.id as string,
      title: d.title as string,
      slug: d.slug as string,
      chunks: (d.doc_chunks as Array<{ count: number }> | null)?.[0]?.count ?? 0,
    }));
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load setup";
  }

  return (
    <>
      <Topbar title="Setup" tag="used when scoring and writing" />
      <div className="flex-1 overflow-y-auto p-5">
        {error ? (
          <ErrorState message={error} />
        ) : !org ? (
          <ErrorState message="No workspace found for this account." />
        ) : (
          <div className="grid max-w-[980px] gap-4 lg:grid-cols-2">
            <SetupForm
              initial={{
                productName: org.product_name,
                senderName: org.sender_name,
                icp: org.icp,
                competitors: org.competitors ?? [],
                keywords: org.keywords ?? [],
                forumUrls: org.forum_urls ?? [],
                crawlUrls: org.crawl_urls ?? [],
              }}
            />

            <DocsManager docs={docs} />
          </div>
        )}
      </div>
    </>
  );
}
