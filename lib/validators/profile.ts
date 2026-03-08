import { z } from "zod";

export const ProfileUpsertSchema = z.object({
  branch: z.string().min(2).default("USMC"),
  mos: z.string().optional().nullable(),
  rank: z.string().optional().nullable(),
  eas_date: z.string().optional().nullable(), // ISO date
  career_interests: z.array(z.string()).optional().nullable(),
  location_pref: z.string().optional().nullable(),
  phone_number: z.string().optional().nullable(),
  professional_email: z.string().email().optional().nullable(),
  linkedin_url: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  security_clearance: z.string().optional().nullable(),
  service_component: z.enum(["ACTIVE", "RESERVE", "NATIONAL_GUARD", "OTHER"]).optional().nullable(),
  years_service_at_eas: z.number().min(0).max(50).optional().nullable(),
  off_duty_education: z.array(z.string()).optional().nullable(),
  civilian_certifications: z.array(z.string()).optional().nullable(),
  additional_training: z.array(z.string()).optional().nullable(),
});
