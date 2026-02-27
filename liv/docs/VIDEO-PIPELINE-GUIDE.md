# Video Pipeline (Página de Vídeo)

Guia completo de uso e funcionamento da página **Pipeline de Vídeo** (`/video-recordings`) no Liv.

Este documento cobre:

- como iniciar/parar gravações
- como analisar uma sessão
- como ler a timeline e os cards
- onde os arquivos ficam salvos
- como o fluxo funciona por baixo (captura, MP4, auto-journal)
- troubleshooting (botão parar, MP4 não aparece, frames zerados, etc.)

## 1. O que é a página de vídeo

A página **Pipeline de Vídeo** é a interface para:

- gravar sessões de captura de tela em intervalos (timelapse)
- gerar um vídeo MP4 da sessão
- analisar a sessão com auto-journal (IA)
- visualizar uma timeline com cards por sessão/categoria
- abrir e baixar os arquivos gerados

Ela combina dados de:

- **screen session recordings** (gravações de tela)
- **auto-journal runs** (resumos/análises de IA)

## 2. Como usar (passo a passo)

### 2.1 Iniciar gravação manual

Na página de vídeo, use o botão **Gravar** no header.

O que acontece:

- uma nova sessão é criada
- a captura de frames começa imediatamente
- depois continua no intervalo configurado (ex.: a cada 5s)

### 2.2 Parar gravação manual

Use o botão **Parar** no header.

O que acontece:

- a sessão é encerrada
- o app tenta gerar um **MP4** com os frames capturados
- o app dispara **auto-journal em background** (sem travar a UI)

Observação:

- o botão foi ajustado para responder imediatamente, sem esperar a IA terminar
- o resumo pode aparecer alguns segundos depois

### 2.3 Analisar uma sessão manualmente

No painel da direita (sessão selecionada), clique em **Analisar sessão**.

Isso executa uma análise explícita para o intervalo da sessão:

- usa `windowStartTs = startedAt`
- usa `windowEndTs = endedAt` (ou `Date.now()` se ainda estiver ativa)

Útil quando:

- você quer reanalisar uma sessão antiga
- o resumo ainda não foi gerado
- houve falha anterior de IA

### 2.4 Filtros da timeline

No topo do painel esquerdo:

- `All tasks`
- `Core tasks`
- `Personal tasks`
- `Distractions`
- `Idle time`

Os filtros usam a categoria das atividades do resumo da IA (`Work`, `Personal`, `Distraction`, `Idle`).

### 2.5 Painel da direita (detalhes)

Ao selecionar uma sessão na timeline, o painel da direita mostra:

- faixa de horário (`HH:mm to HH:mm`)
- título da sessão (normalmente vindo da primeira atividade do auto-journal)
- duração + frames
- **vídeo gravado (MP4)** quando disponível
- bloco **Summary**
- métricas (`Focus meter`, `Distractions`)
- metadata e botão de **Baixar vídeo**

Se aparecer `MP4 indisponível para esta sessão`, veja troubleshooting.

## 3. Ativação da gravação (manual vs automática)

Existem 2 formas de ativação:

### 3.1 Manual (na página de vídeo)

Você controla usando os botões:

- `Gravar`
- `Parar`

### 3.2 Automática (via configuração)

O app também pode sincronizar a gravação de sessão com a configuração:

- `screenSessionRecordingEnabled`
- `screenSessionCaptureIntervalSeconds`

Na inicialização, o app chama a sincronização de serviços em background e pode iniciar/parar gravação automaticamente conforme essa config.

## 4. Como a gravação funciona internamente

### 4.1 Captura de frames (timelapse)

A captura:

- usa `desktopCapturer` (Electron)
- salva imagens JPG em uma pasta da sessão
- registra metadados (`timestamp`, `appName`, `windowTitle`) em `samples.jsonl`

Detalhe importante:

- se **não houver janela visível** do app (`BrowserWindow` visível), a captura pode ser ignorada naquele ciclo

Isso ajuda a evitar capturas quando a interface está totalmente fechada/oculta.

### 4.2 Intervalo de captura

O intervalo é limitado entre:

- mínimo: `2s`
- máximo: `30s`

Fluxo:

- captura 1 frame imediatamente ao iniciar
- agenda próximas capturas em `setInterval`

### 4.3 Encerramento da sessão

Ao parar:

- `endedAt` é preenchido
- status vira `completed`
- o app tenta gerar o `session.mp4`

## 5. Geração do vídeo MP4

### 5.1 Requisitos

O MP4 depende de `ffmpeg`.

O app tenta localizar:

- ffmpeg do sistema (`/opt/homebrew/bin/ffmpeg`, etc.)
- ffmpeg empacotado (`@ffmpeg-installer/ffmpeg`)

### 5.2 Build empacotado (.dmg)

Em builds `.dmg`, o executável não pode ser executado de dentro do `app.asar`.

O app usa a cópia em `app.asar.unpacked` para evitar erro como:

- `spawn ENOTDIR`

### 5.3 Quando o MP4 pode não ser gerado

Casos comuns:

- sessão com menos de **2 frames**
- `ffmpeg` indisponível
- erro de encode do ffmpeg

Nesses casos, a sessão continua válida, mas sem `videoPath`.

## 6. Como a timeline da página de vídeo funciona

### 6.1 Fonte dos blocos

A timeline cruza:

- sessões gravadas
- runs do auto-journal

Cada bloco representa uma sessão, mas o intervalo visual do bloco prioriza:

1. intervalo das **activities** do resumo (`activities[].startTs/endTs`)
2. `windowStartTs/windowEndTs` da run
3. duração bruta da sessão (`startedAt/endedAt`) como fallback

Isso evita blocos gigantes quando a sessão ficou aberta por muito tempo.

### 6.2 Categorias e cores

A categoria do bloco vem da **primeira atividade** do resumo.

Mapeamento:

- `work`
- `personal`
- `distraction`
- `idle`

## 7. Fluxo de auto-journal na página de vídeo

Existem 2 fluxos:

### 7.1 Ao clicar em `Parar`

Depois de encerrar a gravação:

- o app dispara auto-journal em background para a janela da sessão
- a UI não espera esse processamento terminar

Resultado:

- o botão para de ficar “travado”
- o resumo pode surgir depois

### 7.2 Ao clicar em `Analisar sessão`

Executa uma análise explícita por faixa de tempo da sessão.

Esse fluxo é útil para reprocessar.

## 8. Onde os arquivos são salvos

Base (macOS, app empacotado):

- `~/Library/Application Support/app.liv/recordings/`

Subpastas relevantes:

- `screen-sessions/` → gravações de tela
- `auto-journal/runs/` → runs de auto-journal
- `auto-journal/gifs/` → GIFs de preview (quando gerados)

Estrutura típica de uma sessão:

- `screen-sessions/<sessionId>/frames/*.jpg`
- `screen-sessions/<sessionId>/samples.jsonl`
- `screen-sessions/<sessionId>/session.mp4` (se gerado)
- `screen-sessions/index.json` (índice das sessões)

## 9. Troubleshooting (problemas comuns)

### 9.1 “Cliquei em Parar e não acontece nada”

Causa comum (já corrigida):

- o IPC aguardava geração de vídeo + auto-journal antes de responder

Comportamento atual:

- o stop responde rápido
- a análise roda em background

Se ainda ocorrer:

- verifique logs do app
- confira se a sessão foi encerrada no `index.json`

### 9.2 “MP4 indisponível para esta sessão”

Verifique:

1. A sessão teve pelo menos 2 frames?
2. `ffmpeg` está acessível?
3. Em build `.dmg`, você está usando build novo com correção de `app.asar.unpacked`?

Também pode acontecer em sessões antigas gravadas antes da correção.

### 9.3 Sessão com `Frames: 0`

Possíveis causas:

- janela visível não disponível em alguns ciclos
- sessão iniciada/parada rápido demais
- permissão de captura de tela do macOS não concedida

### 9.4 Card gigante na timeline

Causa:

- sessão longa/anômala usando duração bruta

Correção:

- timeline agora prioriza o intervalo do resumo/activities

### 9.5 Resumo não aparece imediatamente após parar

Esperado em muitos casos:

- a análise roda em background

Ações:

- aguarde alguns segundos
- clique em **Atualizar**
- use **Analisar sessão** manualmente

## 10. Dicas de uso

- Use sessões curtas (ex.: 10–60 min) para análises mais úteis.
- Se quiser melhor MP4, não pare a sessão cedo demais (garanta alguns frames).
- Se o objetivo for produtividade, use `Analisar sessão` ao final de blocos de trabalho.
- Use os filtros da timeline para revisar distrações e tempo ocioso.

## 11. Arquivos-chave (para devs)

Frontend:

- `src/renderer/src/pages/pile/VideoRecordings/index.jsx`
- `src/renderer/src/pages/pile/VideoRecordings/VideoRecordings.module.scss`

Backend / serviços:

- `src/main/services/screen-session-recording-service.ts`
- `src/main/services/auto-journal-service.ts`
- `src/main/tipc.ts`

Inicialização:

- `src/main/index.ts` (sincronização de schedulers / screen session)

