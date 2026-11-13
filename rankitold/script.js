// THE BASICS
// Initialize Lucide icons
function refreshIcons() {
  if (window.lucide && typeof lucide.createIcons === "function") {
    lucide.createIcons();
  }
}

refreshIcons();

// Merge Sort Helper Class
class MergeSortManager {
  constructor(items) {
    this.lists = items.map((i) => [i]);
    this.currentLeftList = 0;
    this.currentRightList = 1;
    this.leftIndex = 0;
    this.rightIndex = 0;
    this.merged = [];
  }

  static fromState(data) {
    const manager = new MergeSortManager([]);
    manager.lists = data.lists;
    manager.currentLeftList = data.currentLeftList;
    manager.currentRightList = data.currentRightList;
    manager.leftIndex = data.leftIndex;
    manager.rightIndex = data.rightIndex;
    manager.merged = data.merged;
    return manager;
  }

  getNextPair() {
    if (this.lists.length <= 1) return null; // Done
    const leftItem = this.lists[this.currentLeftList][this.leftIndex];
    const rightItem = this.lists[this.currentRightList][this.rightIndex];
    return { left: leftItem, right: rightItem };
  }

  resolveVote(winner) {
    const leftList = this.lists[this.currentLeftList];
    const rightList = this.lists[this.currentRightList];
    const leftItem = leftList[this.leftIndex];

    if (winner === leftItem) {
      this.merged.push(leftItem);
      this.leftIndex++;
    } else {
      this.merged.push(rightList[this.rightIndex]);
      this.rightIndex++;
    }

    // Check if sub-list exhausted
    if (this.leftIndex >= leftList.length) {
      this.merged.push(...rightList.slice(this.rightIndex));
      this.finishStep();
    } else if (this.rightIndex >= rightList.length) {
      this.merged.push(...leftList.slice(this.leftIndex));
      this.finishStep();
    }
  }

  finishStep() {
    this.lists.splice(this.currentLeftList, 2, this.merged);
    this.merged = [];
    this.leftIndex = 0;
    this.rightIndex = 0;

    // Move to next pair
    this.currentLeftList++;
    if (this.currentLeftList >= this.lists.length - 1) {
      this.currentLeftList = 0;
    }
    this.currentRightList = this.currentLeftList + 1;
  }

  getSortedList() {
    // In merge sort, when finished, lists[0] contains the fully sorted array
    return this.lists[0] || [];
  }
}

