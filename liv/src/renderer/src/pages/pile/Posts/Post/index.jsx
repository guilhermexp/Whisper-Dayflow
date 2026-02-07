import { useEffect, useState, useCallback, useRef, memo, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import styles from './Post.module.scss';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { DateTime } from 'luxon';
import { postFormat } from 'renderer/utils/fileOperations';
import Editor from '../../Editor';
import * as fileOperations from 'renderer/utils/fileOperations';
import { usePilesContext } from 'renderer/context/PilesContext';
import usePost from 'renderer/hooks/usePost';
import { AnimatePresence, motion } from 'framer-motion';
import Reply from './Reply';
import {
  AIIcon,
  EditIcon,
  NeedleIcon,
  PaperIcon,
  ReflectIcon,
} from 'renderer/icons';
import { useTimelineContext } from 'renderer/context/TimelineContext';
import Ball from './Ball';
import { useHighlightsContext } from 'renderer/context/HighlightsContext';
import { useAIContext } from 'renderer/context/AIContext';
import { useTranslation } from 'react-i18next';

const COMMAND_OR_TAG_REGEX =
  /(`[^`]+`)|(\/[a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)|(@[a-z0-9_.-]+)|(\b[a-z0-9_.-]+\.(?:ts|tsx|js|jsx|json|py|md)\b)/gi;

const splitParagraphs = (raw = '') =>
  String(raw)
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

const hasTimeRange = (line = '') =>
  /\b\d{1,2}:\d{2}\s?(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s?(?:AM|PM)\b/i.test(line);

const parseAutoJournalContent = (content = '') => {
  const paragraphs = splitParagraphs(content);
  if (paragraphs.length === 0) return null;

  const overall = paragraphs[0];
  const activities = [];
  let index = 1;

  while (index < paragraphs.length) {
    const title = paragraphs[index] || '';
    const maybeTime = paragraphs[index + 1] || '';
    const maybeSummary = paragraphs[index + 2] || '';

    if (title && hasTimeRange(maybeTime) && maybeSummary) {
      activities.push({
        title,
        timeRange: maybeTime,
        summary: maybeSummary,
      });
      index += 3;
      continue;
    }

    // Fallback for malformed/partial blocks
    activities.push({
      title: title || 'Activity',
      timeRange: hasTimeRange(maybeTime) ? maybeTime : '',
      summary: hasTimeRange(maybeTime)
        ? maybeSummary || ''
        : [maybeTime, maybeSummary].filter(Boolean).join(' '),
    });
    index += 3;
  }

  return { overall, activities };
};

const renderRichText = (text = '') => {
  const content = String(text || '');
  if (!content) return null;

  const nodes = [];
  let last = 0;
  let match;

  while ((match = COMMAND_OR_TAG_REGEX.exec(content)) !== null) {
    const start = match.index;
    const end = COMMAND_OR_TAG_REGEX.lastIndex;

    if (start > last) {
      nodes.push(
        <span key={`text-${start}`}>{content.slice(last, start)}</span>
      );
    }

    const token = match[0].replaceAll('`', '');
    nodes.push(
      <span key={`chip-${start}`} className={styles.inlineChip}>
        {token}
      </span>
    );

    last = end;
  }

  if (last < content.length) {
    nodes.push(<span key={`tail-${last}`}>{content.slice(last)}</span>);
  }

  return nodes.length > 0 ? nodes : content;
};

