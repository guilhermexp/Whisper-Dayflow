# 📋 Análise Completa do Whispo

**Data da Análise:** Novembro 2024  
**Versão Analisada:** 0.1.7  
**Repositório:** Whisper-Dayflow/whispo

---

## 🎯 O Que É o Whispo

**Whispo** é uma ferramenta de **ditado por voz alimentada por IA** (AI-powered dictation tool) construída como aplicativo desktop **Electron** para **macOS** e **Windows**.

### Proposta de Valor

- Gravar voz com atalho de teclado global
- Transcrever automaticamente usando Whisper (OpenAI ou Groq)
- Inserir texto automaticamente no aplicativo ativo
- Manter histórico completo de transcrições
- Dados armazenados 100% localmente

---

## ⚙️ Stack Técnica

### Frontend

- **Electron** v31.0.2
- **React** 18.3.1 + **TypeScript** 5.6.3
- **TailwindCSS** 3.4.13 (styling)
- **Radix UI** (componentes acessíveis)
- **React Router** 6.27.0 (navegação)
- **TanStack Query** 5.59.14 (state management)
- **Electron Vite** 2.3.0 (build tool)

### Backend/Sistema

- **Node.js** (processo principal Electron)
- **Rust** (binário nativo `whispo-rs`)
  - `rdev` 0.5.3 - captura eventos de teclado
  - `enigo` 0.3.0 - simula digitação de texto
  - `serde` + `serde_json` - serialização

### Bibliotecas Principais

- `@egoist/tipc` - comunicação IPC type-safe
- `@egoist/electron-panel-window` - janelas flutuantes
- `@google/generative-ai` - integração Gemini
- `electron-updater` - auto-updates
- `dayjs` - manipulação de datas

---

## 🚀 Funcionalidades Principais

### 1. Gravação de Voz por Atalho de Teclado

**Dois modos de atalho configuráveis:**

#### Modo "Hold Ctrl" (padrão)
- Segura tecla `Ctrl` por **800ms** → inicia gravação
- Solta `Ctrl` → finaliza e transcreve
- Pressiona qualquer outra tecla → cancela gravação

#### Modo "Ctrl+/"
- `Ctrl+/` → inicia gravação
- `Ctrl+/` novamente → finaliza e transcreve
- `Esc` → cancela gravação

**Fluxo de Gravação:**
1. Usuário ativa atalho configurado
2. Janela flutuante (panel) aparece com visualizador de áudio
3. Som de início é reproduzido
4. Microfone captura áudio em formato WebM (128kbps)
5. Visualizador em tempo real mostra amplitude
6. Ao finalizar: som de fim + transcrição + inserção automática

### 2. Transcrição de Voz para Texto (STT)

**Provedores Suportados:**

| Provedor | Modelo | API Base URL |
|----------|--------|--------------|
| **OpenAI** | `whisper-1` | `https://api.openai.com/v1` |
| **Groq** | `whisper-large-v3` | `https://api.groq.com/openai/v1` |

**Configurações Customizáveis:**
- API Key
- Base URL (permite APIs compatíveis/custom)

**Processo de Transcrição:**
1. Áudio gravado em **WebM** (Blob)
2. Enviado via `FormData` para endpoint `/audio/transcriptions`
3. Headers: `Authorization: Bearer {API_KEY}`
4. Resposta JSON: `{ "text": "transcrição..." }`
5. Opcional: pós-processamento com LLM

### 3. Pós-Processamento com LLM

**Provedores de Chat Suportados:**

| Provedor | Modelo | Temperatura |
|----------|--------|-------------|
| **OpenAI** | `gpt-4o-mini` | 0 |
| **Groq** | `llama-3.1-70b-versatile` | 0 |
| **Gemini** | `gemini-1.5-flash-002` | - |

**Funcionalidade:**
- Refina/melhora transcrição bruta
- Prompt customizável com placeholder `{transcript}`
- Casos de uso:
  - Corrigir gramática
  - Formatar para contexto específico
  - Adicionar pontuação
  - Traduzir
  - Resumir

**Exemplo de Prompt:**
```
Corrija a gramática e adicione pontuação apropriada: {transcript}
```

