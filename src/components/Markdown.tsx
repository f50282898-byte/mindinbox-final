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
        <p className="mb-4 leading-loose last:mb-0 text-zinc-200">
          <InlineView nodes={block.inline} />
        </p>
      );

    case "heading": {
      const Tag = block.level === 2 ? "h3" : "h4";
      return (
        <Tag
          className={`mb-3 mt-5 font-bold text-gold-light first:mt-0 tracking-tight ${
            block.level === 2 ? "text-xl" : "text-lg"
          }`}
        >
          <InlineView nodes={block.inline} />
        </Tag>
      );
    }

    case "bullet":
      return (
        <ul className="mb-4 space-y-2 ps-6 last:mb-0 list-disc marker:text-amber-400/70">
          {block.items.map((item, i) => (
            <li key={i} className="leading-loose text-zinc-200">
              <InlineView nodes={item} />
            </li>
          ))}
        </ul>
      );

    case "ordered":
      return (
        <ol className="mb-4 list-decimal space-y-2 ps-6 last:mb-0 marker:text-amber-400/70">
          {block.items.map((item, i) => (
            <li key={i} className="leading-loose text-zinc-200">
              <InlineView nodes={item} />
            </li>
          ))}
        </ol>
      );

    case "quote":
      return (
        <blockquote className="mb-4 border-r-2 border-amber-500/60 bg-amber-500/5 pr-4 py-2 rounded-l-lg last:mb-0 italic text-zinc-200/90">
          <InlineView nodes={block.inline} />
        </blockquote>
      );

    case "rule":
      return <hr className="my-4 border-gold/15" />;

    case "code":
      return (
        // `whitespace-pre-wrap` rather than `overflow-x-auto`: a horizontal
        // scroll region inside a chat bubble is a CLS and touch problem.
        <pre className="mb-3 overflow-x-hidden whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.04] p-3 text-[0.8rem] leading-relaxed last:mb-0 shadow-2xl">
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
              <strong key={i} className="font-bold text-amber-400/90">
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
                className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-100 border border-white/10"
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
