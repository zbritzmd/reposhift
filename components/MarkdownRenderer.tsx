"use client";

import { type ReactElement } from "react";

/**
 * Lightweight markdown renderer for generated content.
 * Handles: headers, code blocks, lists, bold, inline code, horizontal rules.
 * No external dependencies.
 */

interface MarkdownRendererProps {
  content: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): string {
  let result = escapeHtml(text);
  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong class="text-text-primary font-semibold">$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong class="text-text-primary font-semibold">$1</strong>');
  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-surface-overlay text-accent text-[0.8em] font-mono">$1</code>');
  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">$1</a>'
  );
  return result;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const lines = content.split("\n");
  const elements: ReactElement[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <div key={key++} className="my-3 rounded-lg border border-border overflow-hidden">
          {lang && (
            <div className="px-3 py-1.5 bg-surface-overlay border-b border-border text-[10px] uppercase tracking-wider text-text-muted font-mono">
              {lang}
            </div>
          )}
          <pre className="p-4 bg-surface overflow-x-auto text-[0.8rem] leading-relaxed text-text-secondary font-mono">
            {escapeHtml(codeLines.join("\n"))}
          </pre>
        </div>
      );
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      elements.push(<hr key={key++} className="my-4 border-border" />);
      i++;
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      const sizes: Record<number, string> = {
        1: "text-xl font-bold text-text-primary mt-6 mb-3",
        2: "text-lg font-semibold text-text-primary mt-5 mb-2",
        3: "text-base font-semibold text-text-primary mt-4 mb-2",
        4: "text-sm font-semibold text-text-primary mt-3 mb-1",
        5: "text-sm font-medium text-text-secondary mt-2 mb-1",
        6: "text-xs font-medium text-text-secondary mt-2 mb-1",
      };
      elements.push(
        <Tag
          key={key++}
          className={sizes[level] || sizes[4]}
          dangerouslySetInnerHTML={{ __html: renderInline(text) }}
        />
      );
      i++;
      continue;
    }

    // Unordered list items
    if (/^\s*[-*+]\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*[-*+]\s/, ""));
        i++;
      }
      elements.push(
        <ul key={key++} className="my-2 ml-4 space-y-1">
          {listItems.map((item, idx) => (
            <li
              key={idx}
              className="text-sm text-text-secondary leading-relaxed list-disc"
              dangerouslySetInnerHTML={{ __html: renderInline(item) }}
            />
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list items
    if (/^\s*\d+[.)]\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*\d+[.)]\s/, ""));
        i++;
      }
      elements.push(
        <ol key={key++} className="my-2 ml-4 space-y-1">
          {listItems.map((item, idx) => (
            <li
              key={idx}
              className="text-sm text-text-secondary leading-relaxed list-decimal"
              dangerouslySetInnerHTML={{ __html: renderInline(item) }}
            />
          ))}
        </ol>
      );
      continue;
    }

    // Checkbox list items (- [ ] or - [x])
    if (/^\s*[-*]\s\[[ x]\]/.test(line)) {
      const checkItems: { checked: boolean; text: string }[] = [];
      while (i < lines.length && /^\s*[-*]\s\[[ x]\]/.test(lines[i])) {
        const checked = /\[x\]/i.test(lines[i]);
        const text = lines[i].replace(/^\s*[-*]\s\[[ x]\]\s*/, "");
        checkItems.push({ checked, text });
        i++;
      }
      elements.push(
        <ul key={key++} className="my-2 ml-2 space-y-1">
          {checkItems.map((item, idx) => (
            <li key={idx} className="text-sm text-text-secondary leading-relaxed flex items-start gap-2">
              <span className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] ${item.checked ? "bg-success/20 border-success/40 text-success" : "border-border"}`}>
                {item.checked ? "✓" : ""}
              </span>
              <span dangerouslySetInnerHTML={{ __html: renderInline(item.text) }} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p
        key={key++}
        className="text-sm text-text-secondary leading-relaxed my-1.5"
        dangerouslySetInnerHTML={{ __html: renderInline(line) }}
      />
    );
    i++;
  }

  return <div className="markdown-content">{elements}</div>;
}
