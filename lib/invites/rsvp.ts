import { z } from "zod";
import type { InviteData, InviteEvent } from "@/lib/invites/schema";
import { eventIsComplete, formatDateLong, formatTimeRange, sortEvents } from "@/lib/invites/time";

// Guest answers. A guest answers yes, maybe, or no for each event, with a
// headcount for the events they are coming to. Validated here on the way in
// and again inside the database function that saves it.

export const RSVP_STATUSES = ["yes", "maybe", "no"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];
export type EventAnswer = { status: RsvpStatus; adults: number; children: number };
export type GuestAnswers = Record<string, EventAnswer>;

export const MAX_PARTY = 30;

const text = (max: number) =>
  z
    .string()
    .max(max, `Keep this under ${max} characters.`)
    .transform((v) => v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim());

const count = z.number().int().min(0).max(MAX_PARTY);

const AnswerSchema = z
  .object({ status: z.enum(RSVP_STATUSES), adults: count.default(1), children: count.default(0) })
  .transform((a) => (a.status === "no" ? { status: a.status, adults: 0, children: 0 } : a));

const eventId = z.string().regex(/^[a-z0-9]{4,12}$/);

const answers = z
  .record(eventId, AnswerSchema)
  .refine((value) => Object.keys(value).length > 0, "Answer yes, maybe, or no for at least one event.")
  .refine((value) => Object.values(value).every((a) => a.status === "no" || a.adults + a.children > 0), "Count at least one person for each event you are coming to.");

const requiredEmail = z
  .string()
  .max(120)
  .transform((v) => v.trim().toLowerCase())
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter your email address. It is how you change your answer later.");

const optionalEmail = z
  .string()
  .max(120)
  .transform((v) => v.trim().toLowerCase())
  .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address, or leave it blank.");

const phone = z
  .string()
  .max(30)
  .transform((v) => v.trim())
  .refine((v) => v === "" || /^[+()\d][\d\s().+\-x]{5,29}$/.test(v), "Enter a phone number using digits, spaces, and + ( ) - only.");

export const RsvpSubmitSchema = z.object({
  token: z
    .string()
    .regex(/^[a-f0-9]{32,80}$/)
    .optional()
    .nullable(),
  name: text(80).refine((v) => v.length >= 2, "Enter your name."),
  email: requiredEmail,
  phone: phone.default(""),
  answers,
  meals: z.record(z.string().max(40), count).default({}),
  dietary: text(300).default(""),
  dodId: z.enum(["yes", "no", ""]).default(""),
  passNames: text(600).default(""),
  message: text(1500).default(""),
});
export type RsvpSubmit = z.infer<typeof RsvpSubmitSchema>;

// A guest the host adds by hand, for someone who will never use the form.
export const HostGuestSchema = z.object({
  name: text(80).refine((v) => v.length >= 2, "Enter the guest's name."),
  email: optionalEmail.default(""),
  phone: phone.default(""),
  answers,
  dodId: z.enum(["yes", "no", ""]).default(""),
  passNames: text(600).default(""),
  dietary: text(300).default(""),
});
export type HostGuest = z.infer<typeof HostGuestSchema>;

export const PIPELINE_STEPS = [
  { key: "sent", label: "Names sent to the base" },
  { key: "formDone", label: "Guest finished the base's form" },
  { key: "inHand", label: "Pass in hand" },
] as const;
export type PipelineKey = (typeof PIPELINE_STEPS)[number]["key"];
export type Pipeline = Partial<Record<PipelineKey, boolean>>;

export const PipelinePatchSchema = z.object({
  pipeline: z.object({ sent: z.boolean().optional(), formDone: z.boolean().optional(), inHand: z.boolean().optional() }).strict(),
});

