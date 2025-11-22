# Design: Auto-Journal

## Overview

Auto-journal simples que periodicamente compila transcrições recentes e gera entradas automáticas no journal/dashboard sobre o que o usuário está fazendo.

## Architecture

```
Main Process
     │
     ├─► AutoJournalService (novo)
     │        │
     │        ├─► Timer (intervalo configurável)
     │        ├─► historyStore.readAll() → transcrições
     │        ├─► LLM (enhancement provider) → análise
     │        └─► Pile handlers → criar post
     │
     └─► Config: autoJournalEnabled, autoJournalWindowMinutes
```

## Components

### 1. AutoJournalService

Localização: `src/main/services/auto-journal-service.ts`

Responsabilidades:
- Gerenciar timer periódico
- Buscar transcrições recentes do historyStore
- Chamar LLM para gerar resumo
- Criar post no Pile

Interface:
```typescript
class AutoJournalService {
  private timer: NodeJS.Timeout | null
  private lastProcessedTime: number
  
  start(): void
  stop(): void
  generateSummary(windowMinutes?: number): Promise<AutoJournalSummary>
  private processWindow(): Promise<void>
  private createJournalPost(summary: AutoJournalSummary): Promise<void>
}
```

### 2. Tipos

```typescript
type AutoJournalSummary = {
  startTime: number      // timestamp início da janela
  endTime: number        // timestamp fim da janela
  title: string          // título curto
  content: string        // resumo markdown
  recordingIds: string[] // ids das transcrições usadas
}
```

### 3. Prompt LLM

Prompt simples para gerar resumo:
```
Você é um assistente que analisa transcrições de áudio para criar entradas de journal.

Baseado nas transcrições abaixo, crie um resumo do que a pessoa estava fazendo.
Use linguagem direta, em primeira pessoa, sem "eu".
Formato: título curto + resumo em 2-3 parágrafos.

Transcrições:
[lista de transcrições com timestamps]
```

## Data Flow

1. Timer dispara (a cada X minutos)
2. Busca transcrições onde `createdAt >= lastProcessedTime`
3. Se não há transcrições novas, retorna
4. Formata transcrições para o LLM
5. Chama enhancement provider (OpenAI/Groq/etc)
6. Parse da resposta em AutoJournalSummary
7. Cria arquivo markdown no Pile
8. Atualiza lastProcessedTime

## Integration Points

### historyStore
- `historyStore.readAll()` - já existe
- Filtrar por timestamp

### Enhancement Service
- Reutilizar providers de LLM já configurados
- Usar `enhancementProvider` do config

### Pile Handlers
- Criar arquivo markdown via `pileHelper.createFile()` ou similar
- Formato: `YYYY/Mon/YYYYMMDD-HHMMSS-journal.md`

## Config

Propriedades (já adicionadas em types.ts):
```typescript
autoJournalEnabled?: boolean        // default: false
autoJournalWindowMinutes?: number   // default: 60
```

## Error Handling

- Se LLM falha, logar erro e tentar novamente no próximo ciclo
- Se não há transcrições, skip silencioso
- Se Pile não está configurado, skip com warning

## Testing Strategy

- Unit test para formatação de transcrições
- Unit test para parse de resposta LLM
- Integration test para criação de arquivo Pile
