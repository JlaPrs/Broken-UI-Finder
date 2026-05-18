const VISIBLE_COUNT = 5;
// TODO: nach dem ersten GitHub-Push mit der echten Repo-URL ersetzen
const GITHUB_REPO = "https://github.com/dein-username/broken-ui-finder";

// ─── Feedback Modal ───────────────────────────────────────────────────────────
const feedbackModal   = document.getElementById("feedbackModal");
const feedbackTrigger = document.getElementById("feedbackTrigger");
const closeModal      = document.getElementById("closeModal");
const submitFeedback  = document.getElementById("submitFeedback");
const feedbackText    = document.getElementById("feedbackText");

feedbackTrigger.addEventListener("click", () => {
  feedbackModal.hidden = false;
  feedbackText.focus();
});

closeModal.addEventListener("click", () => { feedbackModal.hidden = true; });

feedbackModal.addEventListener("click", (e) => {
  if (e.target === feedbackModal) feedbackModal.hidden = true;
});

submitFeedback.addEventListener("click", () => {
  const text = feedbackText.value.trim();
  if (!text) return;
  const title = encodeURIComponent("Feedback: Broken UI Finder");
  const body = encodeURIComponent(`**Feedback:**\n\n${text}`);
  chrome.tabs.create({ url: `${GITHUB_REPO}/issues/new?title=${title}&body=${body}` });
  feedbackModal.hidden = true;
  feedbackText.value = "";
});
// ─────────────────────────────────────────────────────────────────────────────

// ─── Tab Navigation ──────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${tab}`).classList.add("active");
    // Aktiven Tab speichern
    chrome.storage.local.get("bui_scan", (stored) => {
      if (stored.bui_scan) {
        chrome.storage.local.set({ bui_scan: { ...stored.bui_scan, activeUiTab: tab } });
      }
    });
  });
});

function setScanButton(rescan) {
  const btn = document.getElementById("scanBtn");
  if (rescan) {
    btn.innerHTML = `${ICONS.reload} Seite erneut scannen`;
  } else {
    btn.textContent = "Seite scannen";
  }
}

let _scanNoteTimer = null;
function showScanNote(msg) {
  const el = document.getElementById("scanNote");
  if (_scanNoteTimer) clearTimeout(_scanNoteTimer);
  el.textContent = msg;
  el.classList.remove("fade-out");
  el.hidden = false;
  _scanNoteTimer = setTimeout(() => {
    el.classList.add("fade-out");
    setTimeout(() => { el.hidden = true; el.classList.remove("fade-out"); }, 400);
  }, 2100);
}

function showTabs() {
  document.getElementById("tabNav").hidden = false;
  document.getElementById("tabPanels").hidden = false;
}