// State
let state = {
  screen: "home",
  mode: null,
  items: [],
  itemsSubmitted: false,
  completedMethods: {},
  lastCompletedMethod: null,
  project: {
    title: "",
    itemNotes: {},
    methodNotes: {},
    decisionNote: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  consistencyMode: "consistent",
  compareReadyNotified: false,
  lastComparedCount: 0,

  // Pairwise Specific
  currentRankings: {},
  pairs: [],
  currentPair: null,
  votedPairs: [],
  history: [],
  showLiveRankings: false,

  // Tier Specific
  tierList: { S: [], A: [], B: [], C: [], D: [] },
  draggedItem: null,
  dragOrder: [],

  // Budget Specific
  budget: { allocated: {} },

  // Tournament Specific
  tournament: { rounds: [], currentRoundIndex: 0, winner: null },

  // Smart Sort Specific
  smartSortData: null,

  // Elimination Specific
  elimination: {
    round: 1,
    remainingItems: [],
    eliminated: {}, // { item: roundNumber, ... }
    history: [], // For undo functionality
  },
};

// Comparison state (used for the Compare Results screen)
const comparisonState = {
  analysis: null,
  robustMethods: [],
  consistencyMode: "consistent", // or "volatile"
};

const METHOD_LABELS = {
  pairwise: "Pairwise Ranking",
  drag: "Drag to Rank",
  tier: "Tier List",
  budget: "Budget Allocation",
  tournament: "Tournament Bracket",
  smart: "Smart Sort",
  elimination: "Vote Off The Island",
};

const METHOD_GUIDANCE = {
  drag: {
    type: "quick",
    use: "Use when you already have a gut order and want a fast baseline.",
    effort: "Low effort",
  },
  budget: {
    type: "tradeoff",
    use: "Use when you need to show strength of preference, not just order.",
    effort: "Low effort",
  },
  tier: {
    type: "grouping",
    use: "Use when options naturally fall into quality bands.",
    effort: "Low effort",
  },
  pairwise: {
    type: "thorough",
    use: "Use when close calls matter and you want every head-to-head tested.",
    effort: "Higher effort",
  },
  smart: {
    type: "efficient",
    use: "Use when you want pairwise choices with fewer comparisons.",
    effort: "Medium effort",
  },
  tournament: {
    type: "head-to-head",
    use: "Use when picking a winner matters more than perfect lower rankings.",
    effort: "Medium effort",
  },
  elimination: {
    type: "elimination",
    use: "Use when it is easier to remove weak options than choose the best one.",
    effort: "Medium effort",
  },
};

function createDefaultProject() {
  const now = new Date().toISOString();
  return {
    title: "",
    itemNotes: {},
    methodNotes: {},
    decisionNote: "",
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeProjectState() {
  const existing = state.project && typeof state.project === "object"
    ? state.project
    : {};
  const fallback = createDefaultProject();

  state.project = {
    ...fallback,
    ...existing,
    itemNotes:
      existing.itemNotes && typeof existing.itemNotes === "object"
        ? existing.itemNotes
        : {},
    methodNotes:
      existing.methodNotes && typeof existing.methodNotes === "object"
        ? existing.methodNotes
        : {},
  };

  state.project.title = String(state.project.title || "").slice(0, 120);
  state.project.decisionNote = String(state.project.decisionNote || "");
}

function touchProject() {
  normalizeProjectState();
  state.project.updatedAt = new Date().toISOString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatScore(score) {
  const num = Number(score);
  if (!Number.isFinite(num)) return "0";
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function isValidCompletedMethod(methodData) {
  return (
    methodData &&
    typeof methodData === "object" &&
    Array.isArray(methodData.rankedList) &&
    methodData.scores &&
    typeof methodData.scores === "object"
  );
}

function getCompletedMethodNames() {
  return Object.keys(state.completedMethods || {}).filter((method) =>
    isValidCompletedMethod(state.completedMethods[method])
  );
}

function getCompletedMethodCount() {
  return getCompletedMethodNames().length;
}

function sanitizeCompletedMethods(methods) {
  const sanitized = {};
  if (!methods || typeof methods !== "object") return sanitized;

  Object.entries(methods).forEach(([methodName, methodData]) => {
    if (isValidCompletedMethod(methodData)) {
      sanitized[methodName] = methodData;
    }
  });

  return sanitized;
}

function getMethodLabel(method) {
  return METHOD_LABELS[method] || method.charAt(0).toUpperCase() + method.slice(1);
}

function getItemIndex(item) {
  return state.items.indexOf(item);
}

function itemsMatchCurrentList(list) {
  return (
    Array.isArray(list) &&
    list.length === state.items.length &&
    list.every((item) => state.items.includes(item))
  );
}

function resetRankingProgress() {
  normalizeProjectState();
  state.completedMethods = {};
  state.compareReadyNotified = false;
  state.lastComparedCount = 0;
  state.lastCompletedMethod = null;
  state.consistencyMode = "consistent";

  state.currentRankings = {};
  state.pairs = [];
  state.currentPair = null;
  state.votedPairs = [];
  state.history = [];
  state.showLiveRankings = false;

  state.tierList = { S: [], A: [], B: [], C: [], D: [] };
  state.draggedItem = null;
  state.dragOrder = [...state.items];
  state.budget = { allocated: {} };
  state.items.forEach((item) => {
    state.budget.allocated[item] = 0;
  });
  state.tournament = { rounds: [], currentRoundIndex: 0, winner: null };
  state.smartSortData = null;
  state.elimination = {
    round: 1,
    remainingItems: [...state.items],
    eliminated: {},
    history: [],
  };

  comparisonState.analysis = null;
  comparisonState.robustMethods = [];
  comparisonState.consistencyMode = "consistent";
}

function getDecisionTitle(fallback = "Untitled decision") {
  normalizeProjectState();
  return state.project.title.trim() || fallback;
}

function parseItemNotes(value) {
  const notes = {};
  String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separator = line.indexOf(":");
      if (separator === -1) return;
      const item = line.slice(0, separator).trim();
      const note = line.slice(separator + 1).trim();
      if (item && note) notes[item] = note;
    });
  return notes;
}

function formatItemNotesForTextarea() {
  normalizeProjectState();
  return state.items
    .filter((item) => state.project.itemNotes[item])
    .map((item) => `${item}: ${state.project.itemNotes[item]}`)
    .join("\n");
}

function updateDecisionInputs() {
  normalizeProjectState();
  const titleInput = document.getElementById("decisionTitleInput");
  if (titleInput) titleInput.value = state.project.title || "";

  const notesInput = document.getElementById("itemNotesInput");
  if (notesInput) notesInput.value = formatItemNotesForTextarea();
}

function syncDecisionInputs() {
  normalizeProjectState();
  const titleInput = document.getElementById("decisionTitleInput");
  if (titleInput) state.project.title = titleInput.value.trim().slice(0, 120);

  const notesInput = document.getElementById("itemNotesInput");
  if (notesInput) state.project.itemNotes = parseItemNotes(notesInput.value);

  touchProject();
  saveState();
}

function updateProgressBar(progressBar, fill, current, total) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeCurrent = Math.max(0, Number(current) || 0);
  const percent = safeTotal > 0 ? Math.min(100, (safeCurrent / safeTotal) * 100) : 0;

  if (fill) fill.style.width = `${percent}%`;
  if (progressBar) {
    progressBar.setAttribute("aria-valuenow", String(Math.round(percent)));
  }
}

function getMethodRecommendation(mode) {
  const itemCount = state.items.length;
  const recommended =
    itemCount <= 3
      ? ["drag", "budget", "tier"]
      : itemCount <= 10
      ? ["smart", "budget", "pairwise"]
      : ["smart", "budget", "tier"];

  if (state.itemsSubmitted && recommended.includes(mode)) {
    return { label: "Recommended start", className: "recommended" };
  }

  const type = METHOD_GUIDANCE[mode]?.type || "method";
  return {
    label: type.charAt(0).toUpperCase() + type.slice(1),
    className: "",
  };
}

function getEstimatedEffort(mode) {
  const n = state.items.length;
  if (n <= 0) return "";
  if (mode === "pairwise") return `${(n * (n - 1)) / 2} comparisons`;
  if (mode === "smart") return `About ${Math.ceil(n * Math.log2(n))} choices`;
  if (mode === "tournament") return `${Math.max(0, n - 1)} matchups`;
  if (mode === "elimination") return `${Math.max(0, n - 1)} eliminations`;
  return "A few minutes";
}

function getRecommendedMethods() {
  const itemCount = state.items.length;
  if (!state.itemsSubmitted || itemCount === 0) return ["drag", "budget", "tier"];
  if (itemCount <= 3) return ["drag", "budget", "tier"];
  if (itemCount <= 10) return ["smart", "budget", "pairwise"];
  return ["smart", "budget", "tier"];
}

function startMode(mode) {
  if (!state.itemsSubmitted) {
    showNotification("Define your decision before choosing a ranking method.");
    return;
  }
  state.mode = mode;
  startRankingMode();
}

function updateMethodHeader(mode) {
  const header = document.getElementById(`${mode}MethodHeader`);
  if (!header) return;

  const guidance = METHOD_GUIDANCE[mode];
  const completed = isValidCompletedMethod(state.completedMethods[mode]);
  header.innerHTML = `
    <div>
      <p class="eyebrow">Ranking method</p>
      <h2>${escapeHtml(getMethodLabel(mode))}</h2>
      <p>${escapeHtml(guidance?.use || "Rank your options from another angle.")}</p>
    </div>
    <div class="method-header-meta">
      <span>${escapeHtml(guidance?.effort || "Guided")}</span>
      <span>${escapeHtml(getEstimatedEffort(mode) || "Ready")}</span>
      ${completed ? "<span>Completed</span>" : "<span>In progress</span>"}
    </div>
  `;
}

function renderMethodReflection(mode, target) {
  normalizeProjectState();
  const container =
    typeof target === "string" ? document.getElementById(target) : target;
  if (!container) return;

  const note = state.project.methodNotes[mode] || "";
  container.innerHTML = `
    <div class="method-reflection">
      <label for="${mode}CompletionNote" class="form-label">
        Reflection note
        <span class="form-hint">Optional: why did this method feel right or wrong?</span>
      </label>
      <textarea
        id="${mode}CompletionNote"
        rows="3"
        data-completion-method="${mode}"
        placeholder="What did this method reveal?"
      >${escapeHtml(note)}</textarea>
    </div>
  `;

  const input = container.querySelector("[data-completion-method]");
  input.addEventListener("input", () => {
    state.project.methodNotes[mode] = input.value;
    saveState();
  });
}

// --- VIEW CONTROLLER ---

function showScreen(screenName) {
  const screens = [
    "home",
    "pairwise",
    "tier",
    "drag",
    "results",
    "budget",
    "tournament",
    "smart",
    "elimination",
  ];

  // Hide all
  screens.forEach((s) => {
    const el = document.getElementById(s + "Screen");
    if (el) el.classList.add("hidden");
  });

  // Home Logic
  if (screenName === "home") {
    document.getElementById("homeScreen").classList.remove("hidden");
    document.getElementById("backBtn").classList.add("hidden");
    state.screen = "home";
    saveState();
    updateHomeScreen();
    updateInputTitle();
    return;
  }

  // Specific Screen Logic
  const target = document.getElementById(screenName + "Screen");
  if (target) target.classList.remove("hidden");

  document.getElementById("backBtn").classList.remove("hidden");

  state.screen = screenName;
  saveState();
}

function updateHomeScreen() {
  document.querySelectorAll(".mode-card").forEach((card) => {
    const mode = card.dataset.mode;
    const guidance = METHOD_GUIDANCE[mode];

    // Mark completed
    if (isValidCompletedMethod(state.completedMethods[mode])) {
      card.classList.add("completed");
    } else {
      card.classList.remove("completed");
    }

    // Disable/Enable based on items
    if (!state.itemsSubmitted) {
      card.classList.add("disabled");
      card.setAttribute("aria-disabled", "true");
      card.tabIndex = -1;
    } else {
      card.classList.remove("disabled");
      card.setAttribute("aria-disabled", "false");
      card.tabIndex = 0;
    }

    let guidanceEl = card.querySelector(".method-guidance");
    if (!guidanceEl) {
      guidanceEl = document.createElement("div");
      guidanceEl.className = "method-guidance";
      card.appendChild(guidanceEl);
    }

    const recommendation = getMethodRecommendation(mode);
    guidanceEl.innerHTML = guidance
      ? `
          <span class="method-badge ${recommendation.className}">${escapeHtml(recommendation.label)}</span>
          <span class="method-badge">${escapeHtml(guidance.effort)}</span>
          <span class="method-badge">${escapeHtml(getEstimatedEffort(mode))}</span>
          <p>${escapeHtml(guidance.use)}</p>
        `
      : "";
  });

  renderRecommendedMethods();
  renderLatestReflectionPrompt();

  const completedCount = getCompletedMethodCount();
  const compareBtn = document.getElementById("compareResultsBtn");
  const compareHint = document.getElementById("compareResultsHint");

  const canCompare = completedCount >= 2;

  if (compareBtn) {
    compareBtn.disabled = !canCompare;
    compareBtn.setAttribute("aria-disabled", String(!canCompare));
    compareBtn.title = canCompare
      ? "View comparison of all completed rankings"
      : "Complete at least 2 ranking methods to review the decision summary";
    compareBtn.classList.toggle("btn-disabled", !canCompare);

    // Auto-scroll + highlight when user becomes eligible to compare
    if (canCompare && !state.compareReadyNotified) {
      state.compareReadyNotified = true;
      saveState();
      showNotification(
        "You can now compare results. Select Compare to see the summary.",
        4000
      );
      compareBtn.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  if (compareHint) {
    compareHint.classList.toggle("hidden", canCompare);
  }

  const compareLabel = document.getElementById("compareBtnLabel");
  if (compareLabel) {
    compareLabel.textContent =
      completedCount >= 2
        ? `Open Decision Summary (${completedCount} completed)`
        : "Open Decision Summary";
  }

  const compareCounter = document.getElementById("compareCounter");
  if (compareCounter) {
    compareCounter.textContent =
      completedCount >= 2
        ? `${completedCount} completed`
        : `${completedCount} / 2 complete`;
  }

  refreshIcons();
}

function renderRecommendedMethods() {
  const container = document.getElementById("recommendedModeGrid");
  if (!container) return;

  const methods = getRecommendedMethods();
  container.innerHTML = methods
    .map((mode) => {
      const guidance = METHOD_GUIDANCE[mode];
      const complete = isValidCompletedMethod(state.completedMethods[mode]);
      return `
        <button
          type="button"
          class="recommended-method-card ${complete ? "completed" : ""}"
          data-recommended-mode="${mode}"
          ${state.itemsSubmitted ? "" : "disabled"}
        >
          <span class="recommended-method-kicker">${escapeHtml(guidance?.type || "method")}</span>
          <strong>${escapeHtml(getMethodLabel(mode))}</strong>
          <span>${escapeHtml(getEstimatedEffort(mode) || "Define items first")}</span>
          <small>${escapeHtml(guidance?.use || "")}</small>
        </button>
      `;
    })
    .join("");

  container.querySelectorAll("[data-recommended-mode]").forEach((button) => {
    button.addEventListener("click", () => startMode(button.dataset.recommendedMode));
  });
}

function markMethodCompleted(mode) {
  state.lastCompletedMethod = mode;
  touchProject();
}

function renderLatestReflectionPrompt() {
  const container = document.getElementById("latestReflectionArea");
  if (!container) return;

  const mode = state.lastCompletedMethod;
  if (!mode || !isValidCompletedMethod(state.completedMethods[mode])) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  normalizeProjectState();
  container.classList.remove("hidden");
  container.innerHTML = `
    <p class="eyebrow">Method reflection</p>
    <h3>${escapeHtml(getMethodLabel(mode))}</h3>
    <label for="latestMethodNote" class="form-label">
      What did this method reveal?
      <span class="form-hint">This note is saved with your project.</span>
    </label>
    <textarea
      id="latestMethodNote"
      rows="4"
      placeholder="This method felt useful because..."
    >${escapeHtml(state.project.methodNotes[mode] || "")}</textarea>
  `;

  const input = document.getElementById("latestMethodNote");
  input.addEventListener("input", () => {
    state.project.methodNotes[mode] = input.value;
    saveState();
  });
}

// --- STATE MANAGEMENT ---

let _localStorageAvailable = null;
let _saveStateTimeout = null;

function isLocalStorageAvailable() {
  if (_localStorageAvailable !== null) return _localStorageAvailable;

  try {
    const testKey = "__rankit_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    _localStorageAvailable = true;
  } catch (err) {
    // Some browsers block or lock localStorage; fail gracefully without
    // clearing unrelated site data.
    console.warn("LocalStorage unavailable (attempting recovery):", err);
    try {
      localStorage.removeItem("rankitState");
      const testKey = "__rankit_test__";
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      _localStorageAvailable = true;
    } catch (err2) {
      console.warn("LocalStorage still unavailable after recovery attempt:", err2);
      _localStorageAvailable = false;
    }
  }
  return _localStorageAvailable;
}

function saveStateNow() {
  if (!isLocalStorageAvailable()) return;
  touchProject();

  if (_saveStateTimeout) {
    clearTimeout(_saveStateTimeout);
    _saveStateTimeout = null;
  }

  try {
    localStorage.setItem("rankitState", JSON.stringify(state));
  } catch (err) {
    console.warn("Failed to save state to localStorage:", err);
  }
}

function saveState(debounce = true) {
  if (!debounce) {
    return saveStateNow();
  }

  if (!isLocalStorageAvailable()) return;
  touchProject();

  // Debounce rapid state updates (improves performance during fast interactions)
  if (_saveStateTimeout) {
    clearTimeout(_saveStateTimeout);
  }
  _saveStateTimeout = setTimeout(() => {
    _saveStateTimeout = null;
    try {
      localStorage.setItem("rankitState", JSON.stringify(state));
    } catch (err) {
      console.warn("Failed to save state to localStorage:", err);
    }
  }, 250);
}

function loadState() {
  if (!isLocalStorageAvailable()) return;

  try {
    const saved = localStorage.getItem("rankitState");
    if (!saved) return;

    const loaded = JSON.parse(saved);
    state = { ...state, ...loaded }; // Merge to ensure new keys exist
    normalizeProjectState();
    state.completedMethods = sanitizeCompletedMethods(state.completedMethods);

    // Force refresh to always land on the home screen.
    // This prevents returning to a mid-ranking screen where inputMode can reappear.
    state.screen = "home";

    // If the stored state has items, treat those as already submitted.
    // This ensures that returning users (even mid-ranking) see the "Edit Items" view
    // instead of the initial item submission form.
    const hasItems = Array.isArray(state.items) && state.items.length > 0;
    if (!state.itemsSubmitted && hasItems) {
      state.itemsSubmitted = true;
      saveState();
    }

    // Restore UI based on screen
    showScreen(state.screen);

    // If items were submitted, always keep the item display mode active (even if
    // we are restoring into another screen). This prevents the submission form
    // from reappearing on reload after rankings have begun.
    if (state.itemsSubmitted) {
      showItemsDisplay();
    }

    switch (state.screen) {
      case "pairwise":
        renderPairwiseComparison();
        break;
      case "tier":
        renderTierList();
        break;
      case "drag":
        renderDragRank();
        break;
      case "budget":
        renderBudgetScreen();
        break;
      case "tournament":
        renderTournamentBracket();
        break;
      case "smart":
        renderSmartSort();
        break;
      case "results":
        // If the user was on the results screen, rerun the compare rendering so
        // we restore the cards/charts instead of showing an empty screen.
        renderCompareResults();
        break;
    }

    // Ensure home UI elements reflect the loaded state
    updateHomeScreen();
    updateOnboardingHints();
    updateDecisionInputs();
  } catch (err) {
    console.warn("Failed to load state from localStorage:", err);
  }
}

function clearState() {
  if (confirm("Clear all data?")) {
    if (_saveStateTimeout) {
      clearTimeout(_saveStateTimeout);
      _saveStateTimeout = null;
    }
    if (isLocalStorageAvailable()) {
      localStorage.removeItem("rankitState");
    }
    location.reload();
  }
}

function showNotification(msg, durationMs = 2000) {
  const el = document.getElementById("notification");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), durationMs);
}

function showInputError(msg) {
  const el = document.getElementById("itemsError");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}

function clearInputError() {
  const el = document.getElementById("itemsError");
  if (!el) return;
  el.textContent = "";
  el.classList.add("hidden");
}

function validateItemsInput(value) {
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (items.length === 0) {
    return "Enter items or choose a template to get started.";
  }
  if (items.length < 3) {
    return "Please enter at least 3 items.";
  }
  if (items.length > 20) {
    return "Please enter no more than 20 items.";
  }

  const duplicates = items.filter(
    (item, index) => items.indexOf(item) !== index
  );
  if (duplicates.length) {
    return `Duplicate item detected: "${duplicates[0]}". Make each item unique.`;
  }

  return "";
}

function updateOnboardingHints() {
  // Update the checklist progress indicators
  const progressItems = document.getElementById("progressItems");
  const progressMethod = document.getElementById("progressMethod");
  const progressCompare = document.getElementById("progressCompare");

  if (progressItems) {
    progressItems.classList.toggle("complete", state.itemsSubmitted);
    progressItems.classList.toggle("incomplete", !state.itemsSubmitted);
  }

  const completedCount = getCompletedMethodCount();
  const hasMethod = completedCount >= 2;
  if (progressMethod) {
    progressMethod.classList.toggle("complete", hasMethod);
    progressMethod.classList.toggle("incomplete", !hasMethod);
  }

  const canCompare = completedCount >= 2;
  const hasCompared =
    state.lastComparedCount >= 2 && state.lastComparedCount === completedCount;
  if (progressCompare) {
    progressCompare.classList.toggle("complete", hasCompared);
    progressCompare.classList.toggle("incomplete", !hasCompared);
  }

  const progressCompareLink = document.getElementById("progressCompareLink");
  if (progressCompareLink) {
    progressCompareLink.classList.toggle("disabled", !canCompare);
    progressCompareLink.setAttribute("aria-disabled", String(!canCompare));
    progressCompareLink.tabIndex = canCompare ? 0 : -1;
  }
}

function updateItemsPreview(value) {
  const preview = document.getElementById("itemsPreview");
  if (!preview) return;

  const items = (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  preview.innerHTML = items.length
    ? items.map((i) => `<div class="chip">${escapeHtml(i)}</div>`).join("")
    : `<div class="chip chip-empty">Items will appear here as you type.</div>`;
}

// --- INITIALIZATION & INPUT ---

function updateInputTitle() {
  const el = document.getElementById("inputTitle");
  if (el)
    el.textContent = state.itemsSubmitted ? "Your Decision" : "Set Up Your Decision";
}

function showItemsDisplay() {
  normalizeProjectState();
  clearInputError();
  updateOnboardingHints();

  // Ensure we have a valid items array (fallback to parsing the textarea)
  if (!Array.isArray(state.items) || state.items.length === 0) {
    const itemsInput = document.getElementById("itemsInput");
    if (itemsInput) {
      state.items = itemsInput.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  const display = document.getElementById("itemsDisplay");
  const content = state.items.length
    ? state.items
        .map((i) => {
          const note = state.project.itemNotes[i];
          return `
            <div class="chip decision-chip">
              <span>${escapeHtml(i)}</span>
              ${note ? `<small>${escapeHtml(note)}</small>` : ""}
            </div>
          `;
        })
        .join("")
    : `<div class="chip chip-empty">No items found. Enter items to get started.</div>`;

  const decisionDisplay = document.getElementById("decisionDisplay");
  if (decisionDisplay) {
    decisionDisplay.innerHTML = `
      <div class="decision-title-display">${escapeHtml(getDecisionTitle())}</div>
      <p class="text-muted">Your rankings and notes stay in this browser unless you share or export them.</p>
    `;
  }

  display.innerHTML = content;

  // Ensure the display section is visible, even if something else is hiding it.
  const displayMode = document.getElementById("displayMode");
  if (displayMode) {
    displayMode.classList.remove("hidden");
    displayMode.style.display = "block";
  }

  document.getElementById("inputMode").classList.add("hidden");
  document.getElementById("editItemsBtn")?.remove();

  const btn = document.createElement("button");
  btn.id = "editItemsBtn";
  btn.className = "btn btn-secondary";
  btn.textContent = "Edit Items";
  btn.style.width = "100%";
  btn.style.marginTop = "1rem";
  btn.onclick = () => {
    // Only warn if there is existing progress to lose
    const hasProgress = getCompletedMethodCount() > 0;

    if (hasProgress) {
      const confirmed = confirm(
        "Editing your items will reset all saved ranking progress. Continue?"
      );

      if (!confirmed) {
        return; // Stop the process if the user cancels
      }
    }
    document.getElementById("inputMode").classList.remove("hidden");
    document.getElementById("displayMode").classList.add("hidden");
    document.getElementById("itemsInput").value = state.items.join(", ");
    updateDecisionInputs();

    // Reset state only after confirmation
    state.itemsSubmitted = false;
    resetRankingProgress();

    updateHomeScreen();
    updateInputTitle();
    updateOnboardingHints();
    saveState();
  };
  document.getElementById("displayMode").appendChild(btn);
}
document.getElementById("startRankingBtn").addEventListener("click", () => {
  syncDecisionInputs();
  const itemsInput = document.getElementById("itemsInput");
  const val = itemsInput ? itemsInput.value : "";

  const error = validateItemsInput(val);
  if (error) {
    showInputError(error);
    return;
  }

  clearInputError();

  const items = val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  state.items = items;
  state.itemsSubmitted = true;
  syncDecisionInputs();
  resetRankingProgress();

  showItemsDisplay();
  updateHomeScreen();
  updateInputTitle();
  updateOnboardingHints();
  saveState();
});

// --- MODE SELECTION ---

document.querySelectorAll(".mode-card").forEach((card) => {
  const selectMode = () => {
    startMode(card.dataset.mode);
  };

  card.addEventListener("click", selectMode);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectMode();
    }
  });
});

function startRankingMode() {
  // 1. Pairwise
  if (state.mode === "pairwise") {
    // CHECK 1: If the ranking is already completed, it means the user is restarting it.
    const isCompleted = state.completedMethods.pairwise;

    if (isCompleted) {
      state.currentPair = null;
    }
    // CHECK 2: If we have no items in the ranking queue, it means it's a new or reset session.
    const isQueueEmpty = state.pairs.length === 0;

    // CHECK 3: If currentRankings are empty, it means we must initialize the Elo scores.
    const areRankingsEmpty = Object.keys(state.currentRankings).length === 0;

    if (!isCompleted && isQueueEmpty && areRankingsEmpty) {
      // Initialize logic
      state.pairs = [];
      for (let i = 0; i < state.items.length; i++) {
        for (let j = i + 1; j < state.items.length; j++) {
          state.pairs.push([state.items[i], state.items[j]]);
        }
      }
      shuffleArray(state.pairs);
      state.currentPair = state.pairs.length > 0 ? state.pairs[0] : null; // Handle 0 items
      state.votedPairs = [];
      state.currentRankings = {};
      state.items.forEach(
        (i) => (state.currentRankings[i] = { rating: 1000, votes: 0 })
      );
      state.history = []; // Also ensure history is cleared on a new start
    }

    // If the state is partially filled, we simply proceed to the screen,
    // relying on the data loaded from local storage.

    showScreen("pairwise");
    updateMethodHeader("pairwise");
    renderPairwiseComparison();
  }
  // 2. Tier
  else if (state.mode === "tier") {
    // Ensure keys exist
    if (!state.tierList || Object.keys(state.tierList).length === 0) {
      state.tierList = { S: [], A: [], B: [], C: [], D: [] };
    }
    showScreen("tier");
    updateMethodHeader("tier");
    renderTierList();
  }
  // 3. Drag
  else if (state.mode === "drag") {
    if (!itemsMatchCurrentList(state.dragOrder)) {
      state.dragOrder = [...state.items];
    }
    showScreen("drag");
    updateMethodHeader("drag");
    renderDragRank();
  }
  // 4. Budget
  else if (state.mode === "budget") {
    // Init budget if empty
    if (!state.budget || !state.budget.allocated)
      state.budget = { allocated: {} };
    Object.keys(state.budget.allocated).forEach((item) => {
      if (!state.items.includes(item)) delete state.budget.allocated[item];
    });
    state.items.forEach((i) => {
      if (state.budget.allocated[i] === undefined)
        state.budget.allocated[i] = 0;
    });
    showScreen("budget");
    updateMethodHeader("budget");
    renderBudgetScreen();
  }
  // 5. Tournament
  else if (state.mode === "tournament") {
    if (!state.tournament || !state.tournament.structure) {
      // Initialize Tournament
      const shuffled = shuffleArray([...state.items]);

      // Calculate number of rounds needed (Log2)
      // We pre-fill the first round, and create empty arrays for subsequent rounds
      let bracket = [shuffled];
      let count = shuffled.length;

      while (count > 1) {
        count = Math.ceil(count / 2);
        // Create empty slots for the next round
        bracket.push(new Array(count).fill(null));
      }

      state.tournament = {
        structure: bracket, // Array of Arrays (Rounds)
        eliminated: {}, // Track when people lost for ranking: { "ItemName": RoundIndex }
      };
    }
    showScreen("tournament");
    updateMethodHeader("tournament");
    renderTournamentBracket();
  }

  // 6. Smart Sort
  else if (state.mode === "smart") {
    // If Smart Sort is already complete, show its saved result.
    if (state.completedMethods["smart"]) {
      showNotification("Returning to completed Smart Sort results.");
      showScreen("smart");
      updateMethodHeader("smart");

      const area = document.getElementById("smartComparisonArea");
      const methodData = state.completedMethods["smart"];
      area.innerHTML = _generateSmartSortResultsHtml(methodData);
      document.getElementById("smartResetDataBtn").onclick = resetSmartSortData;
      document.getElementById("smartReturnHomeBtn").onclick = () =>
        showScreen("home");
      renderMethodReflection("smart", "smartCompletionReflection");

      // Ensure extraneous elements are hidden
      document
        .getElementById("smartProgressText")
        .parentElement.classList.add("hidden");
      document.getElementById("smartContextArea").style.display = "none";
      document.getElementById("smartUndoBtn")?.classList.add("hidden");

      refreshIcons();
      return; // Stop initiation and show results
    }

    // Existing initialization logic proceeds only if not complete:
    if (!state.smartSortData) {
      const manager = new MergeSortManager(state.items);
      state.smartSortData = {
        lists: manager.lists,
        currentLeftList: manager.currentLeftList,
        currentRightList: manager.currentRightList,
        leftIndex: manager.leftIndex,
        rightIndex: manager.rightIndex,
        merged: manager.merged,
      };
    }

    // Ensure elements are visible if we are starting fresh
    document
      .getElementById("smartProgressText")
      .parentElement.classList.remove("hidden");
    document.getElementById("smartContextArea").style.display = "block";

    showScreen("smart");
    updateMethodHeader("smart");
    renderSmartSort();
  }

  // 7. Elimination
  // 7. Elimination
  else if (state.mode === "elimination") {
    
    // --- Determine if a reset/initialization is required ---
    let needsInitialization = false;

    // 1. Check if the structure doesn't exist (initial run of the app)
    if (!state.elimination) {
        needsInitialization = true;
    } 
 
    // 3. Check if the item list has changed since the elimination began 
    //    (Total number of items in state should match total tracked in elimination)
    else {
        const trackedItemsCount = 
            state.elimination.remainingItems.length + 
            Object.keys(state.elimination.eliminated).length;
            
        if (trackedItemsCount !== state.items.length) {
            needsInitialization = true;
        }
    }

    // Initialize ONLY if required
    if (needsInitialization) {
      state.elimination = {
        round: 1,
        remainingItems: [...state.items],
        eliminated: {},
        history: [],
      };
    }
    
    // Always show the screen and render the state, whether new or persisted
    showScreen("elimination");
    updateMethodHeader("elimination");
    renderEliminationScreen();
  }

  saveState();
}

// --- LOGIC: PAIRWISE ---

// 1. Helper to snapshot state before changes
function pushPairwiseHistory() {
  if (!state.history) state.history = [];

  const snapshot = {
    currentRankings: JSON.parse(JSON.stringify(state.currentRankings)),
    pairs: JSON.parse(JSON.stringify(state.pairs)),
    votedPairs: JSON.parse(JSON.stringify(state.votedPairs)),
    currentPair: [...state.currentPair],
  };
  state.history.push(snapshot);
}

// 2. The Undo Function
window.undoPairwiseVote = () => {
  if (!state.history || state.history.length === 0) return;

  const previous = state.history.pop();

  // Restore State
  state.currentRankings = previous.currentRankings;
  state.pairs = previous.pairs;
  state.votedPairs = previous.votedPairs;
  state.currentPair = previous.currentPair;

  saveState();
  renderPairwiseComparison();
};

// --- LOGIC: RESET PAIRWISE ---
function resetPairwiseRanking() {
  // Clear the existing state properties for Pairwise
  state.pairs = [];
  state.votedPairs = [];
  state.currentPair = null;
  state.currentRankings = {};
  state.history = [];
  
  // Clear the completion record so the next run initializes properly
  delete state.completedMethods.pairwise; 

  // The logic in the mode initializer will now detect that state.pairs is empty 
  // and re-run the full initialization.
  
  // Re-run the mode setup (which will regenerate the pairs and ELO scores)
  // This assumes the mode handler logic is separate from screen handling
  
  // For simplicity, we can manually trigger the initialization that's in the main switch/if block
  
  // 1. Manually trigger initialization code block for consistency
  for (let i = 0; i < state.items.length; i++) {
    for (let j = i + 1; j < state.items.length; j++) {
      state.pairs.push([state.items[i], state.items[j]]);
    }
  }
  shuffleArray(state.pairs);
  state.currentPair = state.pairs.length > 0 ? state.pairs[0] : null;
  state.items.forEach(
    (i) => (state.currentRankings[i] = { rating: 1000, votes: 0 })
  );

  saveState();
  renderPairwiseComparison(); // Rerender to show the new round 1
  showNotification("Pairwise Ranking Reset!");
}

function renderPairwiseComparison() {
  const area = document.getElementById("comparisonArea");
  const actionButtonsArea = document.getElementById("actionButtonsArea");

  if (!state.currentPair) {
    // --- Completion/Finalization Logic ---
    const rankedList = getSortedRankings();

    // Calculate final scores based on current rankings
    const finalScores = {};
    rankedList.forEach((item) => {
      // Use the rating from currentRankings for the final score
      finalScores[item] = state.currentRankings[item]?.rating || 0;
    });

    // 1. Save Final State (ENSURE PERSISTENCE)
    state.completedMethods["pairwise"] = {
      rankedList: rankedList,
      scores: finalScores,
      metadata: { scoreType: "ELO Rating" },
    };
    markMethodCompleted("pairwise");
    saveState();

    // 2. Display Final Ranked List and Reset Button
    const rankListHTML = rankedList
      .map(
        (item, index) =>
          `<div class="ranking-item">
             <span class="ranking-number">#${index + 1}</span>
             <span class="ranking-name">${escapeHtml(item)}</span>
             <span class="ranking-score">(${Math.round(finalScores[item])})</span>
           </div>`
      )
      .join("");

    area.innerHTML = `
      <div class="text-center" style="max-width: 400px; margin: 0 auto;">
        <h2>Pairwise Ranking Complete! 🎉</h2>
        <p style="margin-bottom: 1.5rem;">Based on ${state.votedPairs.length} comparisons.</p>
        <div class="ranking-list-final">${rankListHTML}</div>
      </div>
    `;

    // 3. Render Action Buttons (Reset)
    actionButtonsArea.innerHTML = `
      <button class="btn btn-danger" id="pairwiseResetBtn">
        <i data-lucide="rotate-ccw" class="icon"></i> Reset Rankings
      </button>
      <button class="btn btn-primary" id="pairwiseReturnHomeBtn">Return Home</button>
      <div id="pairwiseCompletionReflection" class="completion-reflection-slot"></div>
    `;

    // Attach Reset Listener
    document.getElementById("pairwiseResetBtn").onclick = resetPairwiseRanking;
    document.getElementById("pairwiseReturnHomeBtn").onclick = () =>
      showScreen("home");
    renderMethodReflection("pairwise", "pairwiseCompletionReflection");
    refreshIcons();

    return;
  }

  const [a, b] = state.currentPair;
  area.innerHTML = `
        <div class="comparison-grid">
            <button type="button" class="comparison-card" data-winner-index="${getItemIndex(a)}" data-loser-index="${getItemIndex(b)}">
              <h3>${escapeHtml(a)}</h3>
            </button>
            <button type="button" class="comparison-card" data-winner-index="${getItemIndex(b)}" data-loser-index="${getItemIndex(a)}">
              <h3>${escapeHtml(b)}</h3>
            </button>
        </div>
    `;

  area.querySelectorAll(".comparison-card").forEach((card) => {
    card.addEventListener("click", () => {
      const winner = state.items[Number(card.dataset.winnerIndex)];
      const loser = state.items[Number(card.dataset.loserIndex)];
      if (winner && loser) handleVote(winner, loser);
    });
  });

  // Check if history exists to show Undo button
  const hasHistory = state.history && state.history.length > 0;

  // Render Buttons
  document.getElementById("actionButtonsArea").innerHTML = `
        <button class="btn btn-yellow" id="pairwiseTieBtn">Tie (↓ or Space)</button>
        <button class="btn btn-secondary" id="pairwiseSkipBtn">Skip (↑)</button>
        ${
          hasHistory
            ? `<button class="btn btn-blue" id="pairwiseUndoBtn">
                <i data-lucide="rotate-ccw" class="icon"></i> Undo (Ctrl+Z)
            </button>`
            : ""
        }
    `;

  document.getElementById("pairwiseTieBtn").onclick = handleTie;
  document.getElementById("pairwiseSkipBtn").onclick = skipPair;
  const undoBtn = document.getElementById("pairwiseUndoBtn");
  if (undoBtn) undoBtn.onclick = undoPairwiseVote;

  refreshIcons(); // Refresh icons for the new undo button

  // Progress
  const total = state.pairs.length + state.votedPairs.length;
  document.getElementById(
    "progressText"
  ).textContent = `${state.votedPairs.length} / ${total}`;
  updateProgressBar(
    document.querySelector("#pairwiseScreen .progress-bar"),
    document.getElementById("progressFill"),
    state.votedPairs.length,
    total
  );
}

function handleVote(winner, loser) {
  pushPairwiseHistory(); // <--- Snapshot before change

  // ELO Logic
  const k = 32;
  const rW = state.currentRankings[winner].rating;
  const rL = state.currentRankings[loser].rating;
  const eW = 1 / (1 + Math.pow(10, (rL - rW) / 400));
  const eL = 1 / (1 + Math.pow(10, (rW - rL) / 400));

  state.currentRankings[winner].rating += k * (1 - eW);
  state.currentRankings[loser].rating += k * (0 - eL);

  nextPair(true);
}

function handleTie() {
  pushPairwiseHistory(); // <--- Snapshot before change

  const [a, b] = state.currentPair;
  // ELO Draw
  const k = 32;
  const rA = state.currentRankings[a].rating;
  const rB = state.currentRankings[b].rating;
  const eA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  const eB = 1 / (1 + Math.pow(10, (rA - rB) / 400));

  state.currentRankings[a].rating += k * (0.5 - eA);
  state.currentRankings[b].rating += k * (0.5 - eB);

  nextPair(true);
}

function skipPair() {
  pushPairwiseHistory(); // <--- Snapshot before change
  nextPair(false);
}

function nextPair(voted) {
  if (voted) state.votedPairs.push(state.currentPair);
  else state.pairs.push(state.currentPair); // Skip puts it at end

  state.pairs.shift();
  state.currentPair = state.pairs.length > 0 ? state.pairs[0] : null;
  saveState();
  renderPairwiseComparison();
}

function getSortedRankings() {
  return Object.keys(state.currentRankings).sort(
    (a, b) => state.currentRankings[b].rating - state.currentRankings[a].rating
  );
}

// --- LOGIC: BUDGET ---

function finishBudget() {
  // 1. Get allocated scores
  const allocatedScores = Object.fromEntries(
    state.items.map((item) => [item, Number(state.budget.allocated[item] || 0)])
  );

  // 2. Determine ranking based on score
  const rankedList = Object.keys(allocatedScores).sort(
    (a, b) => allocatedScores[b] - allocatedScores[a]
  );

  // 3. Save to completedMethods
  state.completedMethods["budget"] = {
    rankedList: rankedList,
    scores: allocatedScores,
    metadata: { scoreType: "Allocated Budget ($)" },
  };
  markMethodCompleted("budget");
  saveState();
  showNotification("Budget ranking saved!");
  showScreen("home");
}

function renderBudgetScreen() {
  const container = document.getElementById("budgetContainer");

  // 1. Calculate initial values
  const totalUsed = Object.values(state.budget.allocated).reduce(
    (a, b) => a + parseInt(b || 0),
    0
  );
  const remaining = 100 - totalUsed;

  // 2. Render the Header
  const titleColor =
    remaining < 0 ? "#dc2626" : remaining === 0 ? "#10b981" : "#059669";
  document.querySelector("#budgetScreen .card").innerHTML = `
        <div class="text-center">
            <h2 id="budgetRemainingTitle" style="font-size: 2.5rem; color: ${titleColor}">
                $${remaining} Remaining
            </h2>
            <p style="color: #6b7280">Allocate your budget. You must use exactly $100.</p>
        </div>
    `;

  // 3. Render the Rows ONCE
  // We give specific IDs to inputs so we can update them later without re-rendering
  container.innerHTML = state.items
    .map((item, idx) => {
      const val = state.budget.allocated[item] || 0;
      // Sanitize item name for ID
      const safeId = idx;
      return `
            <div class="budget-row">
                <label class="budget-label" for="range-${safeId}">${escapeHtml(item)}</label>
                <input type="range" id="range-${safeId}" class="budget-slider" 
                       min="0" max="100" value="${val}" data-item-index="${idx}" data-budget-id="${safeId}">
                <input type="number" id="num-${safeId}" class="budget-input" 
                       min="0" max="100" value="${val}" data-item-index="${idx}" data-budget-id="${safeId}"
                       aria-label="Budget for ${escapeHtml(item)}">
            </div>
        `;
    })
    .join("");

  container
    .querySelectorAll(".budget-slider, .budget-input")
    .forEach((input) => {
      input.addEventListener("input", () => {
        const item = state.items[Number(input.dataset.itemIndex)];
        if (!item) return;
        handleBudgetInput(item, Number(input.dataset.budgetId), input.value);
      });
    });
}

// 4. Optimized Input Handler (Does NOT re-render HTML)
window.handleBudgetInput = (item, id, value) => {
  let val = parseInt(value);
  if (isNaN(val)) val = 0;
  if (val < 0) val = 0;
  if (val > 100) val = 100;

  // Update State
  state.budget.allocated[item] = val;
  saveState();

  // Update DOM Elements directly to prevent stutter
  document.getElementById(`range-${id}`).value = val;
  document.getElementById(`num-${id}`).value = val;

  // Update Header Calculation
  const totalUsed = Object.values(state.budget.allocated).reduce(
    (a, b) => a + parseInt(b || 0),
    0
  );
  const remaining = 100 - totalUsed;
  const titleEl = document.getElementById("budgetRemainingTitle");

  titleEl.textContent = `$${remaining} Remaining`;
  titleEl.style.color =
    remaining < 0 ? "#dc2626" : remaining === 0 ? "#10b981" : "#059669";
};

document.getElementById("saveBudgetBtn").addEventListener("click", () => {
  const total = Object.values(state.budget.allocated).reduce(
    (a, b) => a + parseInt(b),
    0
  );
  if (total !== 100) {
    showNotification(`Use exactly $100 before saving. Current total: $${total}.`, 3500);
    return;
  }
  saveState();
  finishBudget();
  showNotification("Budget Saved!");
});

// --- LOGIC: TOURNAMENT ---
// Function to generate the initial empty structure for a new tournament
function generateInitialTournamentStructure(items) {
  let structure = [items];
  let currentRound = items.length;

  while (currentRound > 1) {
    // Number of matches in the next round is half the current round, rounded up
    const nextRoundSize = Math.ceil(currentRound / 2);
    // Create an array of nulls for the next round's slots
    structure.push(Array(nextRoundSize).fill(null));
    currentRound = nextRoundSize;
  }
  return structure;
}

// Function to reset the entire tournament state
function resetTournamentData() {
  // 1. Get current participant list (assuming state.items holds this)
  const participants = state.items;

  // 2. Clear old tournament data and set up a new empty structure
  state.tournament = {
    structure: generateInitialTournamentStructure(participants),
    eliminated: {},
  };
  delete state.completedMethods.tournament;

  // 3. Clear the winner area display
  const winnerArea = document.getElementById("tournamentWinnerArea");
  if (winnerArea) {
    winnerArea.innerHTML = "";
    winnerArea.classList.add("hidden");
  }

  // 4. Save the reset state
  saveState();

  // 5. Re-render the bracket UI
  renderTournamentBracket();

  // Optional: Show confirmation
   showNotification("Tournament has been reset!");
}

function renderTournamentBracket() {
  const container = document.getElementById("bracketContainer");
  const tournamentWinnerArea = document.getElementById("tournamentWinnerArea");
  const structure = state.tournament.structure;
  const totalRounds = structure.length;

  // Check if we have a final winner (last round has a value)
  const finalWinner = structure[totalRounds - 1][0];

  if (finalWinner) {
    // Show Winner DIV
    tournamentWinnerArea.innerHTML = `
            <div class="card bg-success-subtle text-success-emphasis" style="margin-bottom: 1rem; padding: 1rem;">
                <i data-lucide="trophy" class="icon" style="color: gold; width: 2rem; height: 2rem; margin-right: 0.5rem; display: inline-block; vertical-align: middle;"></i>
                <h3 style="font-size: 1.5rem; font-weight: bold; margin: 0; display: inline-block; vertical-align: middle;">Tournament Complete!</h3>
                <p style="font-size: 1.2rem; margin-top: 0.5rem;">The winner is: <strong>${escapeHtml(finalWinner)}</strong></p>
            </div>
            <div class="text-center">
                <button class="btn btn-primary" id="finishTourneyBtn">Return Home</button>
            </div>
            <div id="tournamentCompletionReflection" class="completion-reflection-slot"></div>
        `;
    tournamentWinnerArea.classList.remove("hidden");
    refreshIcons();
    document.getElementById("finishTourneyBtn").onclick = finishTournament;
    renderMethodReflection("tournament", "tournamentCompletionReflection");
    return;
  }

  // Render Bracket
  let html = '<div class="bracket-wrapper">';

  for (let roundIndex = 0; roundIndex < totalRounds - 1; roundIndex++) {
    const roundItems = structure[roundIndex];

    html += `<div class="bracket-round"><h4>Round ${roundIndex + 1}</h4>`;

    for (let i = 0; i < roundItems.length; i += 2) {
      const p1 = roundItems[i];
      const p2 = roundItems[i + 1];

      const isReady = p1 && (p2 !== undefined ? p2 !== null : true);
      const isBye = p2 === undefined;

      const p1Class = p1 ? "" : "empty-slot";
      const p2Class = p2 || p2 === null ? "" : "empty-slot";

      const displayPlayer = (p) => p || "Waiting...";

      if (isBye) {
        // --- BYE LOGIC ---
        html += `
                    <div class="match-card">
                        <button type="button" class="match-player winner" data-round-index="${roundIndex}" data-player-index="${i}" data-winner-index="${getItemIndex(p1)}">
                           ${escapeHtml(displayPlayer(p1))} <span class="match-note">(bye - advance)</span>
                        </button>
                    </div>`;
      } else {
        // --- REGULAR MATCH LOGIC ---
        html += `
                    <div class="match-card ${!isReady ? "placeholder" : ""}">
                        <button type="button" class="${p1Class} match-player"
                             ${isReady && p1 ? `data-round-index="${roundIndex}" data-player-index="${i}" data-winner-index="${getItemIndex(p1)}" data-loser-index="${getItemIndex(p2)}"` : "disabled"}>
                             ${escapeHtml(displayPlayer(p1))}
                        </button>
                        <button type="button" class="${p2Class} match-player"
                             ${isReady && p2 ? `data-round-index="${roundIndex}" data-player-index="${i}" data-winner-index="${getItemIndex(p2)}" data-loser-index="${getItemIndex(p1)}"` : "disabled"}>
                             ${escapeHtml(displayPlayer(p2))}
                        </button>
                    </div>
                `;
      }
    }
    html += `</div>`;
  }

  html += "</div>";
  container.innerHTML = html;
  container.querySelectorAll(".match-player[data-winner-index]").forEach((button) => {
    button.addEventListener("click", () => {
      advanceTournament(
        Number(button.dataset.roundIndex),
        Number(button.dataset.playerIndex),
        Number(button.dataset.winnerIndex),
        button.dataset.loserIndex === undefined
          ? null
          : Number(button.dataset.loserIndex)
      );
    });
  });
}

window.advanceTournament = (roundIndex, playerIndex, winnerIndex, loserIndex = null) => {
  const structure = state.tournament.structure;
  const winnerName = state.items[winnerIndex];
  const loserName =
    loserIndex === null || Number.isNaN(loserIndex) ? null : state.items[loserIndex];
  if (!winnerName) return;

  // 1. Set Winner in Next Round
  const nextRoundIndex = roundIndex + 1;
  if (nextRoundIndex < structure.length) {
    // The position in the next round is the current player index divided by 2
    const nextSlotIndex = Math.floor(playerIndex / 2);

    // Place winner
    structure[nextRoundIndex][nextSlotIndex] = winnerName;
  }

  // 2. Record Loser for Ranking (if it wasn't a bye)
  if (loserName) {
    state.tournament.eliminated[loserName] = roundIndex;
  }

  saveState();
  renderTournamentBracket();
};

function finishTournament() {
  const structure = state.tournament.structure;
  const winner = structure[structure.length - 1][0];
  const eliminations = state.tournament.eliminated;
  const numRounds = structure.length;
  const finalScores = {};

  // Score Logic: Winner gets max score (N+1), eliminated gets their round index (0-based)
  state.items.forEach((item) => {
    if (item === winner) {
      finalScores[item] = numRounds + 1;
    } else if (eliminations[item] !== undefined) {
      finalScores[item] = eliminations[item] + 1; // Score is Round 1, 2, 3...
    } else {
      finalScores[item] = 0; // Item not in bracket (if possible)
    }
  });

  // Ranking Logic: Sort by Score
  const finalRanking = Object.keys(finalScores).sort(
    (a, b) => finalScores[b] - finalScores[a]
  );

  state.completedMethods["tournament"] = {
    rankedList: finalRanking,
    scores: finalScores,
    metadata: { scoreType: "Elimination Round Score" },
  };
  markMethodCompleted("tournament");

  saveState();
  showScreen("home");
  showNotification("Tournament Saved!");
}

// --- LOGIC: SMART SORT (Merge Sort) ---
/**
 * Generates the HTML for the final Smart Sort results screen.
 */
function _generateSmartSortResultsHtml(methodData) {
  if (!methodData || !methodData.rankedList) return "";

  const rankedItemsWithTies = getTieAwareRanking(methodData);
  const scoreType = methodData.metadata?.scoreType || "Raw Score";

  return `
        <div class="text-center">
            <i data-lucide="check-circle" class="icon-lg" style="color:#10b981; width: 4rem; height: 4rem; margin-bottom:1rem;"></i>
            <h2>Smart Sort Complete!</h2>
            <p class="mb-4" style="color: #6b7280;">Final Ranking based on: ${scoreType}</p>
        </div>
        
        <div class="method-results-card" style="margin: 1.5rem auto 2rem; max-width: 400px;">
            <h3 style="margin-bottom: 1rem;">Final Ranked List</h3>
            ${rankedItemsWithTies
              .map(
                (rankedItem) => `
                <div class="method-ranking-item">
                    <span class="rank-badge">${rankedItem.rank}</span> 
                    <span class="ranking-name">${escapeHtml(rankedItem.item)}</span>
                    <span style="margin-left: auto; font-size: 0.9em; color: #4b5563;">
                        ${formatScore(rankedItem.score)}
                    </span>
                </div>
            `
              )
              .join("")}
        </div>

        <div class="action-buttons" style="margin-top: 1rem;">
            <button class="btn btn-blue" id="smartResetDataBtn">
                Rank Again
            </button>
            <button class="btn btn-primary" id="smartReturnHomeBtn">
                Back to Home
            </button>
        </div>
        <div id="smartCompletionReflection" class="completion-reflection-slot"></div>
    `;
}

/**
 * Handles the logic to reset the state specifically for Smart Sort.
 */
window.resetSmartSortData = () => {
  delete state.completedMethods["smart"]; // Remove final result
  state.smartSortData = null; // Reset the sort manager data

  saveState();
  showNotification("Smart Sort data reset! Starting over...");

  // Call the correct function to re-initialize the screen
  startRankingMode("smart");
};

function renderSmartSort() {
  const area = document.getElementById("smartComparisonArea");
  if (!state.smartSortData || !state.smartSortData.lists) {
    // If data is null/missing, force re-initialization before proceeding.
    // This calls the logic within startRankingMode that creates the MergeSortManager data.
    startRankingMode("smart");
    // Since startRankingMode calls renderSmartSort(), we can return here
    return;
  }
  const manager = MergeSortManager.fromState(state.smartSortData);
  const pair = manager.getNextPair();

  // Progress Calculation
  const totalItems = state.items.length;
  const progress = Math.min(
    100,
    ((state.smartSortData.progressCounter || 0) /
      (totalItems * Math.log2(totalItems))) *
      100
  );

  document.getElementById("smartProgressText").textContent = pair
    ? "Sorting..."
    : "Done";
  updateProgressBar(
    document.querySelector("#smartScreen .progress-bar"),
    document.getElementById("smartProgressFill"),
    progress,
    100
  );

  if (!pair) {
    // --- Smart Sort Completion Logic ---
    const sorted = manager.getSortedList();
    const finalScores = {};

    // Score is based on rank (1st gets N points, 2nd N-1)
    const N = sorted.length;
    sorted.forEach((item, index) => {
      finalScores[item] = N - index;
    });

    // Save robust result
    state.completedMethods["smart"] = {
      rankedList: sorted,
      scores: finalScores,
      metadata: { scoreType: "Ordinal Rank Score (Merge Sort)" },
    };
    markMethodCompleted("smart");
    saveState();

    // 1. RENDER THE DETAILED RESULTS LIST
    const methodData = state.completedMethods["smart"];
    area.innerHTML = _generateSmartSortResultsHtml(methodData);
    document.getElementById("smartResetDataBtn").onclick = resetSmartSortData;
    document.getElementById("smartReturnHomeBtn").onclick = () =>
      showScreen("home");
    renderMethodReflection("smart", "smartCompletionReflection");

    // 2. HIDE PROGRESS BAR AND CONTEXT
    document
      .getElementById("smartProgressText")
      .parentElement.classList.add("hidden"); // Hides the progress bar container
    document.getElementById("smartContextArea").style.display = "none";

    // 3. HIDE UNDO BUTTON IF VISIBLE
    document.getElementById("smartUndoBtn")?.classList.add("hidden");

    refreshIcons();
    return;
  }

  // Save current pair for shortcuts
  state.smartSortData.currentPair = pair;

  // Check history for Undo Button visibility
  const hasHistory =
    state.smartSortData.history && state.smartSortData.history.length > 0;

  area.innerHTML = `
        <div class="comparison-grid">
            <button type="button" class="comparison-card" data-winner-index="${getItemIndex(pair.left)}">
                <h3>${escapeHtml(pair.left)}</h3>
                <div class="comparison-hint">Press Left Arrow</div>
            </button>
            <button type="button" class="comparison-card" data-winner-index="${getItemIndex(pair.right)}">
                <h3>${escapeHtml(pair.right)}</h3>
                <div class="comparison-hint">Press Right Arrow</div>
            </button>
        </div>
        
        <div id="smartActionButtonsArea" class="action-buttons">
             ${
               hasHistory
                 ? `<button id="smartUndoBtn" class="btn btn-blue">
                    <i data-lucide="rotate-ccw" class="icon"></i> Undo (Ctrl+Z)
                </button>`
                 : ""
             }
        </div>
    `;
  area.querySelectorAll(".comparison-card").forEach((card) => {
    card.addEventListener("click", () => {
      const winner = state.items[Number(card.dataset.winnerIndex)];
      if (winner) handleSmartVote(winner);
    });
  });
  const smartUndoBtn = document.getElementById("smartUndoBtn");
  if (smartUndoBtn) smartUndoBtn.onclick = undoSmartVote;
  refreshIcons();
}

window.handleSmartVote = (winnerItem) => {
  // 1. SNAPSHOT STATE FOR UNDO
  // We create a deep copy of the data needed to restore the sort manager
  if (!state.smartSortData.history) state.smartSortData.history = [];

  const snapshot = {
    lists: JSON.parse(JSON.stringify(state.smartSortData.lists)),
    currentLeftList: state.smartSortData.currentLeftList,
    currentRightList: state.smartSortData.currentRightList,
    leftIndex: state.smartSortData.leftIndex,
    rightIndex: state.smartSortData.rightIndex,
    merged: JSON.parse(JSON.stringify(state.smartSortData.merged)),
    progressCounter: state.smartSortData.progressCounter,
  };

  state.smartSortData.history.push(snapshot);

  // 2. PROCESS VOTE
  const manager = MergeSortManager.fromState(state.smartSortData);
  manager.resolveVote(winnerItem);

  // 3. UPDATE STATE
  state.smartSortData = {
    ...state.smartSortData, // Keep history and other keys
    lists: manager.lists,
    currentLeftList: manager.currentLeftList,
    currentRightList: manager.currentRightList,
    leftIndex: manager.leftIndex,
    rightIndex: manager.rightIndex,
    merged: manager.merged,
    progressCounter: (state.smartSortData.progressCounter || 0) + 1,
  };

  saveState();
  renderSmartSort();
};

window.undoSmartVote = () => {
  if (!state.smartSortData.history || state.smartSortData.history.length === 0)
    return;

  const previousState = state.smartSortData.history.pop();

  // Restore State
  state.smartSortData = {
    ...state.smartSortData,
    ...previousState, // Overwrite current data with snapshot
    history: state.smartSortData.history, // Ensure history array is preserved
  };

  saveState();
  renderSmartSort();
};

// --- LOGIC: DRAG ---
function finalizeDragRank() {
  const finalList = Array.isArray(state.dragOrder) && state.dragOrder.length
    ? [...state.dragOrder]
    : [...state.items];
  const finalScores = {};

  // Score is based on rank (1st gets N points, 2nd gets N-1, etc.)
  const N = finalList.length;

  finalList.forEach((item, index) => {
    // Score = Total Items - Rank Index
    finalScores[item] = N - index;
  });

  // Save to new completedMethods structure
  state.completedMethods["drag"] = {
    rankedList: finalList,
    scores: finalScores,
    metadata: { scoreType: "Ordinal Rank Score" },
  };
  markMethodCompleted("drag");

  saveState();
  showNotification("Drag to Rank Saved!");
}

function renderDragRank() {
  const list = document.getElementById("dragRankList");
  if (!itemsMatchCurrentList(state.dragOrder)) {
    state.dragOrder = [...state.items];
  }

  list.innerHTML = state.dragOrder
    .map(
      (item, idx) => `
        <li class="drag-rank-item" draggable="true" data-index="${idx}">
          <span>${idx + 1}.</span> <span>${escapeHtml(item)}</span>
        </li>
    `
    )
    .join("");

  // Add basic drag events
  let dragged = null;
  list.querySelectorAll("li").forEach((li) => {
    li.addEventListener("dragstart", (e) => {
      dragged = e.target;
      e.target.style.opacity = 0.5;
    });
    li.addEventListener("dragend", (e) => {
      e.target.style.opacity = 1;
    });
    li.addEventListener("dragover", (e) => e.preventDefault());
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      const fromIdx = parseInt(dragged.dataset.index);
      const toIdx = parseInt(li.dataset.index);
      if (fromIdx !== toIdx) {
        const item = state.dragOrder.splice(fromIdx, 1)[0];
        state.dragOrder.splice(toIdx, 0, item);
        saveState();
        renderDragRank();
      }
    });
  });
}

