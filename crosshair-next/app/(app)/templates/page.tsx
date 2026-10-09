import Link from "next/link";
import { Topbar } from "@/components/ui/Topbar";
import { ErrorState } from "@/components/ui/States";
import { TemplatesEditor } from "@/components/templates/TemplatesEditor";
import { requireSession } from "@/lib/supabase/server";
import { DEFAULT_SEQUENCE, parseSequence, type TemplateCompany } from "@/lib/templates";
import { sendingEnabled } from "@/lib/send";

export const dynamic = "force-dynamic";

/** Which sending settings are present. Never the values. */
function smtpStatus() {
  return {
    enabled: sendingEnabled(),
    user: Boolean(process.env.SMTP_USER),
    pass: Boolean(process.env.SMTP_PASS),
    from: Boolean(process.env.SEND_FROM),
    unsubscribe: Boolean(process.env.UNSUBSCRIBE_URL),
  };
}

export default async function TemplatesPage() {
  let error: string | null = null;
  let initial = { sequence: DEFAULT_SEQUENCE, custom: false, senderName: "Alex", signature: "", productName: "" };
  let services: string[] = [];
  let sample: TemplateCompany | null = null;
  try {
    const { supabase, orgId } = await requireSession();
    const [{ data: org, error: err }, { data: top }] = await Promise.all([
      supabase.from("orgs").select("sender_name, signature, product_name, email_templates, services").eq("id", orgId).maybeSingle(),
      supabase
        .from("companies")
        .select("name, domain, flaws, services_matched, trigger_headline, trigger_kind")
        .eq("status", "audited")
        .neq("flaws", "[]")
        .order("trigger_kind", { ascending: false })
        .order("score", { ascending: false })
        .limit(1),
    ]);
    if (err) throw new Error(err.message);
    initial = {
      sequence: parseSequence(org?.email_templates),
      custom: Boolean(org?.email_templates),
      senderName: (org?.sender_name as string | undefined) ?? "Alex",
      signature: (org?.signature as string | undefined) ?? "",
      productName: ((org?.product_name as string | undefined) ?? "").replace(/^(My product|My company|Pellucid)$/, ""),
    };
    services = (org?.services as string[] | undefined) ?? [];
    sample = (top?.[0] as TemplateCompany | undefined) ?? null;
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load templates";
  }
  const smtp = smtpStatus();

  return (
    <>
      <Topbar title="Templates" subtitle="The emails Crosshair writes for you" tag="your email sequence" />
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {error ? (
          <ErrorState message={error} />
        ) : (
          <>
            <TemplatesEditor initial={initial} services={services} sample={sample} />

            <section className="ch-card">
              <h2 className="ch-label mb-2">Sending</h2>
              {smtp.enabled && smtp.user && smtp.pass && smtp.from && smtp.unsubscribe ? (
                <p className="text-sm" style={{ color: "var(--color-mint)" }}>
                  Direct sending is on: <b>Send now</b> in the Pipeline sends from your mailbox over SMTP.
                </p>
              ) : (
                <div className="space-y-2 text-[13px]">
                  <p>
                    Right now the Pipeline opens each email as a ready draft in <b>Gmail, Outlook or your email app</b>; you press
                    send there and mark it sent. To send straight from Crosshair, add these to <code>crosshair-next/.env.local</code>
                    and restart:
                  </p>
                  <pre className="overflow-x-auto rounded-[9px] p-3 text-[12px]" style={{ background: "var(--color-raise)", fontFamily: "var(--font-mono)" }}>
{`SEND_ENABLED=true
SMTP_HOST=smtp.gmail.com      # or your provider
SMTP_PORT=465
SMTP_USER=you@yourcompany.com
SMTP_PASS=your-app-password   # Gmail: Google Account → Security → App passwords
SEND_FROM="Your Name <you@yourcompany.com>"
UNSUBSCRIBE_URL=https://yourcompany.com/unsubscribe`}
                  </pre>
                  <p style={{ color: "var(--color-muted)" }}>
                    Missing now:{" "}
                    {[
                      !smtp.enabled && "SEND_ENABLED",
                      !smtp.user && "SMTP_USER",
                      !smtp.pass && "SMTP_PASS",
                      !smtp.from && "SEND_FROM",
                      !smtp.unsubscribe && "UNSUBSCRIBE_URL",
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    . Every email offers an easy opt-out, and you only email addresses the company published.
                  </p>
                </div>
              )}
              <p className="mt-3 text-[12px]" style={{ color: "var(--color-muted)" }}>
                Product docs and advanced settings: <Link href="/setup" className="underline">Setup</Link>.
              </p>
            </section>
          </>
        )}
      </div>
    </>
  );
}
