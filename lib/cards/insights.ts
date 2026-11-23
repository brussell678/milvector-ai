import { EVENT_SOURCES, SOURCE_LABELS, type EventKind, type EventSource } from "@/lib/cards/schema";

export type StatRow = { day: string; kind: EventKind; source: EventSource; count: number };

export type Insights = {
  // Totals over the window (90 days)
  views: number;
  saves: number;
  linkTaps: number;
  walletAdds: number;
  resumeDownloads: number;
  // Share of visitors who saved the contact, as a whole percent, or null with no views
  saveRate: number | null;
  viewsBySource: { source: EventSource; count: number }[];
  // Last 30 days, oldest first, every day present
  daily: { day: string; views: number; saves: number }[];
};

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export function summarizeStats(rows: StatRow[], today: Date): Insights {
  let views = 0;
  let saves = 0;
  let linkTaps = 0;
  let walletAdds = 0;
  let resumeDownloads = 0;
  const bySource = new Map<EventSource, number>();
  const byDay = new Map<string, { views: number; saves: number }>();

  for (const row of rows) {
    const count = Math.max(0, Number(row.count) || 0);
    if (row.kind === "view") {
      views += count;
      bySource.set(row.source, (bySource.get(row.source) ?? 0) + count);
    } else if (row.kind === "save") saves += count;
    else if (row.kind === "link") linkTaps += count;
    else if (row.kind === "apple" || row.kind === "google") walletAdds += count;
    else if (row.kind === "resume") resumeDownloads += count;

    if (row.kind === "view" || row.kind === "save") {
      const entry = byDay.get(row.day) ?? { views: 0, saves: 0 };
      if (row.kind === "view") entry.views += count;
      else entry.saves += count;
      byDay.set(row.day, entry);
    }
  }

  const daily: Insights["daily"] = [];
  for (let back = 29; back >= 0; back -= 1) {
    const day = isoDay(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back)));
    daily.push({ day, ...(byDay.get(day) ?? { views: 0, saves: 0 }) });
  }

  return {
    views,
    saves,
    linkTaps,
    walletAdds,
    resumeDownloads,
    saveRate: views > 0 ? Math.min(100, Math.round((saves / views) * 100)) : null,
    viewsBySource: EVENT_SOURCES.map((source) => ({ source, count: bySource.get(source) ?? 0 })).filter((entry) => entry.count > 0),
    daily,
  };
}

// Contacts as a CSV a spreadsheet or CRM can import. Cells that start with a
// formula character are prefixed so a spreadsheet never runs them.
export type CsvLead = {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  note: string | null;
  source: string;
  created_at: string;
  event_name?: string | null;
  owner_note?: string | null;
};

export function leadsCsv(leads: CsvLead[]): string {
  const cell = (value: string | null | undefined) => {
    let text = value ?? "";
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const header = ["Name", "Email", "Phone", "Organization", "Their note", "My notes", "Event", "Came from", "Date"].join(",");
  const lines = leads.map((lead) =>
    [
      lead.name,
      lead.email,
      lead.phone,
      lead.company,
      lead.note,
      lead.owner_note,
      lead.event_name,
      SOURCE_LABELS[lead.source as EventSource] ?? lead.source,
      lead.created_at.slice(0, 10),
    ]
      .map(cell)
      .join(","),
  );
  return [header, ...lines].join("\r\n") + "\r\n";
}
