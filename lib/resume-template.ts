import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

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

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clean(value?: string | null) {
  return (value ?? "").trim();
}

function hasItems(items?: string[] | null) {
  return (items ?? []).map((item) => item.trim()).filter(Boolean).length > 0;
}

function paragraphXml(runs: Array<{ text: string; bold?: boolean }>) {
  const runsXml = runs
    .filter((run) => run.text.length > 0)
    .map((run) => {
      const preserve = /^\s|\s$/.test(run.text) ? ' xml:space="preserve"' : "";
      const runProps = run.bold ? "<w:rPr><w:b/></w:rPr>" : "";
      return `<w:r>${runProps}<w:t${preserve}>${escapeXml(run.text)}</w:t></w:r>`;
    })
    .join("");

  return runsXml ? `<w:p>${runsXml}</w:p>` : "<w:p/>";
}

function blankParagraphXml() {
  return "<w:p/>";
}

function bulletParagraphXml(text: string) {
  return paragraphXml([{ text: `${String.fromCodePoint(0x2022)} ${text}` }]);
}

function buildContactLine(contact: ResumeContactInfo) {
  const phoneIcon = String.fromCodePoint(0x1F4DE);
  const emailIcon = String.fromCodePoint(0x2709, 0xFE0F);
  const linkIcon = String.fromCodePoint(0x1F517);
  const locationIcon = String.fromCodePoint(0x1F4CD);
  const clearanceIcon = String.fromCodePoint(0x1F6E1, 0xFE0F);

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

function replaceContainerInner(xml: string, tagName: string, inner: string) {
  const pattern = new RegExp(`(<${tagName}[^>]*>)[\\s\\S]*?(</${tagName}>)`);
  return xml.replace(pattern, `$1${inner}$2`);
}

function buildDocumentBodyXml(args: {
  contact: ResumeContactInfo;
  resume: StructuredTargetedResume;
  sectPrXml: string;
}) {
  const { contact, resume, sectPrXml } = args;
  const paragraphs: string[] = [];

  if (clean(contact.full_name)) paragraphs.push(paragraphXml([{ text: clean(contact.full_name), bold: true }]));
  if (clean(resume.target_title)) paragraphs.push(paragraphXml([{ text: clean(resume.target_title) }]));

  const contactLine = buildContactLine(contact);
  if (contactLine) paragraphs.push(paragraphXml([{ text: contactLine }]));

  if (paragraphs.length > 0) paragraphs.push(blankParagraphXml());

  if (clean(resume.executive_summary)) {
    paragraphs.push(paragraphXml([{ text: "EXECUTIVE SUMMARY", bold: true }]));
    paragraphs.push(paragraphXml([{ text: resume.executive_summary.trim() }]));
    paragraphs.push(blankParagraphXml());
  }

  const coreSkills = (resume.core_skills ?? []).map((item) => item.trim()).filter(Boolean);
  if (coreSkills.length > 0) {
    paragraphs.push(paragraphXml([{ text: "CORE EXPERTISE", bold: true }]));
    for (const skill of coreSkills) paragraphs.push(bulletParagraphXml(skill));
    paragraphs.push(blankParagraphXml());
  }

  const experienceRows = (resume.experience ?? []).filter(
    (row) => clean(row.role_title) || clean(row.organization) || clean(row.location) || clean(row.dates) || hasItems(row.bullets)
  );
  if (experienceRows.length > 0) {
    paragraphs.push(paragraphXml([{ text: "PROFESSIONAL EXPERIENCE", bold: true }]));
    experienceRows.forEach((row, index) => {
      if (clean(row.role_title)) paragraphs.push(paragraphXml([{ text: clean(row.role_title), bold: true }]));
      const orgLine = buildOrgLine(row);
      if (orgLine) paragraphs.push(paragraphXml([{ text: orgLine }]));
      for (const bullet of (row.bullets ?? []).map((item) => item.trim()).filter(Boolean)) {
        paragraphs.push(bulletParagraphXml(bullet));
      }
      if (index < experienceRows.length - 1) paragraphs.push(blankParagraphXml());
    });
    paragraphs.push(blankParagraphXml());
  }

  const education = (resume.off_duty_education ?? []).map((item) => item.trim()).filter(Boolean);
  const certifications = (resume.civilian_certifications ?? []).map((item) => item.trim()).filter(Boolean);
  const training = (resume.additional_training ?? []).map((item) => item.trim()).filter(Boolean);

  if (education.length > 0 || certifications.length > 0 || training.length > 0) {
    paragraphs.push(paragraphXml([{ text: "EDUCATION & PROFESSIONAL DEVELOPMENT", bold: true }]));
    for (const item of [...education, ...certifications, ...training]) {
      paragraphs.push(bulletParagraphXml(item));
    }
  }

  return `<w:body>${paragraphs.join("")}${sectPrXml}</w:body>`;
}

export async function renderTargetedResumeDocx(args: {
  templatePath?: string;
  contact: ResumeContactInfo;
  resume: StructuredTargetedResume;
}) {
  const templatePath = args.templatePath ?? path.join(process.cwd(), "docs", "milvector_resume_template_v1.docx");
  const templateBuffer = await readFile(templatePath);
  const zip = await JSZip.loadAsync(templateBuffer);

  const documentFile = zip.file("word/document.xml");
  if (!documentFile) {
    throw new Error("Template document.xml not found.");
  }

  const documentXml = await documentFile.async("string");
  const sectPrMatch = documentXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
  if (!sectPrMatch) {
    throw new Error("Template section properties not found.");
  }

  const updatedDocumentXml = replaceContainerInner(
    documentXml,
    "w:body",
    buildDocumentBodyXml({ contact: args.contact, resume: args.resume, sectPrXml: sectPrMatch[0] }).replace(/^<w:body>|<\/w:body>$/g, "")
  );
  zip.file("word/document.xml", updatedDocumentXml);

  const footerFile = zip.file("word/footer1.xml");
  if (footerFile) {
    const footerXml = await footerFile.async("string");
    const footerText = [clean(args.contact.full_name), clean(args.resume.target_title)].filter(Boolean).join(" - ");
    const updatedFooterXml = replaceContainerInner(footerXml, "w:ftr", paragraphXml([{ text: footerText }]));
    zip.file("word/footer1.xml", updatedFooterXml);
  }

  return zip.generateAsync({ type: "nodebuffer" });
}
