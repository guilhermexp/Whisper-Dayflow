import styles from './Posts.module.scss';
import { useState, useEffect, useMemo } from 'react';
import { useIndexContext } from 'renderer/context/IndexContext';
import NewPost from '../NewPost';
import VirtualList from './VirtualList';

export default function Posts() {
  const { index } = useIndexContext();
  const [data, setData] = useState([]);

  // Index is updated when an entry is added/deleted.
  // We use this to generate the data array which consists of
  // all the items that are going to be rendered on the virtual list.
  useEffect(() => {
    const onlyParentEntries = [];
    let i = 1; // Start at 1 to leave space for NewPost

    for (const [key, metadata] of index) {
      if (!metadata.isReply) {
        onlyParentEntries[i] = [key, metadata];
        i++;
      }
    }

    onlyParentEntries[0] = [
      'NewPost',
      { height: 150, hash: Date.now().toString() },
    ];

    setData(onlyParentEntries);
  }, [index]);

  const renderList = useMemo(() => {
    return <VirtualList data={data} />;
  }, [data]);

  // When there are zero entries
  if (index.size === 0) {
    return (
      <div className={styles.posts}>
        <NewPost />
      </div>
    );
  }

  return (
    <div className={styles.posts}>
      {renderList}
      <div className={styles.gradient}></div>
    </div>
  );
}
