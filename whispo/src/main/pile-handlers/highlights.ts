import { ipcMain } from 'electron';
import pileHighlights from '../pile-utils/pileHighlights';

ipcMain.handle('highlights-load', (_event, pilePath) => {
  const highlights = pileHighlights.load(pilePath);
  return highlights;
});

ipcMain.handle('highlights-get', (_event) => {
  const highlights = pileHighlights.get();
  return highlights;
});

ipcMain.handle('highlights-create', (_event, highlight) => {
  pileHighlights.create(highlight);
});

ipcMain.handle('highlights-delete', (_event, highlight) => {
  pileHighlights.delete(highlight);
});