function updateBadges() {
  ["layout", "a11y", "struktur"].forEach((tab) => {
    const panel = document.getElementById(`panel-${tab}`);
    const count = panel.querySelectorAll(".check-header.found").length;
    const badge = document.getElementById(`badge-${tab}`);
    badge.textContent = count > 0 ? String(count) : "";
  });
}
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById("scanBtn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    const tab = tabs[0];
    // chrome:// und extension-Seiten können nicht gescannt werden
    if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("about:")) {
      const btn = document.getElementById("scanBtn");
      btn.textContent = "⚠ Diese Seite kann nicht gescannt werden";
      setTimeout(() => setScanButton(false), 3000);
      return;
    }

    // Während des Scans: Button deaktivieren
    const btn = document.getElementById("scanBtn");
    const isRescan = !!btn.querySelector("svg"); // hat Reload-Icon → war schon gescannt
    btn.disabled = true;
    btn.textContent = "Wird gescannt…";
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: () => {
          // Alte bui-ids aufräumen
          document.querySelectorAll("[data-bui-id]").forEach((el) =>
            el.removeAttribute("data-bui-id")
          );

          let buiCounter = 0;
          function tagElement(el) {
            if (el.hasAttribute("data-bui-id")) return el.getAttribute("data-bui-id");
            const id = String(buiCounter++);
            el.setAttribute("data-bui-id", id);
            return id;
          }

          // Erkennt Extension-injizierte Custom Elements (z.B. Bookmark Sidebar)
          // Custom Elements haben einen Bindestrich im Tag-Namen und sitzen direkt unter body/html
          function isExtensionEl(el) {
            let node = el;
            while (node && node.tagName) {
              const tag = node.tagName.toLowerCase();
              const isDirectChildOfRoot =
                node.parentElement === document.body ||
                node.parentElement === document.documentElement;
              if (isDirectChildOfRoot) {
                // Custom element tag (e.g. <bookmark-sidebar>)
                if (tag.includes("-")) return true;
                // Regular element with extension-namespaced ID + class (e.g. div#redeviation-bs-indicator.redeviation-bs-fullHeight)
                const id = node.id || "";
                const cls =
                  typeof node.className === "string"
                    ? node.className.trim().split(/\s+/)[0]
                    : "";
                if (id.includes("-") && cls.includes("-") && id.split("-")[0] === cls.split("-")[0]) {
                  return true;
                }
              }
              node = node.parentElement;
            }
            return false;
          }

          function elLabel(el) {
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : "";
            const cls =
              el.className && typeof el.className === "string"
                ? `.${el.className.trim().split(/\s+/)[0]}`
                : "";
            return `<${tag}${id}${cls}>`;
          }

          // Check 1: Alt-Attribute
          const missingAlt = [];
          const missingSize = [];
          document.querySelectorAll("img").forEach((img) => {
            if (isExtensionEl(img)) return;
            const src = img.src || "(kein src)";
            if (!img.alt || img.alt.trim() === "") {
              const filename = src.split("/").pop().split("?")[0] || src;
              missingAlt.push({
                summary: filename,
                details: [{ key: "src", value: src }],
                buiId: tagElement(img),
              });
            }
            if (!img.width || !img.height) missingSize.push(src);
          });

          // Check 3: Horizontaler Overflow
          const viewportWidth = window.innerWidth;
          const overflowElements = [];
          document.querySelectorAll("*").forEach((el) => {
            if (isExtensionEl(el)) return;
            const rect = el.getBoundingClientRect();
            if (rect.right > viewportWidth + 1) {
              const overflow = Math.round(rect.right - viewportWidth);
              overflowElements.push({
                summary: elLabel(el),
                value: `${overflow}px`,
                details: [
                  { key: "Überragt Viewport um", value: `${overflow}px` },
                  { key: "Element", value: elLabel(el) },
                ],
                buiId: tagElement(el),
              });
            }
          });

          // Check 4: Versteckte Buttons und Links
          const hiddenInteractive = [];
          document.querySelectorAll("button, a").forEach((el) => {
            if (isExtensionEl(el)) return;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const isHidden =
              style.display === "none" ||
              style.visibility === "hidden" ||
              style.opacity === "0" ||
              (rect.width === 0 && rect.height === 0);
            if (isHidden) {
              const tag = el.tagName.toLowerCase();
              const text =
                el.textContent.trim().slice(0, 40) ||
                el.getAttribute("href") ||
                "(kein Text)";
              const selector = el.id
                ? `${tag}#${el.id}`
                : el.className && typeof el.className === "string"
                ? `${tag}.${el.className.trim().split(/\s+/)[0]}`
                : tag;
              hiddenInteractive.push({ label: `<${tag}> "${text}"`, copy: selector });
            }
          });

          // Check 5: Responsive (Light)
          const responsiveIssues = [];
          const viewportMeta = document.querySelector('meta[name="viewport"]');
          if (!viewportMeta) {
            responsiveIssues.push('Kein <meta name="viewport"> gefunden');
          } else if (!viewportMeta.content.includes("width=device-width")) {
            responsiveIssues.push(
              `Viewport-Meta fehlt "width=device-width": ${viewportMeta.content}`
            );
          }
          const MOBILE_WIDTH = 375;
          document.querySelectorAll("*").forEach((el) => {
            if (isExtensionEl(el)) return;
            if (
              ["html", "head", "body", "script", "style", "meta", "link"].includes(
                el.tagName.toLowerCase()
              )
            )
              return;
            const inlineWidth = el.style.width;
            if (
              inlineWidth &&
              /^\d+px$/.test(inlineWidth) &&
              parseInt(inlineWidth, 10) > MOBILE_WIDTH
            ) {
              responsiveIssues.push(`${elLabel(el)} — inline width: ${inlineWidth}`);
            }
          });

          // Check 6: Z-Index / Layering (Light)
          const zIndexIssues = [];
          const positioned = [];
          document.querySelectorAll("*").forEach((el) => {
            if (isExtensionEl(el)) return;
            const style = window.getComputedStyle(el);
            const position = style.position;
            const zIndex = style.zIndex;
            if (
              ["relative", "absolute", "fixed", "sticky"].includes(position) &&
              zIndex !== "auto"
            ) {
              positioned.push({ el, label: elLabel(el), z: parseInt(zIndex, 10), position });
            }
          });
          positioned
            .filter(({ z }) => z > 99)
            .sort((a, b) => b.z - a.z)
            .slice(0, 20)
            .forEach(({ el, label, z, position }) => {
              zIndexIssues.push({
                summary: label,
                value: String(z),
                tip: "💡 Hohe z-index Werte führen zu schwer wartbaren Stacking-Konflikten. Besser: eine Skala mit CSS Custom Properties definieren — z.B. --z-dropdown: 100, --z-sticky: 200, --z-modal: 300.",
                details: [
                  { key: "z-index", value: String(z) },
                  { key: "position", value: position },
                  { key: "Element", value: label },
                ],
                buiId: tagElement(el),
              });
            });
          positioned
            .filter(({ position, z }) => (position === "fixed" || position === "sticky") && z === 0)
            .forEach(({ el, label, position }) => {
              zIndexIssues.push({
                summary: label,
                value: "–",
                tip: "💡 Fixierte und sticky Elemente ohne z-index können unerwartet von anderen Elementen überdeckt werden. Immer einen expliziten z-index setzen.",
                details: [
                  { key: "z-index", value: "fehlt" },
                  { key: "position", value: position },
                  { key: "Element", value: label },
                ],
                buiId: tagElement(el),
              });
            });

          // Check 7: Broken Links
          const brokenLinks = [];
          document.querySelectorAll("a").forEach((el) => {
            if (isExtensionEl(el)) return;
            const href = el.getAttribute("href");
            const isBroken = href === null || href.trim() === "" || href.trim() === "#";
            if (isBroken) {
              const text = el.textContent.trim().slice(0, 40) || "(kein Text)";
              const reason = href === null ? "kein href" : href.trim() === "" ? 'href=""' : 'href="#"';
              brokenLinks.push({
                summary: `"${text}"`,
                value: reason,
                tip: href !== null && href.trim() === "#"
                  ? "💡 href=\"#\" deutet auf eine Aktion hin, keine Navigation — besser <button> verwenden. Buttons sind semantisch korrekt, tastaturzugänglich und lösen kein Scroll-to-top aus."
                  : null,
                details: [
                  { key: "Problem", value: reason },
                  { key: "Text", value: text },
                ],
                buiId: tagElement(el),
              });
            }
          });

          // Check 8: Kontrast (WCAG AA, Light)
          const contrastIssues = [];

          function parseRgb(str) {
            const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)] : null;
          }

          function luminance(r, g, b) {
            return [r, g, b].reduce((sum, c, i) => {
              const s = c / 255;
              const val = s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
              return sum + val * [0.2126, 0.7152, 0.0722][i];
            }, 0);
          }

          function contrastRatio(fg, bg) {
            const l1 = luminance(...fg);
            const l2 = luminance(...bg);
            const light = Math.max(l1, l2);
            const dark = Math.min(l1, l2);
            return (light + 0.05) / (dark + 0.05);
          }

          function getEffectiveBg(el) {
            let node = el;
            while (node && node.tagName !== "BODY") {
              const bg = window.getComputedStyle(node).backgroundColor;
              if (bg && bg !== "transparent" && !bg.startsWith("rgba(0, 0, 0, 0)")) return bg;
              node = node.parentElement;
            }
            return "rgb(255, 255, 255)";
          }

          const seen = new Set();
          document.querySelectorAll("p, h1, h2, h3, h4, h5, h6, span, a, li, td, th, label, button").forEach((el) => {
            if (isExtensionEl(el)) return;
            if (!el.textContent.trim() || seen.has(el)) return;
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden") return;
            const fg = parseRgb(style.color);
            const bg = parseRgb(getEffectiveBg(el));
            if (!fg || !bg) return;
            const ratio = contrastRatio(fg, bg);
            const fontSize = parseFloat(style.fontSize);
            const isBold = parseInt(style.fontWeight, 10) >= 700;
            const isLargeText = fontSize >= 18 || (fontSize >= 14 && isBold);
            const threshold = isLargeText ? 3 : 4.5;
            if (ratio < threshold) {
              seen.add(el);
              const tag = el.tagName.toLowerCase();
              const bgColor = getEffectiveBg(el);
              contrastIssues.push({
                summary: `${tag}: "${el.textContent.trim().slice(0, 25)}"`,
                value: `${ratio.toFixed(1)}:1`,
                swatches: [style.color, bgColor],
                details: [
                  { key: "Kontrast-Ratio", value: `${ratio.toFixed(2)}:1 (Minimum: ${threshold}:1)` },
                  { key: "Textfarbe", value: style.color },
                  { key: "Hintergrund", value: bgColor },
                ],
                buiId: tagElement(el),
              });
            }
          });

          // Check 9: Fehlende Form-Labels
          const missingLabels = [];
          document.querySelectorAll("input, textarea, select").forEach((el) => {
            if (isExtensionEl(el)) return;
            const type = (el.getAttribute("type") || "").toLowerCase();
            if (["hidden", "submit", "button", "reset", "image"].includes(type)) return;
            const hasAriaLabel = el.hasAttribute("aria-label") && el.getAttribute("aria-label").trim() !== "";
            const hasAriaLabelledBy = el.hasAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"));
            const hasLabelFor = el.id && document.querySelector(`label[for="${el.id}"]`);
            const hasParentLabel = el.closest("label");
            if (!hasAriaLabel && !hasAriaLabelledBy && !hasLabelFor && !hasParentLabel) {
              const tag = el.tagName.toLowerCase();
              const name = el.getAttribute("name") || el.getAttribute("id") || "(kein name/id)";
              missingLabels.push({
                summary: `<${tag}> ${type ? `type="${type}"` : ""} — ${name}`,
                details: [
                  { key: "Element", value: `<${tag}>` },
                  { key: "type", value: type || "(kein type)" },
                  { key: "name/id", value: name },
                ],
                buiId: tagElement(el),
              });
            }
          });

          // Check 10: Doppelte IDs
          const duplicateIds = [];
          const idMap = {};
          document.querySelectorAll("[id]").forEach((el) => {
            if (isExtensionEl(el)) return;
            const id = el.getAttribute("id").trim();
            if (!id) return;
            if (!idMap[id]) idMap[id] = [];
            idMap[id].push(el);
          });
          Object.entries(idMap).forEach(([id, els]) => {
            if (els.length < 2) return;
            duplicateIds.push({
              summary: `#${id}`,
              value: `${els.length}×`,
              details: [
                { key: "ID", value: id },
                { key: "Anzahl", value: `${els.length} Elemente mit dieser ID` },
                { key: "Elemente", value: els.map(elLabel).join(", ") },
              ],
              buiId: tagElement(els[0]),
            });
          });

          return { missingAlt, missingSize, overflowElements, hiddenInteractive, responsiveIssues, zIndexIssues, brokenLinks, contrastIssues, missingLabels, duplicateIds };
        },
      },
      (results) => {
        btn.disabled = false;
        const data = results[0].result;
        applyResults(data);
        if (isRescan) showScanNote("✓ Seite erfolgreich neu gescannt");
        // Ergebnisse für diesen Tab speichern
        chrome.storage.local.set({
          bui_scan: {
            results: data,
            tabId: tab.id,
            url: tab.url,
            activeUiTab: "layout",
          },
        });
      }
    );
  });
});