### 4. Inserção Automática de Texto

**Após transcrição bem-sucedida:**

1. Texto copiado para **clipboard** (área de transferência)
2. **Se permissões de acessibilidade concedidas:**
   - Binário Rust (`whispo-rs`) é invocado
   - Comando: `whispo-rs write "texto transcrito"`
   - Simula digitação nativa usando `enigo`
   - Funciona em **qualquer aplicativo** com input de texto

**Tecnologia:**
- Rust `enigo` → simula eventos de teclado nativos do OS
- Multiplataforma (macOS, Windows)
- Não depende de automação específica de app

### 5. Histórico de Gravações

**Armazenamento Local:**

```
macOS: ~/Library/Application Support/app.whispo/recordings/
Windows: %APPDATA%/app.whispo/recordings/
```

**Estrutura de Dados:**

`history.json`:
```json
[
  {
    "id": "1699876543210",
    "createdAt": 1699876543210,
    "duration": 3500,
    "transcript": "Texto transcrito completo",
    "filePath": "/path/to/recordings/1699876543210.webm"
  }
]
```

**Interface do Usuário:**
- ✅ Lista ordenada por data (desc)
- ✅ Agrupamento: Hoje, Ontem, datas específicas
- ✅ Busca/filtro em tempo real
- ✅ Player de áudio embutido (play/pause)
- ✅ Seleção de texto (copiável)
- ✅ Exclusão individual com confirmação
- ✅ Limpeza completa de histórico

### 6. Visualizador de Áudio em Tempo Real

**Tecnologia:**
- **Web Audio API** (`AudioContext`, `AnalyserNode`)
- **Buffer:** 70 barras verticais
- **Atualização:** `requestAnimationFrame` (~60fps)

**Algoritmo:**
1. Captura dados de domínio de tempo (`getByteTimeDomainData`)
2. Calcula **RMS** (Root Mean Square):
   ```js
   rms = sqrt(Σ(normalized_values²) / length)
   ```
3. Normaliza com expoente 1.5 (expansão não-linear)
4. Escala entre 1%-100% de altura
5. Atualiza barras com transição CSS (75ms)

**Visual:**
- Barras cinzas quando sem áudio
- Barras brancas com sombra quando detectando som
- Animação fluida tipo "waveform"

### 7. Ícone na System Tray

**Estados Visuais:**
- `trayIconTemplate.png` - estado idle (não gravando)
- `stopTrayIconTemplate.png` - estado recording (gravando)

**Menu de Contexto:**

```
├─ Iniciar Gravação / Cancelar Gravação
├─ Ver Histórico
├─ ───────────────
├─ Configurações (Cmd/Ctrl+,)
├─ ───────────────
└─ Sair
```

**Interações:**
- **Click esquerdo:**
  - Se gravando → finaliza gravação
  - Se idle → abre menu
- **Click direito:** abre menu sempre

### 8. Auto-Update

**Configuração:**
- **Provider:** GitHub Releases
- **Feed customizado:** `electron-releases.umida.co`
- **Repo:** `egoist/whispo`
- **Estratégia:** download automático, instalação no quit

**Fluxo:**
1. App verifica updates ao iniciar
2. Se disponível: download em background
3. Notificação visual na UI
4. Usuário escolhe: instalar agora ou no próximo quit
5. Auto-install habilitado por padrão

**Changelog:**
- `fullChangelog: true` (mostra todas as mudanças)

### 9. Sistema de Configurações

**Arquivo:** `config.json` (salvo em `appData/app.whispo/`)

**Schema de Configuração:**

```typescript
{
  shortcut?: "hold-ctrl" | "ctrl-slash"
  hideDockIcon?: boolean  // macOS only
  
  sttProviderId?: "openai" | "groq"
  openaiApiKey?: string
  openaiBaseUrl?: string
  groqApiKey?: string
  groqBaseUrl?: string
  
  geminiApiKey?: string
  geminiBaseUrl?: string
  
  transcriptPostProcessingEnabled?: boolean
  transcriptPostProcessingProviderId?: "openai" | "groq" | "gemini"
  transcriptPostProcessingPrompt?: string
}
```

**Páginas de Configuração:**

