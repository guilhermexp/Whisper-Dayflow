# Overlay Layout Map

Mapping of the three dialog-style surfaces that currently define the polished UI experience (Chat, Search, Settings). Use this as the reference when building new modal/overlay pages so visuals, spacing, and interaction models stay aligned.

## 1. Common Shell Patterns

- **Trigger**: Every surface is launched from an icon button rendered via the shared `.iconHolder` pattern (`Chat.module.scss:1-31`, `Search.module.scss:1-31`, `Settings.module.scss:5-33`). Dimensions are `32x32` with 8px radius and low-opacity icon that brightens on hover.
- **Overlay**: Radix `Dialog.Overlay` consistently uses `var(--bg-tertiary)` at ~0.9 opacity with a quick `overlayShow` animation (`Chat.module.scss:38-52`, `Search.module.scss:33-44`, `Settings.module.scss:40-55`).
- **Content container**: Each dialog has rounded corners, neutral glass background, and internal scroll strategies:
  - Chat: full viewport takeover with blurred background, centered column (`Chat.module.scss:54-94`).
  - Search: centered card (`max-width: 960px`, 17px radius) (`Search.module.scss:46-68`).
  - Settings: full viewport sheet anchored to `#dialog` with straight edges for desktop-app feel (`Settings.module.scss:57-93`).
- **Header gradient**: Chat and Settings share the same gradient bar (`padding: 0 85px`, `height: 44-50px`) with title centered and controls floated right (`Chat.module.scss:96-163`, `Settings.module.scss:95-151`). Search embeds the header controls inside the dialog title row using the `InputBar` + `OptionsBar` stack.

## 2. Search Surface (`src/renderer/src/pages/pile/Search`)

| Section | Implementation details | Key styles |
| --- | --- | --- |
| Input bar | `InputBar` component provides the large grey bar with embedded text input, primary search button, and close button. Layout: flex row with 4px gaps, `40px` height, `13px/9px` asymmetric corner radius, `var(--bg-tertiary)` background (`InputBar.module.scss:1-90`). | Buttons reuse the pill pattern (`border-radius: 9px`, `var(--active)` color). Close button uses `var(--bg-secondary)` to stay neutral. |
| Filter chips | `OptionsBar` renders pill buttons for relevance/recent/oldest plus highlight/attachment toggles. Selected state uses `var(--active)` background with white text (`OptionsBar/index.jsx`, `.button` styles at `OptionsBar.module.scss:9-53`). |
| Semantic switch | Right-aligned Radix `Switch` with 42x25 track and 19px thumb; toggles `options.semanticSearch` and feeds the `vectorSearch` path (`OptionsBar.module.scss:60-88`). |
| Results meta row | Row below filters showing `threads`, `entries`, `destacados`, `anexos`. Styled via `.meta` (dashed divider, 7px top padding, 8px gaps) in `Search.module.scss:87-102`. |
| List area | Scrollable `.scroller` with overlay scrollbars, gradient fades at top/bottom, and `VirtualList` for performance (`Search/index.jsx:116-176`, `Search.module.scss:119-188`). |

Behavioral map:
- Input Enter/primary button triggers `search()` or `vectorSearch()` depending on `semanticSearch` (`Search/index.jsx:63-115`).
- Filter chip clicks mutate `options` state and immediately re-run the query via `onSubmit` and `useEffect` watchers.
- Stats line and counts derive from the filtered array, so add-ons should reuse `filterResults` to stay accurate.

## 3. Chat Surface (`src/renderer/src/pages/pile/Chat`)

| Section | Implementation details | Key styles |
| --- | --- | --- |
| Header | Gradient background, centered `Status` component, right-aligned action chips (theme selector, export, clear, close) – same pill style as search. Buttons use `36px` height and `90px` radius (`Chat.module.scss:96-170`). |
| Theme selector | Popover anchored to the theme button with 24px circular swatches; uses `AnimatePresence` for fade animation (`Chat/index.jsx:140-179`, `.themeSelector` styles `Chat.module.scss:144-170`). |
| Context toggle/panel | When `relevantEntries` exist, a floating toggle sits on the left of the chat area (8px padded pill). Clicking reveals a fixed side panel with numbered entries (`Chat/index.jsx:212-258`, `.contextToggle`/`.contextPanel` styles `Chat.module.scss:186-260`). |
| Transcript column | `VirtualList` handles streaming conversation; `history` local state mirrors `useChat` store to show tokens progressively (`Chat/index.jsx:226-350`). |
| Composer | Fixed bottom `.inputBar` with 700px max width, 13px radius text area, disclaimers, and an `Enviar` button that morphs width when `querying` (`Chat.module.scss:280-356`). |

