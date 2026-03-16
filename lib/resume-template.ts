import { Document, Footer, Packer, Paragraph, TextRun } from "docx";

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
  return new Paragraph({});
}

function headingParagraph(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true })],
    spacing: { before: 160, after: 100 },
  });
}

function bulletParagraph(text: string) {
  return new Paragraph({
    children: [new TextRun(`${String.fromCodePoint(0x2022)} ${text}`)],
    spacing: { after: 60 },
  });
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

  const coreSkills = (resume.core_skills ?? []).map((item) => item.trim()).filter(Boolean);
  if (coreSkills.length > 0) {
    lines.push("CORE EXPERTISE");
    for (const skill of coreSkills) lines.push(`- ${skill}`);
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
      for (const bullet of (row.bullets ?? []).map((item) => item.trim()).filter(Boolean)) {
        lines.push(`- ${bullet}`);
      }
      lines.push("");
    }
  }

  const education = (resume.off_duty_education ?? []).map((item) => item.trim()).filter(Boolean);
  const certifications = (resume.civilian_certifications ?? []).map((item) => item.trim()).filter(Boolean);
  const training = (resume.additional_training ?? []).map((item) => item.trim()).filter(Boolean);

  if (education.length > 0 || certifications.length > 0 || training.length > 0) {
    lines.push("EDUCATION & PROFESSIONAL DEVELOPMENT");
    for (const item of [...education, ...certifications, ...training]) {
      lines.push(`- ${item}`);
    }
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
        children: [new TextRun({ text: clean(args.contact.full_name), bold: true, size: 28 })],
        spacing: { after: 80 },
      })
    );
  }

  if (clean(args.resume.target_title)) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: clean(args.resume.target_title), size: 24 })],
        spacing: { after: 80 },
      })
    );
  }

  const contactLine = buildContactLine(args.contact);
  if (contactLine) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun(contactLine)],
        spacing: { after: 160 },
      })
    );
  }

  if (clean(args.resume.executive_summary)) {
    paragraphs.push(headingParagraph("EXECUTIVE SUMMARY"));
    paragraphs.push(
      new Paragraph({
        children: [new TextRun(args.resume.executive_summary.trim())],
        spacing: { after: 120 },
      })
    );
  }

  const coreSkills = (args.resume.core_skills ?? []).map((item) => item.trim()).filter(Boolean);
  if (coreSkills.length > 0) {
    paragraphs.push(headingParagraph("CORE EXPERTISE"));
    for (const skill of coreSkills) paragraphs.push(bulletParagraph(skill));
    paragraphs.push(blankParagraph());
  }

  const experienceRows = (args.resume.experience ?? []).filter(
    (row) => clean(row.role_title) || clean(row.organization) || clean(row.location) || clean(row.dates) || hasItems(row.bullets)
  );
  if (experienceRows.length > 0) {
    paragraphs.push(headingParagraph("PROFESSIONAL EXPERIENCE"));
    for (const row of experienceRows) {
      if (clean(row.role_title)) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: clean(row.role_title), bold: true })],
            spacing: { after: 60 },
          })
        );
      }
      const orgLine = buildOrgLine(row);
      if (orgLine) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun(orgLine)],
            spacing: { after: 60 },
          })
        );
      }
      for (const bullet of (row.bullets ?? []).map((item) => item.trim()).filter(Boolean)) {
        paragraphs.push(bulletParagraph(bullet));
      }
      paragraphs.push(blankParagraph());
    }
  }

  const education = (args.resume.off_duty_education ?? []).map((item) => item.trim()).filter(Boolean);
  const certifications = (args.resume.civilian_certifications ?? []).map((item) => item.trim()).filter(Boolean);
  const training = (args.resume.additional_training ?? []).map((item) => item.trim()).filter(Boolean);

  if (education.length > 0 || certifications.length > 0 || training.length > 0) {
    paragraphs.push(headingParagraph("EDUCATION & PROFESSIONAL DEVELOPMENT"));
    for (const item of [...education, ...certifications, ...training]) {
      paragraphs.push(bulletParagraph(item));
    }
  }

  const footerText = [clean(args.contact.full_name), clean(args.resume.target_title)].filter(Boolean).join(" - ");

  const doc = new Document({
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
                    children: [new TextRun(footerText)],
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