function applyResults({ missingAlt, missingSize, overflowElements, hiddenInteractive, responsiveIssues, zIndexIssues, brokenLinks, contrastIssues, missingLabels, duplicateIds }) {
  renderCheck({
    cardId: "altCard", headerId: "altHeader", titleId: "altTitle", listId: "altList",
    items: missingAlt,
    labelOk: "✅ Alle Bilder haben ein alt-Attribut",
    labelFound: (n) => n === 1 ? "⚠️ 1 Bild ohne alt-Attribut" : `⚠️ ${n} Bilder ohne alt-Attribut`,
    highlightable: true, copyable: true, itemIcon: "error",
    cardTip: "💡 Alt-Texte sollten den Bildinhalt beschreiben — nicht \"Bild von...\". Rein dekorative Bilder bekommen alt=\"\" damit Screen Reader sie überspringen.",
  });
  renderCheck({
    cardId: "sizeCard", headerId: "sizeHeader", titleId: "sizeTitle", listId: "sizeList",
    items: missingSize,
    labelOk: "✅ Alle Bilder haben width & height",
    labelFound: (n) => n === 1 ? "⚠️ 1 Bild ohne width/height" : `⚠️ ${n} Bilder ohne width/height`,
    cardTip: "💡 width & height Attribute im HTML reservieren den Platz vor dem Laden und verhindern Layout Shifts. Alternativ: aspect-ratio in CSS setzen, z.B. aspect-ratio: 16 / 9.",
  });
  renderCheck({
    cardId: "overflowCard", headerId: "overflowHeader", titleId: "overflowTitle", listId: "overflowList",
    items: overflowElements,
    labelOk: "✅ Kein horizontaler Overflow",
    labelFound: (n) => n === 1 ? "⚠️ 1 Element über den Viewport hinaus" : `⚠️ ${n} Elemente über den Viewport hinaus`,
    highlightable: true, itemIcon: "error",
    colLeft: "Element", colRight: "Overflow",
    cardTip: "💡 Häufige Ursachen: width: 100vw (ignoriert Scrollbar-Breite), negative margins oder absolut positionierte Kinder ohne overflow: hidden am Elternelement.",
  });
  renderCheck({
    cardId: "hiddenCard", headerId: "hiddenHeader", titleId: "hiddenTitle", listId: "hiddenList",
    items: hiddenInteractive,
    labelOk: "✅ Keine versteckten Buttons oder Links",
    labelFound: (n) => n === 1 ? "⚠️ 1 versteckter Button / Link" : `⚠️ ${n} versteckte Buttons / Links`,
    copyable: true,
  });
  renderCheck({
    cardId: "responsiveCard", headerId: "responsiveHeader", titleId: "responsiveTitle", listId: "responsiveList",
    items: responsiveIssues,
    labelOk: "✅ Keine offensichtlichen Responsive-Probleme",
    labelFound: (n) => n === 1 ? "⚠️ 1 potenzielles Responsive-Problem" : `⚠️ ${n} potenzielle Responsive-Probleme`,
    copyable: true,
    cardTip: "💡 Statt fixer px-Breite besser max-width + width: 100% kombinieren. Viewport-Meta: <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.",
  });
  renderCheck({
    cardId: "zIndexCard", headerId: "zIndexHeader", titleId: "zIndexTitle", listId: "zIndexList",
    items: zIndexIssues,
    labelOk: "✅ Keine auffälligen Z-Index-Probleme",
    labelFound: (n) => n === 1 ? "⚠️ 1 potenzielles Layering-Problem" : `⚠️ ${n} potenzielle Layering-Probleme`,
    highlightable: true, itemIcon: "warning",
    colLeft: "Element", colRight: "Z-Index",
  });
  renderZIndexChart(zIndexIssues);
  renderCheck({
    cardId: "brokenLinksCard", headerId: "brokenLinksHeader", titleId: "brokenLinksTitle", listId: "brokenLinksList",
    items: brokenLinks,
    labelOk: "✅ Keine broken Links gefunden",
    labelFound: (n) => n === 1 ? "⚠️ 1 broken Link" : `⚠️ ${n} broken Links`,
    highlightable: true, itemIcon: "link",
    colLeft: "Link", colRight: "Problem",
  });
  renderCheck({
    cardId: "contrastCard", headerId: "contrastHeader", titleId: "contrastTitle", listId: "contrastList",
    items: contrastIssues,
    labelOk: "✅ Kein offensichtlicher Kontrast-Fehler",
    labelFound: (n) => n === 1 ? "⚠️ 1 Kontrast-Problem (WCAG AA)" : `⚠️ ${n} Kontrast-Probleme (WCAG AA)`,
    highlightable: true, itemIcon: "warning",
    colLeft: "Element", colRight: "Ratio",
  });
  renderCheck({
    cardId: "formLabelsCard", headerId: "formLabelsHeader", titleId: "formLabelsTitle", listId: "formLabelsList",
    items: missingLabels,
    labelOk: "✅ Alle Eingabefelder haben ein Label",
    labelFound: (n) => n === 1 ? "⚠️ 1 Eingabefeld ohne Label" : `⚠️ ${n} Eingabefelder ohne Label`,
    highlightable: true, itemIcon: "warning",
    cardTip: "💡 Beste Lösung: <label for=\"inputId\">Text</label>. Für Felder ohne sichtbares Label (z.B. Suchfelder) eignet sich aria-label=\"Suche\" als Alternative.",
  });
  renderCheck({
    cardId: "duplicateIdsCard", headerId: "duplicateIdsHeader", titleId: "duplicateIdsTitle", listId: "duplicateIdsList",
    items: duplicateIds,
    labelOk: "✅ Alle IDs sind eindeutig",
    labelFound: (n) => n === 1 ? "⚠️ 1 doppelte ID" : `⚠️ ${n} doppelte IDs`,
    highlightable: true, itemIcon: "error",
    colLeft: "ID", colRight: "Duplikate",
    cardTip: "💡 IDs müssen im gesamten Dokument eindeutig sein. Für Styling lieber CSS-Klassen verwenden — IDs sollten Anchor-Links und JavaScript-Selektoren vorbehalten sein.",
  });
  showTabs();
  sortCards();
  updateBadges();
  setScanButton(true);
}

