# Broken UI Finder

**Detect broken UI before your users do.**

A Chrome extension for frontend developers that scans any webpage for common UI issues and displays results directly in the popup — no DevTools required.

---

## Features

Results are organized in three tabs. Each check card shows a type pill, key metrics inline, and helpful tips specific to the issue.

### Tab: Layout

**Horizontal Overflow**
Finds elements extending beyond the viewport. Shows how many pixels the element overflows.
→ Highlight scrolls to the element on the page

**Images Missing Width/Height**
Finds images without explicit dimensions that cause Layout Shifts (CLS).
Important for Core Web Vitals & performance.

**Responsive Check (Light)**
Checks whether a correct `<meta name="viewport">` tag is present. Finds elements with hardcoded `px` widths above 375px.
→ Copy button copies the issue text

**Z-Index / Layering**
Finds positioned elements with high z-index (> 99), sorted by value. Also finds `position: fixed` or `sticky` elements without any z-index — a common cause of layering bugs. Includes a bar chart visualization.
→ Highlight scrolls to the element on the page

### Tab: A11y

**Missing Alt Attributes**
Finds all `<img>` elements without alternative text. Critical for accessibility and SEO.
→ Copy button copies the image URL · Highlight scrolls to the element on the page

**Contrast Check (WCAG AA)**
Calculates the contrast ratio between text color and background color via `getComputedStyle`. Normal text: minimum 4.5:1 · Large text (≥ 18px or ≥ 14px bold): minimum 3:1. Shows foreground/background color swatches and a text preview.
→ Highlight scrolls to the element on the page

**Missing Form Labels**
Finds `<input>`, `<textarea>`, and `<select>` elements without an associated label. Checks: `aria-label`, `aria-labelledby`, `<label for="id">`, and parent `<label>`.
→ Highlight scrolls to the element on the page

**Hidden Buttons & Links**
Finds interactive elements hidden via CSS (`display: none`, `visibility: hidden`, `opacity: 0`, zero dimensions).
→ Copy button copies the CSS selector for use in DevTools

### Tab: Struktur

**Broken Links**
Finds `<a>` elements with no `href`, empty `href=""`, or `href="#"`. Items with `href="#"` include a tip to use a `<button>` element instead.
→ Highlight scrolls to the element on the page

**Duplicate IDs**
Finds all `id` attributes that appear more than once in the DOM. Shows the duplicate count. Duplicates break anchor links, `querySelector`, and accessibility.
→ Highlight scrolls to the first occurrence on the page

---

## Usage

1. Load the extension in Chrome (`chrome://extensions` → Developer mode → **Load unpacked** → select folder)
2. Open any webpage
3. Click the extension icon in the toolbar
4. Click **"Seite scannen"** (Scan page)
5. Results appear in the popup, organized by tab

The three tabs (Layout / A11y / Struktur) appear after the first scan. Each tab shows a badge with the number of issues found. Cards with no issues are sorted to the top.

---

## List Item Interaction

- By default **5 entries** are shown per check
- If more exist, an **"X weitere anzeigen" (Show X more)** button appears
- Expandable items show a **Highlight** button (dark blue) and a **Copy** button (gray) side by side
- **Highlight** scrolls to the affected element and shows a floating pink **"BUI #01"** badge for 2.5 seconds
- **Copy** copies the associated value (URL, selector, etc.) to the clipboard
- Items are marked with status icons: red circle-! for errors, orange triangle-! for warnings

Scan results persist when the popup is closed and reopened. Results are cleared automatically when you navigate to a different URL or tab.

---

## Feedback

A **"Feedback geben"** button is available in the popup. Clicking it opens a pre-filled GitHub Issue in your browser — describe your bug or feature request and click "Submit new issue".

---

## Project Structure

```
Broken UI Finder/
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── store-screenshots/  — HTML mockup files for store listing
├── manifest.json       — Extension config (Manifest V3)
├── popup.html          — Extension UI
├── popup.css           — Styles
├── popup.js            — Scan logic & UI rendering
```

---

## Technical

- **Manifest V3** — current Chrome extension API
- **Permissions:** `activeTab`, `scripting`, `storage` — no persistent page access beyond scan results
- Runs entirely **locally** — no data is sent externally
- Browser extension elements (e.g. custom sidebar elements) are filtered out from results
- To publish: a Chrome Web Store developer account is required (one-time fee of $5)
