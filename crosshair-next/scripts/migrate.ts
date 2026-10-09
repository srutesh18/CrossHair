/**
 * Apply supabase/migrations/*.sql in order, each in its own transaction.
 *
 *   npm run db:migrate            apply pending migrations
 *   npm run db:migrate -- --status
 *
 * Needs SUPABASE_DB_URL (Supabase -> Connect -> Session pooler URI). Applied
 * versions are recorded in supabase_migrations.schema_migrations, the same
 * table the Supabase CLI uses, so `supabase db push` agrees with this script.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

const DIR = join(process.cwd(), "supabase", "migrations");

function dbUrl(): string {
  const v = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
  if (!v) {
    throw new Error(
      "SUPABASE_DB_URL is not set. Supabase dashboard -> Connect -> Session pooler -> URI.",
    );
  }
  return v;
}

async function main(): Promise<void> {
  const statusOnly = process.argv.includes("--status");
  const client = new Client({
    connectionString: dbUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(`
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (
        version text primary key,
        statements text[],
        name text
      );`);

    const { rows } = await client.query<{ version: string }>(
      "select version from supabase_migrations.schema_migrations",
    );
    const applied = new Set(rows.map((r) => r.version));

    const files = (await readdir(DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    let ran = 0;
    for (const file of files) {
      const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
      const name = rest.join("_");
      if (!version) continue;
      if (applied.has(version)) {
        console.log(`  applied  ${file}`);
        continue;
      }
      if (statusOnly) {
        console.log(`  pending  ${file}`);
        continue;
      }
      const sql = await readFile(join(DIR, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
          [version, name, [sql]],
        );
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw new Error(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
      // PostgREST caches the schema; tell it to reload so the API sees new tables.
      await client.query("notify pgrst, 'reload schema'");
      console.log(`  ran      ${file}`);
      ran += 1;
    }
    if (!statusOnly) console.log(ran ? `Done. ${ran} migration(s) applied.` : "Up to date.");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