function renderZIndexChart(items) {
  const card = document.getElementById("zIndexCard");
  const existing = card.querySelector(".zindex-chart");
  if (existing) existing.remove();

  // Nur Items mit echtem z-index Wert (nicht "–")
  const withZ = items.filter((i) => i.value && i.value !== "–");
  if (withZ.length === 0) return;

  const groups = [
    { label: "100–999", min: 100, max: 999 },
    { label: "1k–9k",  min: 1000, max: 9999 },
    { label: "10k+",   min: 10000, max: Infinity },
  ];

  const buckets = groups
    .map((g) => ({
      label: g.label,
      count: withZ.filter((i) => {
        const z = parseInt(i.value, 10);
        return z >= g.min && z <= g.max;
      }).length,
    }))
    .filter((b) => b.count > 0);

  if (buckets.length < 2) return;

  const maxCount = Math.max(...buckets.map((b) => b.count));
  const chart = document.createElement("div");
  chart.className = "zindex-chart";

  buckets.forEach((b, i) => {
    const wrap = document.createElement("div");
    wrap.className = "zindex-bar-wrap";

    const bar = document.createElement("div");
    bar.className = "zindex-bar" + (i === buckets.length - 1 ? " zindex-bar-high" : "");
    bar.style.height = `${Math.max(24, Math.round((b.count / maxCount) * 64))}px`;

    const count = document.createElement("span");
    count.className = "zindex-bar-count";
    count.textContent = String(b.count);
    bar.appendChild(count);

    const label = document.createElement("span");
    label.className = "zindex-bar-label";
    label.textContent = b.label;

    wrap.appendChild(bar);
    wrap.appendChild(label);
    chart.appendChild(wrap);
  });

  card.appendChild(chart);
}

