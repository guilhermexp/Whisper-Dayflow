# UI/UX Design System Requirements Specification for Whispo

## 1. Executive Summary

This document specifies the requirements for implementing a comprehensive UI/UX redesign of Whispo, inspired by VoiceInk's polished visual design system and user interface patterns. The redesign will transform Whispo from a basic Electron application into a modern, professional desktop experience with native-feeling interactions, cohesive visual language, and intuitive navigation.

**Design Philosophy:**
- **Native-First**: Feel like a native macOS/Windows application, not a web app
- **Consistent**: Unified design language across all screens and components
- **Accessible**: WCAG 2.1 AA compliant with keyboard navigation support
- **Performant**: Smooth 60fps animations and transitions
- **Professional**: Clean, minimal design that inspires confidence

**Reference Implementation:** VoiceInk's SwiftUI-based interface adapted for Electron + React + Radix UI + Tailwind CSS stack.

---

## 2. Current State Analysis

### 2.1 Existing Whispo UI

**Current Implementation:**
- Basic Electron window with minimal styling
- Simple settings page (no navigation structure)
- Panel window for recording
- Limited visual feedback
- Inconsistent spacing and typography
- No cohesive design system

**Pain Points:**
- Feels like a web app, not a desktop app
- No clear navigation structure
- Inconsistent visual hierarchy
- Limited use of animations and transitions
- No visual branding or personality

### 2.2 VoiceInk Reference Design

**Key Visual Elements:**
- Sidebar navigation with app icon and menu items
- Clean, spacious layouts with generous padding
- Subtle animations and transitions
- SF Symbols-inspired iconography
- Native macOS visual effects (blur, shadows)
- Professional typography (SF Pro)
- Consistent color palette with accent colors
- Card-based component design
- Tab-based content organization

---

## 3. Functional Requirements

### 3.1 Navigation Architecture

**REQ-NAV-001**: WHEN the application launches THEN the system SHALL display a sidebar navigation structure with clearly defined sections

**REQ-NAV-002**: WHEN user clicks a navigation item THEN the system SHALL navigate to the corresponding view with smooth transition animation

**REQ-NAV-003**: WHEN viewing any screen THEN the sidebar SHALL remain persistent and indicate the current active section

**REQ-NAV-004**: WHEN sidebar items are numerous THEN the system SHALL support collapsible sections and scrolling

**REQ-NAV-005**: WHEN user preferences are set THEN the system SHALL remember last visited section and restore on next launch

#### Navigation Items Structure

**Required Navigation Sections:**
1. **Dashboard** - Overview and quick stats
2. **Recording** - Active recording interface
3. **History** - Transcription history
4. **Models** - Local model management
5. **Enhancement** - AI enhancement settings
6. **Settings** - Application settings
7. **About** - Version info and license

### 3.2 Visual Design System

**REQ-DESIGN-001**: WHEN displaying any UI element THEN the system SHALL use consistent design tokens for colors, typography, spacing, and shadows

**REQ-DESIGN-002**: WHEN switching between light and dark modes THEN all UI elements SHALL adapt seamlessly without layout shifts

**REQ-DESIGN-003**: WHEN hovering over interactive elements THEN the system SHALL provide immediate visual feedback (color change, elevation, cursor change)

**REQ-DESIGN-004**: WHEN performing actions THEN the system SHALL show appropriate loading states and transitions

**REQ-DESIGN-005**: WHEN displaying content THEN the system SHALL maintain consistent card-based layout patterns

#### Design Token Requirements

**Colors:**
- Primary brand color with light/dark variants
- Accent color for CTAs and highlights
- Semantic colors (success, warning, error, info)
- Neutral gray scale (10 shades minimum)
- Background layers (base, elevated, overlay)

**Typography:**
- Consistent font family (system fonts)
- Type scale (10-48px with 1.25 ratio)
- Font weights (regular, medium, semibold, bold)
- Line heights (1.2-1.8)
- Letter spacing for headings

**Spacing:**
- Consistent spacing scale (4px base unit)
- Common spacers (4, 8, 12, 16, 24, 32, 48, 64px)
- Component padding guidelines
- Section margins

**Shadows:**
- Subtle elevation shadows (3 levels)
- Focus rings for keyboard navigation
- Glow effects for active states

### 3.3 Component Library

**REQ-COMP-001**: WHEN building UI THEN the system SHALL use a consistent set of reusable components

**REQ-COMP-002**: WHEN components are used THEN they SHALL have predictable behavior and styling

**REQ-COMP-003**: WHEN components receive props THEN they SHALL handle all states (default, hover, active, disabled, loading, error)

**REQ-COMP-004**: WHEN components are nested THEN they SHALL maintain visual hierarchy

#### Required Components

**Navigation Components:**
- Sidebar
- SidebarItem
- SidebarSection
- AppHeader

