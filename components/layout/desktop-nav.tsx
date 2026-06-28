import { PrimaryNav } from "@/components/primary-nav";

export function DesktopNav() {
  return (
    <div className="site-nav-glass sticky top-0 z-50 hidden md:block">
      <PrimaryNav />
    </div>
  );
}
