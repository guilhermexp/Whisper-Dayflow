const postFormat = {
  title: '',
  content: null,
  createdAt: null,
  updatedAt: null,
  attachments: [],
  color: null,
  area: null,
  tags: [],
  replies: [],
  isReply: false,
  isAI: false,
};

const getDirectoryPath = (filePath) => {
  const isAbsolute = filePath.startsWith('/');
  const pathArr = filePath.split(/[/\\]/);
  pathArr.pop();
  let directoryPath = window.electron.joinPath(...pathArr);

  if (isAbsolute && !directoryPath.startsWith('/')) {
    directoryPath = '/' + directoryPath;
  }

  return directoryPath;
};

const getFormattedTimestamp = () => {
  const currentDate = new Date();

  const year = String(currentDate.getFullYear()).slice(-2);
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const day = String(currentDate.getDate()).padStart(2, '0');
  const hours = String(currentDate.getHours()).padStart(2, '0');
  const minutes = String(currentDate.getMinutes()).padStart(2, '0');
  const seconds = String(currentDate.getSeconds()).padStart(2, '0');

  const fileName = `${year}${month}${day}-${hours}${minutes}${seconds}.md`;

  return fileName;
};

const getFilePathForNewPost = (basePath, timestamp = new Date()) => {
  const date = new Date();
  const month = date.toLocaleString('default', { month: 'short' });
  const year = date.getFullYear().toString();
  const fileName = getFormattedTimestamp();
  const path = window.electron.joinPath(basePath, year, month, fileName);

  return path;
};

const createDirectory = (directoryPath) => {
  return tipcClient.ensureDirectory({ dirPath: directoryPath });
};

const getFiles = async (dir) => {
  const files = await tipcClient.listFilesRecursively({ dirPath: dir });

  return files;
};

const saveFile = (path, file) => {
  return tipcClient.writeTextFile({ filePath: path, content: file });
};

const deleteFile = (path) => {
  return tipcClient.deleteFilePath({ filePath: path });
};

const generateMarkdown = (content, data) => {
  return tipcClient.matterStringify({ content, data });
};

export {
  postFormat,
  createDirectory,
  saveFile,
  deleteFile,
  getFiles,
  getDirectoryPath,
  getFilePathForNewPost,
  generateMarkdown,
};
import { tipcClient } from 'renderer/lib/tipc-client';
