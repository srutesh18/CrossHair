import "server-only";
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { ExportRow } from "./rows";

const BRAND = "#d2441f";
const INK = "#1f2433";
const MUTED = "#6b6a62";
const LINE = "#e7e5de";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: INK, fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    paddingBottom: 8,
    marginBottom: 14,
  },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: INK },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 3 },
  meta: { fontSize: 8, color: MUTED, textAlign: "right" },

  card: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 4,
    padding: 10,
    marginBottom: 10,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  name: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  role: { fontSize: 9, color: MUTED, marginTop: 2 },
  tier: { fontSize: 9, fontFamily: "Helvetica-Bold", color: BRAND },

  scoreRow: { flexDirection: "row", marginTop: 4, marginBottom: 4 },
  scoreCell: { flex: 1, paddingRight: 8 },
  scoreLabel: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  scoreValue: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 1 },
  scoreReason: { fontSize: 8, color: MUTED, marginTop: 1 },

  label: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 },
  value: { fontSize: 9, marginTop: 1 },
  link: { fontSize: 8, color: BRAND, marginTop: 1 },

  email: {
    marginTop: 6,
    padding: 8,
    backgroundColor: "#faf9f6",
    borderLeftWidth: 2,
    borderLeftColor: BRAND,
  },
  emailDay: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  emailBody: { fontSize: 8, marginTop: 3, lineHeight: 1.4 },

  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: MUTED,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 6,
  },
});

function Facet({ label, value, reason }: { label: string; value: string; reason: string }) {
  return (
    <View style={styles.scoreCell}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <Text style={styles.scoreValue}>{value || "-"}</Text>
      <Text style={styles.scoreReason}>{reason}</Text>
    </View>
  );
}

function Email({ day, text }: { day: string; text: string }) {
  if (!text) return null;
  return (
    <View style={styles.email} wrap={false}>
      <Text style={styles.emailDay}>{day}</Text>
      <Text style={styles.emailBody}>{text}</Text>
    </View>
  );
}

export function LeadReport({ rows, scope }: { rows: ExportRow[]; scope: string }) {
  const generated = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <Document title="Crosshair lead report" author="Crosshair">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.title}>Crosshair lead report</Text>
            <Text style={styles.subtitle}>
              Don&apos;t email more. Email right. &middot; Draft mode, nothing sent.
            </Text>
          </View>
          <View>
            <Text style={styles.meta}>{generated}</Text>
            <Text style={styles.meta}>
              {rows.length} lead{rows.length === 1 ? "" : "s"} &middot; {scope}
            </Text>
          </View>
        </View>

        {rows.length === 0 ? (
          <Text style={styles.subtitle}>No leads match the current filters.</Text>
        ) : (
          rows.map((r, i) => (
            <View key={`${r.name}-${i}`} style={styles.card} wrap={false}>
              <View style={styles.cardTop}>
                <View>
                  <Text style={styles.name}>{r.name}</Text>
                  <Text style={styles.role}>
                    {[r.role, r.company].filter(Boolean).join(" at ")}
                  </Text>
                </View>
                <Text style={styles.tier}>{r.tier.toUpperCase()}</Text>
              </View>

              <View style={styles.scoreRow}>
                <Facet label="Pain" value={r.pain} reason={r.painReason} />
                <Facet label="Fit" value={r.fit} reason={r.fitReason} />
                <Facet label="Trigger" value={r.trigger} reason={r.triggerReason} />
              </View>

              <Text style={styles.label}>Unhappy with</Text>
              <Text style={styles.value}>{r.competitor || "-"}</Text>

              <Text style={styles.label}>Source</Text>
              <Text style={styles.value}>
                {[r.sourceName, r.foundOn].filter(Boolean).join(" · ")}
              </Text>
              {r.sourceUrl ? <Text style={styles.link}>{r.sourceUrl}</Text> : null}

              <Email day="Day 0" text={r.day0} />
              <Email day="Day 3 · proof" text={r.day3} />
              <Email day="Day 7 · close" text={r.day7} />
            </View>
          ))
        )}

        <View style={styles.footer} fixed>
          <Text>Crosshair &middot; public data only &middot; draft mode</Text>
          <Text
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export async function toPdf(rows: ExportRow[], scope: string): Promise<Buffer> {
  return renderToBuffer(<LeadReport rows={rows} scope={scope} />);
}
