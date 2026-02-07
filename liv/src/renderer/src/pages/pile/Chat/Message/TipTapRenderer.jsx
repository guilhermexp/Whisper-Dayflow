import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Highlight } from "@tiptap/extension-highlight"
import { Link } from "@tiptap/extension-link"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { common, createLowlight } from "lowlight"
import { useEffect, memo } from "react"

const lowlight = createLowlight(common)
const TIME_RANGE_REGEX =
  /\b\d{1,2}:\d{2}\s?(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s?(?:AM|PM)\b/gi
const CHIP_TOKEN_REGEX =
  /(?:\/[a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)|(?:@[a-zA-Z0-9_.-]+)|(?:\b[a-zA-Z0-9_.-]+\.(?:ts|tsx|js|jsx|json|py|md)\b)/g

const TipTapRenderer = memo(({ content, className }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
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
    content: parseMarkdown(content),
    editable: false,
    editorProps: {
      attributes: {
        class: className || "",
      },
    },
  })

  useEffect(() => {
    if (editor && content) {
      editor.commands.setContent(parseMarkdown(content))
    }
  }, [content, editor])

  return <EditorContent editor={editor} />
})

function parseMarkdown(text) {
  if (!text) return ""

  // Split into lines for processing
  const lines = text.split('\n')
  const result = []
  let inCodeBlock = false
  let codeBlockLang = ""
  let codeBlockContent = []
  let inList = false
  let listItems = []
  let listType = "ul"

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code block handling
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeBlockLang = line.slice(3).trim() || "plaintext"
        codeBlockContent = []
      } else {
        inCodeBlock = false
        result.push(`<pre><code class="language-${codeBlockLang}">${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`)
      }
      continue
    }

    if (inCodeBlock) {
      codeBlockContent.push(line)
      continue
    }

    // Close list if we hit a non-list line
    if (inList && !line.match(/^(\d+\.|[-*])\s/)) {
      result.push(`<${listType}>${listItems.join('')}</${listType}>`)
      listItems = []
      inList = false
    }

    // Empty line
    if (line.trim() === '') {
      if (inList) {
        result.push(`<${listType}>${listItems.join('')}</${listType}>`)
        listItems = []
        inList = false
      }
      continue
    }

    // Headers
    if (line.startsWith('#### ')) {
      result.push(`<h4>${formatInline(line.slice(5))}</h4>`)
      continue
    }
    if (line.startsWith('### ')) {
      result.push(`<h3>${formatInline(line.slice(4))}</h3>`)
      continue
    }
    if (line.startsWith('## ')) {
      result.push(`<h2>${formatInline(line.slice(3))}</h2>`)
      continue
    }
    if (line.startsWith('# ')) {
      result.push(`<h1>${formatInline(line.slice(2))}</h1>`)
      continue
    }

    // Horizontal rule
    if (line.match(/^(-{3,}|\*{3,})$/)) {
      result.push('<hr>')
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      result.push(`<blockquote><p>${formatInline(line.slice(2))}</p></blockquote>`)
      continue
    }

    // Unordered list
    if (line.match(/^[-*]\s/)) {
      if (!inList || listType !== 'ul') {
        if (inList) {
          result.push(`<${listType}>${listItems.join('')}</${listType}>`)
          listItems = []
        }
        inList = true
        listType = 'ul'
      }
      const content = line.replace(/^[-*]\s/, '')
      // Task list
      if (content.startsWith('[x] ')) {
        listItems.push(`<li>✓ ${formatInline(content.slice(4))}</li>`)
      } else if (content.startsWith('[ ] ')) {
        listItems.push(`<li>○ ${formatInline(content.slice(4))}</li>`)
      } else {
        listItems.push(`<li>${formatInline(content)}</li>`)
      }
      continue
    }

    // Ordered list
    if (line.match(/^\d+\.\s/)) {
      if (!inList || listType !== 'ol') {
        if (inList) {
          result.push(`<${listType}>${listItems.join('')}</${listType}>`)
          listItems = []
        }
        inList = true
        listType = 'ol'
      }
      listItems.push(`<li>${formatInline(line.replace(/^\d+\.\s/, ''))}</li>`)
      continue
    }

    // Regular paragraph
    result.push(`<p>${formatInline(line)}</p>`)
  }

  // Close any remaining list
  if (inList) {
    result.push(`<${listType}>${listItems.join('')}</${listType}>`)
  }

  return result.join('')
}

function formatInline(text) {
  let result = text

  // Inline code (must be first to avoid conflicts)
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Strikethrough
  result = result.replace(/~~(.+?)~~/g, '<s>$1</s>')

  // Highlight
  result = result.replace(/==(.+?)==/g, '<mark>$1</mark>')

  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')

  // Images
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')

  // Semantic chips (time ranges, file extensions, commands, tags)
  result = transformOutsideProtectedTags(result, (segment) =>
    segment.replace(TIME_RANGE_REGEX, (timeRange) => `<span class="timeChip">${timeRange}</span>`),
  )

  result = transformOutsideProtectedTags(result, (segment) =>
    segment.replace(CHIP_TOKEN_REGEX, (token) => createTokenChip(token)),
  )

  return result
}

function createTokenChip(token) {
  if (token.startsWith("/")) {
    return `<code class="tokenChip tokenCommand">${token}</code>`
  }

  if (token.startsWith("@")) {
    return `<code class="tokenChip tokenTag">${token}</code>`
  }

  const lower = token.toLowerCase()

  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) {
    return `<code class="tokenChip tokenFile tokenExtTs">${token}</code>`
  }

  if (lower.endsWith(".js") || lower.endsWith(".jsx")) {
    return `<code class="tokenChip tokenFile tokenExtJs">${token}</code>`
  }

  if (lower.endsWith(".py")) {
    return `<code class="tokenChip tokenFile tokenExtPy">${token}</code>`
  }

  if (lower.endsWith(".json")) {
    return `<code class="tokenChip tokenFile tokenExtJson">${token}</code>`
  }

  if (lower.endsWith(".md")) {
    return `<code class="tokenChip tokenFile tokenExtMd">${token}</code>`
  }

  return `<code class="tokenChip tokenFile">${token}</code>`
}

function transformOutsideProtectedTags(input, transformer) {
  const chunks = input.split(/(<\/?[^>]+>)/g)
  const protectedTags = new Set(["code", "a", "pre", "img"])
  const stack = []

  return chunks
    .map((chunk) => {
      if (!chunk) return chunk

      if (chunk.startsWith("<")) {
        const match = chunk.match(/^<\/?\s*([a-zA-Z0-9-]+)/)
        if (match) {
          const tagName = match[1].toLowerCase()
          const isClosingTag = chunk.startsWith("</")
          const isSelfClosing = chunk.endsWith("/>")

          if (protectedTags.has(tagName) && !isSelfClosing) {
            if (isClosingTag) {
              const index = stack.lastIndexOf(tagName)
              if (index !== -1) stack.splice(index, 1)
            } else {
              stack.push(tagName)
            }
          }
        }
        return chunk
      }

      if (stack.length > 0) return chunk
      return transformer(chunk)
    })
    .join("")
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
