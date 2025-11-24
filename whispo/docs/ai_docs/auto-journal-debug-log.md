# Auto Journal - Debug Log (Nov 24, 2025)

Registro completo do que foi feito nesta sessão para o Auto Journal (backend + frontend), incluindo caminhos de arquivos tocados, comportamentos esperados e pendências.

## 1) Contexto inicial
- Feature existente: geração de runs (auto/manual) com resumo JSON; UI tinha botão “Salvar no diário”, mas não criava post automático nem havia auto-save.
- Problemas observados: sem auto-save no scheduler; botão manual sem feedback; scroll da página quebrado.

## 2) Mudanças implementadas

### Backend (Main)
- Criado helper de escrita de post:
  - `src/main/services/auto-journal-entry.ts`
  - Função `saveAutoJournalEntry({ pilePath, summary, activities, windowStartTs, windowEndTs })` escreve Markdown com frontmatter; erro explícito se `pilePath` inválido.
- Auto-save após runs automáticos:
  - `src/main/services/auto-journal-service.ts`: após `runAutoJournalOnce` com status `success`, se `autoJournalAutoSaveEnabled` e `autoJournalTargetPilePath` definidos, chama `saveAutoJournalEntry`; loga sucesso/erro.
- Config/IPC/Types para novo flag de auto-save:
  - `src/shared/types.ts`: campo `autoJournalAutoSaveEnabled?: boolean`.
  - `src/main/config.ts`: default e persistência do flag.
  - `src/main/tipc.ts`: `getAutoJournalSettings`/`saveAutoJournalSettings` expõem o flag; `createAutoJournalEntry` reutiliza o helper e loga erro.

### Frontend (Renderer)
- Página `/auto-journal` (`src/renderer/src/pages/pile/AutoJournal/index.jsx`):
  - Novo toggle “Salvar automaticamente no diário” na aba Configurações; chaves i18n em `src/renderer/src/locales/en-US.json` e `src/renderer/src/locales/pt-BR.json` (`autoSave`, `autoSaveDesc`, `timeout`).
  - Resolução de pile alvo na ordem: `autoJournalTargetPilePath` → pile atual → primeiro pile disponível.
  - Botão “Salvar no diário” refatorado:
    - Usa `mutateAsync` com timeout de 15s; seta `savingRunId` imediatamente.
    - Mostra toast de sucesso/erro/timeout; sempre limpa `savingRunId` no fim (ou na troca de run selecionado).
  - Scroll da página: `AutoJournal.module.scss` ajustado para permitir overflow vertical e padding extra inferior.

## 3) Comportamento esperado agora
- Scheduler: se `autoJournalEnabled` e `autoJournalAutoSaveEnabled` estiverem ativos e `autoJournalTargetPilePath` definido, cada run `success` deve gravar post no pile alvo além do JSON em `recordings/auto-journal/runs`.
- Botão manual “Salvar no diário”: ao clicar, deve aparecer estado de “Salvando…”, com toast de sucesso ou erro/timeout em até ~15s; spinner libera após toast.

## 4) Problemas ainda presentes (para debug)
- No ambiente atual, o clique em “Salvar no diário” não produz toast nem sucesso aparente. Possíveis causas:
  - `pilePath` resolvido vazio ou inválido (helper lança erro; confirmar no console do Main).
  - Erro silencioso no IPC (checar logs do processo main: `[auto-journal] Failed to save entry`).
  - Piles indefinidos no `PilesContext` (ver `piles.json` e paths reais).
- Auto-save do scheduler depende de `autoJournalTargetPilePath`; se vazio, só loga aviso e não salva post.

## 5) Arquivos tocados (lista rápida)
- Backend/Main: `src/main/services/auto-journal-entry.ts`, `src/main/services/auto-journal-service.ts`, `src/main/tipc.ts`, `src/main/config.ts`.
- Tipos: `src/shared/types.ts`.
- Frontend: `src/renderer/src/pages/pile/AutoJournal/index.jsx`, `src/renderer/src/pages/pile/AutoJournal/AutoJournal.module.scss`.
- i18n: `src/renderer/src/locales/en-US.json`, `src/renderer/src/locales/pt-BR.json`.

## 6) Próximos passos sugeridos de debug
1. No Main, logar `pilePath` e o erro em `saveAutoJournalEntry` ao receber o IPC `createAutoJournalEntry` (já imprime erro no console; verificar saída real ao clicar no botão).
2. No Renderer, antes de chamar `mutateAsync`, logar `resolvePilePath()` para ver o caminho efetivo.
3. Testar IPC direto (DevTools renderer):
   ```js
   tipcClient.createAutoJournalEntry({ pilePath: "/algum/pile/valido", summary: "test", activities: [] })
   ```
   e observar erro.
4. Validar conteúdo de `piles.json` (PilesContext) e permissões de escrita no path.
5. Confirmar que `autoJournalTargetPilePath` está preenchido quando testando o auto-save do scheduler.

## 7) Datas e status
- Data das alterações: 24 Nov 2025.
- Status: auto-save implementado, mas salvamento manual ainda não confirma sucesso no ambiente atual; requer debug adicional.
