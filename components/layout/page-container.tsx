import { ElementType, ReactNode } from "react";

type PageContainerSize = "md" | "lg" | "xl";

type PageContainerProps = {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  size?: PageContainerSize;
};

const sizeClass: Record<PageContainerSize, string> = {
  md: "max-w-5xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
};

export function PageContainer({
  as: Component = "main",
  children,
  className = "",
  size = "lg",
}: PageContainerProps) {
  return (
    <Component
      className={[
        "mx-auto w-full min-w-0 px-4 py-4 sm:px-6 lg:px-8",
        sizeClass[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Component>
  );
}