**Layout Components:**
- Card
- Section
- Grid
- Stack (Horizontal/Vertical)
- Divider
- Spacer

**Content Components:**
- Typography (Heading, Text, Caption, Label)
- Icon
- Badge
- Avatar
- StatusIndicator

**Input Components:**
- Button (Primary, Secondary, Ghost, Danger)
- IconButton
- Input
- Textarea
- Select
- Switch
- Slider
- Radio
- Checkbox

**Feedback Components:**
- Toast
- Dialog
- Alert
- Progress
- Spinner
- Skeleton

**Data Display:**
- Table
- List
- EmptyState
- StatCard
- MetricDisplay

### 3.4 Sidebar Navigation UI

**REQ-SIDEBAR-001**: WHEN sidebar is displayed THEN it SHALL show:
- App icon and name at top
- Navigation items with icons and labels
- Active item highlighting
- Hover states for all items
- Smooth transitions between views

**REQ-SIDEBAR-002**: WHEN sidebar items are clicked THEN the system SHALL:
- Update active state immediately
- Animate content transition
- Update URL route (if applicable)
- Persist selection

**REQ-SIDEBAR-003**: WHEN sidebar is collapsed (future) THEN the system SHALL:
- Show only icons
- Display tooltips on hover
- Maintain all functionality

**REQ-SIDEBAR-004**: WHEN sidebar contains app branding THEN it SHALL:
- Display app icon (32x32px)
- Show app name with proper typography
- Include version badge or PRO indicator if applicable
- Provide subtle separator from navigation items

### 3.5 Layout Structure

**REQ-LAYOUT-001**: WHEN application window is displayed THEN the layout SHALL follow this structure:
```
┌─────────────────────────────────────────────┐
│ [Sidebar] | [Content Area]                 │
│           |                                 │
│  Nav      |  [Page Header]                 │
│  Items    |  [Page Content]                │
│           |                                 │
└─────────────────────────────────────────────┘
```

**REQ-LAYOUT-002**: WHEN window is resized THEN the system SHALL:
- Maintain sidebar width (210px default)
- Scale content area responsively
- Enforce minimum window size (940x730px)
- Handle overflow with scrolling

**REQ-LAYOUT-003**: WHEN content exceeds viewport THEN the system SHALL:
- Enable vertical scrolling on content area only
- Keep sidebar fixed
- Maintain header visibility (sticky)
- Show scroll indicators

### 3.6 Card-Based Component Design

**REQ-CARD-001**: WHEN displaying grouped content THEN the system SHALL use card components with:
- Subtle border (1px solid)
- Border radius (8-12px)
- Background color (layer above base)
- Padding (16-24px)
- Optional header and footer sections

**REQ-CARD-002**: WHEN cards are interactive THEN they SHALL:
- Show hover state (border color change, slight elevation)
- Support click actions
- Provide focus states for keyboard navigation
- Use cursor pointer when clickable

**REQ-CARD-003**: WHEN cards contain sections THEN they SHALL:
- Use dividers between sections
- Maintain consistent internal spacing
- Support collapsible sections
- Include action buttons in footer

### 3.7 Typography System

**REQ-TYPE-001**: WHEN displaying text THEN the system SHALL use consistent typography scale:
- Display: 48px, bold (page titles, marketing)
- H1: 32px, bold (main page headers)
- H2: 24px, semibold (section headers)
- H3: 20px, semibold (subsection headers)
- H4: 18px, medium (card headers)
- Body: 14px, regular (primary content)
- Caption: 12px, regular (secondary content)
- Label: 12px, medium (form labels, badges)

**REQ-TYPE-002**: WHEN text has semantic meaning THEN the system SHALL apply appropriate colors:
- Primary: default text color
- Secondary: 60% opacity
- Tertiary: 40% opacity
- Accent: brand color
- Success: green
- Warning: orange
- Error: red

**REQ-TYPE-003**: WHEN text needs emphasis THEN the system SHALL use:
- Font weight variation (not size)
- Color for semantic meaning
- Background highlights sparingly
- Proper heading hierarchy

### 3.8 Color Palette

**REQ-COLOR-001**: WHEN defining color palette THEN the system SHALL include:

**Light Mode:**
- Background: #FFFFFF
- Surface: #F9FAFB
- Surface Elevated: #FFFFFF with shadow
- Border: #E5E7EB
- Text Primary: #111827
- Text Secondary: #6B7280
- Text Tertiary: #9CA3AF
- Accent: #3B82F6 (blue)
- Success: #10B981 (green)
- Warning: #F59E0B (amber)
- Error: #EF4444 (red)

**Dark Mode:**
- Background: #111827
- Surface: #1F2937
- Surface Elevated: #374151
- Border: #374151
- Text Primary: #F9FAFB
- Text Secondary: #D1D5DB
- Text Tertiary: #9CA3AF
- Accent: #60A5FA (lighter blue)
- Success: #34D399 (lighter green)
- Warning: #FBBF24 (lighter amber)
- Error: #F87171 (lighter red)

