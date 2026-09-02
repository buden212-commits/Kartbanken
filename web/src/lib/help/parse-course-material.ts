import { readFileSync } from "fs";
import path from "path";
import { Marked, type Tokens } from "marked";

export type CourseMaterialSegment =
  | { kind: "html"; html: string }
  | { kind: "diagram"; title: string; chart: string };

const MERMAID_BLOCK = /```mermaid\n([\s\S]*?)```/g;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[«»]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function stripComments(markdown: string): string {
  return markdown
    .replace(/<!--\s*(?:bild|diagram):[\w.-]+\s*-->\n?/g, "")
    .replace(/<!--\s*\/(?:bild|diagram):[\w.-]+\s*-->\n?/g, "");
}

function diagramTitleBefore(block: string): string {
  const lines = block.trimEnd().split("\n");
  const last = lines.at(-1)?.trim() ?? "";
  const match = last.match(/^\*\*(.+)\*\*$/);
  return match?.[1]?.trim() ?? "";
}

function buildMarked(): Marked {
  const marked = new Marked({ gfm: true, breaks: false });

  marked.use({
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const text = this.parser.parseInline(tokens);
        const plain = text.replace(/<[^>]*>/g, "");
        const id = slugify(plain);
        const tag = `h${depth}`;
        const size =
          depth === 1
            ? "text-2xl font-semibold text-slate-900 mt-10 mb-4 scroll-mt-24"
            : depth === 2
              ? "text-xl font-semibold text-slate-900 mt-8 mb-3 scroll-mt-24"
              : depth === 3
                ? "text-base font-semibold text-slate-900 mt-6 mb-2 scroll-mt-24"
                : "text-sm font-semibold text-slate-900 mt-4 mb-2 scroll-mt-24";
        return `<${tag} id="${id}" class="${size}">${text}</${tag}>\n`;
      },
      paragraph({ tokens }: Tokens.Paragraph) {
        const text = this.parser.parseInline(tokens);
        if (!text.trim()) return "";
        return `<p class="my-2">${text}</p>\n`;
      },
      image({ href, title, text }) {
        const alt = text.replace(/"/g, "&quot;");
        const titleAttr = title ? ` title="${title.replace(/"/g, "&quot;")}"` : "";
        const src = href?.startsWith("bilder/") ? `/kursmaterial/${href}` : href;
        return `<figure class="my-4"><img src="${src}" alt="${alt}"${titleAttr} class="max-w-full rounded-lg border border-slate-200 shadow-sm" loading="lazy" /><figcaption class="mt-1 text-xs text-slate-500">${alt}</figcaption></figure>\n`;
      },
      table(token: Tokens.Table) {
        const header = token.header
          .map((cell, i) => {
            const align = token.align[i] ? ` style="text-align:${token.align[i]}"` : "";
            return `<th class="border border-slate-200 bg-slate-50 px-2 py-1 text-left"${align}>${cell.text}</th>`;
          })
          .join("");
        const body = token.rows
          .map(
            (row) =>
              `<tr>${row
                .map((cell, i) => {
                  const align = token.align[i] ? ` style="text-align:${token.align[i]}"` : "";
                  return `<td class="border border-slate-200 px-2 py-1 align-top"${align}>${cell.text}</td>`;
                })
                .join("")}</tr>`,
          )
          .join("");
        return `<div class="my-4 overflow-x-auto"><table class="w-full border-collapse text-sm"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>\n`;
      },
      list(token: Tokens.List) {
        const tag = token.ordered ? "ol" : "ul";
        const listClass = token.ordered ? "list-decimal" : "list-disc";
        const body = token.items
          .map((item) => {
            const checkbox =
              item.task && item.checked !== undefined
                ? `<span class="mr-1">${item.checked ? "☑" : "☐"}</span>`
                : "";
            return `<li class="my-1">${checkbox}${this.parser.parse(item.tokens)}</li>`;
          })
          .join("");
        return `<${tag} class="${listClass} my-2 pl-5">${body}</${tag}>\n`;
      },
      blockquote({ tokens }: Tokens.Blockquote) {
        const body = this.parser.parseInline(tokens);
        return `<blockquote class="my-3 border-l-4 border-slate-300 bg-slate-50 px-3 py-2 text-slate-600">${body}</blockquote>\n`;
      },
      hr() {
        return `<hr class="my-8 border-slate-200" />\n`;
      },
      codespan({ text }) {
        return `<code class="rounded bg-slate-100 px-1 py-0.5 text-xs">${text}</code>`;
      },
      code({ text }) {
        return `<pre class="my-3 overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs"><code>${text.replace(/</g, "&lt;")}</code></pre>\n`;
      },
      link({ href, text }) {
        if (href?.startsWith("#")) {
          return `<a href="${href}" class="link-primary">${text}</a>`;
        }
        if (href?.startsWith("/")) {
          return `<a href="${href}" class="link-primary">${text}</a>`;
        }
        return `${text} (${href})`;
      },
      strong({ tokens }) {
        return `<strong class="font-semibold">${this.parser.parseInline(tokens)}</strong>`;
      },
      em({ tokens }) {
        return `<em class="text-slate-600">${this.parser.parseInline(tokens)}</em>`;
      },
    },
  });

  return marked;
}

function postProcessHtml(html: string): string {
  return html.replace(
    /\*\*\[BILD ([\d.]+)\]\*\*([^<]*)/g,
    (_match, id: string, rest: string) =>
      `<p class="my-3 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-amber-900"><strong>Bild ${id}</strong>${rest}</p>`,
  );
}

export function parseCourseMaterial(markdown: string): CourseMaterialSegment[] {
  const cleaned = stripComments(markdown);
  const segments: CourseMaterialSegment[] = [];
  const marked = buildMarked();

  let lastIndex = 0;
  for (const match of cleaned.matchAll(MERMAID_BLOCK)) {
    const index = match.index ?? 0;
    const before = cleaned.slice(lastIndex, index);
    if (before.trim()) {
      segments.push({ kind: "html", html: postProcessHtml(marked.parse(before) as string) });
    }

    const title = diagramTitleBefore(before);
    segments.push({ kind: "diagram", title, chart: match[1].trim() });
    lastIndex = index + match[0].length;
  }

  const tail = cleaned.slice(lastIndex);
  if (tail.trim()) {
    segments.push({ kind: "html", html: postProcessHtml(marked.parse(tail) as string) });
  }

  return segments;
}

export function loadCourseMaterialSegments(): CourseMaterialSegment[] {
  const filePath = path.join(process.cwd(), "src/lib/help/course-material.md");
  const markdown = readFileSync(filePath, "utf-8");
  return parseCourseMaterial(markdown);
}
