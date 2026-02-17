# Guia de Build - Liv

## Build Rápido (macOS)

```bash
cd /Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv
npm run build:mac
```

O app será gerado em:
- **App:** `dist/mac-arm64/Liv.app`
- **DMG:** `dist/Liv-0.1.8-arm64.dmg`

## Após o Build

### 1. Remover quarentena (se necessário)
```bash
xattr -cr dist/mac-arm64/Liv.app
```

### 2. Verificar assinatura
```bash
codesign --verify --deep --strict --verbose=2 dist/mac-arm64/Liv.app
```

### 3. Instalar
```bash
rm -rf /Applications/Liv.app
cp -R dist/mac-arm64/Liv.app /Applications/
xattr -cr /Applications/Liv.app
```

Ou abra o DMG e arraste para Aplicações.

## Sobre Permissões

O app usa **ad-hoc signing** (assinatura local sem certificado Apple Developer).

**Implicações:**
- Permissões de Acessibilidade e Gravação de Tela persistem enquanto usar a mesma versão
- Cada rebuild gera um novo hash = precisa reautorizar permissões
- Para permissões permanentes, seria necessário certificado Apple Developer ($99/ano)

**Dica:** Mantenha a versão buildada em `/Applications/` e só rebuilde quando necessário.

## Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Modo desenvolvimento (hot reload) |
| `npm run build` | Build sem empacotamento |
| `npm run build:mac` | Build + empacotamento macOS |
| `npm run build:win` | Build + empacotamento Windows |
| `npm run build:linux` | Build + empacotamento Linux |

## Troubleshooting

### Erro de TypeScript
Se aparecer erro de compilação, verifique:
```bash
npm run typecheck
```

### Erro: Identificador duplicado
Se aparecer erro como `TS2300: Duplicate identifier`, verifique imports duplicados no arquivo indicado.

**Exemplo comum:** `src/main/tipc.ts` com import duplicado
```typescript
// ERRADO - import duplicado
import {
  startAutoJournalScheduler,
  stopAutoJournalScheduler,
  startAutoJournalScheduler,  // <- DUPLICADO
} from "./services/auto-journal-service"
```

### Erro: FFmpeg não encontrado

Este erro ocorre quando o binário FFmpeg não é encontrado na máquina ou no bundle.

**Comportamento atual:** o app tenta primeiro o FFmpeg do sistema e depois o binário bundled (`@ffmpeg-installer/ffmpeg`).

O app procura automaticamente em:
- `/opt/homebrew/bin/ffmpeg` (Homebrew Apple Silicon)
- `/usr/local/bin/ffmpeg` (Homebrew Intel)
- `/usr/bin/ffmpeg` (Sistema)

**Se precisar do FFmpeg para GIFs do auto-journal:**
```bash
brew install ffmpeg
```

**Se o erro persistir após correção:**
```bash
# Limpar build anterior e rebuildar
rm -rf dist out
npm run build:mac
```

### Erro: Unable to preload CSS (assets://app/assets/...)

Problema com protocolo `assets://` não carregando arquivos estáticos.

**Causa:** O `fs.promises.stat` não funcionava corretamente dentro de arquivos `.asar`.

**Solução:** Usar `fs.existsSync` que funciona com asar no Electron. Já corrigido em `src/main/serve.ts`.

### App não abre
1. Mate processos anteriores: `pkill -9 -f "Liv"`
2. Verifique se removeu quarentena: `xattr -cr /Applications/Liv.app`
3. Verifique assinatura: `codesign --verify /Applications/Liv.app`

### App abre versão antiga após rebuild

O macOS pode cachear o app antigo.

```bash
# Matar todos os processos, reinstalar e abrir
pkill -9 -f "Liv"
rm -rf /Applications/Liv.app
cp -R dist/mac-arm64/Liv.app /Applications/
xattr -cr /Applications/Liv.app
open /Applications/Liv.app
```

### Permissões não funcionam
1. Remova o app de Preferências do Sistema > Privacidade
2. Abra o app novamente
3. Reautorize quando solicitado

## Build Limpo (recomendado após problemas)

```bash
# Remove artefatos anteriores e faz build limpo
rm -rf dist out
npm run build:mac

# Instala
pkill -9 -f "Liv" 2>/dev/null
rm -rf /Applications/Liv.app
cp -R dist/mac-arm64/Liv.app /Applications/
xattr -cr /Applications/Liv.app
open /Applications/Liv.app
```

## Estrutura de Saída

```
dist/
├── mac-arm64/
│   └── Liv.app              # App pronto para uso
├── Liv-0.1.8-arm64.dmg      # Instalador DMG
├── Liv-0.1.8-arm64.zip      # Versão compactada
└── builder-effective-config.yaml
```

## Arquivos de Configuração Importantes

| Arquivo | Descrição |
|---------|-----------|
| `electron-builder.config.cjs` | Config do electron-builder (asarUnpack, entitlements) |
| `electron.vite.config.ts` | Config do Vite (externals para módulos nativos) |
| `src/main/serve.ts` | Protocolo `assets://` para carregar arquivos |
| `build/entitlements.mac.plist` | Permissões do macOS |

## Dependências Nativas

Módulos que precisam de tratamento especial no build:

| Módulo | Tratamento |
|--------|------------|
| `sherpa-onnx-*` | External no Vite + asarUnpack |
| `@egoist/electron-panel-window` | asarUnpack |
| `sqlite3` | Fallback de carregamento em runtime + empacotamento reforçado |
| FFmpeg | Busca sistema + fallback bundled (`@ffmpeg-installer/ffmpeg`) |