**REQ-COLOR-002**: WHEN using colors THEN the system SHALL:
- Ensure WCAG AA contrast ratios (4.5:1 for text)
- Provide color-blind friendly alternatives
- Use semantic color names, not hex values directly
- Support custom accent color configuration

### 3.9 Animation and Transitions

**REQ-ANIM-001**: WHEN navigating between views THEN the system SHALL:
- Fade in new content (200ms ease-out)
- Slide content slightly (8px vertical offset)
- Stagger list item animations (50ms delay each)
- Maintain 60fps performance

**REQ-ANIM-002**: WHEN hovering over interactive elements THEN the system SHALL:
- Transition color changes (150ms ease-in-out)
- Scale buttons slightly (1.02x, 100ms)
- Show elevation changes (200ms ease-out)
- Change cursor appropriately

**REQ-ANIM-003**: WHEN showing/hiding elements THEN the system SHALL:
- Use opacity transitions (200ms)
- Combine with scale or slide (300ms total)
- Support reduced motion preference
- Never block interactions during animations

**REQ-ANIM-004**: WHEN loading content THEN the system SHALL:
- Show skeleton screens for slow loads (>500ms)
- Use spinner for quick operations (<500ms)
- Animate progress bars smoothly
- Provide feedback for long operations

### 3.10 Icon System

**REQ-ICON-001**: WHEN displaying icons THEN the system SHALL use:
- Lucide Icons (or similar consistent icon library)
- Standard sizes: 16px, 20px, 24px, 32px
- Consistent stroke width (2px)
- Proper semantic naming
- Accessibility labels

**REQ-ICON-002**: WHEN icons are interactive THEN they SHALL:
- Include hover states
- Support focus indicators
- Have proper click targets (44x44px minimum)
- Show active states for toggles

**REQ-ICON-003**: WHEN icons accompany text THEN they SHALL:
- Align vertically centered
- Use consistent spacing (8px gap)
- Match text color and opacity
- Scale proportionally

### 3.11 Spacing and Layout Grid

**REQ-SPACING-001**: WHEN laying out components THEN the system SHALL use 4px base unit:
- xs: 4px
- sm: 8px
- md: 12px
- base: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px
- 3xl: 64px

**REQ-SPACING-002**: WHEN creating responsive layouts THEN the system SHALL:
- Use max-width containers (1280px)
- Apply consistent horizontal padding (24px)
- Maintain vertical rhythm (24px sections)
- Use grid system (12 columns) when appropriate

**REQ-SPACING-003**: WHEN stacking elements THEN the system SHALL:
- Use Stack components for consistent gaps
- Apply proper section margins
- Maintain visual hierarchy through spacing
- Group related elements with tighter spacing

### 3.12 Accessibility

**REQ-A11Y-001**: WHEN building UI THEN the system SHALL support:
- Keyboard navigation (Tab, Arrow keys, Enter, Escape)
- Screen reader announcements (ARIA labels)
- Focus management (visible focus rings)
- Reduced motion preference
- High contrast mode
- Scalable text (200% zoom support)

**REQ-A11Y-002**: WHEN focus moves THEN the system SHALL:
- Show clear focus indicators (2px accent ring)
- Follow logical tab order
- Trap focus in modals
- Return focus to trigger element on close
- Skip navigation links for main content

**REQ-A11Y-003**: WHEN providing feedback THEN the system SHALL:
- Use color AND text/icons for status
- Announce dynamic content changes
- Provide text alternatives for images/icons
- Support keyboard shortcuts with hints

### 3.13 Responsive Design

**REQ-RESP-001**: WHEN window width changes THEN the system SHALL:
- Maintain sidebar at fixed width (210px)
- Scale content area proportionally
- Enforce minimum width (940px)
- Show horizontal scrollbar if needed (last resort)

**REQ-RESP-002**: WHEN content doesn't fit THEN the system SHALL:
- Use vertical scrolling (preferred)
- Support horizontal scrolling for tables
- Collapse less important information
- Provide overflow indicators

**REQ-RESP-003**: WHEN on different screen densities THEN the system SHALL:
- Support 1x, 2x, 3x scaling
- Use vector icons
- Provide sharp text rendering
- Scale UI proportionally

---

## 4. UI Component Specifications

### 4.1 Sidebar Component

**File:** `src/renderer/src/components/layout/Sidebar.tsx`

**Structure:**
```tsx
<aside className="sidebar">
  <SidebarHeader />
  <SidebarNav>
    <SidebarSection>
      <SidebarItem />
      <SidebarItem />
    </SidebarSection>
    <SidebarSection>
      <SidebarItem />
    </SidebarSection>
  </SidebarNav>
  <SidebarFooter />
</aside>
```

