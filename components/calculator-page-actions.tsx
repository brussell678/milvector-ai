"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

// Bottom of the public calculator page. A visitor is offered an account; a
// member who is already signed in gets the way back into the workspace, not a
// sign-up button. The page stays static: the session is read in the browser,
// and these buttons sit far below the first screen, so the swap is not seen.
export function CalculatorPageActions() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    try {
      supabaseBrowser()
        .auth.getSession()
        .then(({ data }) => {
          if (active) setSignedIn(!!data.session);
        })
        .catch(() => {});
    } catch {
      // No Supabase settings in this environment: show the visitor buttons.
    }
    return () => {
      active = false;
    };
  }, []);

  if (signedIn) {
    return (
      <>
        <Link href="/app" className="btn btn-primary">
          Go to your workspace
        </Link>
        <Link href="/app/tools" className="btn btn-secondary">
          Open your tools
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/auth?mode=signup&next=%2Fapp" className="btn btn-primary">
        Create your free account
      </Link>
      <Link href="/tools" className="btn btn-secondary">
        See every MilVector tool
      </Link>
    </>
  );
}
