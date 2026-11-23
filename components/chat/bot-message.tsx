import Image from "next/image";
import type { ReactNode } from "react";

// One MilVector message in a chat: the logo, then the message. The logo is
// the transparent mark the site header uses in both themes; its own glow fills
// the round frame, so it reads on light and dark.
export function BotMessage({ children }: { children: ReactNode }) {
  return (
    <div className="chat-msg-bot">
      <span className="chat-avatar" aria-hidden="true">
        <Image src="/assets/milvector-ai-logo-transparent.png" alt="" width={32} height={32} />
      </span>
      <div className="chat-msg-body">{children}</div>
    </div>
  );
}