document.getElementById("saveDragBtn").addEventListener("click", () => {
  finalizeDragRank(); // Calls the function that saves the robust data structure
  showScreen("home");
});

// --- LOGIC: TIER LIST ---
function renderTierList() {
  // Reuse existing items logic for brevity
  // Assume similar Drag Logic as provided in original code
  // Just hook up the save button
  const area = document.getElementById("unplacedItemsArea");
  const tierArea = document.getElementById("tierListArea");

  const allPlaced = Object.values(state.tierList).flat();
  const unplaced = state.items.filter((i) => !allPlaced.includes(i));

  area.innerHTML = unplaced
    .map(
      (i) =>
        `<div class="draggable-item" draggable="true" data-item-index="${getItemIndex(i)}">${escapeHtml(i)}</div>`
    )
    .join("");

  const tiers = ["S", "A", "B", "C", "D"];
  tierArea.innerHTML = tiers
    .map(
      (t) => `
        <div class="tier-row">
            <div class="tier-label tier-${t.toLowerCase()}">${t}</div>
            <div class="tier-items" data-tier="${t}">
                ${state.tierList[t]
                  .map(
                    (i) =>
                      `<div class="draggable-item" draggable="true" data-item-index="${getItemIndex(i)}">${escapeHtml(i)}</div>`
                  )
                  .join("")}
            </div>
        </div>
    `
    )
    .join("");

  setupTierDrag();
}

