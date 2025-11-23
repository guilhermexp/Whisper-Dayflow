import { ipcMain } from 'electron';
import { getKey, setKey, deleteKey, getOpenrouterKey, setOpenrouterKey, getOpenrouterModels, fetchOpenrouterModels } from '../pile-utils/store';

ipcMain.handle('get-ai-key', async () => {
  return getKey();
});

ipcMain.handle('set-ai-key', async (_, secretKey) => {
  return setKey(secretKey);
});

ipcMain.handle('delete-ai-key', async () => {
  return deleteKey();
});

ipcMain.handle('get-openrouter-key', async () => {
  return getOpenrouterKey();
});

ipcMain.handle('set-openrouter-key', async (_, secretKey) => {
  return setOpenrouterKey(secretKey);
});

ipcMain.handle('get-openrouter-models', async () => {
  return getOpenrouterModels();
});

ipcMain.handle('fetch-openrouter-models', async () => {
  return fetchOpenrouterModels();
});
