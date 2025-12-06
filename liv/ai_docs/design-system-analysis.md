# Design System Analysis - Página de Configurações

**Documento de Análise de Layout/Design**
**Data:** 06/12/2025
**Versão:** 1.0

---

## 1. Estrutura Geral da Página

### 1.1 Page Container
```scss
.pageContainer {
  position: fixed;
  top: 30px;
  left: calc(56px + 8px);  // 64px (nav rail + gap)
  right: 12px;
  bottom: 12px;
  background-color: var(--bg);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  z-index: 1400;
}
```

**Características:**
- Painel flutuante com cantos arredondados (16px)
- Sombra profunda para efeito de elevação
- Margens: 30px topo, 12px laterais e inferior
- Posicionado à direita do navigation rail (56px)

---

## 2. Sistema de Cores

### 2.1 Variáveis CSS (Dark Mode)
| Variável | Valor | Uso |
|----------|-------|-----|
| `--bg` | `#171717` | Background principal |
| `--bg-secondary` | `#373737` | Background de seções |
| `--bg-tertiary` | `#575757` | Background de inputs/cards |
| `--primary` | `#ffffff` | Texto principal |
| `--secondary` | `#c1c1c1` | Texto secundário/labels |
| `--border` | `#565656` | Bordas e divisórias |
| `--active` | `#4d88ff` | Cor de destaque/ação |
| `--active-text` | `#ffffff` | Texto sobre elementos ativos |

### 2.2 Temas Disponíveis
- **Default (Dark):** Cinza escuro neutro
- **Blue:** Azul com acentos laranja
- **Purple:** Roxo com acentos verde-limão
- **Yellow:** Amarelo/âmbar quente
- **Green:** Verde natureza
- **Liquid:** Preto puro minimalista

### 2.3 Seletor de Tema Visual
```scss
.theme {
  width: 36px;
  height: 36px;
  border-radius: 50%;           // Círculo perfeito
  border: 2px solid transparent;

  &.current {
    border-color: var(--active); // Borda azul quando selecionado
  }

  &:hover {
    transform: scale(1.1);       // Aumenta 10% no hover
  }
}
```

---

## 3. Tipografia

### 3.1 Fonte Principal
```scss
font-family: 'Inter', sans-serif;
// Com suporte a variable fonts:
font-family: 'Inter var', sans-serif;
```

### 3.2 Fonte Decorativa
```scss
font-family: 'Porpora';  // Usada para elementos especiais
```

### 3.3 Escala Tipográfica
| Elemento | Tamanho | Peso | Cor |
|----------|---------|------|-----|
| Título da página | 15px | 500 | `--primary` (opacity 0.9) |
| Labels | 13px | 500 | `--primary` |
| Texto de input | 13px | 400 | `--primary` |
| Placeholder | 13px | 400 | `--secondary` (opacity 0.7) |
| Descrições | 11px | 400 | `--secondary` |
| Tabs | 13px | 500 | `--secondary` → `--primary` |

---

## 4. Componentes

### 4.1 Header
```scss
.header {
  padding: 0 32px;
  height: 52px;
  -webkit-app-region: drag;  // Permite arrastar a janela

  .DialogTitle {
    font-size: 15px;
    font-weight: 500;
    opacity: 0.9;
  }

  .close {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    opacity: 0.6;

    &:hover {
      background: rgba(255, 255, 255, 0.08);
      opacity: 1;
    }
  }
}
```

### 4.2 Sistema de Tabs (Radix UI)
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

  &[data-state='active'] {
    background: var(--bg);
    color: var(--primary);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
}
```

**Estrutura visual:**
```
┌─────────────────────────────────────────────────────┐
│  [■ Diário]     [♪ Whisper]     [✦ Melhorias]      │
└─────────────────────────────────────────────────────┘
     ↑ ativo          inativo          inativo
```

### 4.3 Tabs Secundárias (Provider Selection)
```scss
// Tabs de seleção de provider (Assinatura, API Ollama, API OpenAI, OpenRouter)
// Mesmo padrão das tabs principais mas com ícones específicos
```

### 4.4 Inputs e Selects
```scss
.Input, .Select, .Textarea {
  width: 100%;
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;

  &:focus {
    background: var(--bg);
    border-color: var(--active);
    box-shadow: 0 0 0 2px rgba(var(--active-rgb), 0.1);
  }
}

.Textarea {
  min-height: 100px;
  resize: vertical;
  line-height: 1.5;
}
```

### 4.5 Fieldsets (Grupos de Formulário)
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

### 4.6 Seções Expansíveis (Accordion)
```scss
.ExpandableSection {
  background: var(--bg-tertiary);
  border-radius: 12px;
  margin-bottom: 10px;
}

.ExpandableHeader {
  padding: 14px 16px;
  font-size: 13px;
  font-weight: 500;

  &:hover {
    background: rgba(255, 255, 255, 0.03);
  }
}
```

### 4.7 Botões
```scss
.Button {
  padding: 8px 16px;
  background: var(--active);
  color: var(--active-text);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
}
```

---

## 5. Ícones

### 5.1 Biblioteca de Ícones
Localização: `src/renderer/icons/`

### 5.2 Ícones Usados na Página
| Ícone | Componente | Tamanho |
|-------|------------|---------|
| `CrossIcon` | Botão fechar | 14x14px |
| `NotebookIcon` | Tab Diário | 16x16px |
| `AudiowaveIcon` | Tab Whisper | 16x16px |
| `AIIcon` | Tab Melhorias | 16x16px |
| `ChevronRightIcon` | Seções expansíveis | 14x14px |

### 5.3 Estilo dos Ícones
```scss
// Ícones em tabs
svg {
  height: 16px;
  width: 16px;
}

