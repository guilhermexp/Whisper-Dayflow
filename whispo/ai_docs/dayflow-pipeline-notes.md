# Dayflow – Pipeline de Timeline (Notas para Whispo)

**Objetivo deste documento**

Copiar e entender o pipeline de timeline do Dayflow (baseado em vídeo) para que possamos **reproduzir a mesma ideia usando áudio/transcrições no Whispo**.  
Aqui está a visão de alto nível do que o Dayflow faz e quais partes podemos reaproveitar quase 1:1.

---

## 1. Visão Geral do Pipeline do Dayflow

Referências principais no código do Dayflow:

- `Dayflow/Core/Recording/ScreenRecorder.swift` + `VideoProcessingService.swift`
- `Dayflow/Core/Analysis/AnalysisManager.swift`
- `Dayflow/Core/AI/LLMService.swift`
- `Dayflow/Core/AI/GeminiDirectProvider.swift`
- Prompt em texto: `Dayflow/formatted_prompt.txt`

### 1.1. Etapas principais

1. **Captura (vídeo)**  
   - Grava a tela em **1 FPS**, salvando pequenos chunks de vídeo (~15s).
   - Cada chunk vira um registro em banco (`RecordingChunk`) com:
     - `startTs`, `endTs` (timestamps unix)
     - caminho do arquivo de vídeo no disco.

2. **Agrupamento em batches (~15 min)** – `AnalysisManager`
   - A cada minuto (`checkInterval = 60s`), o `AnalysisManager` roda:
     - Busca chunks **não processados** das últimas 24h.
     - Agrupa em **batches** com:
       - no máx. `targetBatchDuration = 15 * 60` (15 minutos).
       - com **gap máximo de 2 minutos** entre chunks (`maxGap = 120s`).
     - Se o último batch tiver menos de 15 min, ele **é descartado** (regra especial).
   - Cada batch é salvo em tabela própria (`saveBatch`) com:
     - `startTs`, `endTs`
     - lista de `chunkIds`
     - status (`pending`, `processing`, `analyzed`, `failed`, etc.).

3. **Job de análise recorrente** – `AnalysisManager.startAnalysisJob`
   - Um `Timer` (no main thread) dispara a cada 60s:
     - `timerFired` → `triggerAnalysisNow` → `processRecordings`.
   - `processRecordings` roda numa fila `DispatchQueue` dedicada:
     - Seleciona batches `pending`.
     - Para cada batch:
       - Gera um vídeo preparado (`VideoProcessingService.prepareVideoForProcessing`) se necessário (stitch, resize).
       - Aciona o serviço de LLM (`LLMService.processBatch`).

4. **Geração de “observations” (log bruto)**
   - No pipeline original, o vídeo é convertido em uma sequência de **observações textuais** (frames/descrições).  
   - Essas observações ficam salvas em banco (tabela de `Observation`), ligadas ao `batchId` e a timestamps.
   - O LLM **não vê o vídeo diretamente** na etapa de cards; ele vê uma lista de observações textuais com timestamps.

5. **Janela deslizante de 1 hora** – `LLMService`
   - Quando o LLM vai gerar cards para um batch, ele **não usa só aquele batch**:
     - Calcula `currentTime` = `Date(batchEndTs)`.
     - Define `oneHourAgo` = `currentTime - 3600`.
     - Busca **todas as `Observations` no intervalo [oneHourAgo, currentTime]**:
       - Isso é a **janela deslizante de 1h**.
     - Busca também **cards existentes** (`TimelineCard`) que cobrem esse mesmo intervalo.

6. **Chamada ao LLM para gerar/atualizar cards** – `LLMService` + `GeminiDirectProvider`
   - `LLMService` monta um `ActivityGenerationContext` com:
     - `recentObservations`: observações da última hora.
     - `existingActivityCards`: cards de timeline já existentes, convertidos em `ActivityCardData`.
     - `categories`: lista de categorias configuradas pelo usuário (`CategoryStore.descriptorsForLLM()`).
   - Chama `provider.generateActivityCards(...)`:
     - No caso Gemini, implementação fica em `GeminiDirectProvider.generateActivityCards`.
   - O provider:
     - Converte observações em um **texto legível** para o prompt:
       - Cada linha: `[startTime - endTime]: texto da observação`.
     - Serializa os cards existentes em JSON (para contexto).
     - Monta um **prompt gigante** (ver próximo tópico) com:
       - Diretrizes de extensão de cards,
       - Regras de título, resumo, categorias,
       - Exemplo de JSON de saída.
     - Faz a chamada para Gemini (`geminiCardsRequest`).
     - Faz parsing do JSON de volta em `[ActivityCardData]`.
     - Normaliza categorias (`normalizeCards`), valida cobertura de tempo e duração mínima.
     - Se a validação falhar, re-chama com um prompt expandido explicando os erros.

