import { ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <PageContainer as="div" className="py-4 sm:py-5 lg:py-6" size="lg">
      {children}
    </PageContainer>
  );
}