function setupTierDrag() {
  const items = document.querySelectorAll(".draggable-item");
  items.forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", e.target.dataset.itemIndex);
      e.target.style.opacity = 0.5;
    });
    item.addEventListener("dragend", (e) => (e.target.style.opacity = 1));
  });

  document.querySelectorAll(".tier-items").forEach((zone) => {
    zone.addEventListener("dragover", (e) => e.preventDefault());
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      const itemIndex = Number(e.dataTransfer.getData("text/plain"));
      const text = state.items[itemIndex];
      if (!text) return;
      const tier = zone.dataset.tier;

      // Remove from all other tiers/unplaced
      Object.keys(state.tierList).forEach((k) => {
        state.tierList[k] = state.tierList[k].filter((i) => i !== text);
      });

      // Add to new
      state.tierList[tier].push(text);
      saveState();
      renderTierList();
    });
  });
}

document.getElementById("saveTierBtn").addEventListener("click", () => {
  // Check how many items are currently unplaced
  const allPlaced = Object.values(state.tierList).flat();
  const unplaced = state.items.filter((i) => !allPlaced.includes(i));
  const unplacedCount = unplaced.length;
  saveState();

  // 2. CHECK FOR COMPLETION
  if (unplacedCount > 0) {
    // Ranking is NOT complete. Save progress and notify user, but do NOT finalize or go home.
    showNotification(
      `Progress saved! You have ${unplacedCount} item(s) left to place.`
    );
    showScreen("home");
    return; // Stop here, do not run completion logic
  }
  
  // --- Completion/Finalization Logic (Only runs if unplacedCount === 0) ---
  
  // Tier Value Map: S=5, A=4, B=3, C=2, D=1, Unplaced=0
  const tierValueMap = { S: 5, A: 4, B: 3, C: 2, D: 1 };
  const finalScores = {};
  const rankedList = [];

  // 1. Build Final Scores and Ranked List
  const tiersInOrder = ["S", "A", "B", "C", "D"];

  tiersInOrder.forEach((tier) => {
    const score = tierValueMap[tier];
    state.tierList[tier].forEach((item) => {
      // Assign score based on tier
      finalScores[item] = score;
      // Build the ranked list (sorted by tier)
      rankedList.push(item);
    });
  });

  // 2. Save to new completedMethods structure
  state.completedMethods["tier"] = {
    rankedList: rankedList,
    scores: finalScores,
    metadata: { scoreType: "Tier Level (S=5 to D=1)" },
  };
  markMethodCompleted("tier");

  saveState(); // Save the final, completed state
  showScreen("home");
  showNotification("Tier List Completed and Saved! 🎉");
});


