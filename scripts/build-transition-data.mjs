import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const workbookPath = process.argv[2] || String.raw`C:\Users\b_rus\Downloads\Retirement Milestones_20270131 Russell.xlsx`;
const outTasksPath = path.join(process.cwd(), "data", "milvector_transition_tasks.json");
const outLinksPath = path.join(process.cwd(), "data", "milvector_library_links.json");

const CATEGORY_HEADERS = new Set([
  "Transition Planning",
  "Onward to Opportunity or SkillBridge (180 days from EAS)",
  "Job Seeking",
  "Estate Planning",
  "Retirement Ceremony",
  "Post Retirement Actions",
]);

const CATEGORY_BY_HEADER = {
  "Complete TRS": "Administrative",
  "Submit Appendix J (14 mos from EAS)": "Administrative",
  "Complete VA Disability Claim for BDD (180-90 days from EAS)": "VA Benefits",
  "Transition Planning": "Administrative",
  "Onward to Opportunity or SkillBridge (180 days from EAS)": "Employment",
  "Job Seeking": "Employment",
  "Estate Planning": "Financial",
  "Retirement Ceremony": "Administrative",
  "Post Retirement Actions": "Post-Retirement",
};

const DOC_PATHS = [
  "docs/public/0 - Appendix J Fillable Form.pdf",
  "docs/public/1a - Retirement or Separation Timelines.pdf",
  "docs/public/1b - Retirement Planning Timeline.pdf",
  "docs/public/1d - Retirement Planning Checklist.docx",
  "docs/public/2a - Retirement Ceremony Notification.docx",
  "docs/public/2b - Retirement Ceremony Checklist v3.pdf",
  "docs/public/2c - Retirement Ceremony Checklist Template v3.docx",
  "docs/public/3a - Retirement Ceremony  LOI.docx",
  "docs/public/3b - Retirement Ceremony LOI Encl 1_SOE.docx",
  "docs/public/3c - Retirement Ceremony LOI Encl 2_Key Personnel.docx",
  "docs/public/3d - Retirement Ceremony LOI Encl 3_Band Request.pdf",
  "docs/public/4 - Certificate of Appreciation_Family_Template.pptx",
  "docs/public/5 - Retirement Ceremony Invitation Template.docx",
  "docs/public/6 - Retirement Ceremony Program Sample_1.pptx",
  "docs/public/7 - Flag Certificate Template_1.docx",
];

function toAnchor(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "EAS") return "EAS";
  if (raw === "TERMINAL") return "TERMINAL";
  if (raw === "PTAD") return "PTAD";
  if (raw === "CEREMONY") return "CEREMONY";
  return "EAS";
}

function toInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function computePhase(daysBefore) {
  if (daysBefore === null) return "reference";
  if (daysBefore >= 540) return "24 months";
  if (daysBefore >= 365) return "18 months";
  if (daysBefore >= 270) return "12 months";
  if (daysBefore >= 180) return "9 months";
  if (daysBefore >= 90) return "6 months";
  if (daysBefore >= 30) return "3 months";
  return "final";
}

function phaseMonthFromLabel(phase) {
  if (phase === "24 months") return 24;
  if (phase === "18 months") return 18;
  if (phase === "12 months") return 12;
  if (phase === "9 months") return 9;
  if (phase === "6 months") return 6;
  if (phase === "3 months") return 3;
  if (phase === "final") return 0;
  return 24;
}

function mapAssistance(taskTitle) {
  const title = taskTitle.toLowerCase();
  if ((/\bmos\b(?!\s+from)/.test(title) && !title.includes("14 mos")) || title.includes("civilian language")) {
    return {
      assistance_type: "tool",
      assistance_ref: "/app/tools/mos-translator",
      assistance_notes: "MilVector tool can convert MOS language to civilian language.",
    };
  }
  if (title.includes("resume")) {
    return {
      assistance_type: "tool",
      assistance_ref: "/app/tools/resume-targeter",
      assistance_notes: "MilVector tools can build master and targeted resumes.",
    };
  }
  if (title.includes("job description") || title.includes("keywords")) {
    return {
      assistance_type: "tool",
      assistance_ref: "/app/tools/jd-decoder",
      assistance_notes: "MilVector tool can extract and analyze job requirements.",
    };
  }
  if (title.includes("appendix j")) {
    return {
      assistance_type: "doc",
      assistance_ref: "./docs/public/0 - Appendix J Fillable Form.pdf",
      assistance_notes: "MilVector has a ready-to-use Appendix J template.",
    };
  }
  if (title.includes("ceremony") || title.includes("invitation") || title.includes("speech") || title.includes("band")) {
    return {
      assistance_type: "doc",
      assistance_ref: "./docs/public/2b - Retirement Ceremony Checklist v3.pdf",
      assistance_notes: "MilVector has ceremony checklists and templates in docs/public.",
    };
  }
  if (title.includes("trs") || title.includes("timeline") || title.includes("checklist")) {
    return {
      assistance_type: "doc",
      assistance_ref: "./docs/public/1d - Retirement Planning Checklist.docx",
      assistance_notes: "MilVector has planning checklist and timeline documents.",
    };
  }
  return {
    assistance_type: "none",
    assistance_ref: null,
    assistance_notes: "No direct MilVector tool or public template currently mapped for this task.",
  };
}

