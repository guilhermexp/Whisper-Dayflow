# Autonomous Agent Memory & Context Design

## Goal
Build a background agent that keeps durable memory, recovers context semantically, and continuously updates operational kanban boards.

## Applied decisions

1. **Long-term + daily memory split**
- Long-term durable facts in `recordings/auto-agent/MEMORY.md`
- Day logs in `recordings/auto-agent/memory/YYYY-MM-DD.md`

2. **Hybrid retrieval**
- SQLite FTS5 (`bm25`) for keyword and exact token retrieval
- Optional semantic ranking with embeddings (`text-embedding-3-small`)
- Weighted merge (`semantic 0.7`, `keyword 0.3`)

3. **Chunking and overlap**
- Chunk target ~= 400 tokens, overlap ~= 80 tokens
- Line-aware chunking to preserve local context

4. **Background synchronization**
- Reindex on write
- Periodic sync every 5 minutes to keep index consistent

5. **Context packaging for agents**
- Exposed context bundle with:
  - Relevant semantic memory section
  - Recent memory section
- Designed to be injected into future subagent prompts

## Why this architecture

- **Exact+semantic retrieval** avoids failures on IDs/names and improves intent recall.
- **Markdown as source-of-truth** keeps memory auditable and editable by humans.
- **Background indexing** avoids blocking UI and supports continuous operation.
- **Context bundles** decouple memory from execution, allowing future CLI/subagent orchestration.

## Main implementation files

- `src/main/services/autonomous-memory-service.ts`
- `src/main/services/autonomous-kanban-service.ts`
- `src/main/tipc.ts` (IPC endpoints)
- `src/renderer/src/pages/pile/Kanban/index.jsx` (live board)

## External references used

- OpenAI embeddings guide: https://platform.openai.com/docs/guides/embeddings
- OpenAI model card (`text-embedding-3-small`): https://platform.openai.com/docs/models/text-embedding-3-small
- SQLite FTS5 and BM25: https://www.sqlite.org/fts5.html
- LangGraph memory overview (short/long-term): https://docs.langchain.com/oss/javascript/langgraph/memory
- Anthropic long-context prompt practices: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips
- Anthropic prompt caching for repeated long prefixes: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