Interaction flow:
- `useChat` gives `addMessage`, `getAIResponse`, `relevantEntries` (`Chat/index.jsx:24-40`).
- Submit path: append user message → push empty system message → stream tokens via `appendToLastSystemMessage` callback.
- Buttons share the same `styles.button` base class so adding new actions is trivial; keep `gap:4px` and 4px padding for alignment.

## 4. Settings Surface (`src/renderer/src/pages/pile/Settings`)

| Section | Implementation details | Key styles |
| --- | --- | --- |
| Shell | Dialog portal attaches to `#dialog` to sidestep stacking conflicts. Content fills viewport with column flex layout and explicit footer (`Settings/index.jsx:118-146`, `.DialogContent` styles `Settings.module.scss:57-93`, `.footer` at `Settings.module.scss:173-190`). |
| Header | Same gradient and centered title pattern as Chat; close button sits right with 32px square target (`Settings.module.scss:95-151`). |
| Tabs | Radix Tabs with pill list `Tabs.List` (8px padding, 12px radius). Each tab toggles between Journal/Whisper/Enhancement forms (`Settings/index.jsx:216-344`, `.TabsList` styles `Settings.module.scss:200-217`). |
| Form rows | Everywhere uses `.Fieldset` + `.Label` for consistent spacing (24px vertical rhythm, `font-size: 13px`). Controls rely on shared `.Select`, `.Input`, `.SwitchRoot` classes defined inside the module. |
| Expandable sections | Recording/App/Prompt accordions reuse `.ExpandableSection` pattern: button with chevron that rotates 90° when open; interior uses existing `Fieldset` components (`Settings/index.jsx:249-368`). |
| Prompt editor | Modal living inside main dialog (Radix nested). Maintains same rounded corners and button row; follow `promptEditorOpen` state machine near `Settings/index.jsx:48-150`.

Behavioral map:
- Data source: `useConfigQuery` hydrates `whispoConfigQuery.data`; updates go through `useSaveConfigMutation` wrappers to keep IPC contract consistent.
- Theming ties back into `usePilesContext` (`renderThemes`) so any future color pickers should mutate `setTheme`.
- Control guidelines: toggles via checkboxes or Radix `Switch`, selects with `className={styles.Select}`, text areas for prompts using `styles.Textarea`.

## 5. Component/Spacing Tokens

- **Spacing**: Horizontal padding `85px` in dialog headers; body max-widths ~`750px` (Chat) and `600px` (Settings `Container`). Search card uses `padding: 12px` outer and `gap: 6-8px` inside.
- **Corner radii**: icon buttons `8px`, cards `17px`, chips `9px`, switches `9999px`.
- **Typography**: Titles `14px` medium weight; supporting labels `12-13px` with `var(--secondary)` color. Input placeholders lean on gradients for hero text (Search) or `var(--secondary)` for supporting copy.
- **Color tokens**: `var(--bg)` for panels, `var(--bg-secondary)` for hover/backdrop, `var(--active)` for primary CTA (blue/purple accent). All overlays rely on `--primary`/`--secondary` text tokens, so new surfaces should stick to them.

## 6. How to Extend

1. Start from the closest existing module (`Chat`, `Search`, or `Settings`) and copy its SCSS skeleton to inherit the proper overlay shell.
2. Use the shared `.iconHolder` trigger to place entry points in `Layout.jsx` so nav spacing stays intact.
3. Keep button heights at `36-40px` and reuse `styles.button`/`styles.ask` classes for CTA parity.
4. When adding new filters or toggles, update the meta counts (Search) or accordion sections (Settings) to keep the informational hierarchy predictable.

This mapping lets designers/devs know where each visual rule lives in code, ensuring any new dialogs feel indistinguishable from the polished Chat/Search/Settings experiences.