// --- LOGIC: ELIMINATION (Vote Off the Island) ---

function renderEliminationScreen() {
  const remaining = state.elimination.remainingItems;
  const eliminatedMap = state.elimination.eliminated; // { item: roundNumber }
  const allItems = state.items; // Full list to ensure we don't miss any

  const area = document.getElementById("eliminationGridArea");
  const roundNumber = state.elimination.round;
  const undoBtn = document.getElementById("eliminationUndoBtn");
  const finalResultArea = document.getElementById("eliminationFinalResult");

  document.getElementById("eliminationRoundNumber").textContent = roundNumber;

  // Check for Completion (0 or 1 item remaining)
  if (remaining.length <= 1) {
    const winner = remaining[0];
    finalizeElimination(winner);

    finalResultArea.classList.remove("hidden");
    finalResultArea.innerHTML = `
            <h2>Ranking Complete!</h2>
            <p style="margin-bottom: 1.5rem;">Top remaining item: <strong>${escapeHtml(winner)}</strong></p>
            <button class="btn btn-primary" id="eliminationReturnHomeBtn">Return Home</button>
            <div id="eliminationCompletionReflection" class="completion-reflection-slot"></div>
        `;
    document.getElementById("eliminationReturnHomeBtn").onclick = () =>
      showScreen("home");
    renderMethodReflection("elimination", "eliminationCompletionReflection");
    refreshIcons();
    return;
  }

  // --- New Rendering Logic: Show All Items ---

  // 1. Sort the items to show eliminated items first, sorted by elimination round (lowest round first)
  // Then show remaining items (they are sorted alphabetically or by initial input order)
  const itemsToDisplay = [...allItems].sort((a, b) => {
    const roundA = eliminatedMap[a] || Infinity;
    const roundB = eliminatedMap[b] || Infinity;

    // If both are eliminated, sort by elimination round (1, 2, 3...)
    if (roundA !== Infinity && roundB !== Infinity) {
      return roundA - roundB;
    }
    // If only one is eliminated, that one comes first (lower score)
    if (roundA !== Infinity) return -1;
    if (roundB !== Infinity) return 1;

    // If both are remaining, maintain original order (or sort alphabetically)
    return 0;
  });

  area.innerHTML = itemsToDisplay
    .map((item) => {
      const isEliminated = !!eliminatedMap[item];
      const eliminationRound = eliminatedMap[item];

      if (isEliminated) {
        return `
                <div class="elimination-item-card eliminated-card">
                    <h3>${escapeHtml(item)}</h3>
                    <p style="font-size: 0.8em; color: #9ca3af; margin-top: 0.5rem;">
                        Eliminated Round #${eliminationRound}
                    </p>
                </div>
            `;
      } else {
        return `
                <div 
                    class="elimination-item-card" 
                    role="button"
                    tabindex="0"
                    data-item-index="${getItemIndex(item)}"
                >
                    <h3>${escapeHtml(item)}</h3>
                    <p style="font-size: 0.8em; color: #4f46e5; margin-top: 0.5rem;">
                        Select to eliminate
                    </p>
                </div>
            `;
      }
    })
    .join("");

  area.querySelectorAll(".elimination-item-card[data-item-index]").forEach((card) => {
    const vote = () => {
      const item = state.items[Number(card.dataset.itemIndex)];
      if (item) handleEliminationVote(item);
    };
    card.addEventListener("click", vote);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        vote();
      }
    });
  });

  // Update Undo Button visibility
  if (state.elimination.history.length > 0) {
    undoBtn.classList.remove("hidden");
  } else {
    undoBtn.classList.add("hidden");
  }

  // Attach event listener for the Undo Button
  undoBtn.onclick = undoEliminationVote;
  finalResultArea.classList.add("hidden");
  refreshIcons();
}