function sortCards() {
  document.querySelectorAll(".tab-panel .checks").forEach((container) => {
    const ok = Array.from(container.querySelectorAll(".check-card.visible")).filter((c) => c.querySelector(".check-header.ok"));
    const found = Array.from(container.querySelectorAll(".check-card.visible")).filter((c) => c.querySelector(".check-header.found"));
    [...ok, ...found].forEach((c) => container.appendChild(c));
  });
}

function highlightElement(buiId, issueNum) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (id, num) => {
        const el = document.querySelector(`[data-bui-id="${id}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });

        const prev = el.style.cssText;
        el.style.outline = "2px dashed #f97316";
        el.style.outlineOffset = "3px";

        // Floating badge
        const badge = document.createElement("div");
        badge.textContent = num ? `BUI #${String(num).padStart(2, "0")}` : "BUI";
        badge.style.cssText = [
          "position:fixed",
          "background:#f97316",
          "color:white",
          "font-size:10px",
          "font-weight:700",
          "padding:3px 8px",
          "border-radius:4px",
          "z-index:2147483647",
          "pointer-events:none",
          "font-family:-apple-system,BlinkMacSystemFont,sans-serif",
          "letter-spacing:0.06em",
          "text-transform:uppercase",
          "box-shadow:0 2px 8px rgba(0,0,0,0.25)",
          "top:-9999px",
          "left:-9999px",
        ].join(";");
        document.body.appendChild(badge);

        // Position nach Scroll
        setTimeout(() => {
          const rect = el.getBoundingClientRect();
          badge.style.top = `${Math.max(rect.top - 26, 6)}px`;
          badge.style.left = `${Math.max(rect.left, 6)}px`;
        }, 350);

        setTimeout(() => {
          el.style.cssText = prev;
          badge.remove();
        }, 2500);
      },
      args: [buiId, issueNum || null],
    });
  });
}

