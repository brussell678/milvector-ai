missionnext/
  app/
    (public)/
      page.tsx
      about/page.tsx
      privacy/page.tsx
      terms/page.tsx

    (auth)/
      login/page.tsx
      signup/page.tsx

    app/
      layout.tsx
      page.tsx                 # dashboard
      onboarding/page.tsx
      tools/page.tsx
      tools/fitrep-to-bullets/page.tsx
      tools/mos-translator/page.tsx
      tools/jd-decoder/page.tsx
      tools/resume-targeter/page.tsx
      library/page.tsx

    api/
      health/route.ts
      profile/route.ts
      documents/
        upload/route.ts
        [id]/
          extract/route.ts
      tools/
        fitrep-bullets/route.ts
        mos-translator/route.ts
        jd-decoder/route.ts
        resume-targeter/route.ts

  components/
    FileUploader.tsx
    JDInput.tsx
    OutputViewer.tsx
    ToolCard.tsx
    ProgressCard.tsx

  lib/
    supabase/
      server.ts
      client.ts
    auth.ts
    storage.ts
    pdf.ts
    llm/
      client.ts
      prompts.ts
    db.ts
    validators/
      profile.ts
      documents.ts
      tools.ts

  styles/
    globals.css

  .env.local.example
  next.config.js
  package.json
  tsconfig.json