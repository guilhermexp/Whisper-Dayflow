# Design System - Copie Exatamente Isso

## Cores de Background (Dark Mode)
```scss
// Fundo da página
background-color: var(--bg);  // #171717

// Cards, seções, inputs, selects, textareas
background: var(--bg-tertiary);  // #575757

// NÃO use var(--bg-secondary) para cards!
```

## Page Container (COPIAR EXATO)
```scss
.pageContainer {
  position: fixed;
  top: 30px;
  left: calc(56px + 8px);
  right: 12px;
  bottom: 12px;
  background-color: var(--bg);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1400;
}
```

## Header (COPIAR EXATO)
```scss
.header {
  padding: 0 32px;
  flex-shrink: 0;
  background: transparent;
  z-index: 10;
  -webkit-app-region: drag;
}

.wrapper {
  height: 52px;
  display: flex;
  align-items: center;
  position: relative;
}

.DialogTitle {
  font-size: 15px;
  font-weight: 500;
  color: var(--primary);
  opacity: 0.9;
}

.close {
  position: absolute;
  right: 0;
  background: transparent;
  border: none;
  border-radius: 8px;
  height: 32px;
  width: 32px;
  opacity: 0.6;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    opacity: 1;
  }
}
```

## Main Content (COPIAR EXATO)
```scss
.mainContent {
  flex: 1;
  overflow-y: auto;
  padding: clamp(16px, 4vw, 48px);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.Container {
  width: 100%;
  max-width: min(960px, 92vw);
}
```

## Tabs (COPIAR EXATO)
```scss
.TabsList {
  display: flex;
  gap: 8px;
  background: var(--bg-tertiary);
  padding: 4px;
  border-radius: 12px;
  margin-bottom: 24px;
}

.TabTrigger {
  flex: 1;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--secondary);
  background: transparent;
  border: none;

  &:hover {
    color: var(--primary);
    background: rgba(255, 255, 255, 0.05);
  }

  &[data-state='active'] {
    background: var(--bg);
    color: var(--primary);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
}
```

## Inputs/Selects/Textareas (COPIAR EXATO)
```scss
.Input, .Select, .Textarea {
  width: 100%;
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--primary);
  font-size: 13px;

  &:focus {
    background: var(--bg);
    border-color: var(--active);
  }
}
```

## Fieldset/Label (COPIAR EXATO)
```scss
.Fieldset {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
  border: none;
  padding: 0;
}

.Label {
  font-size: 13px;
  font-weight: 500;
  color: var(--primary);
  margin-left: 4px;
}
```

## Cards/Seções (COPIAR EXATO)
```scss
// Qualquer card ou seção com fundo
.Card, .Section, .SwitchRow {
  background: var(--bg-tertiary);
  border-radius: 12px;
  padding: 14px 16px;
}
```

## Botões Primários (COPIAR EXATO)
```scss
.Button {
  padding: 8px 16px;
  background: var(--active);
  color: var(--active-text);
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
}
```

## Hover States (IMPORTANTE)
```scss
// NUNCA use var(--bg-secondary) para hover
// SEMPRE use:
&:hover {
  background: rgba(255, 255, 255, 0.08);
}
```

## Scrollbar (COPIAR EXATO)
```scss
&::-webkit-scrollbar {
  width: 10px;
}
&::-webkit-scrollbar-track {
  background: transparent;
}
&::-webkit-scrollbar-thumb {
  background-color: var(--border);
  border-radius: 20px;
}
```

## Valores Fixos
- Border radius pequeno: 8px
- Border radius médio: 10-12px
- Border radius grande: 16px
- Font size texto: 13px
- Font size título: 15px
- Font weight normal: 400-500
- Font weight bold: 600
- Transição padrão: 0.2s
- Padding header: 0 32px
- Height header wrapper: 52px
- Gap entre seções: 20-24px
- Gap dentro de fieldset: 10px