// A saved guest as the host's dashboard sees it.
export type GuestRecord = {
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
  answers: GuestAnswers;
  meals: Record<string, number>;
  dietary: string | null;
  dod_id: "yes" | "no" | null;
  pass_names: string | null;
  message: string | null;
  pipeline: Pipeline;
  previous: { answers?: GuestAnswers; at?: string } | null;
  source: "guest" | "host";
  late: boolean;
  changed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const GUEST_COLUMNS =
  "id,email,name,phone,answers,meals,dietary,dod_id,pass_names,message,pipeline,previous,source,late,changed_at,created_at,updated_at";

// ─── What the guest sees after answering ─────────────────────────────

export const attending = (status?: RsvpStatus | null) => status === "yes" || status === "maybe";

/** True when this guest is coming to an event aboard an installation. */
export function attendingBaseEvent(data: Pick<InviteData, "events">, answersValue: GuestAnswers): boolean {
  return data.events.some((event) => event.onBase && attending(answersValue[event.id]?.status));
}

/** The meal event, when meal choices are on and that event still exists. */
export function mealEvent(data: InviteData): InviteEvent | null {
  if (!data.rsvp.meals.enabled) return null;
  return data.events.find((event) => event.id === data.rsvp.meals.eventId) ?? null;
}

export function mealOptions(data: InviteData): string[] {
  return data.rsvp.meals.options.map((option) => option.trim()).filter(Boolean);
}

const STATUS_WORDS: Record<RsvpStatus, string> = { yes: "Yes", maybe: "Maybe", no: "No" };

export function partyLine(answer: EventAnswer | undefined): string {
  if (!answer) return "No answer";
  if (answer.status === "no") return "Not attending";
  const people = [`${answer.adults} adult${answer.adults === 1 ? "" : "s"}`, answer.children ? `${answer.children} child${answer.children === 1 ? "" : "ren"}` : ""].filter(Boolean).join(", ");
  return `${STATUS_WORDS[answer.status]}, ${people}`;
}

/**
 * The plain-text summary a guest can email to themselves. MilVector sends no
 * email: this opens the guest's own mail app with everything filled in.
 */
export function confirmationText(args: {
  data: InviteData;
  name: string;
  answers: GuestAnswers;
  addresses: Record<string, string>;
  dodId: string;
  pageUrl: string;
  personalUrl: string;
}): { subject: string; body: string } {
  const { data } = args;
  const who = [data.retiree.rank, data.retiree.name].filter(Boolean).join(" ");
  const lines = sortEvents(data.events.filter(eventIsComplete)).map((event) => {
    const answer = args.answers[event.id];
    const where = args.addresses[event.id] ? `${event.place ? `${event.place}, ` : ""}${args.addresses[event.id]}` : [event.place, event.addressPrivate ? event.area : event.address].filter(Boolean).join(", ");
    return [`${event.name}: ${partyLine(answer)}`, `${formatDateLong(event.date)}, ${formatTimeRange(event, data.timeFormat)}`, where].filter(Boolean).join("\n");
  });
  const pass =
    args.dodId === "no" && attendingBaseEvent(data, args.answers)
      ? `\n\nVISITOR PASS\n${passSteps(data).join("\n")}`
      : "";
  return {
    subject: `My RSVP: ${who}'s retirement`,
    body: [
      `My RSVP for ${who}'s retirement.`,
      lines.join("\n\n"),
      pass.trim(),
      `The invitation: ${args.pageUrl}`,
      `To change my answer: ${args.personalUrl}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

/** The steps a guest who needs a visitor pass follows, in plain words. */
export function passSteps(data: InviteData): string[] {
  const deadline = data.base.passDeadline ? ` by ${formatDateLong(data.base.passDeadline)}` : "";
  const host = data.retiree.name.split(" ")[0] || "The host";
  return [
    `1. RSVP${deadline}, listing everyone who needs a pass by their full legal name, as it appears on their ID.`,
    `2. ${host} sends the names to the base.`,
    "3. Watch your email. The base may send you a form to fill in. Do it the day it arrives.",
    `4. ${data.base.pickup || "Collect your pass as the host directs before you head to the gate."}`,
  ];
}

export const NO_SSN_NOTE =
  "MilVector never asks for a Social Security number or date of birth. If the base needs them, it will contact you directly.";
