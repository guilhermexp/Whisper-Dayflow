import { ipcMain, app, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import pileHelper from '../pile-utils/pileHelper';
import matter from 'gray-matter';

ipcMain.on('update-file', (_event, { path, content }) => {
  pileHelper.updateFile(path, content);
});

ipcMain.on('change-folder', (_event, newPath) => {
  pileHelper.changeWatchFolder(newPath);
});

ipcMain.handle('matter-parse', async (_event, file) => {
  try {
    const post = matter(file);
    return post;
  } catch (error) {
    return null;
  }
});

ipcMain.handle('matter-stringify', async (_event, { content, data }) => {
  const stringifiedContent = matter.stringify(content, data);
  return stringifiedContent;
});

ipcMain.handle('get-files', async (_event, dirPath) => {
  const files = await pileHelper.getFilesInFolder(dirPath);
  return files;
});

ipcMain.handle('get-file', async (_event, filePath) => {
  const content = await pileHelper.getFile(filePath).catch(() => null);
  return content;
});

ipcMain.on('get-config-file-path', (_event) => {
  const userHomeDirectoryPath = app.getPath('home');
  const pilesConfig = path.join(userHomeDirectoryPath, 'Piles', 'piles.json');
  _event.returnValue = pilesConfig;
});

ipcMain.on('open-file-dialog', async (_event) => {
  const directory = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (!directory.canceled) {
    _event.sender.send('selected-directory', directory.filePaths[0]);
  }
});

ipcMain.handle(
  'save-file',
  async (_event, { fileData, fileExtension, storePath }) => {
    try {
      const currentDate = new Date();
      const year = String(currentDate.getFullYear()).slice(-2);
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const hours = String(currentDate.getHours()).padStart(2, '0');
      const minutes = String(currentDate.getMinutes()).padStart(2, '0');
      const seconds = String(currentDate.getSeconds()).padStart(2, '0');
      const milliseconds = String(currentDate.getMilliseconds()).padStart(
        3,
        '0'
      );
      const fileName = `${year}${month}${day}-${hours}${minutes}${seconds}${milliseconds}.${fileExtension}`;
      const fullStorePath = path.join(
        storePath,
        String(currentDate.getFullYear()),
        currentDate.toLocaleString('default', { month: 'short' }),
        'media'
      );
      const newFilePath = path.join(fullStorePath, fileName);

      // Convert Data URL to Buffer
      const dataUrlParts = fileData.split(';base64,');
      const fileBuffer = Buffer.from(dataUrlParts[1], 'base64');

      await fs.promises.mkdir(fullStorePath, { recursive: true });
      await fs.promises.writeFile(newFilePath, fileBuffer);
      return newFilePath;
    } catch (error) {
      console.error('Failed to save the file:', error);
      return null;
    }
  }
);

ipcMain.handle('open-file', async (_event, data) => {
  let attachments: string[] = [];
  const storePath = data.storePath;
  const selected = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'svg'] },
      { name: 'Movies', extensions: ['mp4', 'mov'] },
    ],
  });

  const selectedFiles = selected.filePaths || [];

  if (selected.canceled) {
    return attachments;
  }

  for (const [index, filePath] of selectedFiles.entries()) {
    const currentDate = new Date();
    const year = String(currentDate.getFullYear()).slice(-2);
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const hours = String(currentDate.getHours()).padStart(2, '0');
    const minutes = String(currentDate.getMinutes()).padStart(2, '0');
    const seconds = String(currentDate.getSeconds()).padStart(2, '0');
    const selectedFileName = filePath.split(/[/\\]/).pop();

    if (!selectedFileName) continue;

    const extension = selectedFileName.split('.').pop();
    const fileName = `${year}${month}${day}-${hours}${minutes}${seconds}-${index}.${extension}`;
    const fullStorePath = path.join(
      storePath,
      String(currentDate.getFullYear()),
      currentDate.toLocaleString('default', { month: 'short' }),
      'media'
    );
    const newFilePath = path.join(fullStorePath, fileName);

    try {
      await fs.promises.mkdir(fullStorePath, { recursive: true });
      await fs.promises.copyFile(filePath, newFilePath);
      attachments.push(newFilePath);
    } catch (err) {
      console.error(err);
    }
  }

  return attachments;
});