// --- LOGIC: HANDLE VOTE ---
window.handleEliminationVote = (itemToEliminate) => {
  // 1. Snapshot State for Undo
  const snapshot = JSON.parse(JSON.stringify(state.elimination));
  state.elimination.history.push(snapshot);

  // 2. Process Elimination
  const currentRound = state.elimination.round;

  // Record elimination
  state.elimination.eliminated[itemToEliminate] = currentRound;

  // Remove from remaining list
  state.elimination.remainingItems = state.elimination.remainingItems.filter(
    (item) => item !== itemToEliminate
  );

  // Advance round
  state.elimination.round += 1;

  saveState();
  renderEliminationScreen();
};

// --- LOGIC: UNDO VOTE ---
window.undoEliminationVote = () => {
  if (state.elimination.history.length === 0) return;

  // Restore previous state from history
  const previousState = state.elimination.history.pop();

  state.elimination = previousState;

  saveState();
  renderEliminationScreen();
};

// --- LOGIC: FINALIZE RANKING ---
function finalizeElimination(winner) {
  const totalItems = state.items.length;
  const finalScores = {};
  const eliminatedResults = state.elimination.eliminated;

  // 1. Assign scores based on elimination round (Round 1 = lowest score)
  state.items.forEach((item) => {
    if (item === winner) {
      // The winner gets the highest possible round number/score
      finalScores[item] = totalItems;
    } else {
      // Eliminated items get a score equal to the round they were eliminated in
      // (Round 1 gets score 1, Round 2 gets score 2, etc.)
      finalScores[item] = eliminatedResults[item] || 0; // Should not be 0 if all items are ranked
    }
  });

  // 2. Create the final ranked list by sorting by score (descending)
  const rankedList = Object.keys(finalScores).sort(
    (a, b) => finalScores[b] - finalScores[a]
  );

  // 3. Save to completedMethods using the robust structure
  state.completedMethods["elimination"] = {
    rankedList: rankedList,
    scores: finalScores,
    metadata: { scoreType: "Elimination Round Score" },
  };
  markMethodCompleted("elimination");

  saveState();
}

// --- RESULTS ---
// --- RESULTS UTILITY FUNCTIONS ---

/**
 * Generates a ranked list using Standard Competition Ranking (1, 2, 2, 4)
 * based on the scores provided in the completed method object.
 * @param {Object} methodData - The specific entry from state.completedMethods.
 * @returns {Array<{item: string, rank: number, score: number}>} - List of items with their correct rank number.
 */
function getTieAwareRanking(methodData) {
  if (!methodData || !methodData.scores) return [];

  const scores = methodData.scores;
  // Extract items and sort by score (descending)
  const sortedItems = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);

  let finalRankedOutput = [];
  let currentRank = 0;
  let rankCounter = 0;
  let previousScore = null;

  sortedItems.forEach((item) => {
    const score = scores[item];
    rankCounter++;

    if (score !== previousScore) {
      // New score, new rank (Standard Competition Ranking: 1, 2, 2, 4...)
      currentRank = rankCounter;
    }
    // If score is the same, currentRank remains the same (tie)

    finalRankedOutput.push({ item: item, rank: currentRank, score: score });
    previousScore = score;
  });

  return finalRankedOutput;
}

/**
 * Calculates the final Consensus Rank and builds consistency metrics.
 * @returns {Object} Analysis data.
 */

function analyzeRankings() {
  const allItems = state.items;
  const methods = getCompletedMethodNames();
  let consensusData = {};

  if (methods.length === 0) return { consensus: [], consistency: [] };

  // 1. Calculate Consensus Score (Average Rank Score)
  allItems.forEach((item) => {
    let sumOfRankScores = 0;
    let methodsCounted = 0;

    methods.forEach((methodName) => {
      const methodData = state.completedMethods[methodName];

      // Skip if this method doesn't have the new structure
      if (!methodData || !methodData.rankedList) {
        return;
      }

      // Find the item's rank in the method's ranked list
      const rankIndex = methodData.rankedList.indexOf(item);

      if (rankIndex !== -1) {
        // Rank Score: N - Index (1st place gets max points)
        sumOfRankScores += allItems.length - rankIndex;
        methodsCounted++;
      }
    });

    consensusData[item] =
      methodsCounted > 0 ? sumOfRankScores / methodsCounted : 0;
  });

  // 2. Create Consensus Ranking (Sorted by average rank score descending)
  const consensusRanking = Object.keys(consensusData)
    .map((item) => ({ item, score: consensusData[item] }))
    .sort((a, b) => b.score - a.score);

  // 3. Identify consistency (how stable each item is across methods)
  const consistencyItems = [];

  allItems.forEach((item) => {
    const ranks = [];

    methods.forEach((methodName) => {
      const methodData = state.completedMethods[methodName];
      if (!methodData || !methodData.rankedList) return;

      const rankIndex = methodData.rankedList.indexOf(item);
      if (rankIndex !== -1) {
        ranks.push(rankIndex + 1);
      }
    });

    if (ranks.length > 1) {
      const minRank = Math.min(...ranks);
      const maxRank = Math.max(...ranks);
      const range = maxRank - minRank;

      const consistencyScore = 1 - range / Math.max(1, allItems.length - 1);

      consistencyItems.push({
        item,
        minRank,
        maxRank,
        range,
        consistencyScore,
        ranks: Object.fromEntries(
          methods.map((methodName) => {
            const methodData = state.completedMethods[methodName];
            if (!methodData || !methodData.rankedList) return [methodName, null];

            const rankIndex = methodData.rankedList.indexOf(item);
            return [methodName, rankIndex !== -1 ? rankIndex + 1 : null];
          })
        ),
      });
    }
  });

  consistencyItems.sort((a, b) => a.range - b.range);

  return {
    consensus: consensusRanking,
    consistency: consistencyItems,
  };
}


/**
 * Gathers all ranking data, formats it into a CSV string, and triggers a download.
 */
function exportComparisonData() {
  normalizeProjectState();
  const analysis = analyzeRankings();
  const completedMethods = state.completedMethods;
  
  // 1. Define the columns (Headers)
  let headers = ["Decision", "Item", "Item Note", "Consensus Rank"];
  
  // Dynamically add columns for each completed method
  const methodHeaders = getCompletedMethodNames();
  methodHeaders.forEach(method => {
    // CSV columns will be "MethodName Rank" and "MethodName Score"
    headers.push(`${getMethodLabel(method)} Rank`);
    headers.push(`${getMethodLabel(method)} Score`);
  });

  // 2. Start the CSV string with the headers
  let csv = headers.map(csvEscape).join(",") + "\n";
  
  // Cache tie-aware ranks for each method to avoid re-calculation
  const tieAwareRanksCache = {};
  methodHeaders.forEach(method => {
    // Ensure we don't try to get ranks for methods that don't have scores (though they should if completed)
    if (completedMethods[method] && completedMethods[method].scores) {
        tieAwareRanksCache[method] = getTieAwareRanking(completedMethods[method]);
    } else {
        tieAwareRanksCache[method] = [];
    }
  });
  
  // 3. Populate rows for each item
  
  // To ensure the CSV is sorted by Consensus Rank, we use the consensus list.
  const consensusRanking = (analysis.consensus || []).map((c) => c.item);

  consensusRanking.forEach((item, consensusIndex) => {
    let row = [
      getDecisionTitle(),
      item,
      state.project.itemNotes[item] || "",
    ];
    
    // --- Consensus Data ---
    // The rank number is 1-based index in the consensusRanking array
    row.push(consensusIndex + 1); 

    // --- Method-Specific Data ---
    methodHeaders.forEach(method => {
      const methodRanks = tieAwareRanksCache[method];
      const entry = methodRanks.find(e => e.item === item);
      
      if (entry) {
        // Tie-aware rank and actual score
        row.push(entry.rank); 
        row.push(entry.score);
      } else {
        // If item wasn't ranked in this method
        row.push("-");
        row.push("0");
      }
    });

    csv += row.map(csvEscape).join(",") + "\n";
  });

  csv += "\n";
  csv += ["Decision Note", state.project.decisionNote || ""].map(csvEscape).join(",") + "\n";
  methodHeaders.forEach((method) => {
    csv += [
      `${getMethodLabel(method)} Note`,
      state.project.methodNotes[method] || "",
    ].map(csvEscape).join(",") + "\n";
  });
  
  // 4. Trigger download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'ranking_comparison.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showNotification("Comparison data exported successfully!");
}

function buildProjectExport() {
  normalizeProjectState();
  return {
    version: 2,
    title: state.project.title || "",
    items: state.items,
    itemNotes: state.project.itemNotes || {},
    completedMethods: state.completedMethods || {},
    methodNotes: state.project.methodNotes || {},
    decisionNote: state.project.decisionNote || "",
    createdAt: state.project.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportProjectData() {
  const project = buildProjectExport();
  const slug = (project.title || "rankit-project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "rankit-project";

  downloadTextFile(
    `${slug}.json`,
    JSON.stringify(project, null, 2),
    "application/json;charset=utf-8"
  );
  showNotification("Project JSON exported.");
}

function importProjectData(project) {
  if (!project || !Array.isArray(project.items)) {
    showNotification("Could not import that project file.", 3500);
    return;
  }

  state.items = project.items.map((item) => String(item).trim()).filter(Boolean);
  state.itemsSubmitted = state.items.length >= 3;
  state.completedMethods = sanitizeCompletedMethods(project.completedMethods);
  state.project = {
    title: String(project.title || ""),
    itemNotes:
      project.itemNotes && typeof project.itemNotes === "object"
        ? project.itemNotes
        : {},
    methodNotes:
      project.methodNotes && typeof project.methodNotes === "object"
        ? project.methodNotes
        : {},
    decisionNote: String(project.decisionNote || ""),
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  normalizeProjectState();
  resetRankingProgress();
  state.completedMethods = sanitizeCompletedMethods(project.completedMethods);
  showItemsDisplay();
  updateDecisionInputs();
  updateHomeScreen();
  updateInputTitle();
  updateOnboardingHints();
  saveState();
  showScreen("home");
  showNotification("Project imported.");
}

function setupProjectImportInput(input) {
  if (!input) return;
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importProjectData(JSON.parse(String(reader.result || "")));
      } catch (err) {
        console.warn("Failed to import project JSON:", err);
        showNotification("Could not read that project file.", 3500);
      } finally {
        input.value = "";
      }
    };
    reader.readAsText(file);
  });
}

// --- SHARE LINK + TOUR ---

function _safeBase64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function _safeBase64Decode(str) {
  return decodeURIComponent(escape(atob(str)));
}

function buildShareToken() {
  normalizeProjectState();
  const payload = {
    title: state.project.title,
    items: state.items,
    itemNotes: state.project.itemNotes,
    completedMethods: state.completedMethods,
    methodNotes: state.project.methodNotes,
    decisionNote: state.project.decisionNote,
  };
  try {
    const json = JSON.stringify(payload);
    return _safeBase64Encode(json);
  } catch (err) {
    console.warn("Failed to build share token:", err);
    return "";
  }
}

function parseShareToken(token) {
  try {
    const json = _safeBase64Decode(token);
    return JSON.parse(json);
  } catch (err) {
    console.warn("Failed to parse share token:", err);
    return null;
  }
}

function updateShareLink() {
  const token = buildShareToken();
  const url = new URL(window.location.href);
  if (token) {
    url.searchParams.set("share", token);
  } else {
    url.searchParams.delete("share");
  }
  const shareInput = document.getElementById("shareLinkInput");
  if (shareInput) {
    shareInput.value = url.toString();
  }
}

function openShareDialog() {
  const dialog = document.getElementById("shareDialog");
  if (!dialog) return;
  updateShareLink();
  dialog.classList.remove("hidden");
}

