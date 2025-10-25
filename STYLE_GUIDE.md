# ContextDock UI Style Guide

This guide documents the TailwindCSS component classes and utilities available for building ContextDock's user interfaces.

## Setup

1. **Include the CSS**: Link the built styles in your HTML:
```html
<link rel="stylesheet" href="dist/styles.css">
```

2. **Enable dark mode** (optional): Add the `dark` class to a parent element:
```html
<body class="dark">
  <!-- Your UI here -->
</body>
```

3. **Load Inter font**: Add to your HTML head:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

## Base Typography

- **Font family**: Inter (system-ui fallback)
- **Base size**: 14px (sm) to 16px (base)
- **Line heights**: Optimized for readability
- **Font features**: Enabled for better rendering

## Component Classes

### Cards

```html
<!-- Basic card -->
<div class="contextdock-card">
  <h3>Card Title</h3>
  <p>Card content</p>
</div>

<!-- Elevated card -->
<div class="contextdock-card contextdock-card--elevated">
  <!-- Content -->
</div>

<!-- Interactive card (hover effects) -->
<div class="contextdock-card contextdock-card--interactive">
  <!-- Content -->
</div>
```

**Features:**
- Semi-transparent background with backdrop blur
- Rounded corners (2xl = 16px)
- Soft shadow with dark mode support
- Optional hover animations

### Buttons

```html
<!-- Primary button -->
<button class="contextdock-button contextdock-button--primary">
  Save Prompt
</button>

<!-- Secondary button -->
<button class="contextdock-button contextdock-button--secondary">
  Cancel
</button>

<!-- Ghost button -->
<button class="contextdock-button contextdock-button--ghost">
  Edit
</button>

<!-- Button sizes -->
<button class="contextdock-button contextdock-button--primary contextdock-button--small">
  Small
</button>

<button class="contextdock-button contextdock-button--primary contextdock-button--large">
  Large
</button>

<!-- Full width -->
<button class="contextdock-button contextdock-button--primary contextdock-button--full">
  Full Width
</button>
```

**Features:**
- Smooth transitions and hover glows
- Focus ring accessibility
- Consistent padding and typography
- Dark mode support

### Inputs

```html
<!-- Text input -->
<input type="text" class="contextdock-input" placeholder="Enter title">

<!-- Textarea -->
<textarea class="contextdock-textarea" rows="4">Content</textarea>

<!-- Error state -->
<input type="text" class="contextdock-input contextdock-input--error">
```

**Features:**
- Rounded corners matching buttons
- Smooth focus transitions
- Placeholder styling
- Error state styling

### Tags

```html
<!-- Basic tag -->
<span class="contextdock-tag">sales</span>

<!-- Primary tag -->
<span class="contextdock-tag contextdock-tag--primary">important</span>

<!-- Removable tag -->
<span class="contextdock-tag contextdock-tag--removable">
  tag name
  <button class="contextdock-tag__remove">×</button>
</span>
```

### List Items

```html
<!-- Basic list item -->
<div class="contextdock-list-item">
  <div class="contextdock-list-item__content">
    <div class="contextdock-list-item__title">Prompt Title</div>
    <div class="contextdock-list-item__subtitle">Last used 2 days ago</div>
  </div>
  <div class="contextdock-list-item__actions">
    <button>Edit</button>
  </div>
</div>

<!-- Active list item -->
<div class="contextdock-list-item contextdock-list-item--active">
  <!-- Content -->
</div>
```

### Modals

```html
<!-- Overlay -->
<div class="contextdock-overlay">
  <!-- Modal -->
  <div class="contextdock-modal">
    <div class="contextdock-modal__header">
      <h2 class="contextdock-modal__title">Save Prompt</h2>
      <p class="contextdock-modal__subtitle">Create a reusable prompt</p>
    </div>

    <div class="contextdock-modal__content">
      <!-- Form content -->
    </div>

    <div class="contextdock-modal__footer">
      <button class="contextdock-button contextdock-button--secondary">Cancel</button>
      <button class="contextdock-button contextdock-button--primary">Save</button>
    </div>
  </div>
</div>
```

