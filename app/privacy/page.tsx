import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Privacy",
    description: "How MilVector handles your information: a privacy posture built around trust, not lead generation.",
    path: "/privacy",
  }),
};

const privacyPoints = [
  {
    title: "Automatic PII Redaction",
    detail:
      "When you upload military records, MilVector automatically removes Social Security Numbers and DoD ID (EDIPI) numbers from the document text before it is stored or sent to any AI model. The same scrubbing runs on text you paste into the tools.",
  },
  {
    title: "Free Access, Limited Data",
    detail:
      "MilVector is designed to stay free for service members. We only collect the information needed to operate the workspace, secure access, save outputs, and support follow-up inside the platform.",
  },
  {
    title: "No Selling User Information",
    detail:
      "MilVector is not built to sell service member information to recruiters, lenders, lead-generation networks, or other third parties. That trust line is intentional.",
  },
  {
    title: "Workspace-Based AI Use",
    detail:
      "Every tool runs inside MilVector on paid API calls, so its results connect to your profile, documents, and saved work. No tool sends you to a separate ChatGPT account.",
  },
  {
    title: "Analytics On Public Pages Only",
    detail:
      "MilVector uses Google Analytics on its public pages, such as the home page, knowledge base, and library, to see how many people visit and how they find the site. It uses cookies and records pages viewed, approximate location, and device type. It is not loaded inside the signed-in workspace, so your records, documents, and tool use are never sent to it. You can block it in your browser's cookie settings or with Google's Analytics opt-out add-on (tools.google.com/dlpage/gaoptout).",
  },
  {
    title: "Digital Business Cards",
    detail:
      "A business card you publish is a public page: anyone with its link or QR code can see what you put on it, so include only what you would hand to a stranger. Cards are kept out of search engines and are not covered by site analytics. MilVector counts views and contact saves as totals only, with no record of who the visitor was. Details a visitor chooses to send you go only to you, and you can unpublish or delete a card at any time.",
  },
  {
    title: "Retirement Invitations And Their Guests",
    detail:
      "A retirement invitation a member publishes is a public page: anyone with its link or QR code can see it. Invitations are kept out of search engines and are not covered by site analytics. A home address the host marks private is shown only to guests who answer yes or maybe. If you are a guest, what you send through the page (your name, email, an optional mobile number, your answers, the names and emails of adults in your party who need a base visitor pass, and any message) goes only to the host. MilVector's admin account has no access to it, MilVector does not email you, and your details are not used for anything else. The page never asks for a Social Security number or date of birth. You get a private link to change your answer, and your own phone remembers that you answered so you can see it again; nothing about that is sent anywhere. To stop one person flooding an invitation with fake answers, the page counts answers by a scrambled form of the sender's internet address that cannot be turned back into the address, and deletes those counts after two days. The host can delete your reply at any time, and every answer and message is deleted 180 days after the ceremony.",
  },
  {
    title: "Admin Review And Support",
    detail:
      "Support cases, community moderation, and library submissions can be reviewed by the MilVector admin account so issues can be resolved and unsafe content can be managed inside the workspace.",
  },
  {
    title: "Services MilVector Uses",
    detail:
      "Your information passes through a few services only to run MilVector. Supabase stores your account, profile, files, and saved work. Vercel hosts the site, and Cloudflare carries traffic to milvector.org. OpenAI runs the AI tools: it receives the text a tool needs, with SSN and DoD ID numbers removed first. OpenAI's terms for its API say that data is not used to train its models, and it keeps API logs for up to 30 days to watch for abuse; MilVector also tells it not to store the responses. Resend delivers support emails, and Google Analytics measures visits to public pages only.",
  },
  {
    title: "Deleting Your Account",
    detail:
      "You can delete your account yourself, at any time, from your Profile. That permanently deletes your profile, uploaded records, every resume and file MilVector made for you, your tool history and Timeline progress, your support tickets, and your business card and retirement invitation along with the answers guests sent. Your Community replies and any thread nobody answered are deleted; a thread other members replied to stays, shown as from a former member, so their replies are not lost.",
  },
];

const commitments = [
  "SSN and DoD ID (EDIPI) numbers are auto-removed from document text.",
  "We require sign-in to reduce bot abuse and protect platform operating costs.",
  "We do not sell your information.",
  "The services that run MilVector are named on this page, and the AI provider does not train on what you send.",
  "Site analytics run on public pages only, never inside your workspace.",
  "Guests who answer a retirement invitation are seen only by the host, and their answers are deleted 180 days after the ceremony.",
  "You control what you upload into your workspace, and you can delete your account and everything in it from your Profile.",
  "Community and support content may be reviewed when moderation or resolution is required.",
];

export default function PrivacyPage() {
  return (
    <PageContainer className="flex flex-col gap-4" size="md">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">PRIVACY</p>
            <h1 className="page-title">A simple privacy posture built around trust, not lead generation.</h1>
            <p className="page-description">
              MilVector exists to help service members transition with more continuity and less friction. The platform is designed to keep that mission ahead of monetizing user data.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">CORE COMMITMENTS</p>
            <ul className="page-hero-list">
              {commitments.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className="section-card">
        <h2 className="section-title">What This Means In Practice</h2>
        <p className="section-description">The goal is to be clear about how MilVector operates without burying people in legal-sounding language.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {privacyPoints.map((item) => (
          <article key={item.title} className="section-card">
            <h3 className="text-lg font-bold">{item.title}</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="section-card">
        <h2 className="section-title">Questions Before You Sign In?</h2>
        <p className="section-description">If you want the broader platform context first, start with the trust and product overview.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/platform" className="btn btn-secondary">
            How MilVector Works
          </Link>
          <Link href="/auth" className="btn btn-primary">
            Open Workspace
          </Link>
        </div>
      </section>
    </PageContainer>
  );
}