function closeShareDialog() {
  const dialog = document.getElementById("shareDialog");
  if (!dialog) return;
  dialog.classList.add("hidden");
}

function copyShareLink() {
  const shareInput = document.getElementById("shareLinkInput");
  if (!shareInput) return;

  const text = shareInput.value;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showNotification("Link copied to clipboard!"),
      () => {
        shareInput.select();
        document.execCommand("copy");
        showNotification("Link copied to clipboard!");
      }
    );
  } else {
    shareInput.select();
    shareInput.setSelectionRange(0, 99999);
    document.execCommand("copy");
    showNotification("Link copied to clipboard!");
  }
}

function loadSharedStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const shareToken = params.get("share");
  if (!shareToken) return;

  const shared = parseShareToken(shareToken);
  if (!shared || !Array.isArray(shared.items)) return;

  state.items = shared.items;
  state.itemsSubmitted = true;
  state.project = {
    ...createDefaultProject(),
    title: String(shared.title || ""),
    itemNotes:
      shared.itemNotes && typeof shared.itemNotes === "object"
        ? shared.itemNotes
        : {},
    methodNotes:
      shared.methodNotes && typeof shared.methodNotes === "object"
        ? shared.methodNotes
        : {},
    decisionNote: String(shared.decisionNote || ""),
  };
  normalizeProjectState();
  resetRankingProgress();

  if (shared.completedMethods && typeof shared.completedMethods === "object") {
    state.completedMethods = sanitizeCompletedMethods(shared.completedMethods);
  }

  // Ensure rankable methods have their supporting state on load
  showItemsDisplay();
  updateDecisionInputs();
  updateHomeScreen();
  updateInputTitle();
  updateOnboardingHints();
  saveState();

  showNotification("Loaded ranking from shared link.");
}

// --- VISUALIZATION FUNCTIONS ---

// Global Chart variables to allow redrawing
let rankFlowChartInstance = null;
let scatterPlotChartInstance = null;

// Helper to get a consistent color for an item (simple hash function)
function getItemColor(item) {
  let hash = 0;
  for (let i = 0; i < item.length; i++) {
    hash = item.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = `hsl(${hash % 360}, 70%, 50%)`;
  return color;
}

function createVisualizations(analysis, robustMethods) {
  const allItems = state.items;
  if (typeof Chart === "undefined") {
    ["rankFlowArea", "scatterPlotArea"].forEach((id) => {
      const area = document.getElementById(id);
      if (area) {
        area.innerHTML = `
          <h3>${id === "rankFlowArea" ? "Rank Flow Diagram" : "Method-to-Method Comparison"}</h3>
          <p class="chart-caption">Charts are unavailable because the chart library did not load.</p>
        `;
      }
    });
    return;
  }

  // --- 1. Rank Flow Diagram (Line Chart) ---
  const rankFlowData = {
    labels: robustMethods.map((m) => getMethodLabel(m)), // X-Axis: Methods
    datasets: allItems.map((item) => {
      const dataPoints = robustMethods.map((methodName) => {
        // Find the item's tie-aware rank in the completed data
        const methodData = state.completedMethods[methodName];
        const tieRanks = getTieAwareRanking(methodData);
        const entry = tieRanks.find((e) => e.item === item);
        return entry ? entry.rank : null; // Use rank (Standard Competition Rank)
      });

      return {
        label: item,
        data: dataPoints,
        borderColor: getItemColor(item, robustMethods),
        backgroundColor: getItemColor(item, robustMethods) + "50", // translucent
        tension: 0.4, // smooth lines
        pointRadius: 6,
        hidden: allItems.length > 15, // Hide lines if too many items
      };
    }),
  };

  const ctxFlow = document.getElementById("rankFlowChart").getContext("2d");

  const rankFlowConfig = {
    type: "line",
    data: rankFlowData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          reverse: true, // Higher rank is better (top of chart)
          beginAtZero: true,
          title: { display: true, text: "Rank Position" },
          ticks: {
            stepSize: 1,
          },
          min: 1, // Start Y-axis at Rank 1
          max: allItems.length,
        },
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 12,
          },
        },
        title: {
          display: false,
        },
      },
    },
  };

  if (rankFlowChartInstance) {
    rankFlowChartInstance.data = rankFlowData;
    rankFlowChartInstance.options = rankFlowConfig.options;
    rankFlowChartInstance.update();
  } else {
    rankFlowChartInstance = new Chart(ctxFlow, rankFlowConfig);
  }

  // --- 2. Scatter Plot Setup (UI population) ---

  const scatterX = document.getElementById("scatterXAxis");
  const scatterY = document.getElementById("scatterYAxis");

  // Clear and populate dropdowns
  scatterX.innerHTML = "";
  scatterY.innerHTML = "";
  robustMethods.forEach((method) => {
    const optionX = document.createElement("option");
    optionX.value = method;
    optionX.textContent = getMethodLabel(method);
    scatterX.appendChild(optionX);

    const optionY = document.createElement("option");
    optionY.value = method;
    optionY.textContent = getMethodLabel(method);
    scatterY.appendChild(optionY);
  });

  // Set initial default comparison (e.g., Pairwise vs. Budget, or first two methods)
  if (robustMethods.length >= 2) {
    scatterX.value = robustMethods[0];
    scatterY.value = robustMethods[1];
  }

  // Initial draw and event listeners
  const drawScatter = () => {
    const methodX = scatterX.value;
    const methodY = scatterY.value;

    if (!methodX || !methodY) return;

    // Get the tie-aware ranks for the selected methods
    const ranksX = getTieAwareRanking(state.completedMethods[methodX]);
    const ranksY = getTieAwareRanking(state.completedMethods[methodY]);

    // Map item name to rank for quick lookup
    const mapX = Object.fromEntries(ranksX.map((r) => [r.item, r.rank]));
    const mapY = Object.fromEntries(ranksY.map((r) => [r.item, r.rank]));

    const scatterDatasets = [
      {
        label: "Items",
        data: allItems.map((item) => ({
          x: mapX[item] || allItems.length, // Default to lowest rank if missing
          y: mapY[item] || allItems.length,
          item: item,
        })),
        backgroundColor: allItems.map((item) => getItemColor(item)),
        pointRadius: 8,
        pointHoverRadius: 10,
      },
    ];

    const ctxScatter = document
      .getElementById("scatterPlotChart")
      .getContext("2d");

    const scatterConfig = {
      type: "scatter",
      data: { datasets: scatterDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            reverse: true, // Rank 1 is on the right
            beginAtZero: true,
            title: { display: true, text: getMethodLabel(methodX) + " Rank" },
            ticks: { stepSize: 1 },
            min: 1,
            max: allItems.length,
          },
          y: {
            reverse: true, // Rank 1 is at the top
            beginAtZero: true,
            title: { display: true, text: getMethodLabel(methodY) + " Rank" },
            ticks: { stepSize: 1 },
            min: 1,
            max: allItems.length,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                const item = context.raw.item;
                return (
                  item +
                  " (X: #" +
                  context.raw.x +
                  ", Y: #" +
                  context.raw.y +
                  ")"
                );
              },
            },
          },
        },
      },
    };

    if (scatterPlotChartInstance) {
      scatterPlotChartInstance.data = scatterConfig.data;
      scatterPlotChartInstance.options = scatterConfig.options;
      scatterPlotChartInstance.update();
    } else {
      scatterPlotChartInstance = new Chart(ctxScatter, scatterConfig);
    }
  };

  // Attach listeners to redraw the scatter plot when methods change
  scatterX.onchange = drawScatter;
  scatterY.onchange = drawScatter;

  // Draw the initial plot
  drawScatter();
}

