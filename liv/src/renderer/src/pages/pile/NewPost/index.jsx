import styles from './NewPost.module.scss';
import { memo } from 'react';
import Editor from '../Editor';

const NewPost = memo(() => {
  return (
    <div className={styles.post}>
      {/* <div className={styles.now}>at this moment</div> */}
      <div className={styles.editor}>
        <Editor editable />
      </div>
    </div>
  );
});

export default NewPost;
