// THE BASICS
// Initialize Lucide icons
lucide.createIcons();

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

    // Mark completed
    if (state.completedMethods[mode]) {
      card.classList.add("completed");
    } else {
      card.classList.remove("completed");
    }

    // Disable/Enable based on items
    if (!state.itemsSubmitted) {
      card.classList.add("disabled");
    } else {
      card.classList.remove("disabled");
    }
  });

  const completedCount = Object.keys(state.completedMethods).length;
  const compareBtn = document.getElementById("compareResultsBtn");
  const compareHint = document.getElementById("compareResultsHint");

  const canCompare = completedCount >= 2;

  if (compareBtn) {
    compareBtn.disabled = !canCompare;
    compareBtn.setAttribute("aria-disabled", String(!canCompare));
    compareBtn.title = canCompare
      ? "View comparison of all completed rankings"
      : "Complete at least 2 ranking methods to compare results";
    compareBtn.classList.toggle("btn-disabled", !canCompare);

    // Auto-scroll + highlight when user becomes eligible to compare
    if (canCompare && !state.compareReadyNotified) {
      state.compareReadyNotified = true;
      saveState();
      showNotification(
        "You can now compare results! Tap the Compare button to see the summary.",
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
        ? `Compare All Results (${completedCount} completed)`
        : "Compare All Results";
  }

  const compareCounter = document.getElementById("compareCounter");
  if (compareCounter) {
    compareCounter.textContent =
      completedCount >= 2
        ? `${completedCount} completed`
        : `${completedCount} / 2 complete`;
  }

  lucide.createIcons();
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
    // Some browsers (or corrupted/locked storage files) can throw when accessing
    // localStorage. Try clearing it once as a recovery step before giving up.
    console.warn("LocalStorage unavailable (attempting recovery):", err);
    try {
      localStorage.clear();
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
  const hints = document.getElementById("onboardingHints");
  if (!hints) return;

  // Hide hints once items are submitted (user has progressed)
  hints.classList.toggle("hidden", state.itemsSubmitted);

  // Update the checklist progress indicators
  const progressItems = document.getElementById("progressItems");
  const progressMethod = document.getElementById("progressMethod");
  const progressCompare = document.getElementById("progressCompare");

  if (progressItems) {
    progressItems.classList.toggle("complete", state.itemsSubmitted);
    progressItems.classList.toggle("incomplete", !state.itemsSubmitted);
  }

  const completedCount = Object.keys(state.completedMethods || {}).length;
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
    ? items.map((i) => `<div class="chip">${i}</div>`).join("")
    : `<div class="chip chip-empty">Items will appear here as you type.</div>`;
}

// --- INITIALIZATION & INPUT ---

function updateInputTitle() {
  const el = document.getElementById("inputTitle");
  if (el)
    el.textContent = state.itemsSubmitted ? "Your Items" : "Add Your Items";
}

function showItemsDisplay() {
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
    ? state.items.map((i) => `<div class="chip">${i}</div>`).join("")
    : `<div class="chip chip-empty">No items found. Enter items to get started.</div>`;

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
    // --- ADDED WARNING LOGIC ---
    // Only warn if there is existing progress to lose
    const hasProgress = Object.keys(state.completedMethods).length > 0;

    if (hasProgress) {
      const confirmed = confirm(
        "⚠️ WARNING: Editing your items will reset ALL your ranking progress " +
          "in Pairwise, Budget, Tournament, and all other completed methods. " +
          "Do you wish to continue?"
      );

      if (!confirmed) {
        return; // Stop the process if the user cancels
      }
    }
    // --- END WARNING LOGIC ---

    document.getElementById("inputMode").classList.remove("hidden");
    document.getElementById("displayMode").classList.add("hidden");
    document.getElementById("itemsInput").value = state.items.join(", ");

    // Reset state only after confirmation
    state.itemsSubmitted = false;
    state.completedMethods = {};

    // Reset method-specific states (important for a clean start)
    state.currentRankings = {};
    state.pairs = [];
    state.currentPair = null;
    state.votedPairs = [];
    state.history = [];

    // Ensure other method data is also reset if they exist
    state.tierList = { S: [], A: [], B: [], C: [], D: [] };
    // Add other specific modes' state reset here if necessary (e.g., state.budget = {})

    updateHomeScreen();
    updateInputTitle();
    updateOnboardingHints();
  };
  document.getElementById("displayMode").appendChild(btn);
}
document.getElementById("startRankingBtn").addEventListener("click", () => {
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
  state.completedMethods = {}; // Reset results

  // Reset Specific States
  state.budget = { allocated: {} };
  state.items.forEach((i) => (state.budget.allocated[i] = 0));

  showItemsDisplay();
  updateHomeScreen();
  updateInputTitle();
  updateOnboardingHints();
  saveState();
});

// --- MODE SELECTION ---

document.querySelectorAll(".mode-card").forEach((card) => {
  card.addEventListener("click", () => {
    if (!state.itemsSubmitted) return;
    state.mode = card.dataset.mode;
    startRankingMode();
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

    // RENAME THE CONDITION: Only initialize if the ranking is completed (restarting)
    // OR if the system is currently empty (new start).
if (!isCompleted && (isQueueEmpty && areRankingsEmpty)) {
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
    renderPairwiseComparison();
  }
  // 2. Tier
  else if (state.mode === "tier") {
    // Ensure keys exist
    if (!state.tierList || Object.keys(state.tierList).length === 0) {
      state.tierList = { S: [], A: [], B: [], C: [], D: [] };
    }
    showScreen("tier");
    renderTierList();
  }
  // 3. Drag
  else if (state.mode === "drag") {
    showScreen("drag");
    renderDragRank();
  }
  // 4. Budget
  else if (state.mode === "budget") {
    // Init budget if empty
    if (!state.budget || !state.budget.allocated)
      state.budget = { allocated: {} };
    state.items.forEach((i) => {
      if (state.budget.allocated[i] === undefined)
        state.budget.allocated[i] = 0;
    });
    showScreen("budget");
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
    renderTournamentBracket();
  }

  // 6. Smart Sort
  else if (state.mode === "smart") {
    // NEW: Check for completed Smart Sort ranking (Persistence)
    if (state.completedMethods["smart"]) {
      showNotification("Returning to completed Smart Sort results.");
      showScreen("smart");

      const area = document.getElementById("smartComparisonArea");
      const methodData = state.completedMethods["smart"];
      area.innerHTML = _generateSmartSortResultsHtml(methodData);

      // Ensure extraneous elements are hidden
      document
        .getElementById("smartProgressText")
        .parentElement.classList.add("hidden");
      document.getElementById("smartContextArea").style.display = "none";
      document.getElementById("smartUndoBtn")?.classList.add("hidden");

      lucide.createIcons();
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
  shuffleArray(state.pairs); // Assumes shuffleArray exists
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
    saveState();

    // 2. Display Final Ranked List and Reset Button
    const rankListHTML = rankedList
      .map(
        (item, index) =>
          `<div class="ranking-item">
             <span class="ranking-number">#${index + 1}</span>
             ${item}
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
      <button class="btn btn-primary" onclick="showScreen('home')">Return Home</button>
    `;

    // Attach Reset Listener
    document.getElementById("pairwiseResetBtn").onclick = resetPairwiseRanking;
    lucide.createIcons();

    return;
  }

  const [a, b] = state.currentPair;
  area.innerHTML = `
        <div class="comparison-grid">
            <div class="comparison-card" onclick="handleVote('${a}','${b}')"><h3>${a}</h3></div>
            <div class="comparison-card" onclick="handleVote('${b}','${a}')"><h3>${b}</h3></div>
        </div>
    `;

  // Check if history exists to show Undo button
  const hasHistory = state.history && state.history.length > 0;

  // Render Buttons
  document.getElementById("actionButtonsArea").innerHTML = `
        <button class="btn btn-yellow" onclick="handleTie()">Tie (↓ or Space)</button>
        <button class="btn btn-secondary" onclick="skipPair()">Skip (↑)</button>
        ${
          hasHistory
            ? `<button class="btn btn-blue" onclick="undoPairwiseVote()">
                <i data-lucide="rotate-ccw" class="icon"></i> Undo (Ctrl+Z)
            </button>`
            : ""
        }
    `;

  lucide.createIcons(); // Refresh icons for the new undo button

  // Progress
  const total = state.pairs.length + state.votedPairs.length;
  document.getElementById(
    "progressText"
  ).textContent = `${state.votedPairs.length} / ${total}`;
  document.getElementById("progressFill").style.width = `${
    (state.votedPairs.length / total) * 100
  }%`;
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
  const allocatedScores = state.budget.allocated;

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
                <div class="budget-label">${item}</div>
                <input type="range" id="range-${safeId}" class="budget-slider" 
                       min="0" max="100" value="${val}" 
                       oninput="handleBudgetInput('${item}', ${safeId}, this.value)">
                <input type="number" id="num-${safeId}" class="budget-input" 
                       min="0" max="100" value="${val}" 
                       onchange="handleBudgetInput('${item}', ${safeId}, this.value)">
            </div>
        `;
    })
    .join("");
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
    alert(`You must use exactly $100. Currently at $${total}.`);
    return;
  }
  // Sort by money allocated
  const sorted = Object.keys(state.budget.allocated).sort(
    (a, b) => state.budget.allocated[b] - state.budget.allocated[a]
  );
  state.completedMethods["budget"] = sorted;
  saveState();
  finishBudget();
  showScreen("home");
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
                <p style="font-size: 1.2rem; margin-top: 0.5rem;">The winner is: <strong>${finalWinner}</strong></p>
            </div>
            <div class="text-center">
                <button class="btn btn-primary" id="finishTourneyBtn">Return Home</button>
            </div>
        `;
    tournamentWinnerArea.classList.remove("hidden");
    lucide.createIcons();
    document.getElementById("finishTourneyBtn").onclick = finishTournament;
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
                        <div class="match-player winner" onclick="advanceTournament(${roundIndex}, ${i}, '${p1}')">
                           ${displayPlayer(
                             p1
                           )} <span style="font-size:0.7em; margin-left:auto; opacity:0.6">(BYE - Click to Advance)</span>
                        </div>
                    </div>`;
      } else {
        // --- REGULAR MATCH LOGIC ---
        html += `
                    <div class="match-card ${!isReady ? "placeholder" : ""}">
                        <div class="${p1Class} match-player" 
                             ${
                               isReady && p1
                                 ? `onclick="advanceTournament(${roundIndex}, ${i}, '${p1}', '${p2}')"`
                                 : ""
                             }>
                             ${displayPlayer(p1)}
                        </div>
                        <div class="${p2Class} match-player" 
                             ${
                               isReady && p2
                                 ? `onclick="advanceTournament(${roundIndex}, ${i}, '${p2}', '${p1}')"`
                                 : ""
                             }>
                             ${displayPlayer(p2)}
                        </div>
                    </div>
                `;
      }
    }
    html += `</div>`;
  }

  html += "</div>";
  container.innerHTML = html;
}

window.advanceTournament = (roundIndex, playerIndex, winnerName, loserName) => {
  const structure = state.tournament.structure;

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

  // --- NEW Tournament Finish Logic ---
  state.completedMethods["tournament"] = {
    rankedList: finalRanking,
    scores: finalScores,
    metadata: { scoreType: "Elimination Round Score" },
  };
  // --- END NEW Logic ---

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

  // Assumes getTieAwareRanking is defined and available
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
                    ${rankedItem.item}
                    <span style="margin-left: auto; font-size: 0.9em; color: #4b5563;">
                        ${rankedItem.score.toFixed(1)}
                    </span>
                </div>
            `
              )
              .join("")}
        </div>

        <div class="action-buttons" style="margin-top: 1rem;">
            <button class="btn btn-blue" onclick="resetSmartSortData()">
                Rank Again? (Reset Data)
            </button>
            <button class="btn btn-primary" onclick="showScreen('home')">
                Back to Home
            </button>
        </div>
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
  const manager = MergeSortManager.fromState(state.smartSortData);
  if (!state.smartSortData || !state.smartSortData.lists) {
    // If data is null/missing, force re-initialization before proceeding.
    // This calls the logic within startRankingMode that creates the MergeSortManager data.
    startRankingMode("smart");
    // Since startRankingMode calls renderSmartSort(), we can return here
    return;
  }
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
  document.getElementById("smartProgressFill").style.width = `${progress}%`;

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
    saveState();

    // 1. RENDER THE DETAILED RESULTS LIST
    const methodData = state.completedMethods["smart"];
    area.innerHTML = _generateSmartSortResultsHtml(methodData);

    // 2. HIDE PROGRESS BAR AND CONTEXT
    document
      .getElementById("smartProgressText")
      .parentElement.classList.add("hidden"); // Hides the progress bar container
    document.getElementById("smartContextArea").style.display = "none";

    // 3. HIDE UNDO BUTTON IF VISIBLE
    document.getElementById("smartUndoBtn")?.classList.add("hidden");

    lucide.createIcons();
    return;
  }

  // Save current pair for shortcuts
  state.smartSortData.currentPair = pair;

  // Check history for Undo Button visibility
  const hasHistory =
    state.smartSortData.history && state.smartSortData.history.length > 0;

  area.innerHTML = `
        <div class="comparison-grid">
            <div class="comparison-card" onclick="handleSmartVote('${
              pair.left
            }')">
                <h3>${pair.left}</h3>
                <div class="comparison-hint">Press Left Arrow</div>
            </div>
            <div class="comparison-card" onclick="handleSmartVote('${
              pair.right
            }')">
                <h3>${pair.right}</h3>
                <div class="comparison-hint">Press Right Arrow</div>
            </div>
        </div>
        
        <div id="actionButtonsArea" class="action-buttons">
             ${
               hasHistory
                 ? `<button id="smartUndoBtn" class="btn btn-blue" onclick="undoSmartVote()">
                    <i data-lucide="rotate-ccw" class="icon"></i> Undo (Ctrl+Z)
                </button>`
                 : ""
             }
        </div>
    `;
  lucide.createIcons();
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
  const finalList = state.items; // The final order is stored directly in state.items
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

  saveState();
  showNotification("Drag to Rank Saved!");
}

function renderDragRank() {
  const list = document.getElementById("dragRankList");
  list.innerHTML = state.items
    .map(
      (item, idx) => `
        <li class="drag-rank-item" draggable="true" data-index="${idx}">
          <span>${idx + 1}.</span> <span>${item}</span>
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
        const item = state.items.splice(fromIdx, 1)[0];
        state.items.splice(toIdx, 0, item);
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

  // Basic Render for fix context
  const allPlaced = Object.values(state.tierList).flat();
  const unplaced = state.items.filter((i) => !allPlaced.includes(i));

  area.innerHTML = unplaced
    .map(
      (i) =>
        `<div class="draggable-item" draggable="true" id="item-${i}">${i}</div>`
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
                      `<div class="draggable-item" draggable="true" id="item-${i}">${i}</div>`
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
      e.dataTransfer.setData("text", e.target.innerText);
      e.target.style.opacity = 0.5;
    });
    item.addEventListener("dragend", (e) => (e.target.style.opacity = 1));
  });

  document.querySelectorAll(".tier-items").forEach((zone) => {
    zone.addEventListener("dragover", (e) => e.preventDefault());
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      const text = e.dataTransfer.getData("text");
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
            <p style="margin-bottom: 1.5rem;">Your ultimate survivor is 🥇 <strong>${winner}</strong>!</p>
            <button class="btn btn-primary" onclick="showScreen('home')">Return Home</button>
        `;
    lucide.createIcons();
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
                    <h3>${item}</h3>
                    <p style="font-size: 0.8em; color: #9ca3af; margin-top: 0.5rem;">
                        Eliminated Round #${eliminationRound}
                    </p>
                </div>
            `;
      } else {
        return `
                <div 
                    class="elimination-item-card" 
                    onclick="handleEliminationVote('${item}')"
                >
                    <h3>${item}</h3>
                    <p style="font-size: 0.8em; color: #4f46e5; margin-top: 0.5rem;">
                        Click to Eliminate
                    </p>
                </div>
            `;
      }
    })
    .join("");

  // Update Undo Button visibility
  if (state.elimination.history.length > 0) {
    undoBtn.classList.remove("hidden");
  } else {
    undoBtn.classList.add("hidden");
  }

  // Attach event listener for the Undo Button
  undoBtn.onclick = undoEliminationVote;
  finalResultArea.classList.add("hidden");
  lucide.createIcons();
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

  saveState();
}

// --- RESULTS ---
// --- RESULTS UTILITY FUNCTIONS ---

// Replace your existing getTieAwareRanking function with this simplified version:

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
  const methods = Object.keys(state.completedMethods);
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
  const analysis = analyzeRankings();
  const completedMethods = state.completedMethods;
  
  // 1. Define the columns (Headers)
  let headers = ["Item", "Consensus Rank"]; 
  
  // Dynamically add columns for each completed method
  const methodHeaders = Object.keys(completedMethods);
  methodHeaders.forEach(method => {
    // CSV columns will be "MethodName Rank" and "MethodName Score"
    headers.push(`${method.charAt(0).toUpperCase() + method.slice(1)} Rank`);
    headers.push(`${method.charAt(0).toUpperCase() + method.slice(1)} Score`);
  });

  // 2. Start the CSV string with the headers
  let csv = headers.join(",") + "\n";
  
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
    let row = [item];
    
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

    csv += row.join(",") + "\n";
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

// --- SHARE LINK + TOUR ---

function _safeBase64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function _safeBase64Decode(str) {
  return decodeURIComponent(escape(atob(str)));
}

function buildShareToken() {
  const payload = {
    items: state.items,
    completedMethods: state.completedMethods,
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

  if (shared.completedMethods && typeof shared.completedMethods === "object") {
    state.completedMethods = shared.completedMethods;
  }

  // Ensure rankable methods have their supporting state on load
  showItemsDisplay();
  updateHomeScreen();
  updateInputTitle();
  updateOnboardingHints();
  saveState();

  showNotification("Loaded ranking from shared link.");
}

// --- NEW VISUALIZATION FUNCTIONS (Add to script.js) ---

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

  // --- 1. Rank Flow Diagram (Line Chart) ---
  const rankFlowData = {
    labels: robustMethods.map((m) => m.toUpperCase()), // X-Axis: Methods
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
    scatterX.innerHTML += `<option value="${method}">${method.toUpperCase()}</option>`;
    scatterY.innerHTML += `<option value="${method}">${method.toUpperCase()}</option>`;
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
            title: { display: true, text: methodX.toUpperCase() + " Rank" },
            ticks: { stepSize: 1 },
            min: 1,
            max: allItems.length,
          },
          y: {
            reverse: true, // Rank 1 is at the top
            beginAtZero: true,
            title: { display: true, text: methodY.toUpperCase() + " Rank" },
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
          .map((methodName) => `<th>${methodName.toUpperCase()}</th>`)
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
              title="${methodName.toUpperCase()}: ${display}"
              aria-label="${methodName.toUpperCase()}: ${display}"
            >
              ${display}
            </td>
          `;
        })
        .join("");

      return `
        <tr>
          <th class="heatmap-item">${item}</th>
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
  let title = "✅ Most Consistent Items";
  let desc =
    "Items ranked similarly across methods (smaller spread = more consistent).";

  if (mode === "volatile") {
    selected = consistencyList.slice(-5).reverse();
    title = "🌀 Most Volatile Items";
    desc = "Items with the biggest rank swings across methods.";
  } else {
    selected = consistencyList.slice(0, 5);
  }

  const consensusCard = `
        <div class="method-results-card consensus-card">
            <h3>⭐ Consensus Rank</h3>
            <p style="color: #6b7280; margin-bottom: 1rem;">
                (Average rank score across all ${robustMethods.length} methods)
            </p>
            ${analysis.consensus
              .map(
                (entry, i) => `
                <div class="method-ranking-item">
                    <span class="rank-badge">${i + 1}</span> 
                    ${entry.item}
                    <span class="score-display" style="margin-left:auto; font-size:0.9em; color:#4b5563;">
                      ${entry.score.toFixed(1)}
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
                    ${entry.item}
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
          .map((methodName) => `<th>${methodName.toUpperCase()}</th>`)
          .join("")}
      </tr>
    </thead>
  `;

  const rows = consensusList
    .map((entry) => {
      const item = entry.item;
      const consensusScore = entry.score.toFixed(1);

      const cells = robustMethods
        .map((methodName) => {
          const methodData = state.completedMethods[methodName];
          if (!methodData) return `<td>–</td>`;

          const rankEntry = getTieAwareRanking(methodData).find(
            (e) => e.item === item
          );

          const score = methodData.scores ? methodData.scores[item] : null;
          const displayRank = rankEntry ? `#${rankEntry.rank}` : "–";
          const displayScore = score != null ? ` (${score.toFixed(1)})` : "";

          return `<td>${displayRank}${displayScore}</td>`;
        })
        .join("");

      return `
        <tr>
          <th>${item}</th>
          <td>${consensusScore}</td>
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
  const analysis = analyzeRankings();

  // Filter only methods that have the new robust structure
  const robustMethods = Object.keys(state.completedMethods).filter((method) => {
    const data = state.completedMethods[method];
    return typeof data === "object" && data.rankedList && data.scores;
  });

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
                <h3>${method.toUpperCase()}</h3>
                <p style="color: #6b7280; font-size: 0.9em; margin-bottom: 0.5rem;">
                    Score: ${scoreTypeDisplay}
                </p>
                ${rankedItemsWithTies
                  .map(
                    (rankedItem) => `
                    <div class="method-ranking-item">
                        <span class="rank-badge">${rankedItem.rank}</span> 
                        ${rankedItem.item}
                        <span style="margin-left: auto; font-size: 0.9em; color: #4b5563;">
                            ${rankedItem.score.toFixed(1)}
                        </span>
                    </div>
                `
                  )
                  .join("")}
            </div>
        `;
    })
    .join("");

  detailedGridArea.innerHTML = methodCards;

  // --- C. Create Visualizations ---
  createVisualizations(analysis, robustMethods);
  createHeatmap(analysis, robustMethods);
  renderAggregatedResultsTable(analysis, robustMethods);

  lucide.createIcons();
}

function openCompareResults() {
  const completedCount = Object.keys(state.completedMethods || {}).length;
  if (completedCount < 2) {
    showNotification("Complete at least 2 ranking methods to compare results.");
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
      <label class="form-label">Choose a template:</label>
      <div class="template-category-scroll">
        ${templateData.categories
          .map(
            (cat) => `
          <div class="template-category-card" data-category-id="${cat.id}">
            <div class="icon">${cat.icon}</div>
            <div class="description">${cat.description}</div>
            <div class="name">${cat.name}</div>
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
        <button class="btn btn-icon" onclick="renderTemplateCategories()">⬅ Back</button>
        <div class="template-item-grid">
            ${templates
              .map(
                (t) => `
                <div class="template-item-card" onclick="loadTemplate('${
                  t.id
                }')">
                    <div class="name">${t.name}</div>
                    <div class="description">${t.items
                      .slice(0, 3)
                      .join(", ")}...</div>
                </div>
            `
              )
              .join("")}
        </div>
    `;
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
};

// Event Delegation for Templates
document.addEventListener("click", (e) => {
  const card = e.target.closest(".template-category-card");
  if (card) renderTemplatesForCategory(card.dataset.categoryId);
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
  document.getElementById("copyShareLinkBtn").addEventListener("click", copyShareLink);

  // Load shared state if provided via URL
  loadSharedStateFromUrl();
});
