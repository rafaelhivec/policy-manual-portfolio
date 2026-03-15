const VERSION = "v8.4.1-portfolio";
const $ = (sel) => document.querySelector(sel);

const tocEl = $("#toc");
const docEl = $("#doc");

const chatForm = $("#chatForm");
const questionEl = $("#question");
const chatLog = $("#chatLog");
const usageText = $("#usageText");
const prototypeKeyEl = $("#prototypeKey");
const viewTextEl = $("#viewText");

const goCoverBtn = $("#goCover");
const goTopBtn = $("#goTop");

let policyData = null;
let sections = [];
let sectionRanges = new Map(); // sectionId -> {start,end}
let currentSectionId = null;

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addMessage(who, text) {
  const div = document.createElement("div");
  div.className = `msg ${who === "You" ? "user" : "ai"}`;
  div.innerHTML = `
    <div class="who">${escapeHtml(who)}</div>
    <div class="text">${escapeHtml(text)}</div>
  `;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setViewing(sectionId, targetId) {
  currentSectionId = sectionId || null;
  if (!currentSectionId) {
    viewTextEl.textContent = "Currently viewing: Cover page";
    return;
  }

  const s = sections.find((x) => x.id === currentSectionId);
  if (s && targetId) {
    const sub = (s.items || []).find((it) => it.id === targetId);
    if (sub) {
      viewTextEl.textContent = `Currently viewing: ${sub.label} — ${sub.title}`;
      return;
    }
  }

  const label = s ? `${s.label} — ${s.title}` : currentSectionId;
  viewTextEl.textContent = `Currently viewing: ${label}`;
}

function renderCover() {
  docEl.innerHTML = `
    <div class="cover">
      <img class="cover-logo" src="assets/company-logo.png" alt="Evergreen Mobility logo" />
      <h1 class="cover-title">Personnel Policies and Procedures</h1>
      <p class="cover-subtitle">Web viewer + KweenBee Q&amp;A</p>
      <div class="cover-card">
        <p><strong>How to use this page:</strong></p>
        <ol>
          <li>Pick a section from <strong>Contents</strong> on the left to read the policy.</li>
          <li>Use <strong>KweenBee</strong> on the right to ask questions about <em>any part</em> of the document.</li>
        </ol>
        <p class="muted">Tip: The Contents list scrolls independently, so you can jump around easily.</p>
      </div>
    </div>
  `;
  docEl.scrollTop = 0;
  setViewing(null);
  updateTocActive();
}

function buildSectionRanges(blocks) {
  const majorIdxs = [];
  blocks.forEach((b, i) => {
    if (b.kind === "major_heading" && String(b.label || "").toUpperCase().startsWith("SECTION")) {
      majorIdxs.push(i);
    }
  });

  const ranges = new Map();
  for (let i = 0; i < majorIdxs.length; i++) {
    const start = majorIdxs[i];
    const end = i + 1 < majorIdxs.length ? majorIdxs[i + 1] : blocks.length;
    const id = blocks[start].id;
    ranges.set(id, { start, end });
  }
  return ranges;
}

function buildSectionsFromTOC(toc) {
  const secs = [];
  let current = null;

  for (const item of toc) {
    const label = String(item.label || "");
    if (label.toUpperCase().startsWith("SECTION")) {
      if (current) secs.push(current);
      current = { ...item, items: [] };
    } else if (current) {
      current.items.push(item);
    }
  }
  if (current) secs.push(current);
  return secs;
}

function renderTOC() {
  tocEl.innerHTML = "";

  const coverBtn = document.createElement("button");
  coverBtn.type = "button";
  coverBtn.className = "toc-cover";
  coverBtn.dataset.action = "cover";
  coverBtn.innerHTML = `<strong>Cover</strong><div class="muted">Start here</div>`;
  tocEl.appendChild(coverBtn);

  for (const sec of sections) {
    const group = document.createElement("div");
    group.className = "toc-group";

    const secBtn = document.createElement("button");
    secBtn.type = "button";
    secBtn.className = "toc-major";
    secBtn.dataset.action = "section";
    secBtn.dataset.sectionId = sec.id;
    secBtn.innerHTML = `<strong>${escapeHtml(sec.label)}</strong> <span class="muted">${escapeHtml(sec.title)}</span>`;
    group.appendChild(secBtn);

    const list = document.createElement("div");
    list.className = "toc-sublist";

    for (const item of sec.items) {
      const subBtn = document.createElement("button");
      subBtn.type = "button";
      subBtn.className = "toc-sub";
      subBtn.dataset.action = "sub";
      subBtn.dataset.sectionId = sec.id;
      subBtn.dataset.targetId = item.id;
      subBtn.innerHTML = `<span class="toc-sub-label">${escapeHtml(item.label)}</span> <span class="muted">${escapeHtml(item.title)}</span>`;
      list.appendChild(subBtn);
    }

    group.appendChild(list);
    tocEl.appendChild(group);
  }

  updateTocActive();
}

function updateTocActive(targetId) {
  tocEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));

  if (!currentSectionId) {
    tocEl.querySelector('button[data-action="cover"]')?.classList.add("active");
    return;
  }

  const major = tocEl.querySelector(
    `button[data-action="section"][data-section-id="${CSS.escape(currentSectionId)}"]`
  );
  major?.classList.add("active");

  if (targetId) {
    const sub = tocEl.querySelector(
      `button[data-action="sub"][data-target-id="${CSS.escape(targetId)}"]`
    );
    sub?.classList.add("active");
  }
}