## Utility Classes

### Layout

```html
<!-- Container with responsive padding -->
<div class="contextdock-container">
  <!-- Content -->
</div>

<!-- Responsive grid -->
<div class="contextdock-grid">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>

<!-- Flex utilities -->
<div class="contextdock-flex-center">
  <div>Centered content</div>
</div>

<div class="contextdock-flex-between">
  <div>Left</div>
  <div>Right</div>
</div>

<!-- Spacing utilities -->
<div class="contextdock-space-y">
  <div>Item with vertical spacing</div>
  <div>Item with vertical spacing</div>
</div>

<div class="contextdock-space-x">
  <div>Item with horizontal spacing</div>
  <div>Item with horizontal spacing</div>
</div>
```

### Focus and Accessibility

```html
<!-- Custom focus ring -->
<input class="contextdock-focus-ring">
```

### Scrollbars

```html
<!-- Custom scrollbar styling -->
<div class="contextdock-scrollbar">
  <!-- Scrollable content -->
</div>
```

## Extension-Specific Styles

```html
<!-- Extension popup container -->
<div class="contextdock-extension-popup">
  <!-- Popup content -->
</div>
```

## Color Palette

### Light Mode
- **Primary**: `#0ea5e9` (Sky-500)
- **Surface**: `#ffffff` (White)
- **Text**: `#0f172a` (Slate-900)
- **Secondary**: `#64748b` (Slate-500)
- **Border**: `#e2e8f0` (Slate-200)

### Dark Mode
- **Primary**: `#0ea5e9` (Sky-500)
- **Surface**: `#0f172a` (Slate-900)
- **Text**: `#f1f5f9` (Slate-100)
- **Secondary**: `#94a3b8` (Slate-400)
- **Border**: `#334155` (Slate-700)

## Usage Examples

### Prompt Management UI

```html
<div class="contextdock-card contextdock-space-y">
  <div class="contextdock-flex-between">
    <h3 class="text-lg font-semibold">My Prompts</h3>
    <button class="contextdock-button contextdock-button--primary">
      New Prompt
    </button>
  </div>

  <div class="space-y-2">
    <div class="contextdock-list-item">
      <div class="contextdock-list-item__content">
        <div class="contextdock-list-item__title">Friendly customer response</div>
        <div class="contextdock-list-item__subtitle">Used 5 times • Last: 2 days ago</div>
      </div>
      <div class="contextdock-list-item__actions">
        <button class="contextdock-button contextdock-button--ghost contextdock-button--small">Edit</button>
      </div>
    </div>
  </div>
</div>
```

### Save Modal

```html
<div class="contextdock-overlay">
  <div class="contextdock-modal">
    <div class="contextdock-modal__header">
      <h2 class="contextdock-modal__title">Save New Prompt</h2>
    </div>

    <div class="contextdock-modal__content contextdock-space-y">
      <div>
        <label class="block text-sm font-medium mb-2">Title</label>
        <input type="text" class="contextdock-input" placeholder="e.g., Friendly follow-up">
      </div>

      <div>
        <label class="block text-sm font-medium mb-2">Tags</label>
        <input type="text" class="contextdock-input" placeholder="sales, customer-service">
      </div>

      <div>
        <label class="block text-sm font-medium mb-2">Content</label>
        <textarea class="contextdock-textarea" rows="6" placeholder="Paste your prompt content here..."></textarea>
      </div>
    </div>

    <div class="contextdock-modal__footer">
      <button class="contextdock-button contextdock-button--secondary">Cancel</button>
      <button class="contextdock-button contextdock-button--primary">Save Prompt</button>
    </div>
  </div>
</div>
```

## Building and Development

```bash
# Install dependencies
npm install

# Build for development (watch mode)
npm run dev

# Build for production (minified)
npm run build:prod
```

The built CSS will be available at `dist/styles.css` and can be linked in your HTML files.
