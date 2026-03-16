import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  Paragraph,
  TabStopPosition,
  TabStopType,
  TextRun,
} from "docx";

export type StructuredExperience = {
  role_title: string;
  organization: string;
  location: string;
  dates: string;
  bullets: string[];
};

export type StructuredTargetedResume = {
  target_title: string;
  executive_summary: string;
  core_skills: string[];
  experience: StructuredExperience[];
  off_duty_education: string[];
  civilian_certifications: string[];
  additional_training: string[];
};

export type ResumeContactInfo = {
  full_name?: string | null;
  phone_number?: string | null;
  professional_email?: string | null;
  linkedin_url?: string | null;
  location?: string | null;
  security_clearance?: string | null;
};

function clean(value?: string | null) {
  return (value ?? "").trim();
}

function uniqueItems(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items.map((value) => value.trim()).filter(Boolean)) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function hasItems(items?: string[] | null) {
  return (items ?? []).map((item) => item.trim()).filter(Boolean).length > 0;
}

function buildContactLine(contact: ResumeContactInfo) {
  const phoneIcon = String.fromCodePoint(0x1f4de);
  const emailIcon = String.fromCodePoint(0x2709, 0xfe0f);
  const linkIcon = String.fromCodePoint(0x1f517);
  const locationIcon = String.fromCodePoint(0x1f4cd);
  const clearanceIcon = String.fromCodePoint(0x1f6e1, 0xfe0f);

  const parts = [
    clean(contact.phone_number) ? `${phoneIcon} ${clean(contact.phone_number)}` : "",
    clean(contact.professional_email) ? `${emailIcon} ${clean(contact.professional_email)}` : "",
    clean(contact.linkedin_url) ? `${linkIcon} ${clean(contact.linkedin_url)}` : "",
    clean(contact.location) ? `${locationIcon} ${clean(contact.location)}` : "",
    clean(contact.security_clearance) ? `${clearanceIcon} ${clean(contact.security_clearance)} Clearance` : "",
  ].filter(Boolean);

  return parts.join(" | ");
}

function buildOrgLine(experience: StructuredExperience) {
  return [clean(experience.organization), clean(experience.location), clean(experience.dates)]
    .filter(Boolean)
    .join(" | ");
}

function blankParagraph() {
  return new Paragraph({ spacing: { after: 40 } });
}

function sectionRule() {
  return new Paragraph({
    border: {
      bottom: {
        color: "A0A0A0",
        space: 1,
        style: BorderStyle.SINGLE,
        size: 6,
      },
    },
    spacing: { after: 40 },
  });
}

function sectionHeading(text: string) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        font: "Times New Roman",
        size: 28,
      }),
    ],
    spacing: { after: 20 },
  });
}

function bodyParagraph(text: string, options?: { italics?: boolean; bold?: boolean; centered?: boolean }) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        italics: options?.italics,
        bold: options?.bold,
        font: "Times New Roman",
        size: 22,
      }),
    ],
    alignment: options?.centered ? AlignmentType.CENTER : undefined,
    spacing: { after: 40 },
  });
}

function bulletParagraph(text: string) {
  return new Paragraph({
    children: [
      new TextRun({
        text: `${String.fromCodePoint(0x2022)} ${text}`,
        font: "Times New Roman",
        size: 22,
      }),
    ],
    spacing: { after: 20 },
    indent: { left: 180, hanging: 120 },
  });
}

function experienceHeadingParagraph(entry: StructuredExperience) {
  const role = clean(entry.role_title);
  const orgLine = buildOrgLine(entry);

  if (role && orgLine) {
    return new Paragraph({
      children: [
        new TextRun({ text: role, bold: true, font: "Times New Roman", size: 22 }),
        new TextRun({ text: "\t", font: "Times New Roman", size: 22 }),
        new TextRun({ text: orgLine, italics: true, font: "Times New Roman", size: 22 }),
      ],
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      spacing: { after: 30 },
    });
  }

  return bodyParagraph(role || orgLine, { bold: true });
}

function compactCoreSkills(skills: string[]) {
  return uniqueItems(skills).join(` ${String.fromCodePoint(0x2022)} `);
}

function compactEducationLine(label: string, items: string[]) {
  const compact = uniqueItems(items).join("; ");
  return compact ? `${label}: ${compact}` : "";
}

function pushEducationSection(paragraphs: Paragraph[], resume: StructuredTargetedResume) {
  const education = uniqueItems((resume.off_duty_education ?? []).map((item) => item.trim()).filter(Boolean));
  const certifications = uniqueItems((resume.civilian_certifications ?? []).map((item) => item.trim()).filter(Boolean));
  const training = uniqueItems((resume.additional_training ?? []).map((item) => item.trim()).filter(Boolean));

  if (education.length === 0 && certifications.length === 0 && training.length === 0) return;

  paragraphs.push(sectionRule());
  paragraphs.push(sectionHeading("EDUCATION & PROFESSIONAL DEVELOPMENT"));

  const compactLines = [
    compactEducationLine("Education", education),
    compactEducationLine("Certifications", certifications),
    compactEducationLine("Training", training),
  ].filter(Boolean);

  for (const line of compactLines) {
    paragraphs.push(bodyParagraph(line));
  }
}