const Post = memo(({ postPath, searchTerm = null, repliesCount = 0 }) => {
  const { t, i18n } = useTranslation();
  const { currentPile, getCurrentPilePath } = usePilesContext();
  const { highlights } = useHighlightsContext();
  const { validKey } = useAIContext();
  // const { setClosestDate } = useTimelineContext();
  const { post, cycleColor, refreshPost, setHighlight } = usePost(postPath);
  const [hovering, setHover] = useState(false);
  const [replying, setReplying] = useState(false);
  const [isAIResplying, setIsAiReplying] = useState(false);
  const [editable, setEditable] = useState(false);
  const [aiApiKeyValid, setAiApiKeyValid] = useState(false);

  // Check if the AI API key is valid
  useEffect(() => {
    const checkApiKeyValid = async () => {
      const valid = await validKey();
      setAiApiKeyValid(valid);
    };
    checkApiKeyValid();
  }, [validKey]);

  const closeReply = () => {
    setReplying(false);
    setIsAiReplying(false);
  };

  const toggleReplying = () => {
    if (replying) {
      // reset AI reply
      setIsAiReplying(false);
    }

    setReplying(!replying);
  };

  const toggleEditable = () => setEditable(!editable);
  const handleRootMouseEnter = () => setHover(true);
  const handleRootMouseLeave = () => setHover(false);
  const containerRef = useRef();

  if (!post) return;

  const created = DateTime.fromISO(post.data.createdAt);
  const replies = post?.data?.replies || [];
  const hasReplies = replies.length > 0;
  const isAI = post?.data?.isAI || false;
  const isReply = post?.data?.isReply || false;
  const isAutoJournalPost =
    Array.isArray(post?.data?.tags) &&
    post.data.tags.includes('auto-journal') &&
    isAI;
  const structuredAutoJournal = useMemo(
    () =>
      isAutoJournalPost && !editable
        ? parseAutoJournalContent(post?.content || '')
        : null,
    [isAutoJournalPost, editable, post?.content]
  );
  const highlightColor = post?.data?.highlight
    ? highlights.get(post.data.highlight).color
    : 'var(--border)';

  const renderReplies = () => {
    return replies.map((reply, i) => {
      const isFirst = i === 0;
      const isLast = i === replies.length - 1;
      const path = getCurrentPilePath(reply);

      return (
        <Reply
          key={reply}
          postPath={reply}
          isLast={isLast}
          isFirst={isFirst}
          replying={replying}
          highlightColor={highlightColor}
          parentPostPath={postPath}
          reloadParentPost={refreshPost}
          searchTerm={searchTerm}
        />
      );
    });
  };

  // Replies are handled at the sub-component level
  if (isReply) return;

  return (
    <div
      ref={containerRef}
      className={`${styles.root} ${
        (replying || isAIResplying) && styles.focused
      }`}
      tabIndex="0"
      onMouseEnter={handleRootMouseEnter}
      onMouseLeave={handleRootMouseLeave}
      onFocus={handleRootMouseEnter}
      onBlur={handleRootMouseLeave}
    >
      <div className={styles.post}>
        <div className={styles.left}>
          {post.data.isReply && <div className={styles.connector}></div>}
          <Ball
            isAI={isAI}
            highlightColor={highlightColor}
            cycleColor={cycleColor}
            setHighlight={setHighlight}
          />
          <div
            className={`${styles.line} ${
              (post.data.replies.length > 0 || replying) && styles.show
            }`}
            style={{
              borderColor: highlightColor,
            }}
          ></div>
        </div>
        <div className={styles.right}>
          <div className={styles.header}>
            <div className={styles.title}>{post.name}</div>
            <div className={styles.meta}>
              <button className={styles.time} onClick={toggleEditable}>
                {created.toRelative({ locale: i18n.language })}
              </button>
            </div>
          </div>
          <div className={styles.editor}>
            {structuredAutoJournal ? (
              <div className={styles.autoJournalView}>
                {structuredAutoJournal.overall && (
                  <p className={styles.autoOverall}>
                    {renderRichText(structuredAutoJournal.overall)}
                  </p>
                )}

                {structuredAutoJournal.activities.length > 0 && (
                  <div className={styles.autoCards}>
                    {structuredAutoJournal.activities.map((activity, idx) => (
                      <article key={`${activity.title}-${idx}`} className={styles.autoCard}>
                        <div className={styles.autoCardHeader}>
                          <div className={styles.autoTitleWrap}>
                            <span className={styles.autoDot} />
                            <h4 className={styles.autoCardTitle}>{activity.title}</h4>
                          </div>
                          {activity.timeRange && (
                            <span className={styles.timeChip}>
                              {activity.timeRange}
                            </span>
                          )}
                        </div>
                        {activity.summary && (
                          <p className={styles.autoCardSummary}>
                            {renderRichText(activity.summary)}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Editor
                postPath={postPath}
                editable={editable}
                setEditable={setEditable}
                searchTerm={searchTerm}
              />
            )}
          </div>
        </div>
      </div>

      {renderReplies()}

      <div className={styles.actionsHolder}>
        <AnimatePresence>
          {(replying || hovering) && !isReply && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className={styles.actions}>
                <button className={styles.openReply} onClick={toggleReplying}>
                  <NeedleIcon className={styles.icon} />
                  {t('pile.addAnotherEntry')}
                </button>
                <div className={styles.sep}>/</div>
                <button
                  className={styles.openReply}
                  disabled={!aiApiKeyValid}
                  onClick={() => {
                    setIsAiReplying(true);
                    toggleReplying();
                  }}
                >
                  <ReflectIcon className={styles.icon2} />
                  {t('pile.reflect')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {replying && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ delay: 0.09 }}
          >
            <div className={`${styles.post} ${styles.reply}`}>
              <div className={styles.left}>
                <div
                  className={`${styles.connector} ${
                    (post.data.replies.length > 0 || replying) && styles.show
                  }`}
                  style={{
                    backgroundColor: highlightColor,
                  }}
                ></div>
                <div
                  className={`${styles.ball} ${isAIResplying && styles.ai}`}
                  style={{
                    backgroundColor: highlightColor,
                  }}
                >
                  {isAIResplying && (
                    <AIIcon className={`${styles.iconAI} ${styles.replying}`} />
                  )}
                </div>
              </div>
              <div className={styles.right}>
                <div className={styles.editor}>
                  <Editor
                    parentPostPath={postPath}
                    reloadParentPost={refreshPost}
                    setEditable={setEditable}
                    editable
                    isReply
                    closeReply={closeReply}
                    isAI={isAIResplying}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default Post;
