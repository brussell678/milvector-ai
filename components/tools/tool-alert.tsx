import { type ReactNode } from "react";

type Variant = "info" | "warn" | "error" | "stop";

type Props = {
  variant?: Variant;
  title?: string;
  children: ReactNode;
};

export function ToolAlert({ variant = "info", title, children }: Props) {
  return (
    <div className="tool-alert" data-variant={variant} role="alert">
      {title && <p className="tool-alert-title">{title}</p>}
      <div>{children}</div>
    </div>
  );
}