**Specifications:**
- Width: 210px (fixed)
- Background: Surface color
- Border right: 1px solid border color
- Padding: 16px vertical, 12px horizontal
- Height: 100vh (full height)
- Position: Fixed left

**SidebarHeader:**
```tsx
<div className="sidebar-header">
  <img src="/icon.png" className="app-icon" />
  <div className="app-info">
    <h1 className="app-name">Whispo</h1>
    {isPro && <Badge variant="pro">PRO</Badge>}
  </div>
</div>
```

**SidebarItem:**
```tsx
<button className={cn(
  "sidebar-item",
  isActive && "active",
  isDisabled && "disabled"
)}>
  <Icon name={icon} size={18} />
  <span>{label}</span>
</button>
```

**States:**
- Default: Gray text, transparent background
- Hover: Primary text, surface elevated background
- Active: Accent color, accent background (10% opacity)
- Disabled: 40% opacity, cursor not-allowed

### 4.2 Card Component

**File:** `src/renderer/src/components/ui/Card.tsx`

**Structure:**
```tsx
<div className={cn("card", variant, className)}>
  {header && (
    <div className="card-header">
      {header}
    </div>
  )}
  <div className="card-content">
    {children}
  </div>
  {footer && (
    <div className="card-footer">
      {footer}
    </div>
  )}
</div>
```

**Specifications:**
- Border: 1px solid border color
- Border radius: 12px
- Background: Surface color
- Padding: 20px
- Shadow: None (default), subtle on hover (if interactive)

**Variants:**
- default: Standard card
- elevated: Includes shadow
- interactive: Hover effects enabled
- compact: Reduced padding (12px)

### 4.3 Button Component

**File:** `src/renderer/src/components/ui/Button.tsx`

**Variants:**

**Primary:**
- Background: Accent color
- Text: White
- Hover: Accent darker (10%)
- Active: Accent darker (20%)

**Secondary:**
- Background: Surface elevated
- Text: Primary text
- Border: 1px solid border
- Hover: Surface elevated + accent tint

**Ghost:**
- Background: Transparent
- Text: Primary text
- Hover: Surface elevated background

**Danger:**
- Background: Error color
- Text: White
- Hover: Error darker

**Specifications:**
- Height: 36px (default), 32px (small), 44px (large)
- Padding: 12px horizontal, 8px vertical
- Border radius: 8px
- Font: 14px medium
- Transition: All properties 150ms ease-in-out

### 4.4 Typography Components

**Heading Component:**
```tsx
<Heading level={1} className="...">
  {children}
</Heading>
```

**Levels:**
- h1: 32px bold, 1.2 line-height, -0.02em letter-spacing
- h2: 24px semibold, 1.3 line-height
- h3: 20px semibold, 1.4 line-height
- h4: 18px medium, 1.4 line-height

**Text Component:**
```tsx
<Text variant="body" color="primary">
  {children}
</Text>
```

**Variants:**
- body: 14px regular
- caption: 12px regular
- label: 12px medium

**Colors:**
- primary: Full opacity
- secondary: 60% opacity
- tertiary: 40% opacity
- accent: Accent color
- success/warning/error: Semantic colors

---

## 5. Layout Wireframes

### Main Application Window

```
┌──────────────────────────────────────────────────────────────┐
│  Whispo                                          ○ ○ ○       │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                    │
│  ┌────┐  │  Dashboard                                        │
│  │Icon│  │  ─────────────────────────────────────────────   │
│  └────┘  │                                                    │
│  Whispo  │  ┌─ Recording Stats ───────────┐                 │
│  v2.0.0  │  │  Total: 142                 │                 │
│          │  │  This Week: 23              │                 │
│  ────────│  │  Average: 3.2/day           │                 │
│          │  └─────────────────────────────┘                 │
│  󰋜 Dash  │                                                    │
│  󰕿 Record│  ┌─ Recent Transcriptions ────┐                 │
│  󰈙 History│  │  • Team meeting notes      │                 │
│  󱚝 Models│  │  • Email to John           │                 │
│  󰠮 Enhance│  │  • Code review comments    │                 │
│  󰒓 Settings│ └────────────────────────────┘                 │
│          │                                                    │
│          │                                                    │
│  ────────│                                                    │
│          │                                                    │
│  About   │                                                    │
│          │                                                    │
└──────────┴────────────────────────────────────────────────────┘
  210px      Remaining width (min 730px)
```

### Settings Page Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Settings                                                     │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─ General ────────────────────────────────────────────┐   │
│  │                                                       │   │
│  │  Recording Hotkey                                    │   │
│  │  ○ Hold Ctrl  ◉ Ctrl+/  ○ Fn Key                    │   │
│  │                                                       │   │
│  │  ─────────────────────────────────────────────────   │   │
│  │                                                       │   │
│  │  Hide Dock Icon                            [Toggle]  │   │
│  │  Launch at Login                           [Toggle]  │   │
│  │                                                       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ Providers ──────────────────────────────────────────┐   │
│  │                                                       │   │
│  │  Speech-to-Text Provider                             │   │
│  │  [OpenAI ▼]                                          │   │
│  │                                                       │   │
│  │  OpenAI API Key                                      │   │
│  │  [sk-...                                    ]        │   │
│  │                                                       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### History Page Layout

