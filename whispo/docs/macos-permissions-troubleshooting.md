# macOS Permissions Troubleshooting Guide

**Last Updated:** November 24, 2024

Este documento descreve os problemas de permissões no macOS e como resolvê-los para o VoiceFlow.

---

## Problema Principal

O VoiceFlow usa um binário Rust (`whispo-rs`) para capturar eventos de teclado globalmente. No macOS, isso requer duas permissões:

1. **Accessibility** - Permite controlar o computador
2. **Input Monitoring** - Permite monitorar entrada de teclado

### Sintomas do Problema

- Atalhos de teclado não funcionam (Ctrl, Fn)
- Erro "Paste Error" ao tentar colar transcrição
- App pede permissão repetidamente mesmo após conceder
- Funciona no modo dev mas não em produção

---

## Causa Raiz

O macOS registra permissões baseado na **assinatura do app**. Apps não assinados têm uma "identidade" diferente a cada build, fazendo o macOS não reconhecer as permissões concedidas anteriormente.

Além disso, o macOS aplica atributos de **quarentena** a apps baixados da internet, bloqueando a execução de binários internos.

---

## Solução Implementada

### 1. Assinatura Ad-hoc

Adicionamos assinatura ad-hoc ao processo de build em `scripts/after-pack.cjs`:

```javascript
// Ad-hoc sign the app (allows consistent identity for permissions)
execSync(`codesign --force --deep --sign - "${appPath}"`)
```

Isso dá uma identidade consistente ao app sem precisar de Apple Developer ID.

### 2. Remoção de Quarentena

Removemos atributos de quarentena que bloqueiam execução:

```javascript
execSync(`xattr -cr "${appPath}"`)
```

---

## Procedimento para Usuários

### Primeira Instalação

1. Instale o DMG normalmente
2. Abra o VoiceFlow
3. Quando solicitado, conceda permissão de **Accessibility**
4. Vá em **Ajustes do Sistema > Privacidade e Segurança > Monitoração de Entrada**
5. Adicione o VoiceFlow manualmente (clique no "+")
6. **Reinicie o app completamente** (Cmd+Q e abra novamente)

### Se Parar de Funcionar Após Update

1. Feche o VoiceFlow
2. Vá em **Ajustes do Sistema > Privacidade e Segurança**
3. Em **Accessibility**: Remova o VoiceFlow antigo
4. Em **Monitoração de Entrada**: Remova o VoiceFlow antigo
5. Delete o app de /Applications
6. Instale o novo DMG
7. Abra e conceda permissões novamente
8. Reinicie o app

### Comando Manual para Remover Quarentena

Se o app não funcionar mesmo com permissões, execute no Terminal:

```bash
xattr -cr /Applications/VoiceFlow.app
```

---

## Debugging

### Verificar se Permissões Estão OK

Execute o app pelo terminal para ver os logs:

```bash
/Applications/VoiceFlow.app/Contents/MacOS/VoiceFlow
```

Procure por estas linhas:
```
[Keyboard] Accessibility permission: true    ← Deve ser true
[Keyboard] Spawning binary with 'listen' command...
```

Se `Accessibility permission: false`, a permissão não foi concedida corretamente.

### Verificar se o Binário Está Funcionando

```bash
ps aux | grep "whispo-rs listen"
```

Deve mostrar o processo rodando.

### Testar o Binário Diretamente

```bash
timeout 5 /Applications/VoiceFlow.app/Contents/Resources/app.asar.unpacked/resources/bin/whispo-rs listen
```

Pressione algumas teclas. Se não aparecer output, o binário não tem permissão de Input Monitoring.

---

## Arquivos Relevantes

- `scripts/after-pack.cjs` - Hook de pós-build com assinatura e remoção de quarentena
- `electron-builder.config.cjs` - Configuração do electron-builder
- `src/main/keyboard.ts` - Código do listener de teclado
- `src/main/native-binary.ts` - Caminho do binário whispo-rs
- `build/entitlements.mac.plist` - Entitlements do app

---

## Notas Importantes

### Por que não usar Apple Developer ID?

Uma assinatura com Apple Developer ID ($99/ano) resolveria todos esses problemas automaticamente. Com ela:
- Permissões persistem entre updates
- Gatekeeper não bloqueia o app
- Notarization permite distribuição segura

Para produção comercial, considere obter um Apple Developer ID.

### Diferença entre Dev e Produção

- **Dev mode**: Usa o binário Electron genérico, que precisa de permissões separadas
- **Produção**: Usa o VoiceFlow.app assinado, com suas próprias permissões

Por isso atalhos podem funcionar em um e não no outro.

### Input Monitoring vs Accessibility

- **Accessibility**: Permite "controlar o computador" (necessário para colar texto)
- **Input Monitoring**: Permite "monitorar entrada de teclado" (necessário para capturar atalhos)

O VoiceFlow precisa de **ambas** as permissões.

---

## Histórico de Problemas

### Novembro 2024 - Keyboard Listener Não Funciona em Produção

**Problema**: Atalhos de teclado não funcionavam no build de produção, apenas no dev mode.

**Causa**: 
1. App não estava assinado, causando problemas de identidade para permissões
2. Atributos de quarentena bloqueavam o binário whispo-rs

**Solução**:
1. Adicionado assinatura ad-hoc no `after-pack.cjs`
2. Adicionada remoção de quarentena no mesmo hook
3. Documentado procedimento para usuários reconfigurarem permissões

**Arquivos modificados**:
- `scripts/after-pack.cjs` (novo arquivo)
- `electron-builder.config.cjs` (referência ao hook)
