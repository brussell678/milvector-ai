import { z } from "zod";

export const ProfileUpsertSchema = z.object({
  branch: z.string().min(2).default("USMC"),
  mos: z.string().optional().nullable(),
  rank: z.string().optional().nullable(),
  separation_date: z.string().optional().nullable(), // ISO date
  career_interests: z.array(z.string()).optional().nullable(),
  location_pref: z.string().optional().nullable(),
});