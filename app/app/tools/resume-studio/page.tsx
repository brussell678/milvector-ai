import { redirect } from "next/navigation";

// Resume Studio was retired when the Targeted Resume Builder took over its
// checks (docs/TARGETED_RESUME_PLAN.md, Phase 4). Old links land there.
export default function ResumeStudioPage() {
  redirect("/app/tools/resume-targeter");
}