function isLikelyUrl(value) {
  if (!value) return false;
  const input = String(value).trim();
  if (/^https?:\/\//i.test(input)) return true;
  if (/\s/.test(input)) return false;
  return /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(input);
}

function normalizeUrl(value) {
  const input = String(value || "").trim();
  if (/^https?:\/\//i.test(input)) return input;
  return `https://${input}`;
}

function buildTasks(wb) {
  const ws = wb.Sheets["Milestones"];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });

  const tasks = [];
  let currentCategory = "Administrative";
  let parentMilestone = null;
  let counter = 1;

  for (let i = 0; i < rows.length; i += 1) {
    const rowNumber = i + 1;
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const title = String(row[0] ?? "").trim();
    const daysBefore = toInt(row[4]);
    const anchor = toAnchor(row[5]);
    const notes = row[8] ? String(row[8]).trim() : null;
    const hasTiming = daysBefore !== null && !!row[5];
    if (!title || title === "Task" || title === "Days to EAS") continue;

    if (CATEGORY_BY_HEADER[title]) {
      currentCategory = CATEGORY_BY_HEADER[title];
    }

    if (CATEGORY_HEADERS.has(title)) {
      parentMilestone = null;
      continue;
    }

    const next = rows[i + 1] || [];
    const nextHasTiming = toInt(next[4]) !== null && !!next[5];
    const headerWithoutTiming = !hasTiming && nextHasTiming;

    if (headerWithoutTiming) {
      const assistance = mapAssistance(title);
      parentMilestone = {
        external_id: `mv-${String(counter).padStart(4, "0")}`,
        title,
        description: notes,
        category: currentCategory,
        anchor_event: "EAS",
        days_before_event: null,
        phase: "reference",
        phase_month: 24,
        task_type: "milestone",
        is_milestone: true,
        priority: "medium",
        source_sheet: "Milestones",
        source_row: rowNumber,
        assistance_type: assistance.assistance_type,
        assistance_ref: assistance.assistance_ref,
        assistance_notes: assistance.assistance_notes,
        supporting_tasks: [],
        _supporting_days: [],
      };
      tasks.push(parentMilestone);
      counter += 1;
      continue;
    }

    const assistance = mapAssistance(title);
    const parsed = {
      external_id: `mv-${String(counter).padStart(4, "0")}`,
      title,
      description: notes,
      category: currentCategory,
      anchor_event: anchor,
      days_before_event: daysBefore,
      phase: computePhase(daysBefore),
      phase_month: phaseMonthFromLabel(computePhase(daysBefore)),
      task_type: "milestone",
      is_milestone: true,
      priority: daysBefore !== null && daysBefore <= 90 ? "high" : "medium",
      source_sheet: "Milestones",
      source_row: rowNumber,
      assistance_type: assistance.assistance_type,
      assistance_ref: assistance.assistance_ref,
      assistance_notes: assistance.assistance_notes,
      supporting_tasks: [],
    };
    counter += 1;

    if (parentMilestone) {
      parentMilestone.supporting_tasks.push({
        title: parsed.title,
        description: parsed.description,
        order_index: parentMilestone.supporting_tasks.length + 1,
      });
      if (typeof parsed.days_before_event === "number") {
        parentMilestone._supporting_days.push(parsed.days_before_event);
      }
      continue;
    }

    tasks.push(parsed);
  }

  return tasks.map((task) => {
    const out = { ...task };
    if (Array.isArray(out._supporting_days) && out._supporting_days.length > 0) {
      out.days_before_event = Math.max(...out._supporting_days);
      out.phase = computePhase(out.days_before_event);
      out.phase_month = phaseMonthFromLabel(out.phase);
    }
    delete out._supporting_days;
    return out;
  });
}

function buildLinks(wb) {
  const ws = wb.Sheets["Websites"];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  const links = [];
  let counter = 1;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const category = String(row[0] ?? "").trim();
    const title = String(row[1] ?? "").trim();
    const reference = String(row[2] ?? "").trim();
    if (!category || !title || !reference) continue;

    const url = isLikelyUrl(reference) ? normalizeUrl(reference) : null;
    links.push({
      external_id: `link-${String(counter).padStart(4, "0")}`,
      title,
      category,
      description: null,
      url,
      source: "Retirement Milestones Workbook",
      source_sheet: "Websites",
      source_row: i + 1,
      review_status: url ? "ready" : "needs_review",
      raw_reference: reference,
    });
    counter += 1;
  }
  return links;
}

function main() {
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Workbook not found: ${workbookPath}`);
  }

  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
  const wb = xlsx.readFile(workbookPath, { raw: false });
  const tasks = buildTasks(wb);
  const links = buildLinks(wb);

  fs.writeFileSync(
    outTasksPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source_workbook: workbookPath,
        docs_public_assets: DOC_PATHS,
        tasks,
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    outLinksPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source_workbook: workbookPath,
        links,
      },
      null,
      2
    )
  );

  console.log(`Wrote ${tasks.length} tasks -> ${outTasksPath}`);
  console.log(`Wrote ${links.length} links -> ${outLinksPath}`);
}

main();