```
┌──────────────────────────────────────────────────────────────┐
│  History                                   [Search...] [⚙]   │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─ Team meeting notes ─────────────────── 2 hours ago ───┐  │
│  │  Let's discuss the new feature roadmap for Q1...       │  │
│  │                                                         │  │
│  │  Enhanced • 234 chars • OpenAI               [⋮ Menu] │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Email to John ──────────────────────── 5 hours ago ───┐  │
│  │  Hi John, following up on our conversation about...    │  │
│  │                                                         │  │
│  │  Original • 156 chars • Groq                 [⋮ Menu] │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Code review comments ──────────────── Yesterday ──────┐  │
│  │  The implementation looks good but there are a few...  │  │
│  │                                                         │  │
│  │  Enhanced • 412 chars • OpenAI               [⋮ Menu] │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│                        [Load More]                            │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## 6. Design System Implementation

### 6.1 Tailwind Configuration

**File:** `tailwind.config.ts`

```typescript
export default {
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        // ... full color system
      },
      fontSize: {
        'display': ['48px', { lineHeight: '1.2', fontWeight: '700' }],
        'h1': ['32px', { lineHeight: '1.2', fontWeight: '700' }],
        'h2': ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        'h3': ['20px', { lineHeight: '1.4', fontWeight: '600' }],
        'h4': ['18px', { lineHeight: '1.4', fontWeight: '500' }],
        'body': ['14px', { lineHeight: '1.6', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '1.5', fontWeight: '400' }],
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '12px',
        'base': '16px',
        'lg': '24px',
        'xl': '32px',
        '2xl': '48px',
        '3xl': '64px',
      },
      borderRadius: {
        'sm': '6px',
        'DEFAULT': '8px',
        'lg': '12px',
        'xl': '16px',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'DEFAULT': '0 1px 3px 0 rgb(0 0 0 / 0.1)',
        'md': '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        'lg': '0 10px 15px -3px rgb(0 0 0 / 0.1)',
      },
    },
  },
}
```

### 6.2 CSS Variables

**File:** `src/renderer/src/index.css`

```css
@layer base {
  :root {
    /* Light mode */
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --surface: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    
    --accent: 217.2 91.2% 59.8%;
    --accent-foreground: 222.2 47.4% 11.2%;
    
    --success: 142.1 76.2% 36.3%;
    --warning: 32.2 94.6% 43.7%;
    --error: 0 84.2% 60.2%;
    
    --radius: 0.5rem;
  }
  
  .dark {
    /* Dark mode */
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --surface: 217.2 32.6% 17.5%;
    --border: 217.2 32.6% 17.5%;
    
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    
    --accent: 217.2 91.2% 69.8%;
    --accent-foreground: 222.2 47.4% 11.2%;
    
    --success: 142.1 70.6% 45.3%;
    --warning: 32.2 95.6% 53.7%;
    --error: 0 72.2% 70.6%;
  }
}
```

---

## 7. Implementation Checklist

### Phase 1: Design System Foundation (Week 1)
- [ ] Set up Tailwind config with design tokens
- [ ] Define CSS variables for theming
- [ ] Create typography system
- [ ] Implement color palette
- [ ] Set up spacing scale
- [ ] Configure dark mode support

### Phase 2: Base Components (Week 2)
- [ ] Button component (all variants)
- [ ] Card component
- [ ] Typography components (Heading, Text)
- [ ] Icon system integration
- [ ] Stack/Grid layout components
- [ ] Divider and Spacer components

### Phase 3: Navigation & Layout (Week 3)
- [ ] Sidebar component
- [ ] SidebarItem component
- [ ] AppLayout wrapper
- [ ] Page header component
- [ ] Navigation state management
- [ ] Route transitions

### Phase 4: Advanced Components (Week 4)
- [ ] Input components (all types)
- [ ] Dialog/Modal components
- [ ] Toast notifications
- [ ] Progress indicators
- [ ] Skeleton loaders
- [ ] Empty states

### Phase 5: Page Redesigns (Week 5-6)
- [ ] Dashboard page
- [ ] Settings page
- [ ] History page
- [ ] Models page
- [ ] Enhancement page
- [ ] About page

### Phase 6: Polish & Accessibility (Week 7)
- [ ] Animation polish
- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] Focus management
- [ ] Reduced motion support
- [ ] High contrast mode

### Phase 7: Testing & Documentation (Week 8)
- [ ] Component documentation
- [ ] Storybook setup
- [ ] Visual regression tests
- [ ] Accessibility audit
- [ ] Performance optimization
- [ ] User guide update

---

## 8. Success Metrics

### Visual Quality
- [ ] Consistent spacing across all screens (100%)
- [ ] Proper color contrast ratios (WCAG AA)
- [ ] Smooth 60fps animations
- [ ] No layout shifts on load

### User Experience
- [ ] Reduced clicks to common actions (25% improvement)
- [ ] Faster task completion (30% improvement)
- [ ] Higher user satisfaction scores (4.5/5)
- [ ] Lower bounce rate on first launch (50% reduction)

### Technical
- [ ] Component reusability (80% coverage)
- [ ] Design token usage (100% compliance)
- [ ] Accessibility compliance (WCAG 2.1 AA)
- [ ] Performance budget maintained (<100ms TTI increase)

---

## 9. VoiceInk Design References

### Sidebar Navigation
- Fixed 210px width
- App icon + name header
- Grouped navigation items
- Hover and active states
- Professional spacing

### Card Design
- Subtle borders, no heavy shadows
- Generous padding (20-24px)
- Clear visual hierarchy
- Hover effects for interactivity

### Color Usage
- Minimal color palette
- Accent color for CTAs and highlights
- Gray scale for hierarchy
- Semantic colors for status

### Typography
- System fonts (SF Pro on macOS)
- Clear hierarchy through size and weight
- Consistent line heights
- Proper letter spacing

### Animations
- Subtle, purposeful transitions
- 200-300ms duration
- Ease-out for entrances
- No gratuitous effects

---

**Document Version:** 1.0  
**Last Updated:** January 2025  
**Next Review:** Q2 2025  
**Owner:** Whispo UI/UX Team

---

## 10. Component Implementation Examples

### 10.1 Sidebar Implementation

**File:** `src/renderer/src/components/layout/Sidebar.tsx`

```tsx
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Mic,
  History,
  Brain,
  Sparkles,
  Settings,
  Info,
} from 'lucide-react'