// ─── Icon SVGs ───────────────────────────────────────────────────────────────
const ICONS = {
  error: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor" stroke="none"/></svg>`,
  warning: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="none"/></svg>`,
  link: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`,
  highlight: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>`,
  reload: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  copy: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
};

function makeIcon(type) {
  const span = document.createElement("span");
  span.className = `item-icon item-icon-${type}`;
  span.innerHTML = ICONS[type] || ICONS.warning;
  return span;
}
// ─────────────────────────────────────────────────────────────────────────────

function renderCheck({ cardId, headerId, titleId, listId, items, labelOk, labelFound,
                       copyable = false, highlightable = false,
                       colLeft = null, colRight = null, itemIcon = null,
                       cardTip = null }) {
  const card = document.getElementById(cardId);
  const header = document.getElementById(headerId);
  const title = document.getElementById(titleId);
  const list = document.getElementById(listId);

  list.replaceChildren();
  if (list.nextElementSibling?.classList.contains("mehr-laden-btn")) {
    list.nextElementSibling.remove();
  }
  const existingColHeaders = card.querySelector(".col-headers");
  if (existingColHeaders) existingColHeaders.remove();
  const existingCardTip = card.querySelector(".card-tip");
  if (existingCardTip) existingCardTip.remove();
  card.classList.add("visible");

  if (items.length === 0) {
    header.className = "check-header ok";
    title.textContent = labelOk;
    return;
  }

  header.className = "check-header found";
  title.textContent = labelFound(items.length);

  // Spaltenköpfe (nur wenn beide Labels vorhanden)
  if (colLeft && colRight) {
    const colHeaders = document.createElement("div");
    colHeaders.className = "col-headers";
    const leftLabel = document.createElement("span");
    leftLabel.className = "col-label";
    leftLabel.textContent = colLeft;
    colHeaders.appendChild(leftLabel);
    const rightLabel = document.createElement("span");
    rightLabel.className = "col-label";
    rightLabel.textContent = colRight;
    colHeaders.appendChild(rightLabel);
    list.parentNode.insertBefore(colHeaders, list);
  }

  items.forEach((item, index) => {
    const li = document.createElement("li");
    if (index >= VISIBLE_COUNT) li.classList.add("hidden-item");

    if (highlightable) {
      li.classList.add("expandable");

      const summaryDiv = document.createElement("div");
      summaryDiv.className = "item-summary";
      summaryDiv.addEventListener("click", () => li.classList.toggle("expanded"));

      // Status-Icon (error / warning / link)
      if (itemIcon) {
        summaryDiv.appendChild(makeIcon(itemIcon));
      }

      // Farbswatches (z.B. Kontrast-Check)
      if (item.swatches) {
        const swatchPair = document.createElement("span");
        swatchPair.className = "swatch-pair";
        item.swatches.forEach((color) => {
          const dot = document.createElement("span");
          dot.className = "swatch";
          dot.style.background = color;
          swatchPair.appendChild(dot);
        });
        summaryDiv.appendChild(swatchPair);
      }

      const titleSpan = document.createElement("span");
      titleSpan.className = "item-title";
      titleSpan.textContent = item.summary;
      summaryDiv.appendChild(titleSpan);

      // Wert rechts (z.B. "47px", "9999", "2.1:1")
      if (item.value != null) {
        const valueSpan = document.createElement("span");
        valueSpan.className = "item-value";
        valueSpan.textContent = item.value;
        summaryDiv.appendChild(valueSpan);
      }

      if (copyable) {
        const srcValue = item.details[0]?.value;
        if (srcValue) {
          const copyBtn = document.createElement("button");
          copyBtn.className = "copy-btn";
          copyBtn.textContent = "⎘";
          copyBtn.title = "src kopieren";
          copyBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(srcValue).then(() => {
              copyBtn.textContent = "✓";
              copyBtn.classList.add("copied");
              setTimeout(() => {
                copyBtn.textContent = "⎘";
                copyBtn.classList.remove("copied");
              }, 1500);
            });
          });
          summaryDiv.appendChild(copyBtn);
        }
      }

      const arrow = document.createElement("span");
      arrow.className = "item-arrow";
      arrow.textContent = "›";
      summaryDiv.appendChild(arrow);

      const detailDiv = document.createElement("div");
      detailDiv.className = "item-detail";

      // Kontrast-Vorschau: Text in echten Farben
      if (item.swatches) {
        const preview = document.createElement("div");
        preview.className = "contrast-preview";
        preview.style.color = item.swatches[0];
        preview.style.background = item.swatches[1];
        preview.textContent = "The quick brown fox...";
        detailDiv.appendChild(preview);
      }

      item.details.forEach(({ key, value }) => {
        const row = document.createElement("div");
        row.className = "item-detail-row";
        const label = document.createElement("strong");
        label.textContent = key + ":";
        row.appendChild(label);
        row.appendChild(document.createTextNode(" " + value));
        detailDiv.appendChild(row);
      });

      if (item.tip) {
        const tipEl = document.createElement("div");
        tipEl.className = "item-tip";
        tipEl.textContent = item.tip;
        detailDiv.appendChild(tipEl);
      }

      const actionRow = document.createElement("div");
      actionRow.className = "detail-actions";

      const highlightBtn = document.createElement("button");
      highlightBtn.className = "detail-highlight-btn";
      highlightBtn.innerHTML = `${ICONS.highlight} Highlight`;
      highlightBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        highlightElement(item.buiId, index + 1);
      });

      const copyActionBtn = document.createElement("button");
      copyActionBtn.className = "detail-copy-btn";
      copyActionBtn.innerHTML = `${ICONS.copy} Copy`;
      copyActionBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(item.summary).then(() => {
          copyActionBtn.innerHTML = "✓ Copied";
          setTimeout(() => { copyActionBtn.innerHTML = `${ICONS.copy} Copy`; }, 1500);
        });
      });

      actionRow.appendChild(highlightBtn);
      actionRow.appendChild(copyActionBtn);
      detailDiv.appendChild(actionRow);

      li.appendChild(summaryDiv);
      li.appendChild(detailDiv);
    } else {
      const displayText = typeof item === "object" ? item.label : item;
      const copyText = typeof item === "object" ? item.copy : item;

      const span = document.createElement("span");
      span.textContent = displayText;
      span.title = displayText;
      li.appendChild(span);

      if (copyable) {
        const btn = document.createElement("button");
        btn.className = "copy-btn";
        btn.textContent = "⎘";
        btn.title = "Selector kopieren";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(copyText).then(() => {
            btn.textContent = "✓";
            btn.classList.add("copied");
            setTimeout(() => {
              btn.textContent = "⎘";
              btn.classList.remove("copied");
            }, 1500);
          });
        });
        li.appendChild(btn);
      }
    }

    list.appendChild(li);
  });

  if (items.length > VISIBLE_COUNT) {
    const rest = items.length - VISIBLE_COUNT;
    const moreBtn = document.createElement("button");
    moreBtn.className = "mehr-laden-btn";
    moreBtn.textContent = `${rest} weitere anzeigen`;
    moreBtn.addEventListener("click", () => {
      list.querySelectorAll(".hidden-item").forEach((el) => el.classList.remove("hidden-item"));
      moreBtn.remove();
    });
    list.after(moreBtn);
  }

  if (cardTip) {
    const tipEl = document.createElement("div");
    tipEl.className = "card-tip";
    tipEl.textContent = cardTip;
    card.appendChild(tipEl);
  }
}

// ─── Scan-Ergebnisse beim Öffnen wiederherstellen ─────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return;
  chrome.storage.local.get("bui_scan", (stored) => {
    const s = stored.bui_scan;
    if (!s || s.tabId !== tabs[0].id || s.url !== tabs[0].url) return;

    // Gleicher Tab, gleiche URL → Ergebnisse wiederherstellen
    applyResults(s.results);

    // Aktiven UI-Tab wiederherstellen (falls nicht "layout")
    const uiTab = s.activeUiTab;
    if (uiTab && uiTab !== "layout") {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      const btn = document.querySelector(`.tab-btn[data-tab="${uiTab}"]`);
      const panel = document.getElementById(`panel-${uiTab}`);
      if (btn) btn.classList.add("active");
      if (panel) panel.classList.add("active");
    }
  });
});
// ─────────────────────────────────────────────────────────────────────────────
