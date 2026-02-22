import {
  generateMarkdown,
  createDirectory,
  saveFile,
  deleteFile,
  getFilePathForNewPost,
  getDirectoryPath,
} from '../utils/fileOperations';
import { tipcClient } from 'renderer/lib/tipc-client';

export const getPost = async (postPath) => {
  try {
    if (!postPath) return;
    const fileContent = await tipcClient.readTextFile({ filePath: postPath });
    const parsed = await tipcClient.matterParse({ file: fileContent });
    const post = { content: parsed.content, data: parsed.data };
    return post;
  } catch (error) {
    // TODO: check and cleanup after these files
  }
};

export const attachToPostCreator =
  (setPost, getCurrentPilePath) => async (imageData, fileExtension) => {
    const storePath = getCurrentPilePath();

    let newAttachments = [];
    if (imageData) {
      // save image data to a file
      const newFilePath = await tipcClient.saveAttachmentFile({
        fileData: imageData,
        fileExtension: fileExtension,
        storePath: storePath,
      });

      if (newFilePath) {
        newAttachments.push(newFilePath);
      } else {
        console.error('Failed to save the pasted image.');
      }
    } else {
      newAttachments = await tipcClient.openAttachmentFiles({
        storePath: storePath,
      });
    }
    // Attachments are stored relative to the base path from the
    // base directory of the pile
    const correctedPaths = newAttachments.map((path) => {
      const pathArr = path.split(/[/\\]/).slice(-4);
      const newPath = window.electron.joinPath(...pathArr);

      return newPath;
    });

    setPost((post) => {
      const attachments = [...correctedPaths, ...post.data.attachments];
      const newPost = {
        ...post,
        data: { ...post.data, attachments },
      };

      return newPost;
    });
  };

export const detachFromPostCreator =
  (setPost, getCurrentPilePath) => (attachmentPath) => {
    setPost((post) => {
      let newPost = JSON.parse(JSON.stringify(post));
      const newAtt = newPost.data.attachments.filter(
        (a) => a !== attachmentPath
      );

      newPost.data.attachments = newAtt;

      const fullPath = window.electron.joinPath(
        getCurrentPilePath(),
        attachmentPath
      );

      tipcClient.deleteFilePath({ filePath: fullPath }).catch((err) => {
        console.error('There was an error:', err);
      });

      console.log('Attachment removed', attachmentPath);

      return newPost;
    });
  };

export const tagActionsCreator = (setPost, action) => {
  return (tag) => {
    setPost((post) => {
      if (action === 'add' && !post.data.tags.includes(tag)) {
        return {
          ...post,
          data: {
            ...post.data,
            tags: [...post.data.tags, tag],
          },
        };
      }
      if (action === 'remove' && post.data.tags.includes(tag)) {
        return {
          ...post,
          data: {
            ...post.data,
            tags: post.data.tags.filter((t) => t !== tag),
          },
        };
      }
      return post;
    });
  };
};

export const setHighlightCreator = (post, setPost, savePost) => {
  return (highlight) => {
    setPost((post) => ({
      ...post,
      data: { ...post.data, highlight: highlight },
    }));
    savePost({ highlight: highlight });
  };
};

export const cycleColorCreator = (post, setPost, savePost, highlightColors) => {
  return () => {
    if (!post.data.highlightColor) {
      const newColor = highlightColors[1];
      setPost((post) => ({
        ...post,
        data: { ...post.data, highlightColor: newColor },
      }));
      savePost({ highlightColor: newColor });
      return;
    }
    const currentColor = post.data.highlightColor;
    const currentIndex = highlightColors.findIndex(
      (color) => color === currentColor
    );
    const nextIndex = (currentIndex + 1) % highlightColors.length;
    const nextColor = highlightColors[nextIndex];

    setPost((post) => ({
      ...post,
      data: { ...post.data, highlightColor: nextColor },
    }));
    savePost({ highlightColor: nextColor });
  };
};
