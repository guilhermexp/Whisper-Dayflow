import { ipcMain, app, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import pileHelper from '../pile-utils/pileHelper';
import matter from 'gray-matter';

const pilesConfigPath = path.join(app.getPath('home'), 'Piles', 'piles.json');

const loadAllowedRoots = () => {
  const roots = new Set<string>([path.resolve(path.dirname(pilesConfigPath))]);

  // Allow ~/Documents/Liv for default journal creation
  const homeDir = app.getPath('home');
  if (homeDir) {
    const defaultLivFolder = path.join(homeDir, 'Documents', 'Liv');
    roots.add(path.resolve(defaultLivFolder));
  }

  try {
    if (fs.existsSync(pilesConfigPath)) {
      const raw = fs.readFileSync(pilesConfigPath, 'utf-8');
      const piles = JSON.parse(raw);
      if (Array.isArray(piles)) {
        for (const pile of piles) {
          if (pile?.path) {
            roots.add(path.resolve(String(pile.path)));
          }
        }
      }
    }
  } catch (err) {
    console.warn('[pile-handlers] Failed to read piles.json for allowed roots', err);
  }
  return roots;
};

// Dynamically check allowed paths to support newly created piles
const assertAllowedPath = (targetPath: string) => {
  const resolved = path.resolve(targetPath);
  const allowedRoots = loadAllowedRoots();
  for (const root of allowedRoots) {
    if (resolved === root || resolved.startsWith(root + path.sep)) {
      return;
    }
  }
  throw new Error(`[pile-handlers] Path outside allowed roots: ${targetPath}`);
};

ipcMain.on('update-file', (_event, { path, content }) => {
  try {
    assertAllowedPath(path);
    pileHelper.updateFile(path, content);
  } catch (err) {
    console.warn('[pile-handlers] Blocked update-file for path', path, err);
  }
});

ipcMain.on('change-folder', (_event, newPath) => {
  try {
    assertAllowedPath(newPath);
    pileHelper.changeWatchFolder(newPath);
  } catch (err) {
    console.warn('[pile-handlers] Blocked change-folder for path', newPath, err);
  }
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
  try {
    assertAllowedPath(dirPath);
    const files = await pileHelper.getFilesInFolder(dirPath);
    return files;
  } catch (err) {
    console.warn('[pile-handlers] Blocked get-files for path', dirPath, err);
    return [];
  }
});

ipcMain.handle('get-file', async (_event, filePath) => {
  try {
    assertAllowedPath(filePath);
    const content = await pileHelper.getFile(filePath).catch(() => null);
    return content;
  } catch (err) {
    console.warn('[pile-handlers] Blocked get-file for path', filePath, err);
    return null;
  }
});

ipcMain.on('get-config-file-path', (_event) => {
  const userHomeDirectoryPath = app.getPath('home');
  const pilesConfig = path.join(userHomeDirectoryPath, 'Piles', 'piles.json');
  _event.returnValue = pilesConfig;
});

// Get system locale for i18n initialization (sync)
ipcMain.on('get-system-locale', (_event) => {
  _event.returnValue = app.getLocale();
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
      assertAllowedPath(storePath);
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
  try {
    assertAllowedPath(storePath);
  } catch (err) {
    console.warn('[pile-handlers] Blocked open-file for path', storePath, err);
    return attachments;
  }
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