interface NavItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  path: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { id: 'recording', label: 'Recording', icon: Mic, path: '/recording' },
  { id: 'history', label: 'History', icon: History, path: '/history' },
  { id: 'models', label: 'Models', icon: Brain, path: '/models' },
  { id: 'enhancement', label: 'Enhancement', icon: Sparkles, path: '/enhancement' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
  { id: 'about', label: 'About', icon: Info, path: '/about' },
]

export function Sidebar() {
  const location = useLocation()
  const appVersion = '2.0.0'
  
  return (
    <aside className="w-[210px] h-screen border-r bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <img 
            src="/icon.png" 
            alt="Whispo" 
            className="w-8 h-8 rounded-lg"
          />
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold">Whispo</h1>
            <span className="text-xs text-muted-foreground">v{appVersion}</span>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path
          const Icon = item.icon
          
          return (
            <Link
              key={item.id}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg",
                "text-sm font-medium transition-all duration-150",
                "hover:bg-accent/10 hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                isActive && "bg-accent/10 text-accent"
              )}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      
      {/* Footer (optional) */}
      <div className="p-3 border-t text-xs text-muted-foreground">
        <a 
          href="https://whispo.app" 
          className="hover:text-foreground transition-colors"
        >
          whispo.app
        </a>
      </div>
    </aside>
  )
}
```

### 10.2 Card Component Implementation

**File:** `src/renderer/src/components/ui/Card.tsx`

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'interactive' | 'compact'
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border bg-card text-card-foreground",
          variant === 'default' && "p-5",
          variant === 'elevated' && "p-5 shadow-md",
          variant === 'interactive' && "p-5 hover:border-accent hover:shadow-sm transition-all cursor-pointer",
          variant === 'compact' && "p-3",
          className
        )}
        {...props}
      />
    )
  }
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 pb-4", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, children, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  >
    {children}
  </h3>
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center pt-4 border-t", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
```

### 10.3 Typography Components

**File:** `src/renderer/src/components/ui/Typography.tsx`

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

type HeadingLevel = 1 | 2 | 3 | 4
type TextVariant = 'body' | 'caption' | 'label'
type TextColor = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'success' | 'warning' | 'error'

interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level: HeadingLevel
}

export const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ level, className, children, ...props }, ref) => {
    const Tag = `h${level}` as keyof JSX.IntrinsicElements
    
    const styles = {
      1: "text-h1 font-bold",
      2: "text-h2 font-semibold",
      3: "text-h3 font-semibold",
      4: "text-h4 font-medium",
    }
    
    return (
      <Tag
        ref={ref as any}
        className={cn(styles[level], className)}
        {...props}
      >
        {children}
      </Tag>
    )
  }
)
Heading.displayName = "Heading"

interface TextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  variant?: TextVariant
  color?: TextColor
}

