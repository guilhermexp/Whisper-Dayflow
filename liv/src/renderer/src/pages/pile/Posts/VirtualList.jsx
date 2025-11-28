import React, { useCallback, memo, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useTimelineContext } from 'renderer/context/TimelineContext';
import NewPost from '../NewPost';
import Post from './Post';
import styles from './Scrollbar/Scrollbar.module.scss';

const PostItem = memo(({ postPath }) => {
  return (
    <div style={{ minHeight: 72, width: '100%' }}>
      <Post postPath={postPath} />
    </div>
  );
});

const MemoizedNewPost = memo(() => <NewPost />);

// Memoized Scroller component to avoid recreation on each render
const ScrollerComponent = React.forwardRef((props, ref) => (
  <div
    ref={ref}
    {...props}
    className={styles.scrollbar}
    style={{
      ...props.style,
      overflowY: 'auto',
      overflowX: 'hidden',
    }}
  />
));

const VirtualTimeline = memo(({ data }) => {
  const { virtualListRef, setVisibleIndex } = useTimelineContext();

  const handleRangeChanged = useCallback((range) => {
    setVisibleIndex(range.startIndex);
  }, [setVisibleIndex]);

  const renderItem = useCallback((index, entry) => {
    if (index === 0) {
      return <MemoizedNewPost />;
    }

    const [postPath] = entry;
    return <PostItem postPath={postPath} />;
  }, []);

  const getKey = useCallback((index, entry) => {
    if (index === 0) return 'new-post';
    const [postPath, post] = entry;
    return `${postPath}-${post?.updatedAt || ''}`;
  }, []);

  const components = useMemo(() => ({
    Scroller: ScrollerComponent,
    Footer: () => <div style={{ height: 20 }} />,
  }), []);

  return (
    <Virtuoso
      ref={virtualListRef}
      data={data}
      rangeChanged={handleRangeChanged}
      itemContent={renderItem}
      computeItemKey={getKey}
      components={components}
      overscan={10}
      defaultItemHeight={200}
      style={{ height: '100%', width: '100%' }}
      increaseViewportBy={{ top: 200, bottom: 200 }}
    />
  );
});

VirtualTimeline.displayName = 'VirtualTimeline';

export default VirtualTimeline;
