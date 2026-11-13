/* RankIt 2 — rank one list several ways, keep what holds.
 * No dependencies. State lives in localStorage under "rankit2".
 */
(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const STORE_KEY = "rankit2";
  const MIN_ITEMS = 3;
  const MAX_ITEMS = 20;
  const MAX_ITEM_LEN = 60;
  const POINTS_BUDGET = 100;
  const TIERS = ["S", "A", "B", "C", "D"];

  const ICONS = {
    gut: '<path d="M4 7h16M4 12h10M4 17h6"/>',
    duel: '<path d="M7 5 3 9l4 4"/><path d="M3 9h12"/><path d="m17 11 4 4-4 4"/><path d="M21 15H9"/>',
    tiers: '<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="13" height="4" rx="1"/><rect x="3" y="16" width="8" height="4" rx="1"/>',
    points: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l6 6"/>',
    cut: '<path d="M18 6 6 18M6 6l12 12"/>',
  };

  const METHODS = {
    gut: {
      name: "Gut order",
      short: "Gut",
      blurb: "Put them in order without overthinking it.",
      instructions: "Drag, or use the arrows. Top is best. Go fast — first instinct is the point.",
      effort: () => "About 1 min",
    },
    duel: {
      name: "Head-to-head",
      short: "H2H",
      blurb: "Pick between two at a time. Best for close calls.",
      instructions: "Which do you prefer? Pick one. Use ← and → on a keyboard.",
      effort: (n) => `About ${estimateDuels(n)} picks`,
    },
    tiers: {
      name: "Tiers",
      short: "Tiers",
      blurb: "Sort into S, A, B, C, D. Ties are allowed.",
      instructions: "Give each option a tier. S is the best. Options in the same tier count as tied.",
      effort: (n) => `${n} taps`,
    },
    points: {
      name: "100 points",
      short: "Points",
      blurb: "Split 100 points. Shows how much more you want something.",
      instructions: `Spend exactly ${POINTS_BUDGET} points. Give more to what matters more. Zero is allowed.`,
      effort: () => "About 2 min",
    },
    cut: {
      name: "Elimination",
      short: "Cut",
      blurb: "Cross out the weakest one each round until one is left.",
      instructions: "Which one would you drop first? Tap it. Keep going until one is left.",
      effort: (n) => `${n - 1} picks`,
    },
  };
  const METHOD_ORDER = ["gut", "duel", "tiers", "points", "cut"];

  const EXAMPLES = (window.RANKIT_EXAMPLES && window.RANKIT_EXAMPLES.lists) || [];
  const EXAMPLE_GROUPS = (window.RANKIT_EXAMPLES && window.RANKIT_EXAMPLES.groups) || [];

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const blankState = () => ({
    v: 2,
    title: "",
    items: [],
    results: {}, // method -> { order: [name], values?: {name: value}, at }
    progress: {}, // method -> in-progress data
    note: "",
    updatedAt: new Date().toISOString(),
  });

  let S = blankState();
  let keyHandler = null; // per-view keyboard handler
  let draftTitle = null; // unsaved list-view edits survive re-renders
  let draftItems = null;

  function save() {
    S.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (_) { /* private mode or full */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) S = sanitize(JSON.parse(raw)) || blankState();
    } catch (_) { S = blankState(); }
  }

  // Validate anything that came from storage, a file, or a link.
  function sanitize(obj) {
    if (!obj || typeof obj !== "object" || !Array.isArray(obj.items)) return null;
    const out = blankState();
    out.title = String(obj.title || "").slice(0, 120);
    out.items = dedupe(obj.items.map((x) => String(x).trim().slice(0, MAX_ITEM_LEN)).filter(Boolean)).slice(0, MAX_ITEMS);
    out.note = String(obj.note || "").slice(0, 4000);
    const set = new Set(out.items);
    for (const m of METHOD_ORDER) {
      const r = obj.results && obj.results[m];
      if (r && Array.isArray(r.order) && r.order.length === set.size && r.order.every((x) => set.has(x)) && new Set(r.order).size === set.size) {
        out.results[m] = { order: r.order.slice(), at: r.at || out.updatedAt };
        if (r.values && typeof r.values === "object") {
          out.results[m].values = {};
          for (const it of out.items) if (it in r.values) out.results[m].values[it] = r.values[it];
        }
      }
    }
    if (obj.progress && typeof obj.progress === "object") out.progress = obj.progress;
    return out;
  }

  const doneMethods = () => METHOD_ORDER.filter((m) => S.results[m]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (m) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[m]}</svg>`;
  const app = $("#app");

  function dedupe(list) {
    const seen = new Set();
    return list.filter((x) => {
      const k = x.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function parseItems(text) {
    const raw = String(text || "");
    const parts = raw.includes("\n") ? raw.split(/\n+/) : raw.split(",");
    const cleaned = parts
      .map((p) => p.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
      .filter(Boolean);
    const tooLong = cleaned.some((p) => p.length > MAX_ITEM_LEN);
    const items = dedupe(cleaned.map((p) => p.slice(0, MAX_ITEM_LEN)));
    return { items, dupes: cleaned.length - items.length, tooLong };
  }

  function shuffle(a) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function estimateDuels(n) {
    // Typical merge-sort comparisons, rounded to something friendly.
    if (n <= 1) return 0;
    return Math.max(n - 1, Math.round(n * Math.log2(n) - 1.1 * n + 1));
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function confirmBox(text, okLabel = "Continue") {
    const dlg = $("#confirmDialog");
    $("#confirmText").textContent = text;
    $("#confirmOk").textContent = okLabel;
    if (typeof dlg.showModal !== "function") return Promise.resolve(window.confirm(text));
    return new Promise((resolve) => {
      dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), { once: true });
      dlg.returnValue = "";
      dlg.showModal();
    });
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const slug = () => (S.title || "rankit").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "rankit";

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  // ---------------------------------------------------------------------------
  // Ranking math
  // ---------------------------------------------------------------------------

  /** Turn a saved result into ranks. Equal values (tiers, points) are ties. */
  function computeRanks(result) {
    const { order, values } = result;
    const rank = {}; // fractional rank for math (ties averaged)
    const pos = {}; // competition rank for display (1, 2, 2, 4)
    const tied = {};
    let i = 0;
    while (i < order.length) {
      let j = i;
      if (values) while (j + 1 < order.length && values[order[j + 1]] === values[order[i]]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) {
        rank[order[k]] = avg;
        pos[order[k]] = i + 1;
        tied[order[k]] = j > i;
      }
      i = j + 1;
    }
    return { rank, pos, tied };
  }

  function correlation(a, b) {
    const n = a.length;
    const ma = a.reduce((s, x) => s + x, 0) / n;
    const mb = b.reduce((s, x) => s + x, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return da && db ? num / Math.sqrt(da * db) : 0;
  }

  function analyze() {
    const methods = doneMethods();
    const n = S.items.length;
    const R = Object.fromEntries(methods.map((m) => [m, computeRanks(S.results[m])]));

    const rows = S.items.map((item) => {
      const ranks = methods.map((m) => R[m].rank[item]);
      const avg = ranks.reduce((s, x) => s + x, 0) / ranks.length;
      const min = Math.min(...ranks);
      const max = Math.max(...ranks);
      const firsts = methods.filter((m) => R[m].pos[item] === 1).length;
      const worstPos = Math.max(...methods.map((m) => R[m].pos[item]));
      return { item, ranks, avg, min, max, spread: max - min, firsts, worstPos };
    });
    rows.sort((a, b) => a.avg - b.avg || b.firsts - a.firsts || a.max - b.max);

    // Agreement: mean Spearman correlation across method pairs, plus each method's
    // mean agreement with the others (to find the odd one out).
    const pairCorr = [];
    const perMethod = Object.fromEntries(methods.map((m) => [m, []]));
    for (let i = 0; i < methods.length; i++) {
      for (let j = i + 1; j < methods.length; j++) {
        const a = S.items.map((it) => R[methods[i]].rank[it]);
        const b = S.items.map((it) => R[methods[j]].rank[it]);
        const c = correlation(a, b);
        pairCorr.push(c);
        perMethod[methods[i]].push(c);
        perMethod[methods[j]].push(c);
      }
    }
    const agreement = pairCorr.length ? pairCorr.reduce((s, x) => s + x, 0) / pairCorr.length : 1;
    const methodAgreement = Object.fromEntries(methods.map((m) => [m, perMethod[m].reduce((s, x) => s + x, 0) / (perMethod[m].length || 1)]));

    // Confidence in the top pick.
    const top = rows[0];
    const second = rows[1];
    const gap = second ? second.avg - top.avg : n;
    let confidence;
    if (methods.length >= 3 && ((gap >= 1 && top.max <= 2) || (top.firsts === methods.length && gap > 0))) confidence = "high";
    else if (gap >= 0.5 && top.max <= Math.max(3, Math.ceil(n / 3))) confidence = "medium";
    else confidence = "low";

    const shakyThreshold = Math.max(2, Math.ceil((n - 1) / 2));
    return { methods, R, rows, n, agreement, methodAgreement, confidence, gap, shakyThreshold };
  }

  const fmtRank = (r) => (Number.isInteger(r) ? `#${r}` : `#${r.toFixed(1)}`);
  const fmtAvg = (r) => r.toFixed(1).replace(/\.0$/, "");

  // ---------------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------------
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    return { view: parts[0] || "list", arg: parts[1] || null };
  }

  function render() {
    keyHandler = null;
    let { view, arg } = route();
    if (view !== "list" && S.items.length < MIN_ITEMS) view = "list";
    if (view === "rank" && arg && !METHODS[arg]) arg = null;

    app.classList.toggle("wide", view === "results");
    if (view === "list") renderList();
    else if (view === "rank" && arg) renderMethod(arg);
    else if (view === "rank") renderHub();
    else if (view === "results") renderResults();
    else renderList();

    updateSteps(view);
    window.scrollTo(0, 0);
  }

  function updateSteps(view) {
    const ready = S.items.length >= MIN_ITEMS;
    const done = doneMethods().length;
    for (const a of $$(".steps a")) {
      const step = a.dataset.step;
      a.classList.toggle("active", step === view);
      a.classList.toggle("done", (step === "list" && ready && view !== "list") || (step === "rank" && done >= 2 && view !== "rank"));
      a.classList.toggle("disabled", (step === "rank" && !ready) || (step === "results" && done < 2));
      if (step === view) a.setAttribute("aria-current", "step");
      else a.removeAttribute("aria-current");
    }
  }

  // ---------------------------------------------------------------------------
  // View: list
  // ---------------------------------------------------------------------------
  function renderList() {
    const hasList = S.items.length >= MIN_ITEMS;
    const titleVal = draftTitle ?? S.title;
    const itemsVal = draftItems ?? S.items.join("\n");

    app.innerHTML = `
      <section class="hero">
        <p class="eyebrow">Step 1 of 3</p>
        <h1>${hasList ? "Your options" : "What are you deciding?"}</h1>
        <p class="lede">List your options. Then rank them a few different ways. RankIt shows you which choices hold up no matter how you ask, and which ones depend on the method.</p>
      </section>

      <div class="card stack">
        <label class="field">
          <span class="field-label">The question <span class="muted">optional</span></span>
          <input id="titleIn" class="input title-input" maxlength="120" placeholder="Where should I live next year?" value="${esc(titleVal)}" />
        </label>
        <label class="field">
          <span class="field-label">Options, one per line <span class="muted" id="countLbl"></span></span>
          <textarea id="itemsIn" class="textarea" spellcheck="true" placeholder="Lisbon&#10;Mexico City&#10;Chiang Mai&#10;Stay put">${esc(itemsVal)}</textarea>
          <div id="itemsErr" class="error" hidden></div>
        </label>
        ${EXAMPLES.length ? `<div class="row small"><span class="muted">Need a starting point?</span><button type="button" class="link-btn" id="exOpen">Browse ${EXAMPLES.length} examples</button></div>` : ""}
        <div class="row between">
          <span class="muted small">${MIN_ITEMS}–${MAX_ITEMS} options. Pasting a comma-separated list works too.</span>
          <button id="continueBtn" class="btn primary">Continue →</button>
        </div>
      </div>`;

    const titleIn = $("#titleIn");
    const itemsIn = $("#itemsIn");
    const countLbl = $("#countLbl");
    const err = $("#itemsErr");
    const btn = $("#continueBtn");

    function check() {
      const { items, dupes, tooLong } = parseItems(itemsIn.value);
      countLbl.textContent = items.length ? `${items.length} option${items.length === 1 ? "" : "s"}` : "";
      let msg = "";
      if (items.length > MAX_ITEMS) msg = `That's ${items.length}. Keep it to ${MAX_ITEMS} or fewer.`;
      else if (dupes) msg = `${dupes} duplicate${dupes > 1 ? "s" : ""} will be dropped.`;
      else if (tooLong) msg = `Options longer than ${MAX_ITEM_LEN} characters will be cut off.`;
      err.textContent = msg;
      err.hidden = !msg;
      btn.disabled = items.length < MIN_ITEMS || items.length > MAX_ITEMS;
      return items;
    }

    titleIn.addEventListener("input", () => { draftTitle = titleIn.value; });
    itemsIn.addEventListener("input", () => { draftItems = itemsIn.value; check(); });
    check();

    $("#exOpen")?.addEventListener("click", async () => {
      const ex = await pickExample();
      if (!ex) return;
      const current = parseItems(itemsIn.value).items;
      if (current.length && current.join("\n") !== ex.items.join("\n") &&
          !(await confirmBox(`Replace your ${current.length} options with "${ex.title}"?`, "Replace"))) return;
      titleIn.value = draftTitle = ex.title;
      itemsIn.value = draftItems = ex.items.join("\n");
      check();
      itemsIn.focus({ preventScroll: true });
    });

    btn.addEventListener("click", async () => {
      const items = check();
      if (items.length < MIN_ITEMS || items.length > MAX_ITEMS) return;
      const sameSet = items.length === S.items.length && items.every((x) => S.items.includes(x));
      const finished = doneMethods().length;
      const started = Object.keys(S.progress).length;
      if (!sameSet && (finished || started)) {
        const ok = await confirmBox(
          `Changing the options resets your ${finished ? `${finished} finished ranking${finished > 1 ? "s" : ""}` : "rankings in progress"}. Continue?`,
          "Reset and continue"
        );
        if (!ok) return;
        S.results = {};
        S.progress = {};
      }
      S.title = titleIn.value.trim().slice(0, 120);
      S.items = items;
      draftTitle = draftItems = null;
      save();
      go("#/rank");
    });

    if (!hasList) itemsIn.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------
  // Example picker (dialog)
  // ---------------------------------------------------------------------------
  function pickExample() {
    const dlg = $("#examplesDialog");
    const search = $("#exSearch");
    const groupsEl = $("#exGroups");
    const listEl = $("#exList");
    let group = "all";

    const preview = (items) => {
      const shown = items.slice(0, 4).join(", ");
      return items.length > 4 ? `${shown} +${items.length - 4}` : shown;
    };

    const draw = () => {
      const q = search.value.trim().toLowerCase();
      groupsEl.innerHTML = [{ id: "all", name: "All" }, ...EXAMPLE_GROUPS]
        .map((g) => `<button type="button" role="tab" class="ex-tab" data-g="${g.id}" aria-selected="${g.id === group}">${esc(g.name)}</button>`)
        .join("");
      const hits = EXAMPLES.map((ex, i) => ({ ex, i })).filter(({ ex }) =>
        (group === "all" || ex.g === group) &&
        (!q || ex.title.toLowerCase().includes(q) || ex.items.some((it) => it.toLowerCase().includes(q)))
      );
      listEl.innerHTML = hits.length
        ? hits.map(({ ex, i }) => `
            <li><button type="button" class="ex-item" data-i="${i}">
              <span class="ex-title">${esc(ex.title)}</span>
              <span class="ex-preview">${esc(preview(ex.items))}</span>
            </button></li>`).join("")
        : `<li class="ex-empty">No examples match “${esc(search.value)}”.</li>`;
    };

    return new Promise((resolve) => {
      let picked = null;
      const onGroup = (e) => {
        const b = e.target.closest(".ex-tab");
        if (!b) return;
        group = b.dataset.g;
        draw();
      };
      const onPick = (e) => {
        const b = e.target.closest(".ex-item");
        if (!b) return;
        picked = EXAMPLES[+b.dataset.i];
        dlg.close();
      };
      const onBackdrop = (e) => { if (e.target === dlg) dlg.close(); };
      const onClose = () => dlg.close();
      groupsEl.addEventListener("click", onGroup);
      listEl.addEventListener("click", onPick);
      search.addEventListener("input", draw);
      dlg.addEventListener("click", onBackdrop);
      $("#exClose").addEventListener("click", onClose);
      dlg.addEventListener("close", () => {
        groupsEl.removeEventListener("click", onGroup);
        listEl.removeEventListener("click", onPick);
        search.removeEventListener("input", draw);
        dlg.removeEventListener("click", onBackdrop);
        $("#exClose").removeEventListener("click", onClose);
        resolve(picked);
      }, { once: true });

      search.value = "";
      draw();
      listEl.scrollTop = 0;
      dlg.showModal();
      if (matchMedia("(pointer: fine)").matches) search.focus();
      else dlg.focus();
    });
  }

  // ---------------------------------------------------------------------------
  // View: rank hub
  // ---------------------------------------------------------------------------
  function nextSuggested() {
    return METHOD_ORDER.find((m) => !S.results[m]) || null;
  }

  function renderHub() {
    const done = doneMethods();
    const n = S.items.length;
    let leader = "";
    if (done.length) {
      const a = analyze();
      leader = done.length === 1
        ? `So far <strong>${esc(a.rows[0].item)}</strong> is on top.`
        : `<strong>${esc(a.rows[0].item)}</strong> leads after ${done.length} methods.`;
    }

    app.innerHTML = `
      <section class="hero compact">
        <div class="decision-strip">
          <div>
            <p class="eyebrow">Step 2 of 3 · ${n} options</p>
            <h1 style="font-size:clamp(28px,5vw,38px)">${esc(S.title || "Rank your options")}</h1>
          </div>
          <a class="link-btn" href="#/">Edit options</a>
        </div>
        <p class="lede">Each method asks the question a different way. Do at least two. Options that stay near the top every time are the ones to trust.</p>
      </section>

      <ul class="method-list">
        ${METHOD_ORDER.map((m) => {
          const M = METHODS[m];
          const isDone = !!S.results[m];
          const partial = !isDone && S.progress[m];
          const status = isDone ? "Done" : partial ? "In progress" : "Start";
          const meta = isDone ? `#1: ${esc(S.results[m].order[0])}` : M.effort(n);
          return `
          <li class="method-row ${isDone ? "done" : ""} ${partial ? "partial" : ""}" data-m="${m}" tabindex="0" role="button" aria-label="${esc(M.name)}: ${status}">
            <span class="method-glyph">${icon(m)}</span>
            <div><h3>${M.name}</h3><p>${M.blurb}</p></div>
            <div class="method-meta"><strong>${status}</strong>${meta}</div>
          </li>`;
        }).join("")}
      </ul>

      <div class="cta-bar">
        <div class="row">
          <span class="dots">${METHOD_ORDER.map((m) => `<i class="${S.results[m] ? "on" : ""}"></i>`).join("")}</span>
          <span class="small">${done.length < 2
            ? `${done.length} of 5 done. ${2 - done.length} more to compare. ${leader}`
            : `${done.length} of 5 done. ${leader}`}</span>
        </div>
        <button class="btn ${done.length >= 2 ? "accent" : "primary"}" id="hubCta">
          ${done.length >= 2 ? "Compare results →" : `Start with ${METHODS[nextSuggested()].name} →`}
        </button>
      </div>`;

    $$(".method-row").forEach((row) => {
      const open = () => go(`#/rank/${row.dataset.m}`);
      row.addEventListener("click", open);
      row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    $("#hubCta").addEventListener("click", () => go(done.length >= 2 ? "#/results" : `#/rank/${nextSuggested()}`));
  }

  // ---------------------------------------------------------------------------
  // View: method (shared chrome)
  // ---------------------------------------------------------------------------
  function methodShell(m, body, { progress = null, sub = "" } = {}) {
    const M = METHODS[m];
    return `
      <div class="method-head">
        <a class="btn ghost small" href="#/rank">← Methods</a>
        <span class="muted small">${sub}</span>
      </div>
      <h2>${M.name}</h2>
      <p class="instructions">${M.instructions}</p>
      ${progress !== null ? `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress * 100)}"><i style="width:${progress * 100}%"></i></div>` : ""}
      ${body}`;
  }

  function finishMethod(m, order, values) {
    S.results[m] = { order, at: new Date().toISOString() };
    if (values) S.results[m].values = values;
    delete S.progress[m];
    save();
    renderDone(m);
  }

  function renderMethod(m) {
    if (S.results[m]) return renderDone(m);
    ({ gut: renderGut, duel: renderDuel, tiers: renderTiers, points: renderPoints, cut: renderCut })[m]();
  }

  function renderDone(m) {
    const r = S.results[m];
    const { pos, tied } = computeRanks(r);
    const done = doneMethods().length;
    const next = nextSuggested();
    const valueLabel = (it) => (r.values ? (m === "points" ? `${r.values[it]} pts` : r.values[it]) : "");

    app.innerHTML = `
      <div class="method-head">
        <a class="btn ghost small" href="#/rank">← Methods</a>
        <button class="link-btn" id="redoBtn">Redo this method</button>
      </div>
      <div class="card done-card">
        <p class="eyebrow">${METHODS[m].name} · saved</p>
        <div class="winner">${esc(r.order[0])}</div>
        <p class="muted">${tied[r.order[0]] ? "Tied for the top spot here." : "Came out on top with this method."}</p>
        <ol class="mini-rank">
          ${r.order.map((it) => `<li><span>${tied[it] ? "=" : ""}${pos[it]}</span>${esc(it)}<span class="muted" style="margin-left:auto;width:auto">${esc(valueLabel(it))}</span></li>`).join("")}
        </ol>
        <div class="row" style="justify-content:center;margin-top:28px">
          ${done >= 2 ? `<a class="btn accent" href="#/results">Compare ${done} methods →</a>` : ""}
          ${next ? `<a class="btn ${done >= 2 ? "" : "primary"}" href="#/rank/${next}">Next: ${METHODS[next].name}</a>` : ""}
        </div>
        ${done < 2 ? `<p class="muted small" style="margin-top:14px">One more method and you can compare.</p>` : ""}
      </div>`;

    $("#redoBtn").addEventListener("click", async () => {
      const ok = await confirmBox(`Clear your ${METHODS[m].name} result and do it again?`, "Redo");
      if (!ok) return;
      delete S.results[m];
      delete S.progress[m];
      save();
      render();
    });
  }

  // ---------------------------------------------------------------------------
  // Method: Gut order (sortable list)
  // ---------------------------------------------------------------------------
  function renderGut() {
    let order = Array.isArray(S.progress.gut) && S.progress.gut.length === S.items.length && S.progress.gut.every((x) => S.items.includes(x))
      ? S.progress.gut.slice()
      : S.items.slice();

    const arrow = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
    app.innerHTML = methodShell("gut", `
      <ol class="sortable" id="sortList">
        ${order.map((it, i) => `
          <li class="sort-item" data-item="${esc(it)}">
            <span class="num">${i + 1}</span>
            <span class="name">${esc(it)}</span>
            <span class="ctl">
              <button class="up" aria-label="Move ${esc(it)} up">${arrow("m18 15-6-6-6 6")}</button>
              <button class="down" aria-label="Move ${esc(it)} down">${arrow("m6 9 6 6 6-6")}</button>
              <button class="handle" aria-label="Drag ${esc(it)}">${arrow("M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01")}</button>
            </span>
          </li>`).join("")}
      </ol>
      <div class="footer-actions">
        <button class="btn primary" id="saveGut">Save this order</button>
      </div>`);

    const list = $("#sortList");
    const sync = () => {
      order = $$(".sort-item", list).map((li) => li.dataset.item);
      $$(".sort-item .num", list).forEach((el, i) => (el.textContent = i + 1));
      S.progress.gut = order;
      save();
    };

    list.addEventListener("click", (e) => {
      const btn = e.target.closest("button.up, button.down");
      if (!btn) return;
      const li = btn.closest(".sort-item");
      if (btn.classList.contains("up") && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
      else if (btn.classList.contains("down") && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
      else return;
      li.classList.remove("flash");
      void li.offsetWidth;
      li.classList.add("flash");
      btn.focus();
      sync();
    });

    // Pointer drag: works for mouse, pen and touch.
    list.addEventListener("pointerdown", (e) => {
      const handle = e.target.closest(".handle");
      if (!handle) return;
      const li = handle.closest(".sort-item");
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      li.classList.add("dragging");
      let startY = e.clientY;

      const move = (ev) => {
        let dy = ev.clientY - startY;
        const prev = li.previousElementSibling;
        const next = li.nextElementSibling;
        if (prev && dy < -prev.offsetHeight / 2) {
          list.insertBefore(li, prev);
          startY -= prev.offsetHeight + 8;
        } else if (next && dy > next.offsetHeight / 2) {
          list.insertBefore(next, li);
          startY += next.offsetHeight + 8;
        }
        dy = ev.clientY - startY;
        li.style.transform = `translateY(${dy}px)`;
      };
      const up = () => {
        li.classList.remove("dragging");
        li.style.transform = "";
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        sync();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });

    $("#saveGut").addEventListener("click", () => finishMethod("gut", order));
  }

  // ---------------------------------------------------------------------------
  // Method: Head-to-head (resumable merge sort)
  // ---------------------------------------------------------------------------
  function duelInit() {
    return { queue: shuffle(S.items).map((x) => [x]), next: [], cur: null, count: 0, history: [], done: null };
  }

  function duelAdvance(d) {
    for (;;) {
      if (d.cur) {
        if (d.cur.L.length && d.cur.R.length) return;
        d.next.push([...d.cur.out, ...d.cur.L, ...d.cur.R]);
        d.cur = null;
        continue;
      }
      if (d.queue.length >= 2) {
        d.cur = { L: d.queue.shift(), R: d.queue.shift(), out: [] };
      } else if (d.queue.length === 1 && d.next.length === 0) {
        d.done = d.queue[0];
        return;
      } else {
        if (d.queue.length === 1) d.next.push(d.queue.shift());
        d.queue = d.next;
        d.next = [];
      }
    }
  }

  /** Upper bound on comparisons still needed. */
  function duelRemaining(d) {
    if (d.done) return 0;
    let cost = 0;
    let sizes = d.next.map((l) => l.length);
    if (d.cur) {
      cost += d.cur.L.length + d.cur.R.length - 1;
      sizes.push(d.cur.L.length + d.cur.R.length + d.cur.out.length);
    }
    const q = d.queue.map((l) => l.length);
    for (let i = 0; i + 1 < q.length; i += 2) { cost += q[i] + q[i + 1] - 1; sizes.push(q[i] + q[i + 1]); }
    if (q.length % 2) sizes.push(q[q.length - 1]);
    while (sizes.length > 1) {
      const nxt = [];
      for (let i = 0; i + 1 < sizes.length; i += 2) { cost += sizes[i] + sizes[i + 1] - 1; nxt.push(sizes[i] + sizes[i + 1]); }
      if (sizes.length % 2) nxt.push(sizes[sizes.length - 1]);
      sizes = nxt;
    }
    return cost;
  }

  function validDuel(d) {
    if (!d || !Array.isArray(d.queue) || !Array.isArray(d.next)) return false;
    const all = [...d.queue.flat(), ...d.next.flat(), ...(d.cur ? [...d.cur.L, ...d.cur.R, ...d.cur.out] : [])];
    return all.length === S.items.length && all.every((x) => S.items.includes(x));
  }

  function renderDuel() {
    let d = validDuel(S.progress.duel) ? S.progress.duel : duelInit();
    duelAdvance(d);
    if (d.done) return finishMethod("duel", d.done);
    S.progress.duel = d;
    save();

    const left = d.cur.L[0];
    const right = d.cur.R[0];
    const remaining = duelRemaining(d);
    const pct = d.count / (d.count + remaining);

    app.innerHTML = methodShell("duel", `
      <div class="duel">
        <button class="duel-option" data-side="L"><span>${esc(left)}</span><kbd>←</kbd></button>
        <span class="duel-or">or</span>
        <button class="duel-option" data-side="R"><span>${esc(right)}</span><kbd>→</kbd></button>
      </div>
      <div class="row between" style="margin-top:22px">
        <button class="btn ghost small" id="undoDuel" ${d.history.length ? "" : "disabled"}>↶ Undo</button>
        <span class="muted small">${d.count} picked · at most ${remaining} to go</span>
      </div>`, { progress: pct, sub: `Pick ${d.count + 1}` });

    const pick = (side) => {
      const btn = $(`.duel-option[data-side="${side}"]`);
      if (!btn || btn.classList.contains("picked")) return;
      btn.classList.add("picked");
      const { history, ...snap } = d;
      d.history = [...history.slice(-150), JSON.stringify(snap)];
      d.cur.out.push(side === "L" ? d.cur.L.shift() : d.cur.R.shift());
      d.count++;
      S.progress.duel = d;
      save();
      setTimeout(renderDuel, 140);
    };
    const undo = () => {
      if (!d.history.length) return;
      const prev = JSON.parse(d.history.pop());
      S.progress.duel = { ...prev, history: d.history };
      save();
      renderDuel();
    };

    $$(".duel-option").forEach((b) => b.addEventListener("click", () => pick(b.dataset.side)));
    $("#undoDuel").addEventListener("click", undo);
    keyHandler = (e) => {
      if (e.key === "ArrowLeft") pick("L");
      else if (e.key === "ArrowRight") pick("R");
      else if (e.key === "Backspace" || e.key.toLowerCase() === "u" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z")) { e.preventDefault(); undo(); }
    };
  }

  // ---------------------------------------------------------------------------
  // Method: Tiers
  // ---------------------------------------------------------------------------
  function renderTiers() {
    const t = S.progress.tiers && typeof S.progress.tiers === "object" ? S.progress.tiers : {};
    const placed = S.items.filter((it) => TIERS.includes(t[it])).length;
    const counts = Object.fromEntries(TIERS.map((x) => [x, S.items.filter((it) => t[it] === x).length]));

    app.innerHTML = methodShell("tiers", `
      <div class="tier-summary">${TIERS.map((x) => `<div><b>${x}</b>${counts[x]}</div>`).join("")}</div>
      <div class="tier-list">
        ${S.items.map((it, i) => `
          <div class="tier-row">
            <span class="name">${esc(it)}</span>
            <span class="seg" role="group" aria-label="Tier for ${esc(it)}">
              ${TIERS.map((x) => `<button data-i="${i}" data-tier="${x}" aria-pressed="${t[it] === x}">${x}</button>`).join("")}
            </span>
          </div>`).join("")}
      </div>
      <div class="footer-actions">
        <span class="muted small" style="margin-right:auto;align-self:center">${placed} of ${S.items.length} placed</span>
        <button class="btn primary" id="saveTiers" ${placed === S.items.length ? "" : "disabled"}>Save tiers</button>
      </div>`, { progress: placed / S.items.length });

    $$(".seg button").forEach((b) =>
      b.addEventListener("click", () => {
        const it = S.items[+b.dataset.i];
        t[it] = b.dataset.tier;
        S.progress.tiers = t;
        save();
        const y = window.scrollY;
        renderTiers();
        window.scrollTo(0, y);
        $(`.seg button[data-i="${b.dataset.i}"][data-tier="${b.dataset.tier}"]`)?.focus({ preventScroll: true });
      })
    );

    $("#saveTiers").addEventListener("click", () => {
      const order = S.items.slice().sort((a, b) => TIERS.indexOf(t[a]) - TIERS.indexOf(t[b]));
      finishMethod("tiers", order, Object.fromEntries(S.items.map((it) => [it, t[it]])));
    });
  }

  // ---------------------------------------------------------------------------
  // Method: 100 points
  // ---------------------------------------------------------------------------
  function renderPoints() {
    const p = S.progress.points && typeof S.progress.points === "object" ? S.progress.points : {};
    for (const it of S.items) p[it] = Math.max(0, Math.min(POINTS_BUDGET, Math.round(+p[it] || 0)));
    S.progress.points = p;

    app.innerHTML = methodShell("points", `
      <div class="points-total" id="pTotal">
        <div><div class="big" id="pLeft"></div><div class="small" id="pLbl"></div></div>
        <button class="btn small" id="pScale" hidden>Scale to ${POINTS_BUDGET}</button>
      </div>
      ${S.items.map((it, i) => `
        <div class="point-row">
          <span class="name">${esc(it)}</span>
          <input type="range" min="0" max="${POINTS_BUDGET}" step="1" value="${p[it]}" data-i="${i}" aria-label="Points for ${esc(it)}" />
          <span class="stepper">
            <button data-i="${i}" data-d="-1" aria-label="One less">−</button>
            <input type="number" inputmode="numeric" min="0" max="${POINTS_BUDGET}" value="${p[it]}" data-i="${i}" aria-label="Points for ${esc(it)}" />
            <button data-i="${i}" data-d="1" aria-label="One more">+</button>
          </span>
        </div>`).join("")}
      <div class="footer-actions">
        <button class="btn ghost" id="pReset">Clear</button>
        <button class="btn primary" id="savePoints">Save points</button>
      </div>`);

    const total = () => S.items.reduce((s, it) => s + p[it], 0);
    const refresh = () => {
      const sum = total();
      const left = POINTS_BUDGET - sum;
      $("#pLeft").textContent = left >= 0 ? left : `+${-left}`;
      $("#pLbl").textContent = left > 0 ? "points left to spend" : left === 0 ? "All spent. Ready to save." : "points over budget";
      const box = $("#pTotal");
      box.classList.toggle("over", left < 0);
      box.classList.toggle("exact", left === 0);
      $("#pScale").hidden = left === 0 || sum === 0;
      $("#savePoints").disabled = left !== 0;
      S.progress.points = p;
      save();
    };
    const set = (i, v) => {
      const it = S.items[i];
      p[it] = Math.max(0, Math.min(POINTS_BUDGET, Math.round(+v || 0)));
      $$(`[data-i="${i}"]`).forEach((el) => { if (el.tagName === "INPUT") el.value = p[it]; });
      refresh();
    };

    $$('input[type="range"]').forEach((el) => el.addEventListener("input", () => set(+el.dataset.i, el.value)));
    $$('.stepper input').forEach((el) => {
      el.addEventListener("change", () => set(+el.dataset.i, el.value));
      el.addEventListener("focus", () => el.select());
    });
    $$(".stepper button").forEach((b) => b.addEventListener("click", () => set(+b.dataset.i, p[S.items[+b.dataset.i]] + +b.dataset.d)));

    $("#pScale").addEventListener("click", () => {
      // Largest-remainder rounding so the result sums to exactly 100.
      const sum = total();
      const raw = S.items.map((it) => (p[it] / sum) * POINTS_BUDGET);
      const base = raw.map(Math.floor);
      let rest = POINTS_BUDGET - base.reduce((s, x) => s + x, 0);
      raw.map((x, i) => [x - base[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0) { base[i]++; rest--; } });
      base.forEach((v, i) => set(i, v));
    });
    $("#pReset").addEventListener("click", () => S.items.forEach((_, i) => set(i, 0)));
    $("#savePoints").addEventListener("click", () => {
      const order = S.items.slice().sort((a, b) => p[b] - p[a]);
      finishMethod("points", order, { ...p });
    });
    refresh();
  }

  // ---------------------------------------------------------------------------
  // Method: Elimination
  // ---------------------------------------------------------------------------
  function renderCut() {
    const out = Array.isArray(S.progress.cut) ? S.progress.cut.filter((x) => S.items.includes(x)) : [];
    const remaining = S.items.filter((it) => !out.includes(it));
    if (remaining.length === 1) return finishMethod("cut", [remaining[0], ...out.slice().reverse()]);
    const n = S.items.length;

    app.innerHTML = methodShell("cut", `
      <div class="cut-grid">
        ${remaining.map((it) => `<button class="cut-card" data-item="${esc(it)}" aria-label="Eliminate ${esc(it)}">${esc(it)}</button>`).join("")}
      </div>
      <div class="row between" style="margin-top:22px">
        <button class="btn ghost small" id="undoCut" ${out.length ? "" : "disabled"}>↶ Undo</button>
        <span class="muted small">${remaining.length} left</span>
      </div>
      ${out.length ? `<p class="cut-log">Out so far: ${out.map((x) => `<s>${esc(x)}</s>`).join(", ")}</p>` : ""}`,
      { progress: out.length / (n - 1), sub: `Round ${out.length + 1} of ${n - 1}` });

    $$(".cut-card").forEach((b) =>
      b.addEventListener("click", () => {
        S.progress.cut = [...out, b.dataset.item];
        save();
        renderCut();
      })
    );
    $("#undoCut").addEventListener("click", () => {
      S.progress.cut = out.slice(0, -1);
      save();
      renderCut();
    });
    keyHandler = (e) => {
      if ((e.key === "Backspace" || e.key.toLowerCase() === "u") && out.length) { e.preventDefault(); $("#undoCut").click(); }
    };
  }

  // ---------------------------------------------------------------------------
  // View: results
  // ---------------------------------------------------------------------------
  function buildInsights(a) {
    const { rows, methods, R, n, shakyThreshold } = a;
    const out = [];
    const nameOf = (m) => METHODS[m].name;

    // 1. Steady options
    const steady = rows.filter((r) => r.spread <= 1).slice(0, 4).map((r) => `<strong>${esc(r.item)}</strong>`);
    out.push({
      h: "Holds steady",
      p: steady.length
        ? `${listJoin(steady)} ${steady.length === 1 ? "lands" : "land"} in about the same spot no matter how you rank.`
        : "Nothing lands in the same spot every time. Your methods disagree a lot, so take the order with a grain of salt.",
    });

    // 2. Depends on method
    const swing = rows.slice().sort((x, y) => y.spread - x.spread)[0];
    if (swing && swing.spread >= shakyThreshold) {
      const best = methods.reduce((b, m) => (R[m].rank[swing.item] < R[b].rank[swing.item] ? m : b), methods[0]);
      const worst = methods.reduce((w, m) => (R[m].rank[swing.item] > R[w].rank[swing.item] ? m : w), methods[0]);
      out.push({
        h: "Depends on how you ask",
        p: `<strong>${esc(swing.item)}</strong> moves from #${R[best].pos[swing.item]} in ${nameOf(best)} to #${R[worst].pos[swing.item]} in ${nameOf(worst)}. Ask yourself what changed between those two.`,
      });
    } else {
      out.push({ h: "Depends on how you ask", p: "Nothing swings much. The methods mostly agree on where each option belongs." });
    }

    // 3. Gut vs deliberate
    const others = methods.filter((m) => m !== "gut");
    if (methods.includes("gut") && others.length) {
      const diffs = S.items.map((it) => {
        const otherAvg = others.reduce((s, m) => s + R[m].rank[it], 0) / others.length;
        return { it, gut: R.gut.rank[it], otherAvg, d: otherAvg - R.gut.rank[it] };
      });
      const over = diffs.slice().sort((x, y) => y.d - x.d)[0];
      const under = diffs.slice().sort((x, y) => x.d - y.d)[0];
      if (over.d >= 1.5 || under.d <= -1.5) {
        const big = over.d >= -under.d ? over : under;
        out.push({
          h: "Gut check",
          p: big === over
            ? `Your gut puts <strong>${esc(big.it)}</strong> at #${R.gut.pos[big.it]}, but the slower methods put it near ${fmtRank(Math.round(big.otherAvg))}. Is that a real pull, or just a habit?`
            : `Your gut puts <strong>${esc(big.it)}</strong> at #${R.gut.pos[big.it]}, but the slower methods rank it higher, near ${fmtRank(Math.round(big.otherAvg))}. You might be underselling it.`,
        });
      } else {
        out.push({ h: "Gut check", p: "Your gut order matches the slower methods. Your first instinct seems reliable here." });
      }
    }

    // 4. Agreement / odd one out
    const pct = Math.round(Math.max(0, a.agreement) * 100);
    let p = `Your methods agree <strong>${pct}%</strong> on average${pct >= 75 ? ", which is strong" : pct >= 45 ? ", which is moderate" : ", which is weak"}.`;
    if (methods.length >= 3) {
      const odd = methods.reduce((o, m) => (a.methodAgreement[m] < a.methodAgreement[o] ? m : o), methods[0]);
      const avgOthers = methods.filter((m) => m !== odd).reduce((s, m) => s + a.methodAgreement[m], 0) / (methods.length - 1);
      if (avgOthers - a.methodAgreement[odd] > 0.2) p += ` ${nameOf(odd)} is the odd one out.`;
    }
    out.push({ h: "Agreement", p });
    return out;
  }

  function listJoin(arr) {
    if (arr.length <= 1) return arr.join("");
    return `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`;
  }

  function renderResults() {
    const methods = doneMethods();
    if (methods.length < 2) {
      app.innerHTML = `
        <div class="empty">
          <h2>Not enough to compare yet</h2>
          <p>Finish at least two methods. The comparison is where RankIt earns its keep.</p>
          <a class="btn primary" href="#/rank/${nextSuggested()}">Do ${METHODS[nextSuggested()].name} →</a>
        </div>`;
      return;
    }

    const a = analyze();
    const { rows, n, R, confidence, shakyThreshold } = a;
    const top = rows[0];
    const close = rows.filter((r) => r.avg - top.avg < 0.5);
    const confLabel = { high: "Clear choice", medium: "Leaning one way", low: "Too close to call" }[confidence];
    const next = nextSuggested();

    let headline, sub;
    const record = `#1 in ${top.firsts} of ${methods.length} methods`;
    if (confidence === "low" && close.length >= 2) {
      headline = `It's between ${listJoin(close.slice(0, 3).map((r) => `<em>${esc(r.item)}</em>`))}.`;
      sub = `They're within half a place of each other on average.${next ? ` ${METHODS[next].name} could break the tie.` : " This might really be a coin flip. Pick the one you'd regret skipping."}`;
    } else if (confidence === "low") {
      headline = `<em>${esc(top.item)}</em> edges ahead, barely.`;
      sub = `${record}, but it drops as low as #${top.worstPos}. Your methods disagree, so nothing is a safe bet yet.${next ? ` Try ${METHODS[next].name}.` : ""}`;
    } else if (confidence === "medium") {
      headline = `<em>${esc(top.item)}</em> comes out on top.`;
      sub = `${record}, and never lower than #${top.worstPos}.${next ? ` Try ${METHODS[next].name} to be more sure.` : ""}`;
    } else {
      headline = `<em>${esc(top.item)}</em> is the clear choice.`;
      sub = `${record}, and never lower than #${top.worstPos}. It holds up no matter how you ask.`;
    }

    const cellStyle = (r) => {
      const t = n > 1 ? 1 - (r - 1) / (n - 1) : 1;
      const pct = Math.round(8 + t * 82);
      const color = t > 0.55 ? "var(--accent-ink)" : "var(--ink)";
      return `background:color-mix(in srgb, var(--accent) ${pct}%, transparent);color:${color}`;
    };

    const valueLabel = (m, it) => {
      const r = S.results[m];
      if (!r.values) return "";
      return m === "points" ? ` · ${r.values[it]} pts` : ` · tier ${r.values[it]}`;
    };

    app.innerHTML = `
      <section class="verdict">
        <p class="eyebrow">${esc(S.title || "Your decision")} · ${methods.length} methods</p>
        <h1>${headline}</h1>
        <p class="lede">${sub}</p>
        <span class="confidence ${confidence}"><i></i>${confLabel}</span>
      </section>

      <div class="insights">
        ${buildInsights(a).map((x) => `<div class="insight"><h3>${x.h}</h3><p>${x.p}</p></div>`).join("")}
      </div>

      <div class="section-head">
        <h2>Every method side by side</h2>
        <span class="muted small">Darker means ranked higher</span>
      </div>
      <div class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th>#</th>
              <th class="item-cell">Option</th>
              ${methods.map((m) => `<th title="${esc(METHODS[m].name)}">${METHODS[m].short}</th>`).join("")}
              <th>Avg</th>
              <th>Range</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, i) => {
              const kind = row.spread <= 1 ? "steady" : row.spread >= shakyThreshold ? "shaky" : "";
              const left = n > 1 ? ((row.min - 1) / (n - 1)) * 100 : 0;
              const width = n > 1 ? (row.spread / (n - 1)) * 100 : 0;
              return `
              <tr>
                <td class="pos">${i + 1}</td>
                <td class="item-cell">${esc(row.item)}${kind === "shaky" ? '<span class="tag shaky">swings</span>' : ""}</td>
                ${methods.map((m) => {
                  const rk = R[m].rank[row.item];
                  const label = `${R[m].tied[row.item] ? "=" : ""}${R[m].pos[row.item]}`;
                  return `<td><span class="rank-cell" style="${cellStyle(rk)}" title="${esc(METHODS[m].name)}: #${label}${esc(valueLabel(m, row.item))}">${label}</span></td>`;
                }).join("")}
                <td><strong>${fmtAvg(row.avg)}</strong></td>
                <td><div class="spread" title="Best #${Math.min(...methods.map((m) => R[m].pos[row.item]))}, worst #${row.worstPos}"><span class="bar ${kind}" style="left:calc(${left}% - 4px);width:calc(${width}% + 8px)"></span></div></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div class="legend">
        <span>Range: best to worst rank across methods. Green is steady, orange swings.</span>
        <span>= means tied in that method.</span>
      </div>

      <div class="section">
        <div class="section-head"><h2>What did you decide?</h2><span class="muted small">Saved with this decision</span></div>
        <textarea id="noteIn" class="textarea note" placeholder="I'm going with ___ because…">${esc(S.note)}</textarea>
      </div>

      <div class="section row">
        <button class="btn primary" data-action="share">Copy share link</button>
        <button class="btn" data-action="export-csv">Export CSV</button>
        ${next ? `<a class="btn ghost" href="#/rank/${next}">Add ${METHODS[next].name}</a>` : ""}
      </div>`;

    $("#noteIn").addEventListener("input", (e) => { S.note = e.target.value.slice(0, 4000); save(); });
  }

  // ---------------------------------------------------------------------------
  // Share / import / export
  // ---------------------------------------------------------------------------
  const b64urlEncode = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64urlDecode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

  function shareLink() {
    // Compact payload: item indices instead of repeating names.
    const idx = Object.fromEntries(S.items.map((it, i) => [it, i]));
    const payload = { t: S.title, i: S.items, n: S.note, r: {} };
    for (const m of doneMethods()) {
      const r = S.results[m];
      payload.r[m] = { o: r.order.map((x) => idx[x]) };
      if (r.values) payload.r[m].v = S.items.map((it) => r.values[it]);
    }
    const url = new URL(location.href);
    url.hash = "#/results";
    url.search = `?d=${b64urlEncode(JSON.stringify(payload))}`;
    return url.toString();
  }

  function readShareParam() {
    const params = new URLSearchParams(location.search);
    const d = params.get("d");
    if (!d) return null;
    try {
      const p = JSON.parse(b64urlDecode(d));
      if (!Array.isArray(p.i)) return null;
      const obj = { title: p.t, items: p.i, note: p.n, results: {} };
      for (const m of Object.keys(p.r || {})) {
        const r = p.r[m];
        obj.results[m] = { order: (r.o || []).map((k) => p.i[k]) };
        if (Array.isArray(r.v)) obj.results[m].values = Object.fromEntries(p.i.map((it, k) => [it, r.v[k]]));
      }
      return sanitize(obj);
    } catch (_) {
      return null;
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  function exportCSV() {
    const a = doneMethods().length ? analyze() : null;
    const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const methods = a ? a.methods : [];
    const lines = [];
    if (S.title) lines.push(q(S.title));
    lines.push(["Overall", "Option", ...methods.map((m) => METHODS[m].name), "Average rank", "Best", "Worst"].map(q).join(","));
    const rows = a ? a.rows : S.items.map((item) => ({ item }));
    rows.forEach((row, i) => {
      lines.push([
        a ? i + 1 : "",
        row.item,
        ...methods.map((m) => a.R[m].pos[row.item] + (S.results[m].values ? ` (${S.results[m].values[row.item]})` : "")),
        a ? fmtAvg(row.avg) : "",
        a ? row.min : "",
        a ? row.max : "",
      ].map(q).join(","));
    });
    download(`${slug()}.csv`, lines.join("\n"), "text/csv");
  }

  async function handleAction(action) {
    if (action === "share") {
      if (S.items.length < MIN_ITEMS) return toast("Add your options first.");
      const ok = await copy(shareLink());
      toast(ok ? "Link copied. Anyone with it sees your results." : "Couldn't copy the link.");
    } else if (action === "export-csv") {
      if (S.items.length < MIN_ITEMS) return toast("Nothing to export yet.");
      exportCSV();
    } else if (action === "export-json") {
      if (S.items.length < MIN_ITEMS) return toast("Nothing to save yet.");
      download(`${slug()}.rankit.json`, JSON.stringify(S, null, 2), "application/json");
    } else if (action === "import-json") {
      $("#importInput").click();
    } else if (action === "new") {
      if (S.items.length && !(await confirmBox("Start over? This clears the current decision from this browser. Save a project file first if you want to keep it.", "Start over"))) return;
      S = blankState();
      draftTitle = draftItems = null;
      save();
      go("#/");
    }
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  async function boot() {
    load();

    const shared = readShareParam();
    if (shared) {
      const differs = S.items.length && JSON.stringify(S.items) !== JSON.stringify(shared.items);
      if (!differs || (await confirmBox("Open the shared decision? It will replace the one in this browser.", "Open it"))) {
        S = shared;
        save();
        toast("Opened shared decision.");
      }
      history.replaceState(null, "", location.pathname + (location.hash || "#/results"));
    }

    // Menu
    const menuBtn = $("#menuBtn");
    const menu = $("#menu");
    const closeMenu = () => { menu.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); };
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      menuBtn.setAttribute("aria-expanded", String(!menu.hidden));
      if (!menu.hidden) menu.querySelector("button").focus();
    });
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target)) closeMenu();
      const act = e.target.closest("[data-action]");
      if (act) { closeMenu(); handleAction(act.dataset.action); }
    });

    $("#importInput").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const obj = sanitize(JSON.parse(await file.text()));
        if (!obj || obj.items.length < MIN_ITEMS) throw new Error("bad");
        if (S.items.length && !(await confirmBox("Replace the current decision with this file?", "Replace"))) return;
        S = obj;
        save();
        toast("Project opened.");
        go(doneMethods().length >= 2 ? "#/results" : "#/rank");
      } catch (_) {
        toast("That file isn't a RankIt project.");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
      if (!keyHandler || e.target.closest("input, textarea, select") || $("dialog[open]")) return;
      keyHandler(e);
    });

    const bar = $(".topbar");
    window.addEventListener("scroll", () => bar.classList.toggle("scrolled", window.scrollY > 4), { passive: true });
    window.addEventListener("hashchange", render);

    if (!location.hash) history.replaceState(null, "", "#/" + (S.items.length >= MIN_ITEMS ? (doneMethods().length >= 2 ? "results" : "rank") : ""));
    render();
  }

  boot();
})();
