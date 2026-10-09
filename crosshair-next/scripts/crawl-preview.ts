/**
 * Run the Lead Finder crawl from the terminal, without the app or a login.
 * Prints classified signals; writes nothing to the database.
 *
 *   npm run crawl:preview -- --services "web design,seo audit"
 *   npm run crawl:preview -- --competitors "Tableau,Power BI" --keywords "slow dashboards"
 *   npm run crawl:preview -- --query "looker alternative" --sources hn,stackexchange --json out.json
 */
import { writeFile } from "node:fs/promises";
import { collectSignals, DEFAULT_SOURCES, SOURCE_KEYS, type SourceKey } from "../lib/crawl/run";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const list = (v: string | undefined) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

async function main(): Promise<void> {
  const sources = (list(flag("--sources")).filter((s) => (SOURCE_KEYS as readonly string[]).includes(s)) as SourceKey[]);
  const result = await collectSignals(
    {
      services: list(flag("--services")),
      competitors: list(flag("--competitors")),
      keywords: list(flag("--keywords")),
      forumUrls: list(flag("--forums")),
      crawlUrls: list(flag("--crawl")),
    },
    {
      query: flag("--query") ?? "",
      sources: sources.length ? sources : DEFAULT_SOURCES,
      perSource: Number(flag("--per")) || 25,
    },
  );
  for (const [k, st] of Object.entries(result.sources)) {
    console.log(`${k.padEnd(14)} ${st?.ok ? `${st.count} posts` : `FAILED: ${st?.error}`}`);
  }
  console.log(`\nread ${result.found}, kept ${result.rows.length}, typesafe-refined ${result.refined}\n`);
  for (const r of [...result.rows].sort((a, b) => b.intent - a.intent).slice(0, 15)) {
    console.log(`${String(r.intent).padStart(3)}  ${r.category.padEnd(16)} ${(r.service || r.competitor || "-").padEnd(12)} ${r.source.padEnd(13)} ${(r.title || r.body).slice(0, 70)}`);
  }
  const out = flag("--json");
  if (out) await writeFile(out, JSON.stringify(result.rows, null, 2));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