#### General (`settings-general.tsx`)
- Escolher atalho de gravação
- Ocultar ícone Dock (macOS)
- Selecionar provedor STT
- Habilitar pós-processamento
- Escolher provedor de chat
- Editar prompt de pós-processamento

#### Providers (`settings-providers.tsx`)
- Configurar API Keys:
  - OpenAI
  - Groq
  - Gemini
- Customizar Base URLs (APIs compatíveis)

#### Data (`settings-data.tsx`)
- Deletar todo histórico (com confirmação dupla)

#### About (`settings-about.tsx`)
- Versão do app
- Verificar atualizações
- Informações de update

### 10. Setup Inicial / Wizard de Permissões

**Verificações ao Iniciar:**

1. **Acessibilidade:**
   - macOS: `systemPreferences.isTrustedAccessibilityClient()`
   - Windows: verificação de permissões
   - Se negado: abre janela de setup

2. **Microfone:**
   - `systemPreferences.getMediaAccessStatus('microphone')`
   - Solicita com `askForMediaAccess('microphone')`

**Janela de Setup (`setup.tsx`):**
- Guia passo-a-passo
- Botões para abrir System Preferences
- Verifica permissões em tempo real
- Só permite continuar quando concedidas

### 11. Multiplataforma

**Builds Oficiais:**

| Plataforma | Arquitetura | Formato |
|------------|-------------|---------|
| **macOS** | Apple Silicon (arm64) | DMG |
| **macOS** | Intel (x64) | DMG |
| **Windows** | x64 | NSIS Installer |

**Configuração de Build:**

```javascript
// electron-builder.config.cjs
{
  appId: "app.whispo",
  productName: "Whispo",
  mac: {
    binaries: ["resources/bin/whispo-rs"],
    entitlementsInherit: "build/entitlements.mac.plist",
    extendInfo: {
      NSMicrophoneUsageDescription: "...",
      NSDocumentsFolderUsageDescription: "...",
      // ...
    },
    notarize: { teamId: process.env.APPLE_TEAM_ID }
  },
  win: {
    executableName: "whispo"
  }
}
```

**Binários Nativos:**
- `whispo-rs` (macOS - sem extensão)
- `whispo-rs.exe` (Windows)
- Empacotados em `resources/bin/`
- Descompactados do ASAR (`asarUnpack`)

---

## 📁 Estrutura do Projeto

