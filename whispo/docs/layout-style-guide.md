# Layout & CSS Guide

This project uses a consistent glassy dark theme inspired by the Models page. Follow these rules for any new renderer UI:

## App Shell
- `src/renderer/src/components/app-layout.tsx` renders the chrome. Do **not** add per-page sidebars. Instead, register new entries in the primary nav.
- All pages render inside a dark background (`bg-black text-white`).

## Page Header
- Use `<PageHeader />` (`@renderer/components/page-header`) at the top of every route to show the title, optional description, and action controls (search, buttons, etc.).
- Header automatically applies the rounded glass panel style. Avoid custom wrappers unless you need stacked headers.

```tsx
<PageHeader
  title="Models"
  description="Manage STT and LLM providers"
  actions={<Button>Refresh</Button>}
/>
```

## Content Cards
- Use rounded 16px/`rounded-2xl` containers with `border border-white/10 bg-white/[0.02]` for all secondary panels.
- Long lists (history, analytics) live inside bordered containers with `overflow-auto` and internal padding.
- `ControlGroup` already follows this styling and should wrap settings rows.

## Inputs & Controls
- Inputs use Tailwind classes: `bg-white/5 border-white/10 text-white`. The helper `FilterInput` in `pages/index.tsx` demonstrates the wrapper pattern.
- Buttons default to `variant="ghost"` on dark backgrounds; destructive actions adopt text classes like `text-red-400` if not using a variant.

## Typography & Color
- Use `text-white` for primary titles, `text-white/70` for descriptions, and `text-white/60` for helper labels.
- Sections/labels use uppercase tracking for metadata: `text-xs uppercase tracking-wide text-white/60`.

## Layout Patterns
- Wrap pages in `div className="space-y-6"` to keep uniform spacing between header, filters, and cards.
- Lists inside cards should use virtualized containers (see `pages/index.tsx`) and apply the same rounded card style to each item.

Following these conventions keeps every screen consistent with the Models view and makes future styling updates trivial.