function createHeatmap(analysis, robustMethods) {
  const allItems = (analysis.consensus || []).map((c) => c.item);
  const heatmapContainer = document.getElementById("heatmapContainer");
  if (!heatmapContainer) return;

  const methodRanks = robustMethods.map((methodName) => {
    const methodData = state.completedMethods[methodName];
    const ranked = getTieAwareRanking(methodData);
    const maxRank = ranked.reduce((max, r) => Math.max(max, r.rank), 0);
    const rankMap = Object.fromEntries(ranked.map((r) => [r.item, r.rank]));
    return { methodName, rankMap, maxRank };
  });

  const tableHeader = `
    <thead>
      <tr>
        <th>Item</th>
        ${robustMethods
          .map((methodName) => `<th>${escapeHtml(getMethodLabel(methodName))}</th>`)
          .join("")}
      </tr>
    </thead>
  `;

  const tableRows = allItems
    .map((item) => {
      const cells = methodRanks
        .map(({ methodName, rankMap, maxRank }) => {
          const rank = rankMap[item] || null;
          const normalized = rank ? (rank - 1) / Math.max(1, maxRank - 1) : 1;
          const hue = 120 - 120 * normalized; // green (best) to red (worst)
          const bg = rank
            ? `hsl(${hue}, 70%, 85%)`
            : "rgba(243, 244, 246, 0.8)";
          const textColor = rank ? "#1f2937" : "#6b7280";
          const display = rank ? `#${rank}` : "–";

          return `
            <td
              class="heatmap-cell"
              style="background: ${bg}; color: ${textColor};"
              title="${escapeHtml(getMethodLabel(methodName))}: ${display}"
              aria-label="${escapeHtml(getMethodLabel(methodName))}: ${display}"
            >
              ${display}
            </td>
          `;
        })
        .join("");

      return `
        <tr>
          <th class="heatmap-item">${escapeHtml(item)}</th>
          ${cells}
        </tr>
      `;
    })
    .join("");

  heatmapContainer.innerHTML = `
    <table class="heatmap-table">
      ${tableHeader}
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;
}

function renderSummaryCards() {
  const analysis = comparisonState.analysis;
  const robustMethods = comparisonState.robustMethods;
  if (!analysis || !robustMethods) return;

  const summaryArea = document.getElementById("summaryAndVolatilityArea");
  if (!summaryArea) return;

  const mode = comparisonState.consistencyMode;
  const consistencyList = (analysis.consistency || []).slice();

  // Select items depending on mode
  let selected = [];
  let title = "Most Consistent Items";
  let desc =
    "Items ranked similarly across methods (smaller spread = more consistent).";

  if (mode === "volatile") {
    selected = consistencyList.slice(-5).reverse();
    title = "Most Volatile Items";
    desc = "Items with the biggest rank swings across methods.";
  } else {
    selected = consistencyList.slice(0, 5);
  }

  const consensusCard = `
        <div class="method-results-card consensus-card">
            <h3>Consensus Rank</h3>
            <p style="color: #6b7280; margin-bottom: 1rem;">
                (Average rank score across all ${robustMethods.length} methods)
            </p>
            ${analysis.consensus
              .map(
                (entry, i) => `
                <div class="method-ranking-item">
                    <span class="rank-badge">${i + 1}</span> 
                    <span class="ranking-name">${escapeHtml(entry.item)}</span>
                    <span class="score-display" style="margin-left:auto; font-size:0.9em; color:#4b5563;">
                      ${formatScore(entry.score)}
                    </span>
                </div>
            `
              )
              .join("")}
        </div>
    `;

  const consistencyCard = `
        <div class="method-results-card consistency-card">
            <h3>${title}</h3>
            <p style="color: #6b7280; margin-bottom: 1rem;">
                ${desc}
            </p>
            ${selected
              .map(
                (entry, i) => `
                <div class="method-ranking-item">
                    <span class="rank-badge">${i + 1}</span>
                    <span class="ranking-name">${escapeHtml(entry.item)}</span>
                    <span class="score-display" style="margin-left:auto; font-size:0.9em; color:#4b5563;">
                      ±${entry.range}
                    </span>
                </div>
            `
              )
              .join("")}
        </div>
    `;

  summaryArea.innerHTML = consensusCard + consistencyCard;

  // Update method count badge
  const methodCountEl = document.getElementById("resultsMethodCount");
  if (methodCountEl) {
    methodCountEl.textContent = robustMethods.length;
  }

  // Ensure toggle buttons reflect current mode
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

function setConsistencyMode(mode) {
  comparisonState.consistencyMode = mode;
  state.consistencyMode = mode;
  saveState();

  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  renderSummaryCards();
}

function buildDecisionInsights(analysis, robustMethods) {
  const consensus = analysis.consensus || [];
  const consistency = analysis.consistency || [];
  const completed = robustMethods.length;
  const itemCount = state.items.length;
  const strongest = consensus[0]?.item || "No top choice yet";
  const robust = consistency
    .filter((entry) => entry.range <= 1)
    .slice(0, 3)
    .map((entry) => entry.item);
  const sensitive = consistency
    .slice()
    .filter((entry) => entry.range > 0)
    .sort((a, b) => b.range - a.range)
    .slice(0, 3)
    .map((entry) => entry.item);
  const avgRange =
    consistency.length > 0
      ? consistency.reduce((sum, entry) => sum + entry.range, 0) /
        consistency.length
      : 0;
  const confidence =
    completed >= 4 && avgRange <= 1
      ? "High"
      : completed >= 3 && avgRange <= Math.max(1, itemCount / 4)
      ? "Medium"
      : "Early";

  return {
    strongest,
    robust,
    sensitive,
    confidence,
    coverage: `${completed} of ${Object.keys(METHOD_LABELS).length} methods completed`,
  };
}

function renderDecisionInsights(analysis, robustMethods) {
  const container = document.getElementById("decisionInsightsArea");
  if (!container) return;

  const insights = buildDecisionInsights(analysis, robustMethods);
  const methodExplanations = robustMethods
    .map((method) => {
      const guidance = METHOD_GUIDANCE[method];
      return guidance
        ? `<li><strong>${escapeHtml(getMethodLabel(method))}:</strong> ${escapeHtml(guidance.use)}</li>`
        : "";
    })
    .join("");

  container.innerHTML = `
    <div class="insight-card">
      <span class="insight-label">Likely top choice</span>
      <h3>${escapeHtml(insights.strongest)}</h3>
      <p>Consensus score combines the rank position from every completed method.</p>
    </div>
    <div class="insight-card">
      <span class="insight-label">Most robust choices</span>
      <h3>${insights.robust.length ? escapeHtml(insights.robust.join(", ")) : "Still emerging"}</h3>
      <p>These options stayed close to the same rank across methods.</p>
    </div>
    <div class="insight-card">
      <span class="insight-label">Method-sensitive choices</span>
      <h3>${insights.sensitive.length ? escapeHtml(insights.sensitive.join(", ")) : "No major swings yet"}</h3>
      <p>Review these if your decision depends on the ranking method.</p>
    </div>
    <div class="insight-card">
      <span class="insight-label">Confidence</span>
      <h3>${escapeHtml(insights.confidence)}</h3>
      <p>${escapeHtml(insights.coverage)}. Add another method if the top choices still feel close.</p>
    </div>
    <div class="insight-card insight-card-wide">
      <span class="insight-label">Why methods can disagree</span>
      <ul>${methodExplanations}</ul>
    </div>
  `;
}

function renderAggregatedResultsTable(analysis, robustMethods) {
  const container = document.getElementById("aggregatedResultsTable");
  if (!container) return;

  const consensusList = analysis.consensus || [];

  const headerRow = `
    <thead>
      <tr>
        <th>Item</th>
        <th>Consensus</th>
        ${robustMethods
          .map((methodName) => `<th>${escapeHtml(getMethodLabel(methodName))}</th>`)
          .join("")}
      </tr>
    </thead>
  `;

  const rows = consensusList
    .map((entry) => {
      const item = entry.item;
      const consensusScore = formatScore(entry.score);

      const cells = robustMethods
        .map((methodName) => {
          const methodData = state.completedMethods[methodName];
          if (!methodData) return `<td>–</td>`;

          const rankEntry = getTieAwareRanking(methodData).find(
            (e) => e.item === item
          );

          const score = methodData.scores ? methodData.scores[item] : null;
          const displayRank = rankEntry ? `#${rankEntry.rank}` : "–";
          const displayScore = score != null ? ` (${formatScore(score)})` : "";

          return `<td>${displayRank}${displayScore}</td>`;
        })
        .join("");

      return `
        <tr>
          <th>${escapeHtml(item)}</th>
          <td>${escapeHtml(consensusScore)}</td>
          ${cells}
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="visual-card-header">
      <h3>Aggregated Results</h3>
      <p class="chart-caption">
        Raw scores per method (rank shown with score in parentheses).
      </p>
    </div>
    <div class="smart-table-container">
      <table class="smart-results-table">
        ${headerRow}
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderCompareResults() {
  normalizeProjectState();
  const analysis = analyzeRankings();

  // Filter only methods that have the new robust structure
  const robustMethods = getCompletedMethodNames();

  if (robustMethods.length === 0) {
    document.getElementById("summaryAndVolatilityArea").innerHTML =
      "<div class='text-center'>Not enough completed rankings to compare!</div>";
    return;
  }

  // Update persisted mode (in case this is an older save without the key)
  state.consistencyMode = state.consistencyMode || "consistent";
  saveState();

  // --- A. Render Summary and Consistency Area ---
  comparisonState.analysis = analysis;
  comparisonState.robustMethods = robustMethods;
  comparisonState.consistencyMode = state.consistencyMode;
  renderSummaryCards();
  renderDecisionInsights(analysis, robustMethods);

  const summaryTitle = document.getElementById("decisionSummaryTitle");
  if (summaryTitle) {
    summaryTitle.textContent = getDecisionTitle("Decision summary");
  }

  const decisionNoteInput = document.getElementById("decisionNoteInput");
  if (decisionNoteInput) {
    decisionNoteInput.value = state.project.decisionNote || "";
    decisionNoteInput.oninput = () => {
      state.project.decisionNote = decisionNoteInput.value;
      saveState();
    };
  }

  // --- B. Build Individual Method Cards (Detailed Rank Grid) ---
  const detailedGridArea = document.getElementById("detailedRankGrid");

  const methodCards = robustMethods
    .map((method) => {
      const methodData = state.completedMethods[method];
      if (!methodData || !methodData.rankedList) return "";

      const rankedItemsWithTies = getTieAwareRanking(methodData);

      const scoreTypeDisplay =
        (methodData.metadata && methodData.metadata.scoreType) || "Raw Score";

      return `
            <div class="method-results-card">
                <h3>${escapeHtml(getMethodLabel(method))}</h3>
                <p style="color: #6b7280; font-size: 0.9em; margin-bottom: 0.5rem;">
                    Score: ${escapeHtml(scoreTypeDisplay)}
                </p>
                ${rankedItemsWithTies
                  .map(
                    (rankedItem) => `
                    <div class="method-ranking-item">
                        <span class="rank-badge">${rankedItem.rank}</span> 
                        <span class="ranking-name">${escapeHtml(rankedItem.item)}</span>
                        <span style="margin-left: auto; font-size: 0.9em; color: #4b5563;">
                            ${formatScore(rankedItem.score)}
                        </span>
                    </div>
                `
                  )
                  .join("")}
                <label class="method-note-label" for="methodNote-${method}">
                  Reflection note
                </label>
                <textarea
                  id="methodNote-${method}"
                  class="method-note-input"
                  data-method-note="${method}"
                  rows="3"
                  placeholder="Why did this method feel right or wrong?"
                >${escapeHtml(state.project.methodNotes[method] || "")}</textarea>
            </div>
        `;
    })
    .join("");

  detailedGridArea.innerHTML = methodCards;
  detailedGridArea
    .querySelectorAll("[data-method-note]")
    .forEach((input) => {
      input.addEventListener("input", () => {
        state.project.methodNotes[input.dataset.methodNote] = input.value;
        saveState();
      });
    });

  // --- C. Create Visualizations ---
  createVisualizations(analysis, robustMethods);
  createHeatmap(analysis, robustMethods);
  renderAggregatedResultsTable(analysis, robustMethods);

  refreshIcons();
}

function openCompareResults() {
  const completedCount = getCompletedMethodCount();
  if (completedCount < 2) {
    showNotification("Complete at least 2 ranking methods to review the decision summary.");
    return;
  }

  state.lastComparedCount = completedCount;
  saveState();
  updateOnboardingHints();
  showScreen("results");
  renderCompareResults();
}

document
  .getElementById("compareResultsBtn")
  .addEventListener("click", openCompareResults);

const progressCompareLink = document.getElementById("progressCompareLink");
if (progressCompareLink) {
  progressCompareLink.addEventListener("click", (e) => {
    e.preventDefault();
    openCompareResults();
  });
}

document
  .getElementById("newRankingBtn")
  .addEventListener("click", () => showScreen("home"));

// --- KEYBOARD SHORTCUTS (UPDATED) ---
document.addEventListener("keydown", (e) => {
  const shareDialog = document.getElementById("shareDialog");
  if (e.key === "Escape" && shareDialog && !shareDialog.classList.contains("hidden")) {
    closeShareDialog();
    return;
  }

  // PAIRWISE SHORTCUTS
  if (state.screen === "pairwise" && state.currentPair) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      handleVote(state.currentPair[0], state.currentPair[1]);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handleVote(state.currentPair[1], state.currentPair[0]);
    } else if (e.key === "ArrowDown" || e.key === " ") {
      e.preventDefault();
      handleTie();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      skipPair();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      undoPairwiseVote();
    } // Assuming you have undoLastVote for pairwise
  }

  // SMART SORT SHORTCUTS
  if (state.screen === "smart" && state.smartSortData) {
    // Arrows for Voting
    if (state.smartSortData.currentPair) {
      const pair = state.smartSortData.currentPair;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleSmartVote(pair.left);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleSmartVote(pair.right);
      }
    }

    // Undo Shortcut
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      undoSmartVote();
    }
  }
});

// --- TEMPLATES ---
function renderTemplateCategories() {
  const container = document.getElementById("templateButtonsContainer");
  if (!container) return;
  container.innerHTML = `
      <label class="form-label">Choose a decision starter:</label>
      <div class="template-category-scroll">
        ${templateData.categories
          .map(
            (cat) => `
          <div class="template-category-card" data-category-id="${cat.id}" role="button" tabindex="0">
            <div class="icon">${escapeHtml(cat.icon)}</div>
            <div class="description">${escapeHtml(cat.description)}</div>
            <div class="name">${escapeHtml(cat.name)}</div>
          </div>
        `
          )
          .join("")}
      </div>`;
}

function renderTemplatesForCategory(catId) {
  const container = document.getElementById("templateButtonsContainer");
  const templates = templateData.templates.filter((t) => t.category === catId);
  container.innerHTML = `
        <button class="btn btn-icon" id="templateBackBtn">Back</button>
        <div class="template-item-grid">
            ${templates
              .map(
                (t) => `
                <div class="template-item-card" data-template-id="${escapeHtml(t.id)}" role="button" tabindex="0">
                    <div class="name">${escapeHtml(t.name)}</div>
                    <div class="description">${
                      t.items.length
                        ? escapeHtml(t.items.slice(0, 3).join(", ")) +
                          (t.items.length > 3 ? "..." : "")
                        : "Start with an empty list."
                    }</div>
                </div>
            `
              )
              .join("")}
        </div>
    `;
  document.getElementById("templateBackBtn").onclick = renderTemplateCategories;
  container.querySelectorAll(".template-item-card").forEach((card) => {
    const selectTemplate = () => window.loadTemplate(card.dataset.templateId);
    card.addEventListener("click", selectTemplate);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectTemplate();
      }
    });
  });
}

window.loadTemplate = (id) => {
  const t = templateData.templates.find((x) => x.id === id);
  if (!t) {
    console.warn("Template not found for ID:", id);
    return;
  }
  const itemsInput = document.getElementById("itemsInput");
  if (!itemsInput) return;
  itemsInput.value = t.items.join(", ");
  const titleInput = document.getElementById("decisionTitleInput");
  if (titleInput && !titleInput.value.trim() && t.id !== "blank") {
    titleInput.value = t.name;
  }
  updateItemsPreview(itemsInput.value);
  syncDecisionInputs();
  clearInputError();
};

// Event Delegation for Templates
document.addEventListener("click", (e) => {
  const card = e.target.closest(".template-category-card");
  if (card) renderTemplatesForCategory(card.dataset.categoryId);
});

document.addEventListener("keydown", (e) => {
  const card = e.target.closest(".template-category-card");
  if (!card || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault();
  renderTemplatesForCategory(card.dataset.categoryId);
});

// --- UTILS ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Init
document.addEventListener("DOMContentLoaded", () => {
  renderTemplateCategories();

  // Make sure the home screen is in a safe default state (disabled methods, compare button, etc.)
  updateHomeScreen();
  updateInputTitle();
  updateOnboardingHints();

  // Consistency toggle (most consistent vs most volatile)
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => setConsistencyMode(btn.dataset.mode));
  });

  loadState();

  // Re-apply UI updates after state is restored (in case it changes what should be shown)
  updateHomeScreen();
  updateInputTitle();
  updateOnboardingHints();

  const itemsInput = document.getElementById("itemsInput");
  if (itemsInput) {
    itemsInput.addEventListener("input", (e) => {
      const value = e.target.value;
      const error = validateItemsInput(value);
      if (error) {
        showInputError(error);
      } else {
        clearInputError();
      }
      updateItemsPreview(value);
    });

    // Initialize preview if the user reloads page with existing textarea value.
    updateItemsPreview(itemsInput.value);
  }

  ["decisionTitleInput", "itemNotesInput"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      syncDecisionInputs();
      if (state.itemsSubmitted) showItemsDisplay();
    });
  });

  // tournament reset button
  const resetBtn = document.getElementById("tournamentResetBtn");
  if (resetBtn) {
    resetBtn.onclick = resetTournamentData;
  }

  // export button
  const exportBtn = document.getElementById("exportComparisonBtn");
  if (exportBtn) {
    exportBtn.onclick = exportComparisonData;
  }

  const exportProjectBtn = document.getElementById("exportProjectBtn");
  if (exportProjectBtn) {
    exportProjectBtn.onclick = exportProjectData;
  }

  const homeExportProjectBtn = document.getElementById("homeExportProjectBtn");
  if (homeExportProjectBtn) {
    homeExportProjectBtn.onclick = exportProjectData;
  }

  const copyProjectJsonBtn = document.getElementById("copyProjectJsonBtn");
  if (copyProjectJsonBtn) {
    copyProjectJsonBtn.onclick = () => {
      const text = JSON.stringify(buildProjectExport(), null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => showNotification("Project JSON copied."),
          () => showNotification("Could not copy project JSON.", 3500)
        );
      } else {
        showNotification("Clipboard access is unavailable.", 3500);
      }
    };
  }

  setupProjectImportInput(document.getElementById("importProjectInput"));
  setupProjectImportInput(document.getElementById("homeImportProjectInput"));

  document.getElementById("backBtn").addEventListener("click", () => {
    if (state.screen === "drag") {
      finalizeDragRank(); // Process and save final results
    }
    // 1. Save state upon exiting any ranking mode
    if (state.screen !== "home") {
      saveState();
      showNotification("Progress saved!");
    }

    // 2. Navigate back home
    showScreen("home");
  });

  document.getElementById("clearBtn").addEventListener("click", clearState);
  document.getElementById("shareBtn").addEventListener("click", openShareDialog);
  document.getElementById("shareDialogClose").addEventListener("click", closeShareDialog);
  document.getElementById("shareDialog").addEventListener("click", (e) => {
    if (e.target.id === "shareDialog") closeShareDialog();
  });
  document.getElementById("copyShareLinkBtn").addEventListener("click", copyShareLink);

  // Load shared state if provided via URL
  loadSharedStateFromUrl();
});