```
whispo/
├── src/
│   ├── main/                    # Processo Principal Electron (Node.js)
│   │   ├── index.ts             # Entry point, inicialização
│   │   ├── keyboard.ts          # Captura global de teclado (spawn whispo-rs)
│   │   ├── llm.ts               # Pós-processamento com LLMs
│   │   ├── tipc.ts              # Rotas IPC (router)
│   │   ├── window.ts            # Gerenciamento de janelas (main, panel, setup)
│   │   ├── tray.ts              # System tray icon + menu
│   │   ├── updater.ts           # Auto-update logic
│   │   ├── config.ts            # ConfigStore (leitura/escrita config.json)
│   │   ├── state.ts             # Estado global (isRecording)
│   │   ├── menu.ts              # Application menu
│   │   ├── serve.ts             # Protocolo custom assets://
│   │   ├── utils.ts             # Utilidades (isAccessibilityGranted)
│   │   └── renderer-handlers.ts # Handlers para renderer
│   │
│   ├── renderer/                # UI React
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── index.tsx            # Página de histórico
│   │   │   │   ├── panel.tsx            # Janela de gravação flutuante
│   │   │   │   ├── settings.tsx         # Layout de settings
│   │   │   │   ├── settings-general.tsx # Configurações gerais
│   │   │   │   ├── settings-providers.tsx # API Keys
│   │   │   │   ├── settings-data.tsx    # Gerenciamento de dados
│   │   │   │   ├── settings-about.tsx   # Sobre + updates
│   │   │   │   └── setup.tsx            # Wizard de permissões
│   │   │   │
│   │   │   ├── components/
│   │   │   │   ├── ui/          # Componentes Radix UI customizados
│   │   │   │   │   ├── button.tsx
│   │   │   │   │   ├── input.tsx
│   │   │   │   │   ├── dialog.tsx
│   │   │   │   │   ├── select.tsx
│   │   │   │   │   ├── switch.tsx
│   │   │   │   │   ├── tooltip.tsx
│   │   │   │   │   ├── textarea.tsx
│   │   │   │   │   ├── spinner.tsx
│   │   │   │   │   └── control.tsx
│   │   │   │   ├── app-layout.tsx
│   │   │   │   ├── setup.tsx
│   │   │   │   └── updater.tsx
│   │   │   │
│   │   │   ├── lib/
│   │   │   │   ├── recorder.ts          # Classe Recorder (MediaRecorder)
│   │   │   │   ├── sound.ts             # Reproduzir sons (begin/end record)
│   │   │   │   ├── tipc-client.ts       # Cliente IPC type-safe
│   │   │   │   ├── query-client.ts      # TanStack Query config
│   │   │   │   ├── utils.ts             # Utilidades (cn, clsx)
│   │   │   │   └── event-emitter.d.ts   # Type definitions
│   │   │   │
│   │   │   ├── App.tsx          # Root component
│   │   │   ├── main.tsx         # Entry point React
│   │   │   └── router.tsx       # React Router config
│   │
│   ├── shared/                  # Types compartilhados entre main/renderer
│   │   ├── types.ts             # RecordingHistoryItem, Config
│   │   ├── index.ts             # STT_PROVIDERS, CHAT_PROVIDERS
│   │   ├── data-model.ts        # Models de dados
│   │   └── shims.d.ts           # Type shims
│   │
│   └── preload/                 # Preload scripts
│       ├── index.ts             # Electron preload
│       └── index.d.ts           # Type definitions
│
├── whispo-rs/                   # Binário Rust
│   ├── src/
│   │   └── main.rs              # CLI: listen (keyboard) + write (text)
│   ├── Cargo.toml
│   └── Cargo.lock
│
├── resources/                   # Assets
│   ├── bin/
│   │   ├── whispo-rs            # macOS binary
│   │   └── whispo-rs.exe        # Windows binary
│   ├── trayIconTemplate.png
│   ├── trayIconTemplate@2x.png
│   ├── stopTrayIconTemplate.png
│   ├── stopTrayIconTemplate@2x.png
│   └── trayIcon.ico             # Windows tray icon
│
├── build/                       # Build resources
│   └── entitlements.mac.plist   # macOS entitlements
│
├── scripts/
│   ├── build-rs.sh              # Script para compilar Rust
│   ├── release.js               # Release automation
│   └── fix-pnpm-windows.js      # Fix pnpm no Windows
│
├── electron.vite.config.ts      # Vite config para Electron
├── electron-builder.config.cjs  # Electron Builder config
├── tailwind.config.js           # TailwindCSS config
├── postcss.config.js            # PostCSS config
├── components.json              # Shadcn/UI config
├── tsconfig.json                # TypeScript base config
├── tsconfig.node.json           # TypeScript config para Node
├── tsconfig.web.json            # TypeScript config para web
├── package.json                 # Dependencies + scripts
├── pnpm-lock.yaml
├── .prettierrc                  # Prettier config
├── .editorconfig
├── LICENSE                      # AGPL-3.0
└── README.md
```

---

## 🔐 Permissões e Segurança

### Permissões Requeridas

#### macOS
- **Microfone** (`NSMicrophoneUsageDescription`)
  - Necessário para gravação de áudio
  - Solicitado via `systemPreferences.askForMediaAccess('microphone')`
  
- **Acessibilidade** (Accessibility)
  - Necessário para inserção automática de texto
  - Verificado via `systemPreferences.isTrustedAccessibilityClient()`
  - Usuário deve habilitar manualmente em System Preferences

#### Windows
- **Microfone** (via Windows API)
- **Acessibilidade** (para input simulation)

### Privacidade e Armazenamento

**Dados Locais:**
- ✅ Todos os áudios gravados armazenados localmente
- ✅ Transcrições salvas em JSON local
- ✅ Configurações em arquivo local
- ✅ Sem telemetria ou envio de dados para servidores próprios