function renderBlock(block) {
  const wrap = document.createElement("div");
  const levelClass = `level-${block.level ?? 1}`;
  const kind = block.kind;

  wrap.className = `block ${kind} ${levelClass}`;

  // Provide stable anchors for headings and deeper numbered entries
  if (block.id) wrap.id = block.id;

  if (kind === "major_heading" || kind === "heading" || kind === "subheading") {
    // IMPORTANT: only add a class if it is non-empty.
    // Some browsers throw an error if classList.add("") is called.
    if (kind === "major_heading") wrap.classList.add("major-heading");
    wrap.innerHTML = `
      <div class="gutter">${escapeHtml(block.label || "")}</div>
      <div class="content">
        <h3>${escapeHtml(block.title || "")}</h3>
      </div>
    `;
    return wrap;
  }

  if (kind === "subentry") {
    const txt = block.text || "";
    const colonIdx = txt.indexOf(":");
    let htmlLine = escapeHtml(txt);
    if (colonIdx > 0 && colonIdx < 120) {
      const left = txt.slice(0, colonIdx + 1);
      const right = txt.slice(colonIdx + 1);
      htmlLine = `<strong>${escapeHtml(left)}</strong>${escapeHtml(right)}`;
    }
    wrap.innerHTML = `
      <div class="gutter">${escapeHtml(block.label || "")}</div>
      <div class="content">
        <div class="subentry-line">${htmlLine}</div>
      </div>
    `;
    return wrap;
  }

  if (kind === "list_item") {
    wrap.innerHTML = `
      <div class="gutter"></div>
      <div class="content">
        <div class="list-item">
          <div class="bullet">${escapeHtml(block.label || "•")}</div>
          <div>${escapeHtml(block.text || "")}</div>
        </div>
      </div>
    `;
    return wrap;
  }

  wrap.innerHTML = `
    <div class="gutter"></div>
    <div class="content"><p>${escapeHtml(block.text || "")}</p></div>
  `;
  return wrap;
}

function renderDoc(blocks) {
  docEl.innerHTML = "";
  blocks.forEach((b) => docEl.appendChild(renderBlock(b)));
}

function offsetTopWithin(container, el) {
  let y = 0;
  let node = el;
  while (node && node !== container) {
    y += node.offsetTop || 0;
    node = node.offsetParent;
  }
  return y;
}

function scrollDocTo(targetId) {
  if (!targetId) return;
  const el = docEl.querySelector(`#${CSS.escape(targetId)}`);
  if (!el) return;

  // Visual cue
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 900);

  const y = offsetTopWithin(docEl, el) - 12;
  docEl.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
}

function renderSection(sectionId, targetId) {
  if (!policyData) return;

  const r = sectionRanges.get(sectionId);
  if (!r) return;

  const slice = policyData.blocks.slice(r.start, r.end);
  renderDoc(slice);

  // Reset scroll position
  docEl.scrollTop = 0;
  docEl.focus?.();

  setViewing(sectionId, targetId);
  updateTocActive(targetId);

  // scroll to subsection after render
  if (targetId) requestAnimationFrame(() => scrollDocTo(targetId));
}


let botKeyRequired = false;

