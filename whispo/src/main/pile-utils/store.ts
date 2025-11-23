import settings from 'electron-settings';
import { safeStorage } from 'electron';

if (!safeStorage.isEncryptionAvailable()) {
  throw new Error('Encryption is not available on this system.');
}

export async function getKey(): Promise<string | null> {
  try {
    const encryptedKey = await settings.get('aiKey');
    if (!encryptedKey || typeof encryptedKey !== 'string') return null;
    return safeStorage.decryptString(Buffer.from(encryptedKey, 'base64'));
  } catch (error) {
    console.error('Error retrieving AI key:', error);
    return null;
  }
}

export async function setKey(secretKey: string): Promise<boolean> {
  try {
    const encryptedKey = safeStorage.encryptString(secretKey);
    await settings.set('aiKey', encryptedKey.toString('base64'));
    return true;
  } catch (error) {
    console.error('Error setting AI key:', error);
    return false;
  }
}

export async function deleteKey(): Promise<boolean> {
  try {
    await settings.unset('aiKey');
    return true;
  } catch (error) {
    console.error('Error deleting AI key:', error);
    return false;
  }
}

// OpenRouter key functions
export async function getOpenrouterKey(): Promise<string | null> {
  try {
    const encryptedKey = await settings.get('openrouterKey');
    if (!encryptedKey || typeof encryptedKey !== 'string') return null;
    return safeStorage.decryptString(Buffer.from(encryptedKey, 'base64'));
  } catch (error) {
    console.error('Error retrieving OpenRouter key:', error);
    return null;
  }
}

export async function setOpenrouterKey(secretKey: string): Promise<boolean> {
  try {
    const encryptedKey = safeStorage.encryptString(secretKey);
    await settings.set('openrouterKey', encryptedKey.toString('base64'));
    return true;
  } catch (error) {
    console.error('Error setting OpenRouter key:', error);
    return false;
  }
}

// OpenRouter models cache functions
export async function getOpenrouterModels(): Promise<string[]> {
  try {
    const models = await settings.get('openrouterModels');
    if (Array.isArray(models)) return models as string[];
    return [];
  } catch (error) {
    console.error('Error retrieving OpenRouter models:', error);
    return [];
  }
}

export async function setOpenrouterModels(models: string[]): Promise<boolean> {
  try {
    await settings.set('openrouterModels', models);
    return true;
  } catch (error) {
    console.error('Error setting OpenRouter models:', error);
    return false;
  }
}

export async function fetchOpenrouterModels(): Promise<string[]> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch OpenRouter models:', response.status);
      return [];
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      console.error('Invalid OpenRouter models response');
      return [];
    }

    const models = data.data
      .map((model: any) => model.id as string)
      .filter((id: string) => id)
      .sort();

    // Cache the models
    await setOpenrouterModels(models);

    return models;
  } catch (error) {
    console.error('Error fetching OpenRouter models:', error);
    return [];
  }
}