**APIs de Terceiros:**
- ⚠️ Áudios enviados para OpenAI/Groq para transcrição
- ⚠️ Transcrições podem ser enviadas para LLMs (se pós-processamento habilitado)
- 📝 Sujeito aos termos de privacidade de cada provedor

**API Keys:**
- Armazenadas em plaintext em `config.json`
- Não criptografadas (responsabilidade do usuário proteger)

### Licença

**AGPL-3.0** (GNU Affero General Public License v3.0)
- Código aberto
- Modificações devem ser compartilhadas
- Uso comercial permitido com restrições

---

## 🎨 Design e UX

### Visual Design

**Tema:**
- Dark theme predominante
- Paleta: preto, cinzas, branco
- Acentos em cores Radix UI

**Tipografia:**
- Sistema padrão (sans-serif)
- Variações de peso e tamanho via TailwindCSS

### Janelas

#### Main Window (Histórico)
- **Tamanho:** variável, redimensionável
- **Chrome:** título com botão de busca
- **Layout:** lista de cards agrupados por data
- **Sidebar:** navegação de settings

#### Panel Window (Gravação)
- **Tamanho:** pequeno, fixo
- **Estilo:** floating, sempre no topo
- **Background:** preto semi-transparente com blur
- **Conteúdo:** apenas visualizador de áudio ou spinner

#### Setup Window (Primeira execução)
- **Tamanho:** modal, centrado
- **Conteúdo:** checklist de permissões + botões

### Feedback Visual e Sonoro

**Visual:**
- ✅ Ícone tray muda durante gravação
- ✅ Visualizador de áudio animado (70 barras)
- ✅ Spinner durante transcrição
- ✅ Hover states em todos os botões
- ✅ Transições suaves (CSS transitions)

**Sonoro:**
- 🔊 Som ao **iniciar** gravação (`begin_record`)
- 🔊 Som ao **finalizar** gravação (`end_record`)

### Acessibilidade

- ✅ Componentes Radix UI (ARIA compliant)
- ✅ Navegação por teclado
- ✅ Tooltips informativos
- ✅ Contraste adequado (dark theme)
- ✅ Feedback em múltiplos canais (visual + audio)

---

## 🔧 Arquitetura Técnica

### Comunicação IPC (Inter-Process Communication)

**Biblioteca:** `@egoist/tipc` (type-safe IPC)

**Router Principal (`tipc.ts`):**

```typescript
const router = {
  // App lifecycle
  restartApp: t.procedure.action(async () => {...}),
  
  // Updates
  getUpdateInfo: t.procedure.action(async () => {...}),
  checkForUpdatesAndDownload: t.procedure.action(async () => {...}),
  quitAndInstall: t.procedure.action(async () => {...}),
  
  // Permissions
  getMicrophoneStatus: t.procedure.action(async () => {...}),
  requestMicrophoneAccess: t.procedure.action(async () => {...}),
  isAccessibilityGranted: t.procedure.action(async () => {...}),
  requestAccesssbilityAccess: t.procedure.action(async () => {...}),
  
  // Windows
  showPanelWindow: t.procedure.action(async () => {...}),
  hidePanelWindow: t.procedure.action(async () => {...}),
  
  // Recording
  createRecording: t.procedure.input<{...}>().action(async ({input}) => {...}),
  getRecordingHistory: t.procedure.action(async () => {...}),
  deleteRecordingItem: t.procedure.input<{id}>().action(async () => {...}),
  deleteRecordingHistory: t.procedure.action(async () => {...}),
  
  // Config
  getConfig: t.procedure.action(async () => {...}),
  saveConfig: t.procedure.input<{config}>().action(async () => {...}),
  
  // State
  recordEvent: t.procedure.input<{type}>().action(async () => {...}),
  
  // UI
  showContextMenu: t.procedure.input<{x, y, selectedText}>().action(async () => {...}),
  displayError: t.procedure.input<{title, message}>().action(async () => {...})
}
```

**Handlers do Renderer (`renderer-handlers.ts`):**

```typescript
{
  startRecording: () => void,
  finishRecording: () => void,
  stopRecording: () => void,
  startOrFinishRecording: () => void,
  refreshRecordingHistory: () => void,
  updateAvailable: (info: UpdateInfo) => void
}
```

