import React, {
  useCallback,
  useEffect,
  useRef,
  memo,
} from 'react';
import { Virtuoso } from 'react-virtuoso';
import OverlayScrollbar from '../../../components/ui/overlay-scrollbar';
import styles from './Scrollbar/Scrollbar.module.scss';
import Intro from './Intro';
import Message from './Message';

const VirtualList = memo(({ data }) => {
  const virtualListRef = useRef();

  useEffect(() => {
    scrollToBottom();
  }, [virtualListRef, data]);

  const scrollToBottom = (align = 'end') => {
    virtualListRef?.current?.scrollToIndex({
      index: data.length - 1,
      align,
    });
  };

  const renderItem = useCallback(
    (index, message) => (
      <Message
        index={index}
        message={message}
        scrollToBottom={scrollToBottom}
      />
    ),
    [data]
  );

  const getKey = useCallback((index) => `${index}-item`, [data]);

  return (
    <Virtuoso
      ref={virtualListRef}
      data={data}
      itemContent={renderItem}
      computeItemKey={getKey}
      overscan={500}
      initialTopMostItemIndex={data.length - 1}
      followOutput={'smooth'}
      components={{
        Header: Intro,
        Footer: () => (
          <div
            style={{
              paddingTop: '140px',
            }}
          ></div>
        ),
        Scroller: React.forwardRef((props, ref) => (
          <OverlayScrollbar ref={ref} {...props} className={styles.scrollbar} />
        )),
      }}
    />
  );
});

export default VirtualList;
