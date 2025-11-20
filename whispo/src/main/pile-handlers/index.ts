import { ipcMain } from 'electron';
import pileIndex from '../pile-utils/pileIndex';

ipcMain.handle('index-load', async (_event, pilePath) => {
  const index = await pileIndex.load(pilePath);
  return index;
});

ipcMain.handle('index-get', (_event) => {
  const index = pileIndex.get();
  return index;
});

ipcMain.handle('index-regenerate-embeddings', (_event) => {
  const index = pileIndex.regenerateEmbeddings();
  return index;
});

ipcMain.handle('index-add', (_event, filePath) => {
  const index = pileIndex.add(filePath);
  return index;
});

ipcMain.handle('index-update', (_event, filePath, data) => {
  const index = pileIndex.update(filePath, data);
  return index;
});

ipcMain.handle('index-search', (_event, query) => {
  const results = pileIndex.search(query);
  return results;
});

ipcMain.handle('index-vector-search', (_event, query, _topN = 50) => {
  const results = pileIndex.vectorSearch(query);
  return results;
});

ipcMain.handle('index-get-threads-as-text', (_event, filePaths = []) => {
  const results: any[] = [];

  for (const filePath of filePaths) {
    const entry = pileIndex.getThreadAsText(filePath);
    results.push(entry);
  }
  return results;
});

ipcMain.handle('index-remove', (_event, filePath) => {
  const index = pileIndex.remove(filePath);
  return index;
});