export const Text = React.forwardRef<HTMLParagraphElement, TextProps>(
  ({ variant = 'body', color = 'primary', className, children, ...props }, ref) => {
    const variantStyles = {
      body: "text-body",
      caption: "text-caption",
      label: "text-xs font-medium",
    }
    
    const colorStyles = {
      primary: "text-foreground",
      secondary: "text-muted-foreground",
      tertiary: "text-muted-foreground/60",
      accent: "text-accent",
      success: "text-green-600 dark:text-green-400",
      warning: "text-amber-600 dark:text-amber-400",
      error: "text-red-600 dark:text-red-400",
    }
    
    return (
      <p
        ref={ref}
        className={cn(variantStyles[variant], colorStyles[color], className)}
        {...props}
      >
        {children}
      </p>
    )
  }
)
Text.displayName = "Text"
```

### 10.4 AppLayout Component

**File:** `src/renderer/src/components/layout/AppLayout.tsx`

```tsx
import { Sidebar } from './Sidebar'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="container max-w-screen-xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  )
}

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6 pb-4 border-b">
      <div className="space-y-1">
        <h1 className="text-h1 font-bold">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}
```

---

## 11. VoiceInk to Whispo Design Mapping

### UI Component Mapping

| VoiceInk (SwiftUI) | Whispo (React + Radix UI) | Notes |
|---|---|---|
| `NavigationSplitView` | `AppLayout` with Sidebar | Split layout pattern |
| `List(.sidebar)` | `Sidebar` component | Navigation list |
| `NavigationLink` | React Router `Link` | Navigation items |
| `Section` | `<div className="space-y-4">` | Visual grouping |
| `VStack` / `HStack` | `flex flex-col` / `flex` | Layout primitives |
| `Text` with modifiers | `Text` component | Typography |
| `Button` | Radix `Button` | Interactive buttons |
| `Toggle` | Radix `Switch` | Toggle switches |
| `Picker` | Radix `Select` | Dropdowns |
| `.background()` | `bg-*` Tailwind classes | Background colors |
| `.padding()` | `p-*` Tailwind classes | Spacing |
| `.cornerRadius()` | `rounded-*` Tailwind | Border radius |
| `.shadow()` | `shadow-*` Tailwind | Elevations |

### Design Token Mapping

| VoiceInk Token | Whispo Equivalent | Implementation |
|---|---|---|
| System font (SF Pro) | System font stack | `font-sans` |
| `.primary` color | `--foreground` | CSS variable |
| `.secondary` color | `--muted-foreground` | CSS variable |
| `.accentColor` | `--accent` | CSS variable |
| `.background` | `--background` | CSS variable |
| Sidebar width: 210pt | `w-[210px]` | Fixed width |
| Card padding: 20pt | `p-5` (20px) | Consistent spacing |
| Border radius: 10pt | `rounded-lg` (12px) | Slightly adjusted |
| Font size: 14pt | `text-sm` (14px) | Same size |

### Animation Mapping

| VoiceInk Animation | Whispo Equivalent | CSS Implementation |
|---|---|---|
| `.animation(.default)` | `transition-all duration-150` | Standard transition |
| `.animation(.easeInOut)` | `ease-in-out` | Timing function |
| View transitions | React Router transitions | Route-level |
| Hover effects | `hover:*` Tailwind | Pseudo-class |
| `.opacity()` | `opacity-*` | Opacity utility |
| `.scaleEffect()` | `scale-*` | Transform scale |

### Layout Pattern Mapping

| VoiceInk Pattern | Whispo Pattern | Example |
|---|---|---|
| Sidebar + Detail | Sidebar + Main | `<div className="flex">` |
| Card grid | CSS Grid | `grid grid-cols-2 gap-4` |
| Stacked content | Flexbox column | `flex flex-col space-y-4` |
| Form layout | Form with labels | Standard HTML form |
| Tab view | Radix Tabs | Tab component |
| Modal overlay | Radix Dialog | Dialog component |

---

## 12. Page Redesign Examples

### 12.1 Dashboard Page

**File:** `src/renderer/src/pages/Dashboard.tsx`

```tsx
import { AppLayout, PageHeader } from '@/components/layout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Text } from '@/components/ui/Typography'
import { useQuery } from '@tanstack/react-query'
import { tipcClient } from '@/lib/tipc-client'

export function DashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => tipcClient.getStats()
  })
  
  return (
    <AppLayout>
      <PageHeader 
        title="Dashboard"
        description="Overview of your transcription activity"
      />
      
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-h4">Total Transcriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{stats?.total ?? 0}</p>
            <Text variant="caption" color="secondary">All time</Text>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-h4">This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{stats?.thisWeek ?? 0}</p>
            <Text variant="caption" color="success">
              +{stats?.weekGrowth ?? 0}% from last week
            </Text>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-h4">Average/Day</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">
              {stats?.avgPerDay?.toFixed(1) ?? '0.0'}
            </p>
            <Text variant="caption" color="secondary">Last 30 days</Text>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Recent transcriptions list */}
        </CardContent>
      </Card>
    </AppLayout>
  )
}
```

### 12.2 Settings Page Redesign

**File:** `src/renderer/src/pages/Settings.tsx`

```tsx
import { AppLayout, PageHeader } from '@/components/layout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Input } from '@/components/ui/Input'

