import { ipcMain } from 'electron';
import pileLinks from '../pile-utils/pileLinks';
import { getLinkPreview, getLinkContent } from '../pile-utils/linkPreview';

ipcMain.handle('links-get', (_event, pilePath, url) => {
  const data = pileLinks.get(pilePath, url);
  return data;
});

ipcMain.handle('links-set', (_event, pilePath, url, data) => {
  const status = pileLinks.set(pilePath, url, data);
  return status;
});

ipcMain.handle('get-link-preview', async (_event, url) => {
  try {
    return await getLinkPreview(url);
  } catch {
    return null;
  }
});

ipcMain.handle('get-link-content', async (_event, url) => {
  try {
    return await getLinkContent(url);
  } catch {
    return null;
  }
});