// Ícones em botões de ação
svg {
  height: 14px;
  width: 14px;
  color: var(--secondary);
  opacity: 0.6;

  &:hover {
    opacity: 1;
  }
}
```

---

## 6. Espaçamentos

### 6.1 Sistema de Spacing
| Nome | Valor | Uso |
|------|-------|-----|
| xs | 4px | Gap mínimo entre ícones |
| sm | 8px | Gap entre tabs, padding interno |
| md | 10-12px | Padding de inputs, gap de fieldsets |
| lg | 16px | Padding de seções |
| xl | 20-24px | Margin entre seções |
| 2xl | 32px | Padding horizontal do header |
| 3xl | 48px | Padding máximo do conteúdo (clamp) |

### 6.2 Padding Responsivo
```scss
.mainContent {
  padding: clamp(16px, 4vw, 48px);  // Min 16px, Max 48px
}
```

---

## 7. Border Radius

| Elemento | Radius |
|----------|--------|
| Page container | 16px |
| Tabs container | 12px |
| Tab triggers | 8px |
| Inputs/Selects | 10px |
| Buttons | 8px |
| Theme circles | 50% (círculo) |
| Close button | 8px |
| Expandable sections | 12px |

---

## 8. Sombras e Elevação

```scss
// Page container - Elevação alta
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);

// Tab ativa - Elevação sutil
box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

// Focus ring - Glow
box-shadow: 0 0 0 2px rgba(var(--active-rgb), 0.1);
```

---

## 9. Transições e Animações

### 9.1 Transições Padrão
```scss
transition: all 0.2s;           // Padrão geral
transition: all ease-out 100ms; // Botões rápidos
transition: transform 0.2s ease; // Rotação de chevrons
```

### 9.2 Micro-interações
- **Hover em botões:** `transform: translateY(-1px)`
- **Active em botões:** `transform: scale(0.94)`
- **Hover em temas:** `transform: scale(1.1)`
- **Chevron expandido:** `transform: rotate(90deg)`

---

## 10. Scrollbar Customizada

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

  &:hover {
    background-color: var(--secondary);
  }
}
```

---

## 11. Layout Responsivo

### 11.1 Container Principal
```scss
.Container {
  width: 100%;
  max-width: min(960px, 92vw);  // Max 960px ou 92% da viewport
}
```

### 11.2 Breakpoints Implícitos
- **Mobile (< 909px):** Sidebar escondida
- **Desktop (≥ 909px):** Layout completo

---

## 12. Hierarquia Visual

```
┌────────────────────────────────────────────────────────────┐
│ Header (drag region)                              [X]      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  [Tab 1]  │  [Tab 2]  │  [Tab 3]                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  Label                                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ● ● ● ● ● ○  (Theme selector)                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  Label                                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  [Sub-tab 1] │ [Sub-tab 2] │ [Sub-tab 3] │ [Sub-tab 4] │
│  ├──────────────────────────────────────────────────────┤  │
│  │  Descrição do provedor selecionado                   │  │
│  │                                                      │  │
│  │  URL Base                    Modelo                  │  │
│  │  ┌────────────────────┐      ┌────────────────────┐  │  │
│  │  │ https://...        │      │ gpt-5.1        ▼   │  │  │
│  │  └────────────────────┘      └────────────────────┘  │  │
│  │                                                      │  │
│  │  Chave de API                                        │  │
│  │  ┌──────────────────────────────────────────────┐    │  │
│  │  │ sk-proj-...                                  │    │  │
│  │  └──────────────────────────────────────────────┘    │  │
│  │                                                      │  │
│  │  ⚠ Texto de aviso/ajuda                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  Label                                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Textarea para prompt de personalidade               │  │
│  │                                                      │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 13. Padrões de Código

### 13.1 Nomenclatura CSS
- **BEM-like:** `.ComponentName`, `.componentPart`
- **Estados:** `&.active`, `&.current`, `&:hover`
- **Variantes:** `&[data-state='active']`

### 13.2 Organização SCSS
```scss
// 1. Container/Page styles
// 2. Header styles
// 3. Main content styles
// 4. Component-specific styles
// 5. Form elements
// 6. Animations
// 7. Utility classes
```

---

## 14. Recomendações de Consistência

1. **Sempre usar variáveis CSS** para cores
2. **Border-radius padrão:** 8px (pequeno), 12px (médio), 16px (grande)
3. **Font-size padrão:** 13px para texto, 15px para títulos
4. **Transições:** 0.2s para interações normais, 100ms para feedback rápido
5. **Padding interno de inputs:** 10px 12px
6. **Gap entre elementos de formulário:** 10px
7. **Margin entre seções:** 20-24px

---

*Documento gerado para referência de design do projeto Liv*