### Gerenciamento de Estado

**Main Process:**
- `state.ts` - estado global simples
  ```typescript
  export const state = {
    isRecording: false
  }
  ```

**Renderer:**
- **TanStack Query** para cache e sincronização
- **React hooks** para estado local
- **Context** (minimal, via tipc-client)

**Queries principais:**
```typescript
useConfigQuery()           // config.json
useRecordingHistoryQuery() // history.json
useSaveConfigMutation()    // salvar config
```

### Classe Recorder (Gravação de Áudio)

**Arquitetura:**

```typescript
class Recorder extends EventEmitter {
  stream: MediaStream | null
  mediaRecorder: MediaRecorder | null
  
  async startRecording() {
    // 1. getUserMedia (microfone)
    // 2. Criar MediaRecorder (WebM, 128kbps)
    // 3. Iniciar análise de áudio (visualizador)
    // 4. Emitir 'record-start'
    // 5. Reproduzir som de início
  }
  
  stopRecording() {
    // 1. Parar MediaRecorder
    // 2. Parar stream (liberar microfone)
    // 3. Calcular duração
    // 4. Emitir 'record-end' com Blob e duration
    // 5. Destruir analisador
  }
  
  analyseAudio(stream: MediaStream) {
    // 1. Criar AudioContext + AnalyserNode
    // 2. Loop com requestAnimationFrame
    // 3. getByteTimeDomainData + calcular RMS
    // 4. Emitir 'visualizer-data' com RMS normalizado
  }
}
```

**Eventos:**
- `record-start` → início da gravação
- `record-end` → fim da gravação (com Blob e duração)
- `visualizer-data` → atualização do visualizador (RMS)
- `destroy` → limpeza

### Binário Rust (whispo-rs)

**Comandos:**

```bash
# Escutar eventos de teclado (modo daemon)
whispo-rs listen

# Escrever texto (simular digitação)
whispo-rs write "texto a digitar"
```

**Código Principal:**

```rust
// Evento de teclado → JSON para stdout
fn deal_event_to_json(event: Event) -> RdevEvent {
  // Serializa KeyPress, KeyRelease, MouseMove, etc.
}

// Escutar teclado
rdev::listen(|event| {
  match event.event_type {
    EventType::KeyPress(_) | EventType::KeyRelease(_) => {
      println!("{}", serde_json::to_string(&deal_event_to_json(event)))
    }
    _ => {}
  }
})

// Escrever texto
fn write_text(text: &str) {
  let mut enigo = Enigo::new(&Settings::default()).unwrap();
  enigo.text(text).unwrap();
}
```

**Integração com Electron:**
- `spawn(rdevPath, ["listen"])` → processo filho que emite JSON
- Main process lê stdout e parseia eventos
- Detecção de padrões de teclas (hold Ctrl, Ctrl+/, etc.)

### Fluxo de Transcrição

```
┌─────────────────┐
│ Usuário: Ctrl   │
└────────┬────────┘
         │
         ▼
┌──────────────────────┐
│ keyboard.ts          │
│ Detecta padrão       │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────────────┐
│ showPanelWindowAndStartRecording │
└────────┬─────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ Panel Window               │
│ ├─ Recorder.startRecording │
│ ├─ getUserMedia            │
│ ├─ MediaRecorder.start     │
│ └─ analyseAudio (loop)     │
└────────┬───────────────────┘
         │
         │ (usuário solta Ctrl)
         │
         ▼
┌────────────────────────────┐
│ finishRecording.send()     │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│ Recorder.stopRecording     │
│ ├─ gera Blob (WebM)        │
│ └─ emite 'record-end'      │
└────────┬───────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ tipcClient.createRecording      │
│ ├─ blob → ArrayBuffer           │
│ └─ IPC call para main process   │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ main/tipc.ts: createRecording   │
│ ├─ FormData com áudio           │
│ ├─ POST /audio/transcriptions   │
│ ├─ Recebe JSON { text }         │
│ └─ postProcessTranscript (LLM)  │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Salvar em history.json + .webm  │
│ ├─ ID único (timestamp)         │
│ ├─ Metadata (duration, etc.)    │
│ └─ Arquivo WebM em recordings/  │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ clipboard.writeText(transcript) │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ writeText(transcript) [Rust]    │
│ ├─ spawn whispo-rs write "..."  │
│ └─ Simula digitação nativa      │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Texto aparece no app ativo      │
└─────────────────────────────────┘
```

