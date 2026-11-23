import { Fragment } from "react";
import { boldRuns, textBlocks } from "@/lib/chat/text";

// An answer as paragraphs and bullet lists, with **bold** kept. Plain React
// elements only: model text is never rendered as HTML.

function Line({ text }: { text: string }) {
  return (
    <>
      {boldRuns(text).map((run, i) => (run.bold ? <strong key={i}>{run.text}</strong> : <Fragment key={i}>{run.text}</Fragment>))}
    </>
  );
}

export function ChatText({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const blocks = textBlocks(text);
  return (
    <>
      {blocks.map((block, i) => {
        const last = i === blocks.length - 1;
        if (block.kind === "para") {
          return (
            <p key={i} className={streaming && last ? "chat-caret" : undefined}>
              <Line text={block.text} />
            </p>
          );
        }
        return (
          <ul key={i} className={streaming && last ? "chat-caret" : undefined}>
            {block.items.map((item, j) => (
              <li key={j}>
                <Line text={item} />
              </li>
            ))}
          </ul>
        );
      })}
    </>
  );
}
