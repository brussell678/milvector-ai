import { type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function ActionBar({ children }: Props) {
  return <div className="tool-action-bar">{children}</div>;
}
