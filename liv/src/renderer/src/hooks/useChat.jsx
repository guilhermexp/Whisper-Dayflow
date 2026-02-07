import { useState, useCallback, useMemo } from 'react';
import { useAIContext } from 'renderer/context/AIContext';
import { useIndexContext } from 'renderer/context/IndexContext';

const RAG_TOP_N = 24;
const MAX_CONTEXT_ENTRIES = 12;
const MAX_ENTRY_CHARS = 1500;
const MAX_TOTAL_CONTEXT_CHARS = 12000;
const MAX_QUERY_CHARS = 2000;
const MIN_RELEVANCE_SCORE = 0.12;

const normalizeText = (value) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

const buildRetrievalQuery = (messages, message) => {
  const recentUserMessages = messages
    .filter((m) => m?.role === 'user' && typeof m?.content === 'string')
    .slice(-3)
    .map((m) => normalizeText(m.content))
    .filter(Boolean);

  const currentMessage = normalizeText(message);
  const query = [...recentUserMessages, currentMessage].join('\n');

  return query.slice(0, MAX_QUERY_CHARS);
};

const useChat = () => {
  const { generateCompletion, prompt } = useAIContext();
  const { vectorSearch, getThreadsAsText, latestThreads } = useIndexContext();
  const [relevantEntries, setRelevantEntries] = useState([]);

  const latestThreadsBlock = useMemo(
    () =>
      (latestThreads || [])
        .map((thread) => normalizeText(thread))
        .filter(Boolean)
        .slice(0, 10)
        .join('\n\n---\n\n'),
    [latestThreads]
  );

  const STARTER = useMemo(
    () => [
      {
        role: 'system',
        content:
          'You are a helpful assistant within a digital journaling app called Pile.',
      },
      {
        role: 'system',
        content:
          'The user has provided a description of your personality:' + prompt,
      },
      {
        role: 'system',
        content: `You are about to start a conversation with the user, usually involving reflection or discussion about their thoughts in this journal. For each of their messages, the system will provide a list of relevant journal entries as context to you, be aware of it when you answer and use whatever is relevant and appropriate. You are a wise librarian of my thoughts, providing advice and counsel. You try to keep responses concise and get to the point quickly. Plain-text responses only. You address the user as 'you', you don't need to know their name. You should engage with the user like you're a human. When you mention time, always do it relative to the current time– \nthe date and time at this moment is: ${new Date().toString()}.`,
      },
      {
        role: 'system',
        content: `Here are ${latestThreadsBlock ? 'the latest journal entries' : 'no recent journal entries yet'} from the user:\n\n${latestThreadsBlock || 'No recent entries available.'}`,
      },
      { role: 'system', content: 'The user starts the conversation:' },
    ],
    [prompt, latestThreadsBlock]
  );

  const [messages, setMessages] = useState(STARTER);

  const resetMessages = useCallback(() => {
    setMessages(STARTER);
    setRelevantEntries([]);
  }, [STARTER]);

  const addMessage = useCallback(
    async (message) => {
      const retrievalQuery = buildRetrievalQuery(messages, message);
      const rawSearchResults = retrievalQuery
        ? await vectorSearch(retrievalQuery, RAG_TOP_N)
        : [];

      const dedupedResults = [];
      const seenRefs = new Set();

      for (const entry of rawSearchResults || []) {
        if (!entry?.ref || seenRefs.has(entry.ref)) continue;
        seenRefs.add(entry.ref);
        dedupedResults.push(entry);
      }

      const filteredResults = dedupedResults.filter((entry) => {
        return (
          typeof entry?.score === 'number' &&
          Number.isFinite(entry.score) &&
          entry.score >= MIN_RELEVANCE_SCORE
        );
      });

      const selectedResults = filteredResults.slice(0, MAX_CONTEXT_ENTRIES);
      const entryFilePaths = selectedResults.map((entry) => entry.ref);
      const threadsAsText = await getThreadsAsText(entryFilePaths);

      // Store relevant entries for UI display (top 5 most relevant)
      setRelevantEntries(
        selectedResults.slice(0, 5).map((entry) => ({
          path: entry.ref,
          score: entry.score,
        }))
      );

      let usedChars = 0;
      const contextBlocks = [];

      for (let i = 0; i < selectedResults.length; i += 1) {
        const rawThread = normalizeText(threadsAsText?.[i]);
        if (!rawThread) continue;

        const thread = rawThread.slice(0, MAX_ENTRY_CHARS);
        const score = selectedResults[i]?.score;
        const scoreLabel =
          typeof score === 'number' ? `${Math.round(score * 100)}%` : 'n/a';
        const block = `[Entry ${i + 1} | relevance ${scoreLabel}]\n${thread}`;

        if (usedChars + block.length > MAX_TOTAL_CONTEXT_CHARS) {
          break;
        }

        contextBlocks.push(block);
        usedChars += block.length;
      }

      const contextText =
        contextBlocks.length > 0
          ? contextBlocks.join('\n\n---\n\n')
          : 'No highly relevant journal entries found for this question.';

      return [
        ...messages,
        {
          role: 'system',
          content:
            "Relevant journal context for the user's latest message (most similar first):\n\n" +
            contextText,
        },
        { role: 'user', content: message },
      ];
    },
    [messages, vectorSearch, getThreadsAsText]
  );

  const getAIResponse = useCallback(
    async (messages, callback = () => {}) => {
      setMessages(messages);
      await generateCompletion(messages, callback);
    },
    [generateCompletion]
  );

  return { addMessage, getAIResponse, resetMessages, relevantEntries };
};

export default useChat;