export function buildTargetedResumeText(args: {
  contact: ResumeContactInfo;
  resume: StructuredTargetedResume;
}) {
  const { contact, resume } = args;
  const lines: string[] = [];

  if (clean(contact.full_name)) lines.push(clean(contact.full_name));
  if (clean(resume.target_title)) lines.push(clean(resume.target_title));

  const contactLine = buildContactLine(contact);
  if (contactLine) lines.push(contactLine);

  if (lines.length > 0) lines.push("");

  if (clean(resume.executive_summary)) {
    lines.push("EXECUTIVE SUMMARY");
    lines.push(resume.executive_summary.trim());
    lines.push("");
  }

  const coreSkills = uniqueItems((resume.core_skills ?? []).map((item) => item.trim()).filter(Boolean));
  if (coreSkills.length > 0) {
    lines.push("CORE EXPERTISE");
    lines.push(coreSkills.join(" | "));
    lines.push("");
  }

  const experienceRows = (resume.experience ?? []).filter(
    (row) => clean(row.role_title) || clean(row.organization) || clean(row.location) || clean(row.dates) || hasItems(row.bullets)
  );
  if (experienceRows.length > 0) {
    lines.push("PROFESSIONAL EXPERIENCE");
    for (const row of experienceRows) {
      if (clean(row.role_title)) lines.push(clean(row.role_title));
      const orgLine = buildOrgLine(row);
      if (orgLine) lines.push(orgLine);
      for (const bullet of uniqueItems((row.bullets ?? []).map((item) => item.trim()).filter(Boolean))) {
        lines.push(`- ${bullet}`);
      }
      lines.push("");
    }
  }

  const compactLines = [
    compactEducationLine("Education", resume.off_duty_education ?? []),
    compactEducationLine("Certifications", resume.civilian_certifications ?? []),
    compactEducationLine("Training", resume.additional_training ?? []),
  ].filter(Boolean);

  if (compactLines.length > 0) {
    lines.push("EDUCATION & PROFESSIONAL DEVELOPMENT");
    lines.push(...compactLines);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildTargetedResumeFilename(args: {
  createdAt: Date;
  jobTitle?: string | null;
  company?: string | null;
}) {
  const datePart = args.createdAt.toISOString().slice(0, 10);
  const normalize = (value?: string | null) =>
    (value ?? "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);

  const pieces = [datePart, normalize(args.jobTitle) || "targeted_resume"];
  const company = normalize(args.company);
  if (company) pieces.push(company);
  return `${pieces.join("_")}.docx`;
}

export async function renderTargetedResumeDocx(args: {
  templatePath?: string;
  contact: ResumeContactInfo;
  resume: StructuredTargetedResume;
}) {
  void args.templatePath;

  const paragraphs: Paragraph[] = [];

  if (clean(args.contact.full_name)) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: clean(args.contact.full_name), bold: true, font: "Times New Roman", size: 44 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
      })
    );
  }

  if (clean(args.resume.target_title)) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: clean(args.resume.target_title), italics: true, font: "Times New Roman", size: 26 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
      })
    );
  }

  const contactLine = buildContactLine(args.contact);
  if (contactLine) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: contactLine, font: "Times New Roman", size: 22 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
      })
    );
  }

  paragraphs.push(sectionRule());

  if (clean(args.resume.executive_summary)) {
    paragraphs.push(sectionHeading("EXECUTIVE SUMMARY"));
    paragraphs.push(bodyParagraph(args.resume.executive_summary.trim()));
  }

  const coreSkills = uniqueItems((args.resume.core_skills ?? []).map((item) => item.trim()).filter(Boolean));
  if (coreSkills.length > 0) {
    paragraphs.push(sectionRule());
    paragraphs.push(sectionHeading("CORE EXPERTISE"));
    paragraphs.push(bodyParagraph(compactCoreSkills(coreSkills)));
  }

  const experienceRows = (args.resume.experience ?? []).filter(
    (row) => clean(row.role_title) || clean(row.organization) || clean(row.location) || clean(row.dates) || hasItems(row.bullets)
  );
  if (experienceRows.length > 0) {
    paragraphs.push(sectionRule());
    paragraphs.push(sectionHeading("PROFESSIONAL EXPERIENCE"));
    for (const row of experienceRows) {
      paragraphs.push(experienceHeadingParagraph(row));
      for (const bullet of uniqueItems((row.bullets ?? []).map((item) => item.trim()).filter(Boolean))) {
        paragraphs.push(bulletParagraph(bullet));
      }
      paragraphs.push(blankParagraph());
    }
  }

  pushEducationSection(paragraphs, args.resume);

  const footerText = [clean(args.contact.full_name), clean(args.resume.target_title)].filter(Boolean).join(" - ");

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Times New Roman",
            size: 22,
          },
          paragraph: {
            spacing: {
              line: 240,
              after: 0,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        footers: footerText
          ? {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: footerText, size: 16, color: "262626", font: "Times New Roman" })],
                  }),
                ],
              }),
            }
          : undefined,
        children: paragraphs.length > 0 ? paragraphs : [new Paragraph("")],
      },
    ],
  });

  return Packer.toBuffer(doc);
}