function setChatLocked(locked, reason = "") {
  const btn = chatForm?.querySelector('button[type="submit"]');
  if (locked) {
    questionEl.disabled = true;
    if (btn) btn.disabled = true;
    if (reason) {
      // show a single notice if not already present
      if (!document.querySelector('.chat-lock-notice')) {
        const n = document.createElement('div');
        n.className = 'chat-lock-notice muted';
        n.textContent = reason;
        const cfg = document.querySelector('.chat-config');
        cfg?.appendChild(n);
      } else {
        document.querySelector('.chat-lock-notice').textContent = reason;
      }
    }
  } else {
    questionEl.disabled = false;
    if (btn) btn.disabled = false;
    const n = document.querySelector('.chat-lock-notice');
    if (n) n.remove();
  }
}

async function detectBotKeyRequirement() {
  try {
    const r = await fetch("/api/ask?status=1", { method: "GET", cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    botKeyRequired = !!j.botKeyRequired;
  } catch {
    botKeyRequired = false;
  }
  const key = (prototypeKeyEl.value || "").trim();
  if (botKeyRequired && !key) {
    setChatLocked(true, "KweenBee is locked. Enter the KweenBee access key above to enable chat.");
  } else {
    setChatLocked(false);
  }
}

function loadStoredKey() {
  const key = localStorage.getItem("prototypeKey") || "";
  if (key) prototypeKeyEl.value = key;
}
prototypeKeyEl.addEventListener("change", () => {
  localStorage.setItem("prototypeKey", (prototypeKeyEl.value || "").trim());
  // Update chat lock state when key is entered/changed
  if (botKeyRequired) {
    const key = (prototypeKeyEl.value || "").trim();
    if (!key) setChatLocked(true, "KweenBee is locked. Enter the KweenBee access key above to enable chat.");
    else setChatLocked(false);
  }
});

async function loadPolicy() {
  const res = await fetch("policy.json", { cache: "no-store" });
  policyData = await res.json();

  // Build section data
  sections = buildSectionsFromTOC(policyData.toc || []);
  sectionRanges = buildSectionRanges(policyData.blocks || []);

  // Title
  $("#docTitle").textContent = policyData.meta?.title || "Personnel Policies and Procedures";
  $("#docMeta").textContent = policyData.meta?.subtitle || "Evergreen Mobility · Web viewer";

  renderTOC();
  renderCover();
}

tocEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const action = btn.dataset.action;

  if (action === "cover") {
    renderCover();
    tocEl.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (action === "section") {
    const sectionId = btn.dataset.sectionId;
    renderSection(sectionId);
    return;
  }

  if (action === "sub") {
    const sectionId = btn.dataset.sectionId;
    const targetId = btn.dataset.targetId;

    // If already viewing the right section, just jump
    if (currentSectionId === sectionId) {
      updateTocActive(targetId);
      scrollDocTo(targetId);
      return;
    }
    // Otherwise render section then scroll
    renderSection(sectionId, targetId);
  }
});

goCoverBtn.addEventListener("click", () => {
  renderCover();
  tocEl.scrollTo({ top: 0, behavior: "smooth" });
});
goTopBtn.addEventListener("click", () => {
  docEl.scrollTo({ top: 0, behavior: "smooth" });
});

async function askAI(question) {
  const prototypeKey = (prototypeKeyEl.value || "").trim();
  const resp = await fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, prototypeKey }),
  });

  const payload = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    const detail = payload?.detail ? `\n\nDetails: ${payload.detail}` : "";
    const hint = payload?.hint ? `\n\nHint: ${payload.hint}` : "";
    throw new Error((payload?.error || `Request failed (${resp.status})`) + detail + hint);
  }
  return payload;
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = (questionEl.value || "").trim();
  if (!q) return;

  if (botKeyRequired && !(prototypeKeyEl.value || "").trim()) {
    addMessage("KweenBee", "KweenBee is locked. Please enter the KweenBee access key above to enable chat.");
    return;
  }

  addMessage("You", q);
  questionEl.value = "";

  try {
    usageText.textContent = "Asking…";
    const result = await askAI(q);

    if (typeof result?.remaining === "number" && typeof result?.limit === "number") {
      usageText.textContent = `Daily usage: ${result.limit - result.remaining}/${result.limit} (remaining: ${result.remaining})`;
    } else {
      usageText.textContent = "Daily usage: —";
    }

    addMessage("AI", result.answer || "No answer returned.");
  } catch (err) {
    usageText.textContent = "Daily usage: —";
    addMessage("AI", String(err?.message || err));
  }
});

loadStoredKey();
  detectBotKeyRequirement();
loadPolicy();
