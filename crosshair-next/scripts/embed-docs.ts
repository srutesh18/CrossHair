/**
 * Embed docs/*.md into pgvector for one org.
 *
 *   npm run embed:docs -- --org <org-uuid>
 *   npm run embed:docs -- --email you@company.com
 *
 * Uses the secret key so it can write for a given org without a browser
 * session. Run it locally only; never ship the secret key to a client.
 * (Docs can also be uploaded from the Setup page, which needs no secret key.)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ingestDoc, titleFrom } from "../lib/rag/ingest";

const DOCS_DIR = join(process.cwd(), "docs");

/** Accepts the new secret key (sb_secret_...) or the legacy service-role JWT. */
function secretKey(): string {
  const v = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set. Dashboard -> Project Settings -> API keys -> secret key.",
    );
  }
  return v;
}

function projectUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set in .env.local.");
  return v;
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function resolveOrg(supabase: SupabaseClient): Promise<string> {
  const orgId = flag("--org");
  if (orgId) return orgId;
  const email = flag("--email");
  if (!email) throw new Error("Pass --org <org-uuid> or --email <account email>.");

  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(error.message);
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No account with email ${email}. Sign up at /login first.`);

  const { data: member, error: mErr } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (mErr) throw new Error(mErr.message);
  if (!member) throw new Error(`${email} has no workspace. Run npm run db:migrate.`);
  return member.org_id as string;
}

async function main(): Promise<void> {
  const supabase = createClient(projectUrl(), secretKey(), {
    auth: { persistSession: false },
  });
  const orgId = await resolveOrg(supabase);

  const files = (await readdir(DOCS_DIR)).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) throw new Error(`No .md files in ${DOCS_DIR}`);

  for (const file of files) {
    const raw = await readFile(join(DOCS_DIR, file), "utf8");
    const slug = file.replace(/\.md$/, "");
    const result = await ingestDoc(supabase, orgId, {
      title: titleFrom(raw, slug),
      slug,
      content: raw,
    });
    console.log(`embedded ${file} -> ${result.chunks} chunk(s)`);
  }
  console.log(`Done. ${files.length} doc(s) embedded for org ${orgId}.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