7. **Persistência dos cards de timeline** – `LLMService` + `StorageManager`
   - Após receber os cards:
     - Chama `StorageManager.replaceTimelineCardsInRange(from: oneHourAgo, to: currentTime, with: cards, batchId: batchId)`.
     - Essa operação:
       - Remove cards existentes nesse intervalo.
       - Insere novos cards (`TimelineCardShell`) com:
         - `startTimestamp` (string, ex. `"1:12 AM"`),
         - `endTimestamp`,
         - `category`, `subcategory`,
         - `title`, `summary`, `detailedSummary`,
         - `distractions` (subintervalos curtos),
         - `appSites` (domínios principais/secundários).
       - Retorna IDs inseridos e caminhos de timelapses que podem ser removidos.
     - Delete dos timelapses antigos é feito logo em seguida.

8. **Timelapse por card** – `AnalysisManager` + `VideoProcessingService`
   - Em outra etapa, o Dayflow gera **timelapses por card**:
     - Para cada `TimelineCard`, busca os `RecordingChunk` dentro daquele intervalo.
     - Usa `VideoProcessingService` para gerar um MP4 resumido.
     - Atualiza o card com o caminho do timelapse.

---

## 2. Prompt principal (Gemini / “digital anthropologist”)

O prompt principal está duplicado em:

- `Dayflow/formatted_prompt.txt`
- Dentro de `GeminiDirectProvider.generateActivityCards(...)`.

Resumo das características importantes:

- **Persona:** “digital anthropologist” observando um log bruto de atividades.
- **Saída:** uma lista de **cards de timeline** (JSON), cada um com:
  - `startTime` / `endTime` (ex.: `"1:12 AM"`),
  - `category`, `subcategory`,
  - `title` (curto, direto, estilo “mensagem pra amigo”),
  - `summary` (2–3 frases máx.),
  - `detailedSummary`,
  - `distractions`: lista de interrupções curtas,
  - `appSites`: `{ primary, secondary }` com domínios/paths canônicos.
- **Regras de duração:**
  - Foco em **cards longos** (30–60+ min).
  - Evitar cards < 15–20 min, a não ser que haja mudança forte de contexto.
  - Ao estender card existente, **startTime é imutável**.
- **Regras de estilo:**
  - Títulos específicos, curtos, sem poesia.
  - Summaries em 1ª pessoa sem usar “eu” (fala direta do que foi feito).
  - Proibido: terceira pessoa, adivinhar estado mental, florear.
- **Regras de categoria:**
  - Recebe uma lista de categorias (`LLMCategoryDescriptor`) e deve escolher **exatamente uma** por card.
  - Categoria “idle” só quando a maior parte do período é ociosa.

O provider ainda implementa:

- **Validação de cobertura de tempo**: não pode “perder” intervalos.
- **Validação de duração mínima**: cards intermediários devem ter >= 10 minutos (regra de sanity).
- **Loop de retries** com:
  - Troca de modelo (ex.: `gemini-1.5-pro` → fallback).
  - Expansão do prompt com mensagens de erro detalhadas (por que a resposta anterior falhou).

---

## 3. Janela deslizante (sliding window) de 1h

Esse é o coração do “entender o que estou fazendo” ao longo do tempo.

### 3.1. Como é feito hoje

No `LLMService`:

1. Para uma análise de batch com `batchEndTs`:
   - `currentTime = Date(timeIntervalSince1970: batchEndTs)`.
   - `oneHourAgo = currentTime - 3600`.
2. Busca de dados:
   - Observações: `fetchObservationsByTimeRange(from: oneHourAgo, to: currentTime)`.
   - Cards existentes: `fetchTimelineCardsByTimeRange(from: oneHourAgo, to: currentTime)`.
3. Geração:
   - Passa **toda essa janela** para o LLM, junto com cards existentes.
   - O LLM decide se estende cards atuais ou cria novos, sempre tentando:
     - Manter cards longos/coerentes.
     - Respeitar startTimes imutáveis ao estender.
     - Agrupar por tema.
4. Persistência:
   - `replaceTimelineCardsInRange` substitui todos os cards dessa janela pela nova versão.

Na prática:

- O Dayflow **não pensa em termos de “batches isolados”**, e sim em **janelas contínuas** da sua atividade, sempre olhando 1h pra trás.
- Isso é exatamente o tipo de comportamento que queremos replicar com **áudio/transcrições** no Whispo.

---

## 4. Como reaproveitar esse pipeline para áudio no Whispo

A ideia é que o Whispo não precise reinventar o conceito, apenas trocar a fonte de “observations”.

### 4.1. O que é específico de vídeo

No Dayflow:

- Captura → `RecordingChunk` (vídeo) em 1 FPS.
- Observações → geradas a partir de frames ou trechos de vídeo.
- Timelapse por card → MP4 para visualização.

Tudo isso é específico de vídeo, mas **a camada de LLM não depende de vídeo**, e sim da lista de `Observation { startTs, endTs, observation: String }`.

### 4.2. O que podemos copiar 1:1

Para Whispo (áudio/transcrições), podemos reaproveitar:

- **Modelo mental de janela deslizante de 1h**:
  - Buscar transcrições (ou “observations de áudio”) nos últimos N minutos.
  - Passar isso para o LLM junto com cards/journal existentes.