export function SettingsPage() {
  return (
    <AppLayout>
      <PageHeader 
        title="Settings"
        description="Configure Whispo to your preferences"
      />
      
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Recording Hotkey</Label>
              <div className="flex gap-2">
                <Button variant="outline">Hold Ctrl</Button>
                <Button variant="default">Ctrl + /</Button>
                <Button variant="outline">Fn Key</Button>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Hide Dock Icon</Label>
                <Text variant="caption" color="secondary">
                  Hide app from dock when minimized
                </Text>
              </div>
              <Switch />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Launch at Login</Label>
                <Text variant="caption" color="secondary">
                  Start Whispo when you log in
                </Text>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Providers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Speech-to-Text Provider</Label>
              <Select defaultValue="openai">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="groq">Groq</SelectItem>
                  <SelectItem value="local">Local Model</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>OpenAI API Key</Label>
              <Input 
                type="password" 
                placeholder="sk-..." 
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
```

---

## 13. Animation System

### 13.1 Transition Utilities

**File:** `src/renderer/src/lib/animations.ts`

```typescript
export const animations = {
  // Page transitions
  pageEnter: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: 0.2, ease: 'easeOut' }
  },
  
  // Modal transitions
  modalEnter: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.15, ease: 'easeOut' }
  },
  
  // List stagger
  listStagger: {
    container: {
      animate: {
        transition: {
          staggerChildren: 0.05
        }
      }
    },
    item: {
      initial: { opacity: 0, x: -8 },
      animate: { opacity: 1, x: 0 }
    }
  }
}

// Tailwind animation classes
export const tw = {
  transition: {
    default: 'transition-all duration-150 ease-in-out',
    fast: 'transition-all duration-100 ease-out',
    slow: 'transition-all duration-300 ease-in-out',
  },
  hover: {
    scale: 'hover:scale-[1.02]',
    lift: 'hover:-translate-y-0.5 hover:shadow-md',
    opacity: 'hover:opacity-80',
  }
}
```

### 13.2 Framer Motion Page Wrapper

**File:** `src/renderer/src/components/layout/AnimatedPage.tsx`

```tsx
import { motion } from 'framer-motion'
import { animations } from '@/lib/animations'

export function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={animations.pageEnter.initial}
      animate={animations.pageEnter.animate}
      exit={animations.pageEnter.exit}
      transition={animations.pageEnter.transition}
    >
      {children}
    </motion.div>
  )
}
```

---

## 14. Accessibility Implementation

### 14.1 Focus Management

**File:** `src/renderer/src/hooks/useFocusTrap.ts`

```typescript
import { useEffect, useRef } from 'react'

export function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (!isActive) return
    
    const container = containerRef.current
    if (!container) return
    
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    
    const firstElement = focusableElements[0] as HTMLElement
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }
    
    container.addEventListener('keydown', handleKeyDown)
    firstElement?.focus()
    
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
    }
  }, [isActive])
  
  return containerRef
}
```

### 14.2 Keyboard Navigation Hook

**File:** `src/renderer/src/hooks/useKeyboardNav.ts`

```typescript
import { useEffect } from 'react'

interface KeyboardNavOptions {
  onArrowUp?: () => void
  onArrowDown?: () => void
  onEnter?: () => void
  onEscape?: () => void
  enabled?: boolean
}

export function useKeyboardNav(options: KeyboardNavOptions) {
  const { onArrowUp, onArrowDown, onEnter, onEscape, enabled = true } = options
  
  useEffect(() => {
    if (!enabled) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          onArrowUp?.()
          break
        case 'ArrowDown':
          e.preventDefault()
          onArrowDown?.()
          break
        case 'Enter':
          onEnter?.()
          break
        case 'Escape':
          onEscape?.()
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onArrowUp, onArrowDown, onEnter, onEscape])
}
```

---

## 15. Conclusion

This comprehensive UI/UX Design System specification provides a complete blueprint for transforming Whispo into a professional, native-feeling desktop application inspired by VoiceInk's polished design.

**Key Achievements:**
- Complete design system with consistent tokens
- Comprehensive component library
- VoiceInk-inspired navigation structure
- Production-ready code examples
- Accessibility-first approach
- Performance-optimized animations

**Implementation Timeline:** 8 weeks
**Expected Outcome:** Professional desktop app with 4.5/5+ user satisfaction

By following this specification, Whispo will achieve visual parity with VoiceInk while maintaining its unique identity and cross-platform capabilities.