/**
 * Email templates: a 3-step sequence with a tiny mustache syntax. Pure code,
 * shared by the server (composing) and the Templates page (live preview).
 */
import type { Flaw } from "./audit/checks";
import { areasFor } from "./audit/score";


export interface EmailTemplate {
  subject: string;
  body: string;
}

/** Day 0 / Day 3 / Day 7. */
export type Sequence = [EmailTemplate, EmailTemplate, EmailTemplate];

export const STEP_LABEL = ["Day 0 · first email", "Day 3 · follow-up", "Day 7 · last note"] as const;
/** Days to wait after each step before the next is due. */
export const WAIT_DAYS = [3, 4, 0];

export const DEFAULT_SEQUENCE: Sequence = [
  {
    subject: "Quick note on {{domain}}",
    body: `Hi {{company}} team,

{{#trigger}}Congrats on the news ({{trigger}}). Moments like this send a lot of new people to your website, so I took a quick look at it.{{/trigger}}{{^trigger}}I came across {{domain}} and took a quick look at the site.{{/trigger}}

{{#flaw_1}}{{#flaw_2}}A couple of things stood out:{{/flaw_2}}{{^flaw_2}}One thing stood out:{{/flaw_2}}
- {{flaw_1}}: {{evidence_1}}
{{#flaw_2}}- {{flaw_2}}: {{evidence_2}}
{{/flaw_2}}{{/flaw_1}}
We help companies with {{services}}, and these are quick wins. Would it help if I sent a short video walking through the fixes?

{{sender}}
{{signature}}

If this isn't relevant, just reply "no" and I won't follow up.`,
  },
  {
    subject: "Re: Quick note on {{domain}}",
    body: `Hi again,

Following up on my note about {{domain}}.{{#flaw_1}} If you only fix one thing, I'd start with this: {{flaw_1_lower}}. {{evidence_1}}{{/flaw_1}}

Happy to show you how in 10 minutes this week, no strings attached.

{{sender}}`,
  },
  {
    subject: "Last note on {{domain}}",
    body: `Hi {{company}} team,

I'll leave it here so I don't crowd your inbox. If the timing isn't right, no problem at all.

If you'd like the short audit of {{domain}} as a written checklist, just reply "send it" and it's yours.

{{sender}}`,
  },
];

export function parseSequence(raw: unknown): Sequence {
  if (!Array.isArray(raw) || raw.length !== 3) return DEFAULT_SEQUENCE;
  const ok = raw.every(
    (t) => t && typeof t === "object" && typeof (t as EmailTemplate).subject === "string" && typeof (t as EmailTemplate).body === "string",
  );
  return ok ? (raw as Sequence) : DEFAULT_SEQUENCE;
}

export type Vars = Record<string, string>;

/**
 * Tiny mustache: {{name}}, {{#name}}shown if set{{/name}},
 * {{^name}}shown if empty{{/name}}. No HTML: these are plain-text emails.
 */
export function render(template: string, vars: Vars): string {
  // Innermost sections first, repeated, so sections can nest.
  const section = /\{\{([#^])(\w+)\}\}((?:(?!\{\{[#^])[\s\S])*?)\{\{\/\2\}\}/g;
  let out = template;
  for (let i = 0; i < 10 && section.test(out); i += 1) {
    section.lastIndex = 0;
    out = out.replace(section, (_, kind: string, key: string, inner: string) => {
      const has = Boolean(vars[key]?.trim());
      return (kind === "#" ? has : !has) ? inner : "";
    });
    section.lastIndex = 0;
  }
  out = out.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
  // Tidy blank lines left by empty sections and fields.
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const SEV = { high: 0, medium: 1, low: 2 } as const;

function sentence(s: string): string {
  const t = s.trim();
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

/** The variables a template can use, for one company. */
export interface TemplateCompany {
  name: string;
  domain: string;
  flaws: Flaw[];
  services_matched: string[];
  trigger_headline: string;
  trigger_kind: string;
}

export function varsFor(
  company: TemplateCompany,
  org: { services: string[]; sender: string; signature: string },
): Vars {
  // Lead with the flaws your services fix, most severe first.
  const areas = new Set([...areasFor(org.services).values()].flat());
  const flaws: Flaw[] = [...(company.flaws ?? [])].sort(
    (a, b) => Number(!areas.has(a.area)) - Number(!areas.has(b.area)) || SEV[a.severity] - SEV[b.severity],
  );
  const f1 = flaws[0];
  const f2 = flaws[1];
  const services = (company.services_matched?.length ? company.services_matched : org.services).slice(0, 3);
  return {
    company: company.name || company.domain,
    domain: company.domain || company.name,
    trigger: company.trigger_kind ? company.trigger_headline : "",
    trigger_kind: company.trigger_kind ?? "",
    flaw_1: f1?.title ?? "",
    evidence_1: f1?.evidence ?? "",
    flaw_1_lower: f1 ? sentence(f1.title) : "",
    flaw_2: f2?.title ?? "",
    evidence_2: f2?.evidence ?? "",
    services: services.length > 1 ? `${services.slice(0, -1).join(", ")} and ${services.at(-1)}` : services[0] ?? "their website",
    sender: org.sender || "Alex",
    signature: org.signature,
  };
}

export const TEMPLATE_VARS: Array<[string, string]> = [
  ["company", "Company name"],
  ["domain", "Their website"],
  ["trigger", "News headline (funding, new leader…), empty if none"],
  ["flaw_1", "Biggest flaw your services fix"],
  ["evidence_1", "Proof for flaw 1"],
  ["flaw_1_lower", "Flaw 1, mid-sentence"],
  ["flaw_2", "Second flaw"],
  ["evidence_2", "Proof for flaw 2"],
  ["services", "Your services that fix them"],
  ["sender", "Your name"],
  ["signature", "Your signature"],
];