- **Formato de `ActivityCardData` / TimelineCard**:
  - Mesmo conceito de cards com `startTime`, `endTime`, `title`, `summary`, `detailedSummary`, `category`, `distractions`.
- **Prompt de “digital anthropologist”**:
  - Mantendo quase igual, apenas trocando a explicação do que é “observation” (de frames de tela para “trechos de fala/transcrições”).
- **Validação de tempo + retries**:
  - Cobertura total da janela,
  - Cards mínimos de X minutos,
  - Fallback de modelo / prompt reforçado.

### 4.3. Adaptação mínima necessária para áudio

Quando formos implementar no Whispo:

1. **Observation = trecho de fala**  
   - Cada `RecordingHistoryItem` (ou sub-trecho) vira uma `Observation`:
     - `startTs` / `endTs` baseados nos timestamps da gravação.
     - `observation` = trecho de texto transcrito.
2. **Janela deslizante**  
   - Mesma lógica de 1h (ou outra janela configurável) para olhar o histórico.
3. **Cards → Journal**  
   - No lugar de “TimelineCard” com timelapse, podemos:
     - Criar **posts no journal** (Pile) com os dados do card.
     - Ou armazenar uma camada de cards internos e depois mapear para posts.
4. **Configuração futura**  
   - Decidir:
     - Se esse pipeline roda automaticamente a cada X minutos.
     - Se gera rascunhos de journal ou posts finalizados.
     - Como o usuário revisa/edita os cards.

---

## 5. Resumo rápido (para lembrar depois)

- Dayflow:
  - Captura vídeo em 1 FPS → chunks de 15s → batches de 15min.
  - Job roda a cada minuto, pega batches pendentes.
  - Gera observações textuais (log de atividade), salva em DB.
  - Usa **janela deslizante de 1h** de observações + cards existentes.
  - Chama Gemini com um **prompt longo de “digital anthropologist”** para gerar/estender cards.
  - Substitui cards na janela [t-1h, t] e gera timelapses por card.

- Whispo (objetivo):
  - Trocar “observations de vídeo” por “observations de áudio/transcrição”.
  - Manter a mesma ideia de **janela deslizante + cards longos que contam a história do dia**.
  - Usar esses cards como base para **entradas automáticas de journal** no Pile.

---

## 6. OCR / Captura de Tela no Whispo (gancho para implementação)

Este doc é focado no pipeline tipo Dayflow, mas o Whispo já tem um esboço de **context capture com OCR** definido em outro lugar. Para não nos perdermos:

- Spec oficial de contexto/OCR:
  - `specs/beautification-enhancement-requirements.md`
  - Lá, a seção **10.4 Context Capture** define:
    - Toggles para:
      - “Use clipboard content as context”
      - “Use selected text as context”
      - **“Use screen capture as context”**
    - Configurações de screen capture:
      - Trigger: manual ou automático no início da gravação.
      - Área: tela inteira, janela ativa, seleção.
      - Qualidade de OCR: fast / balanced / accurate.
      - Exclusões de privacidade (apps/janelas).
  - No roadmap (Phase 3: Context Capture) aparece explicitamente:
    - “Build screen capture service (OCR)”.

- Código atual que já conversa com esse spec:
  - `src/shared/types.ts` e `src/shared/types/enhancement.ts`:
    - `useClipboardContext`, `useSelectedTextContext`, `useScreenCaptureContext`.
    - `ContextCapture` com campo opcional `screenCapture?: string`.
  - `src/main/services/enhancement-service.ts`:
    - Método `captureContext()` já implementa **clipboard**.
    - `selectedText` e `screenCapture` estão marcados como TODO, aguardando o serviço de captura + OCR.
    - Se `context.screenCapture` existir e `useScreenCaptureContext` estiver `true`, o texto da tela é injetado no prompt como:
      - `VISIBLE SCREEN CONTENT:\n...`

- Conclusão de alinhamento:
  - O pipeline tipo Dayflow (janela de 1h + cards) vai consumir **observations** que podem vir:
    - do áudio (transcrições do Whispo),
    - e opcionalmente de OCR de tela (quando a flag de screen capture estiver ligada).
  - A implementação concreta de screenshot + OCR deve seguir o spec de **beautification/enhancement**, usando o `EnhancementService`/`ContextCapture` como ponto de integração.
  - Este doc continua sendo a referência para:
    - Janela deslizante,
    - Formato de cards,
    - Prompt de “digital anthropologist”.
  - O spec de beautification continua sendo a referência para:
    - Como ligar/desligar clipboard/seleção/screen capture,
    - UX de contexto,
    - Detalhes de OCR (qualidade, privacidade).

Quando começarmos a implementar, a regra é:

1. Contexto (clipboard/seleção/tela) → seguir `beautification-enhancement-requirements`.
2. Construção de “log de atividade” (áudio + OCR) → seguir este doc de Dayflow pipeline.
3. A partir daí, gerar cards/journal automático como descrito nas seções anteriores.

Este documento deve ser a referência principal quando formos implementar o pipeline de journaling automático no Whispo seguindo o modelo do Dayflow.
