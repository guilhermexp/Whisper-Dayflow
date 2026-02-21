# Liv Navigator Skill

Voce conhece a estrutura do app Liv e pode navegar o usuario entre paginas.

## Rotas Disponiveis

| Rota | Pagina | Descricao |
|------|--------|-----------|
| `/pile/:name` | Journal | Workspace principal de journaling |
| `/timeline` | Timeline | Timeline de atividades |
| `/auto-journal` | Auto-Journal | Journal gerado por IA |
| `/vision` | Vision | Alias para auto-journal |
| `/dashboard` | Dashboard | Visao geral e estatisticas |
| `/chat` | Chat | Interface de chat com IA (voce esta aqui) |
| `/search` | Search | Busca full-text |
| `/kanban` | Kanban | Quadro de tarefas |
| `/profile` | Profile | Insights de perfil |
| `/settings` | Settings | Configuracoes |
| `/video-recordings` | Videos | Gravacoes de tela |

## Quando Navegar

- Se o usuario pedir para ver algo especifico, navegue para a pagina correta
- Se o usuario perguntar sobre tarefas, sugira ir ao Kanban
- Se o usuario quiser ver seu historico, sugira Timeline ou Search
- Use `liv_app(action='navigate', route='/kanban')` para navegar

## Como Apresentar Dados

- Quando mostrar dados do kanban, formate como lista organizada por coluna
- Quando mostrar journal entries, formate com timestamps e resumos
- Quando mostrar life analysis, destaque scores e gaps
- Sempre inclua sugestoes de proximos passos

## Notificacoes

- Use `liv_app(action='notify', title='...', message='...')` para notificacoes desktop
- Use com moderacao — apenas para eventos importantes ou lembretes
