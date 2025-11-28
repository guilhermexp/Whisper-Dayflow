import fs from 'fs';
import axios from 'axios';
import path from 'path';
import { walk } from '../pile-util';
import matter from 'gray-matter';
import settings from 'electron-settings';
import { getKey } from './store';

// Todo: Cache the norms alongside embeddings at some point
// to avoid recomputing them for every query
function cosineSimilarity(embedding, queryEmbedding) {
  if (embedding?.length !== queryEmbedding?.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < embedding.length; i++) {
    dotProduct += embedding[i] * queryEmbedding[i];
    normA += embedding[i] ** 2;
    normB += queryEmbedding[i] ** 2;
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    throw new Error('One of the vectors is zero, cannot compute similarity');
  }

  return dotProduct / (normA * normB);
}

class PileEmbeddings {
  constructor() {
    this.pilePath = null;
    this.fileName = `embeddings.json`;
    this.apiKey = null;
    this.embeddings = new Map();


  }

  async initialize(pilePath, index) {
    try {
      this.pilePath = pilePath;
      await this.initializeAPIKey();

      if (!this.apiKey) {
        // Silently skip embeddings initialization when no API key
        // This is expected behavior - user may not have configured AI yet
        return;
      }
      const embeddingsFilePath = path.join(pilePath, this.fileName);
      if (fs.existsSync(embeddingsFilePath)) {
        const data = fs.readFileSync(embeddingsFilePath, 'utf8');
        this.embeddings = new Map(JSON.parse(data));
        // Clean up orphaned embeddings (entries not in index)
        this.cleanupOrphanedEmbeddings(index);
      } else {
        // Embeddings need to be generated based on the index
        await this.walkAndGenerateEmbeddings(pilePath, index);
        this.saveEmbeddings();
      }
    } catch (error) {
      console.error('Failed to load embeddings:', error);
    }
    return {};
  }

  cleanupOrphanedEmbeddings(index) {
    let removedCount = 0;
    const entriesToRemove = [];

    for (const [entryPath] of this.embeddings) {
      if (!index.has(entryPath)) {
        entriesToRemove.push(entryPath);
      }
    }

    for (const entryPath of entriesToRemove) {
      this.embeddings.delete(entryPath);
      removedCount++;
    }

    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} orphaned embeddings`);
      this.saveEmbeddings();
    }
  }

  async initializeAPIKey() {
    const apiKey = await getKey();
    // Don't throw error if no API key - it's a normal situation
    // User may not have configured AI features yet
    this.apiKey = apiKey || null;
  }

  async walkAndGenerateEmbeddings(pilePath, index) {
    console.log('🧮 Generating embeddings for index:', index.size);
    this.embeddings = new Map();
    for (let [entryPath, metadata] of index) {
      this.addDocument(entryPath, metadata);
    }
  }

  saveEmbeddings() {
    try {
      const embeddingsFilePath = path.join(this.pilePath, this.fileName);
      const entries = this.embeddings.entries();
      if (!entries) return;
      let strMap = JSON.stringify(Array.from(entries));
      fs.writeFileSync(embeddingsFilePath, strMap, 'utf8');
    } catch (error) {
      console.error('Failed to save embeddings:', error);
    }
  }

  async addDocument(entryPath, metadata) {
    try {
      // we only index parent documents
      // the replies are concatenated to the contents
      if (metadata.isReply) return;

      let fullPath = path.join(this.pilePath, entryPath);
      let fileContent = fs.readFileSync(fullPath, 'utf8');
      let { content } = matter(fileContent);
      content =
        'Entry on ' + metadata.createdAt + '\n\n' + content + '\n\nReplies:\n';

      // concat the contents of replies
      for (let replyPath of metadata.replies) {
        let replyFullPath = path.join(this.pilePath, replyPath);
        let replyFileContent = fs.readFileSync(replyFullPath, 'utf8');
        let { content: replyContent } = matter(replyFileContent);
        content += '\n' + replyContent;
      }

      try {
        const embedding = await this.generateEmbedding(content);
        this.embeddings.set(entryPath, embedding);
        console.log('🧮 Embeddings created for thread: ', entryPath);
      } catch (embeddingError) {
        console.warn(
          `Failed to generate embedding for thread: ${entryPath}`,
          embeddingError
        );
        // Skip this document and continue with the next one
        return;
      }

      this.saveEmbeddings();
    } catch (error) {
      console.error('Failed to process thread for vector index.', error);
    }
  }

  // todo: based on which ai is configured this should either
  // use ollama or openai
  async generateEmbedding(document) {
    const pileAIProvider = await settings.get('pileAIProvider');
    const embeddingModel = await settings.get('embeddingModel');
    const isOllama = pileAIProvider === 'ollama';

    if (isOllama) {
      const url = 'http://127.0.0.1:11434/api/embed';
      const data = {
        model: 'mxbai-embed-large',
        input: document,
      };
      try {
        const response = await axios.post(url, data);
        const embeddings = response.data.embeddings;
        return response.data.embeddings[0];
      } catch (error) {
        console.error('Error generating embedding with Ollama:', error);
        return null;
      }
    } else {
      const url = 'https://api.openai.com/v1/embeddings';
      const headers = {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      };
      const data = {
        model: 'text-embedding-3-small',
        input: document,
      };

      try {
        const response = await axios.post(url, data, { headers });
        return response.data.data[0].embedding;
      } catch (error) {
        console.error('Error generating embedding with OpenAI:', error);
        return null;
      }
    }
  }

  async regenerateEmbeddings(index) {
    console.log('🧮 Regenerating embeddings for index:', index.size);
    this.embeddings.clear();
    for (let [entryPath, metadata] of index) {
      await this.addDocument(entryPath, metadata);
    }
    this.saveEmbeddings();
    console.log('✅ Embeddings regeneration complete');
  }

  async search(query, topN = 50) {
    const queryEmbedding = await this.generateEmbedding(query);

    if (!queryEmbedding) {
      console.error('Failed to generate query embedding.');
      return [];
    }

    let scores = [];
    this.embeddings.forEach((embedding, entryPath) => {
      let score = cosineSimilarity(embedding, queryEmbedding);
      scores.push({ entryPath, score });
    });

    scores.sort((a, b) => b.score - a.score);
    // Return full objects with entryPath and score
    const topNEntries = scores.slice(0, topN);
    return topNEntries;
  }
}

const instance = new PileEmbeddings();
export default instance;
