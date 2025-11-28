import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Highlight } from "@tiptap/extension-highlight"
import { Typography } from "@tiptap/extension-typography"
import { Link } from "@tiptap/extension-link"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { Underline } from "@tiptap/extension-underline"
import { common, createLowlight } from "lowlight"
import { useEffect, memo } from "react"

// Register additional languages
import javascript from "highlight.js/lib/languages/javascript"
import typescript from "highlight.js/lib/languages/typescript"
import python from "highlight.js/lib/languages/python"
import css from "highlight.js/lib/languages/css"
import json from "highlight.js/lib/languages/json"
import bash from "highlight.js/lib/languages/bash"
import sql from "highlight.js/lib/languages/sql"
import xml from "highlight.js/lib/languages/xml"
import markdown from "highlight.js/lib/languages/markdown"
import yaml from "highlight.js/lib/languages/yaml"

const lowlight = createLowlight(common)

// Register extra languages
lowlight.register("javascript", javascript)
lowlight.register("js", javascript)
lowlight.register("typescript", typescript)
lowlight.register("ts", typescript)
lowlight.register("python", python)
lowlight.register("py", python)
lowlight.register("css", css)
lowlight.register("json", json)
lowlight.register("bash", bash)
lowlight.register("sh", bash)
lowlight.register("shell", bash)
lowlight.register("sql", sql)
lowlight.register("xml", xml)
lowlight.register("html", xml)
lowlight.register("markdown", markdown)
lowlight.register("md", markdown)
lowlight.register("yaml", yaml)
lowlight.register("yml", yaml)

const TipTapRenderer = memo(({ content, className }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: {
          levels: [1, 2, 3, 4],
        },
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Typography,
      Underline,
      Link.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: "plaintext",
      }),
    ],
    content: convertMarkdownToHtml(content),
    editable: false,
    editorProps: {
      attributes: {
        class: className || "",
      },
    },
  })

  useEffect(() => {
    if (editor && content) {
      const html = convertMarkdownToHtml(content)
      editor.commands.setContent(html)
    }
  }, [content, editor])

  return <EditorContent editor={editor} />
})

function convertMarkdownToHtml(markdown) {
  if (!markdown) return ""

  let html = markdown

  // Code blocks with language (```lang ... ```)
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const language = lang || "plaintext"
    return `<pre><code class="language-${language}">${escapeHtml(code.trim())}</code></pre>`
  })

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>")

  // Task lists (must be before regular lists)
  html = html.replace(/^- \[x\] (.+)$/gm, '<li class="task-done">✓ $1</li>')
  html = html.replace(/^- \[ \] (.+)$/gm, '<li class="task-pending">○ $1</li>')

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>")

  // Underline
  html = html.replace(/__(.+?)__/g, "<u>$1</u>")

  // Highlight/Mark
  html = html.replace(/==(.+?)==/g, "<mark>$1</mark>")

  // Headers
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>")
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>")
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>")
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>")

  // Blockquotes (handle multiple lines)
  html = html.replace(/^> (.+)$/gm, "<blockquote><p>$1</p></blockquote>")

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  )

  // Tables (GFM)
  html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
    const cells = content.split("|").map(cell => cell.trim())
    const cellsHtml = cells.map(cell => `<td>${cell}</td>`).join("")
    return `<tr>${cellsHtml}</tr>`
  })
  // Wrap consecutive table rows
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, (match) => {
    // Check if first row is header (has --- pattern)
    const rows = match.trim().split("\n").filter(r => r.trim())
    if (rows.length > 1 && rows[1].includes("---")) {
      const headerRow = rows[0].replace(/<td>/g, "<th>").replace(/<\/td>/g, "</th>")
      const bodyRows = rows.slice(2).join("\n")
      return `<table><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>`
    }
    return `<table><tbody>${match}</tbody></table>`
  })
  // Remove separator rows
  html = html.replace(/<tr><td>-+<\/td>(<td>-+<\/td>)*<\/tr>/g, "")

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>")
  html = html.replace(/^\*\*\*$/gm, "<hr>")

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>")
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => {
    return `<ul>${match}</ul>`
  })

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>")

  // Paragraphs (lines that aren't already wrapped)
  html = html
    .split("\n\n")
    .map((block) => {
      if (
        block.startsWith("<") ||
        block.trim() === ""
      ) {
        return block
      }
      return `<p>${block}</p>`
    })
    .join("")

  // Clean up line breaks within paragraphs
  html = html.replace(/\n/g, "<br>")

  // Clean up double br tags
  html = html.replace(/<br><br>/g, "</p><p>")

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, "")
  html = html.replace(/<p><br><\/p>/g, "")

  return html
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

export default TipTapRenderer
