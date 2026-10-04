"use client";

import { Fragment, type ReactNode } from "react";
import { blocksToPlainText, parseMarkdown, type Block, type Inline } from "@/lib/markdown";

/**
 * Renders a parsed markdown AST as React elements.
 *
 * There is no `dangerouslySetInnerHTML` anywhere in this file, and there cannot
 * be: the AST is a closed set of node kinds, and every text fragment goes
 * through React's own escaping. A model that emits `<img src=x onerror=…>` gets
 * those characters back as visible text.
 *
 * A link always carries `rel="noopener noreferrer"` and `target="_blank"`, so a
 * model-supplied URL cannot reach back into `window.opener`.
 */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  // `useMemo` would need the component to be memo-aware; at these sizes the
  // parse is cheaper than the render it feeds.
  const blocks = parseMarkdown(text);
  if (blocks.length === 0) return null;

  return (
    <div className={className}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "paragraph":
      return (
        <p className="mb-3 last:mb-0">
          <InlineView nodes={block.inline} />
        </p>
      );

    case "heading": {
      const Tag = block.level === 2 ? "h3" : "h4";
      return (
        <Tag
          className={`mb-2 mt-4 font-bold text-gold-light first:mt-0 ${
            block.level === 2 ? "text-base" : "text-[0.95rem]"
          }`}
        >
          <InlineView nodes={block.inline} />
        </Tag>
      );
    }

    case "bullet":
      return (
        <ul className="mb-3 space-y-1.5 ps-5 last:mb-0">
          {block.items.map((item, i) => (
            <li key={i} className="list-disc marker:text-ink-3">
              <InlineView nodes={item} />
            </li>
          ))}
        </ul>
      );

    case "ordered":
      return (
        <ol className="mb-3 list-decimal space-y-1.5 ps-5 marker:text-ink-3 last:mb-0">
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineView nodes={item} />
            </li>
          ))}
        </ol>
      );

    case "quote":
      return (
        <blockquote className="mb-3 border-s-2 border-gold/40 ps-4 italic text-gold-muted/90 last:mb-0">
          <InlineView nodes={block.inline} />
        </blockquote>
      );

    case "rule":
      return <hr className="my-4 border-gold/15" />;

    case "code":
      return (
        // `whitespace-pre-wrap` rather than `overflow-x-auto`: a horizontal
        // scroll region inside a chat bubble is a CLS and touch problem.
        <pre className="mb-3 overflow-x-hidden whitespace-pre-wrap rounded-xl border border-gold/15 bg-black/40 p-3 text-[0.8rem] leading-relaxed last:mb-0">
          <code className="font-mono text-gold-muted">{block.text}</code>
        </pre>
      );
  }
}

function InlineView({ nodes }: { nodes: Inline[] }): ReactNode {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.kind) {
          case "text":
            return <Fragment key={i}>{node.text}</Fragment>;
          case "bold":
            return (
              <strong key={i} className="font-bold text-gold-light">
                {node.text}
              </strong>
            );
          case "em":
            return (
              <em key={i} className="italic">
                {node.text}
              </em>
            );
          case "code":
            return (
              <code
                key={i}
                className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[0.85em] text-gold-light"
              >
                {node.text}
              </code>
            );
          case "link":
            return (
              <a
                key={i}
                href={node.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-gold-light underline decoration-gold/40 underline-offset-4 transition-colors hover:decoration-gold"
              >
                {node.text}
              </a>
            );
        }
      })}
    </>
  );
}

/** Plain-text form, for the clipboard and for quote cards. */
export function markdownToText(text: string): string {
  return blocksToPlainText(parseMarkdown(text));
}