---

## 🎯 Casos de Uso

### 1. Ditado Rápido em Emails

**Cenário:**
- Usuário escreve email no Gmail
- Segura Ctrl para ditar parágrafo
- Texto é inserido automaticamente no editor

**Benefício:** 3-5x mais rápido que digitação

### 2. Notas de Reunião

**Cenário:**
- Durante reunião, usuário dita pontos importantes
- Histórico mantém todas as transcrições com timestamp
- Busca posterior por palavra-chave

**Benefício:** Captura rápida sem interromper fluxo

### 3. Acessibilidade

**Cenário:**
- Usuário com dificuldades motoras
- Usa voz para preencher formulários, escrever código, etc.

**Benefício:** Acesso total a qualquer aplicativo

### 4. Multilíngue

**Cenário:**
- Usuário fala em português, inglês, espanhol
- Whisper detecta idioma automaticamente
- Transcrição precisa em múltiplos idiomas

**Benefício:** Suporte global sem configuração

### 5. Pós-Processamento Personalizado

**Cenário:**
- Médico dita notas clínicas
- LLM formata em estrutura SOAP (Subjective, Objective, Assessment, Plan)
- Prompt customizado: "Organize em formato SOAP: {transcript}"

**Benefício:** Automação de formatação especializada

---

## 📊 Métricas e Performance

### Latência de Transcrição

**Componentes:**
1. Gravação → Blob: ~100ms
2. Upload para API: variável (rede + tamanho arquivo)
3. Processamento Whisper: 1-5 segundos
4. LLM pós-processamento (opcional): +1-3 segundos
5. Inserção de texto: <100ms

**Total estimado:** 2-10 segundos (depende de rede e providers)

### Consumo de Recursos

**CPU:**
- Idle: <1%
- Gravando (visualizador): 5-10%
- Transcrição (network I/O): <5%

**Memória:**
- Idle: ~100-150MB
- Com histórico grande: +50-100MB

**Disco:**
- App instalado: ~150MB
- Por gravação: ~50-200KB (WebM, depende de duração)

### Precisão de Transcrição

**Fatores:**
- Qualidade do microfone
- Ruído ambiente
- Clareza da fala
- Idioma (Whisper é melhor em inglês)

**Whisper-large-v3 (Groq):**
- WER (Word Error Rate): ~5-10% (inglês, áudio limpo)
- Latência: geralmente mais rápido que OpenAI

---

## 🚧 Limitações Conhecidas

### 1. Dependência de APIs Externas

- ❌ Não funciona offline (requer OpenAI/Groq)
- ❌ Sujeito a rate limits e custos das APIs
- ❌ Privacidade: áudios enviados para servidores de terceiros

### 2. Permissões de Acessibilidade

- ⚠️ macOS: usuário deve habilitar manualmente (não pode ser automatizado)
- ⚠️ Windows: pode requerer elevação de privilégios

### 3. Compatibilidade de Aplicativos

- ⚠️ Alguns apps bloqueiam input sintético (ex: jogos com anti-cheat)
- ⚠️ Apps com segurança elevada podem rejeitar

### 4. Idiomas

- ✅ Whisper suporta 50+ idiomas
- ⚠️ Qualidade varia (inglês > outros idiomas)
- ❌ Sem suporte para dialetos raros

### 5. Armazenamento de API Keys

- ⚠️ Armazenadas em plaintext (sem criptografia)
- ⚠️ Vulnerável se `config.json` for comprometido

---

## 🔮 Possíveis Melhorias Futuras

### Curto Prazo

1. **Criptografia de API Keys**
   - Usar keychain do OS (macOS Keychain, Windows Credential Manager)

2. **Indicador de Custo**
   - Mostrar custo estimado por transcrição
   - Tracking de gastos totais

