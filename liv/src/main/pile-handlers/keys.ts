import { ipcMain } from 'electron';
import {
  getKey, setKey, deleteKey,
  getOpenrouterKey, setOpenrouterKey,
  getOpenrouterModels, fetchOpenrouterModels,
  getGeminiKey, setGeminiKey, deleteGeminiKey,
  getGroqKey, setGroqKey, deleteGroqKey,
  getDeepgramKey, setDeepgramKey, deleteDeepgramKey,
  getCustomKey, setCustomKey, deleteCustomKey,
} from '../pile-utils/store';

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

// Gemini key handlers
ipcMain.handle('get-gemini-key', async () => {
  return getGeminiKey();
});

ipcMain.handle('set-gemini-key', async (_, secretKey) => {
  return setGeminiKey(secretKey);
});

ipcMain.handle('delete-gemini-key', async () => {
  return deleteGeminiKey();
});

// Groq key handlers
ipcMain.handle('get-groq-key', async () => {
  return getGroqKey();
});

ipcMain.handle('set-groq-key', async (_, secretKey) => {
  return setGroqKey(secretKey);
});

ipcMain.handle('delete-groq-key', async () => {
  return deleteGroqKey();
});

// Deepgram key handlers
ipcMain.handle('get-deepgram-key', async () => {
  return getDeepgramKey();
});

ipcMain.handle('set-deepgram-key', async (_, secretKey) => {
  return setDeepgramKey(secretKey);
});

ipcMain.handle('delete-deepgram-key', async () => {
  return deleteDeepgramKey();
});

// Custom provider key handlers
ipcMain.handle('get-custom-key', async () => {
  return getCustomKey();
});

ipcMain.handle('set-custom-key', async (_, secretKey) => {
  return setCustomKey(secretKey);
});

ipcMain.handle('delete-custom-key', async () => {
  return deleteCustomKey();
});
