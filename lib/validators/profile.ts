import { z } from "zod";

export const ProfileUpsertSchema = z.object({
  branch: z.string().min(2).default("USMC"),
  mos: z.string().optional().nullable(),
  rank: z.string().optional().nullable(),
  separation_date: z.string().optional().nullable(), // ISO date
  career_interests: z.array(z.string()).optional().nullable(),
  location_pref: z.string().optional().nullable(),
  phone_number: z.string().optional().nullable(),
  professional_email: z.string().email().optional().nullable(),
  linkedin_url: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  security_clearance: z.string().optional().nullable(),
});