3. **Atalhos Customizáveis**
   - Permitir usuário escolher qualquer combinação de teclas

4. **Exportar Histórico**
   - CSV, JSON, TXT
   - Backup completo

### Médio Prazo

1. **Suporte a Modelos Locais**
   - Whisper.cpp (offline)
   - Reduzir dependência de APIs

2. **Multi-idioma Explícito**
   - Seletor de idioma antes de gravar
   - Melhor precisão para idiomas específicos

3. **Macros de Pós-Processamento**
   - Templates pré-configurados:
     - Email profissional
     - Notas médicas
     - Código comentado
     - etc.

4. **Integração com Apps**
   - Plugins para VS Code, Notion, etc.
   - APIs para desenvolvedores

### Longo Prazo

1. **Reconhecimento de Comandos**
   - "Novo parágrafo" → insere quebra
   - "Deletar última frase" → remove
   - "Enviar email" → trigger action

2. **Transcrição em Tempo Real**
   - Streaming Whisper
   - Ver texto enquanto fala

3. **Colaboração**
   - Compartilhar histórico
   - Sync entre dispositivos

4. **Análise de Voz**
   - Detecção de sentimento
   - Remoção de "uhm", "ahn", pausas

---

## 📚 Documentação Técnica

### Scripts de Build

```json
{
  "dev": "electron-vite dev --watch",
  "build": "npm run typecheck && electron-vite build && npm run build-rs",
  "build-rs": "sh scripts/build-rs.sh",
  "build:mac": "electron-vite build && electron-builder --mac",
  "build:win": "npm run build && electron-builder --win",
  "release": "node ./scripts/release.js"
}
```

**`build-rs.sh`:**
```bash
# Compila whispo-rs para target específico
cargo build --release --manifest-path whispo-rs/Cargo.toml
# Copia binário para resources/bin/
```

### Variáveis de Ambiente

```bash
APP_ID=app.whispo
PRODUCT_NAME=Whispo
IS_MAC=true|false  # Definido automaticamente
APPLE_TEAM_ID=...  # Para notarização macOS
```

### Protocolos Customizados

**`assets://` Protocol:**
- Permite carregar arquivos locais de forma segura
- Usado para reproduzir áudios gravados
- Exemplo: `assets://file?path=/recordings/123.webm`

### Electron Security

**Best Practices Implementadas:**
- ✅ `contextIsolation: true`
- ✅ `nodeIntegration: false`
- ✅ Preload script para IPC seguro
- ✅ CSP (Content Security Policy) em produção
- ✅ Validação de inputs em IPC calls

---

## 🧪 Testing

**Status Atual:**
- ❌ Sem testes automatizados (unit, integration, e2e)

**Oportunidades:**
- Unit tests: Recorder, ConfigStore, utils
- Integration tests: IPC router
- E2E tests: Playwright/Spectron

---

## 🤝 Contribuição

**Repositório:** GitHub - `egoist/whispo`  
**Licença:** AGPL-3.0  
**Autor:** egoist  
**Website:** https://whispo.app

**Stack para Contribuidores:**
- Node.js 20+
- pnpm 9.12.1+
- Rust (para whispo-rs)
- macOS ou Windows para testar builds

---

## 📝 Conclusão

**Whispo** é uma ferramenta de ditado por voz **completa e polida** que demonstra:

✅ **Arquitetura sólida** (Electron + React + Rust)  
✅ **UX refinada** (atalhos globais, feedback multi-sensorial)  
✅ **Integração profunda com OS** (acessibilidade, input sintético)  
✅ **Flexibilidade** (múltiplos providers, customizações)  
✅ **Privacidade** (dados locais, sem telemetria)

**Ideal para:**
- Profissionais que escrevem muito (escritores, médicos, advogados)
- Usuários com necessidades de acessibilidade
- Produtividade pessoal (notas rápidas, emails, etc.)
- Desenvolvedores (comentários de código, documentação)

**Principais Diferenciais:**
- 🚀 Inserção automática em **qualquer app**
- 🎯 Histórico completo e pesquisável
- 🔧 Altamente customizável (prompts, providers)
- 🔒 100% local (exceto APIs de IA)
- 💨 Atalhos globais otimizados