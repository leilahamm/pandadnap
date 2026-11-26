(() => {
  "use strict";

  const table = document.querySelector(".table-section");
  if (!table) return;

  const categoryNames = ["explicit", "implicit", "general", "original"];
  const categorySuits = {
    explicit: "♠",
    implicit: "♥",
    general: "♦",
    original: "♣"
  };
  const captionsContainer = document.getElementById("caption-options");
  const bankrollDisplay = document.getElementById("bankroll");
  const roundDisplay = document.getElementById("round-number");
  const cartoonImage = document.getElementById("cartoon-image");
  const cartoonEmptyState = document.getElementById("cartoon-empty-state");
  const panMood = document.getElementById("pan-mood");
  const dealerMessage = document.getElementById("dealer-message");
  const resultPanel = document.getElementById("result-panel");
  const resultPayout = document.getElementById("result-payout");
  const resultCategory = document.getElementById("result-category");
  const napResultMessage = document.getElementById("nap-result-message");
  const betAmount = document.getElementById("bet-amount");
  const strategyMode = document.getElementById("strategy-mode");
  const strategyHint = document.getElementById("strategy-hint");
  const play100Button = document.getElementById("play-100");
  const simulationPanel = document.getElementById("simulation-panel");
  const simulationSummary = document.getElementById("simulation-summary");
  const chartFootnote = document.getElementById("chart-footnote");
  const bankrollChart = document.getElementById("bankroll-chart");
  const chartTitle = document.getElementById("chart-title");
  const globalMockBanner = document.getElementById("global-mock-banner");
  const gameMockBanner = document.getElementById("game-mock-banner");
  const bottomMockBanner = document.getElementById("bottom-mock-banner");

  let rounds = [];
  let categories = {};
  let bankroll = 100;
  let completedRounds = 0;
  let currentRound = null;
  let selectedCategory = null;
  let roundFinished = false;
  let isMock = false;

  function showLoadError(error) {
    console.error("Could not load casino practice data.", error);
    captionsContainer.replaceChildren();
    const message = document.createElement("p");
    message.className = "loading-message";
    message.setAttribute("role", "alert");
    message.textContent = "The table is unavailable until the practice data loads. Check that the mock JSON files are present and valid.";
    captionsContainer.append(message);
    dealerMessage.textContent = "The practice data could not be loaded. Check the browser console for details.";
  }

  function validatePayouts(data) {
    if (!data || typeof data !== "object" || !data.categories || typeof data.categories !== "object") {
      throw new Error("payouts.json must contain a categories object.");
    }
    if (typeof data.mock !== "boolean") {
      throw new Error('payouts.json must include a boolean "mock" flag.');
    }

    for (const name of categoryNames) {
      const category = data.categories[name];
      if (!category || !Array.isArray(category.payouts) || category.payouts.length === 0) {
        throw new Error(`payouts.json is missing payout samples for "${name}".`);
      }
      if (!Number.isInteger(category.n) || category.n < 0) {
        throw new Error(`The observed sample count for "${name}" must be a non-negative integer.`);
      }
      if (!category.payouts.every((value) => Number.isFinite(value))) {
        throw new Error(`Payout samples for "${name}" must all be finite numbers.`);
      }
    }
    return data;
  }

  function validateRounds(data) {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("rounds.json must contain at least one example round.");
    }

    data.forEach((round, index) => {
      if (!round || (round.image !== null && typeof round.image !== "string") || typeof round.alt !== "string" || (round.image && !round.alt.trim()) || !Array.isArray(round.captions) || round.captions.length !== 4) {
        throw new Error(`Round ${index + 1} must have an optional image path and four captions.`);
      }
      const categoriesInRound = new Set();
      for (const caption of round.captions) {
        if (typeof caption.text !== "string" || !categoryNames.includes(caption.category)) {
          throw new Error(`Round ${index + 1} contains a caption with invalid text or category.`);
        }
        categoriesInRound.add(caption.category);
      }
      if (categoriesInRound.size !== categoryNames.length) {
        throw new Error(`Round ${index + 1} must contain one caption per category.`);
      }
    });
    return data;
  }

  function currentBet() {
    const requestedBet = Number(betAmount.value);
    return Math.min(requestedBet, bankroll);
  }

  function refreshBankroll() {
    bankrollDisplay.textContent = String(bankroll);
    const canBet = bankroll >= 5;
    betAmount.disabled = !canBet || roundFinished;
    captionsContainer.querySelectorAll(".caption-option").forEach((button) => {
      button.disabled = !canBet || roundFinished;
    });
    if (!canBet) {
      dealerMessage.textContent = "The play balance is spent. Reset to begin another hand.";
    }
  }

  function assetUrl(path) {
    const assetBase = new URL(table.dataset.assetBase, window.location.href);
    return new URL(path.replace(/^\/?assets\//, ""), assetBase).href;
  }

  function iconUrl(filename) {
    const iconBase = new URL(table.dataset.iconBase, window.location.href);
    return new URL(filename, iconBase).href;
  }

  function setPanMood(mood, alt) {
    if (mood !== "happy" && mood !== "sad") {
      panMood.hidden = true;
      panMood.removeAttribute("src");
      delete panMood.dataset.mood;
      return;
    }
    panMood.src = iconUrl(`pan-${mood}.svg`);
    panMood.alt = alt;
    panMood.dataset.mood = mood;
    panMood.hidden = false;
  }

  function renderRound() {
    currentRound = rounds[completedRounds % rounds.length];
    selectedCategory = null;
    roundFinished = false;
    setPanMood("neutral", "Pan, ready for the next round");
    roundDisplay.textContent = `Round ${completedRounds + 1}`;
    if (currentRound.image) {
      cartoonImage.src = assetUrl(currentRound.image);
      cartoonImage.alt = currentRound.alt;
      cartoonImage.hidden = false;
      cartoonEmptyState.hidden = true;
    } else {
      cartoonImage.removeAttribute("src");
      cartoonImage.alt = "";
      cartoonImage.hidden = true;
      cartoonEmptyState.hidden = false;
    }
    captionsContainer.replaceChildren();

    currentRound.captions.forEach((caption, index) => {
      const button = document.createElement("button");
      button.className = `caption-option ${strategyMode.checked ? "is-revealed" : "is-hidden"}`;
      button.type = "button";
      button.dataset.category = caption.category;
      button.setAttribute("aria-label", `Caption ${index + 1}: ${caption.text}. Category hidden until after your bet.`);

      const copy = document.createElement("span");
      copy.className = "caption-copy";
      copy.textContent = caption.text;
      button.append(copy);

      const categoryLabel = document.createElement("span");
      categoryLabel.className = "caption-category";
      const categorySuit = document.createElement("span");
      categorySuit.className = `suit-icon suit-${caption.category}`;
      categorySuit.setAttribute("aria-hidden", "true");
      categorySuit.textContent = categorySuits[caption.category];
      categoryLabel.append(categorySuit, document.createTextNode(caption.category));
      categoryLabel.hidden = !strategyMode.checked;
      button.append(categoryLabel);

      for (const position of ["top", "bottom"]) {
        const corner = document.createElement("span");
        corner.className = `card-corner card-corner-${position}`;
        corner.setAttribute("aria-hidden", "true");
        const indexLabel = document.createElement("span");
        indexLabel.className = "card-index";
        indexLabel.textContent = String.fromCharCode(65 + index);
        const cornerSuit = document.createElement("span");
        cornerSuit.className = `card-corner-suit suit-${caption.category}`;
        cornerSuit.textContent = categorySuits[caption.category];
        cornerSuit.hidden = !strategyMode.checked;
        corner.append(indexLabel, cornerSuit);
        button.append(corner);
      }
      captionsContainer.append(button);
    });

    resultPanel.hidden = true;
    document.getElementById("next-round").hidden = true;
    play100Button.disabled = true;
    dealerMessage.textContent = strategyMode.checked
      ? "Strategy mode is on. Categories are visible. Choose a caption to place a practice wager."
      : "Categories remain concealed until you choose a caption.";
    refreshBankroll();
  }

  function sampleScore(categoryName) {
    const samples = categories[categoryName].payouts;
    return samples[Math.floor(Math.random() * samples.length)];
  }

  function tokenChange(score, wager) {
    const change = Math.round((score - 2.5) * 4 * (wager / 10));
    return Math.max(-wager, change);
  }

  function placeBet(button) {
    if (roundFinished || bankroll < 5) return;

    selectedCategory = button.dataset.category;
    const score = sampleScore(selectedCategory);
    const wager = currentBet();
    const change = tokenChange(score, wager);
    bankroll = Math.max(0, bankroll + change);
    completedRounds += 1;
    roundFinished = true;

    captionsContainer.querySelectorAll(".caption-option").forEach((option) => {
      option.disabled = true;
      option.querySelector(".caption-category").hidden = false;
      option.querySelectorAll(".card-corner-suit").forEach((suit) => {
        suit.hidden = false;
      });
      option.classList.remove("is-hidden");
      option.classList.add("is-revealed");
      option.setAttribute("aria-label", `Caption: ${option.querySelector(".caption-copy").textContent}. Category: ${option.dataset.category}.`);
    });
    button.classList.add("is-picked");

    resultPanel.hidden = false;
    resultPayout.textContent = `${change >= 0 ? "+" : ""}${change} tokens`;
    resultCategory.textContent = `${selectedCategory} · sampled score ${score.toFixed(1)} / 5`;
    setPanMood(change >= 0 ? "happy" : "sad", change >= 0 ? "Pan is happy after winning this round" : "Pan is sad after losing this round");
    napResultMessage.textContent = change >= 0
      ? "The hand is complete. This score is a random practice sample, not a research result."
      : `This hand ended below the wager. Tokens are for practice only.${isMock ? " The score is a placeholder." : ""}`;
    dealerMessage.textContent = change >= 0
      ? "The category and a sample score are shown. This hand is for practice only."
      : "The category and a sample score are shown. Tokens have no monetary value.";
    document.getElementById("next-round").hidden = bankroll < 5;
    play100Button.disabled = false;
    strategyHint.textContent = completedRounds >= 3 ? "Unlocked — switch any time" : `${3 - completedRounds} more ${3 - completedRounds === 1 ? "round" : "rounds"}`;
    strategyMode.disabled = completedRounds < 3;
    refreshBankroll();
  }

  function drawChart(values) {
    const namespace = "http://www.w3.org/2000/svg";
    const grid = bankrollChart.querySelector(".chart-grid");
    const line = bankrollChart.querySelector(".chart-line");
    const endpoint = bankrollChart.querySelector(".chart-endpoint");
    const left = 44;
    const right = 700;
    const top = 24;
    const bottom = 220;
    const maximum = Math.max(...values);
    const minimum = Math.min(...values);
    const range = Math.max(maximum - minimum, 1);
    grid.replaceChildren();

    for (let index = 0; index < 5; index += 1) {
      const y = top + ((bottom - top) / 4) * index;
      const gridLine = document.createElementNS(namespace, "line");
      gridLine.setAttribute("x1", String(left));
      gridLine.setAttribute("x2", String(right));
      gridLine.setAttribute("y1", String(y));
      gridLine.setAttribute("y2", String(y));
      grid.append(gridLine);
    }

    const points = values.map((value, index) => {
      const x = left + ((right - left) * index) / Math.max(values.length - 1, 1);
      const y = bottom - ((value - minimum) / range) * (bottom - top);
      return `${x},${y}`;
    });
    line.setAttribute("points", points.join(" "));

    const [lastX, lastY] = points[points.length - 1].split(",");
    endpoint.setAttribute("cx", lastX);
    endpoint.setAttribute("cy", lastY);
    bankrollChart.setAttribute(
      "aria-label",
      `Practice simulation bankroll line chart, starting at ${values[0]} tokens and ending at ${values[values.length - 1]} tokens after ${values.length - 1} rounds.`
    );
  }

  async function simulate100Rounds() {
    if (!selectedCategory) return;
    const wagerPerRound = Number(betAmount.value);
    const previousMood = panMood.dataset.mood || "neutral";
    setPanMood("neutral", "");
    simulationPanel.hidden = false;
    simulationSummary.textContent = "Preparing a 100-round practice simulation.";
    play100Button.disabled = true;
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    const values = [bankroll];
    let simulatedBankroll = bankroll;

    for (let index = 0; index < 100; index += 1) {
      const score = sampleScore(selectedCategory);
      simulatedBankroll += tokenChange(score, wagerPerRound);
      values.push(simulatedBankroll);
    }

    bankroll = simulatedBankroll;
    refreshBankroll();
    setPanMood(previousMood, previousMood === "happy" ? "Pan is happy after winning this round" : previousMood === "sad" ? "Pan is sad after losing this round" : "Pan, ready for the next round");
    drawChart(values);
    simulationSummary.textContent = `Using the ${selectedCategory} ${isMock ? "placeholder " : ""}distribution, the play balance went from ${values[0]} to ${bankroll} tokens over ${values.length - 1} simulated rounds.`;
    chartFootnote.textContent = isMock
      ? "MOCK DATA: not our results · Values and conversion rules are placeholders."
      : "Practice simulation only; this chart is hypothetical, not a result.";
    play100Button.disabled = bankroll < 5;
  }

  function bindVerdictPickers() {
    document.querySelectorAll(".verdict-picker").forEach((picker) => {
      picker.addEventListener("click", (event) => {
        const selectedButton = event.target.closest("button");
        if (!selectedButton) return;
        const wasSelected = selectedButton.getAttribute("aria-pressed") === "true";
        picker.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", "false"));
        const note = picker.parentElement.querySelector(".guess-note");
        if (wasSelected) {
          note.textContent = "No verdict yet — choose a guess, not a result.";
          return;
        }
        selectedButton.setAttribute("aria-pressed", "true");
        note.textContent = `Selected hypothesis: ${selectedButton.textContent}. This is not a result.`;
      });
    });
  }

  async function start() {
    try {
      const [payoutResponse, roundResponse] = await Promise.all([
        fetch(table.dataset.payoutsUrl),
        fetch(table.dataset.roundsUrl)
      ]);
      if (!payoutResponse.ok || !roundResponse.ok) {
        throw new Error(`Could not load practice JSON (payouts: ${payoutResponse.status}, rounds: ${roundResponse.status}).`);
      }

      const [payoutData, roundData] = await Promise.all([payoutResponse.json(), roundResponse.json()]);
      validatePayouts(payoutData);
      categories = payoutData.categories;
      rounds = validateRounds(roundData);
      isMock = payoutData.mock === true;
      setPanMood("neutral", "Pan, ready for the first round");
      const hasMockRounds = rounds.some((round) =>
        round.captions.some((caption) => caption.text.startsWith("[MOCK]"))
      );
      const hasMockData = isMock || hasMockRounds;
      globalMockBanner.hidden = !hasMockData;
      gameMockBanner.hidden = !hasMockData;
      bottomMockBanner.hidden = !hasMockData;
      chartTitle.textContent = `${isMock ? "Mock " : "Practice "}bankroll over 100 simulated rounds`;
      dealerMessage.textContent = isMock
        ? "Choose a caption to begin. This practice table uses example captions and placeholder score samples."
        : "Choose a caption to begin. This table uses example captions and the selected payout distribution.";
      renderRound();
    } catch (error) {
      showLoadError(error);
    }
  }

  captionsContainer.addEventListener("click", (event) => {
    const button = event.target.closest(".caption-option");
    if (button && captionsContainer.contains(button)) placeBet(button);
  });

  strategyMode.addEventListener("change", () => {
    captionsContainer.querySelectorAll(".caption-category").forEach((label) => {
      label.hidden = !strategyMode.checked && !roundFinished;
    });
    captionsContainer.querySelectorAll(".caption-option").forEach((button, index) => {
      const categoryIsHidden = !strategyMode.checked && !roundFinished;
      button.setAttribute(
        "aria-label",
        categoryIsHidden
          ? `Caption ${index + 1}: ${button.querySelector(".caption-copy").textContent}. Category hidden until after your bet.`
          : `Caption: ${button.querySelector(".caption-copy").textContent}. Category: ${button.dataset.category}.`
      );
      button.classList.toggle("is-hidden", categoryIsHidden);
      button.classList.toggle("is-revealed", !categoryIsHidden);
      button.querySelectorAll(".card-corner-suit").forEach((suit) => {
        suit.hidden = categoryIsHidden;
      });
    });
  });

  document.getElementById("next-round").addEventListener("click", renderRound);
  document.getElementById("reset-game").addEventListener("click", () => {
    bankroll = 100;
    completedRounds = 0;
    selectedCategory = null;
    play100Button.disabled = true;
    strategyMode.checked = false;
    strategyMode.disabled = true;
    strategyHint.textContent = "Unlocks after 3 rounds";
    simulationPanel.hidden = true;
    renderRound();
  });
  play100Button.addEventListener("click", simulate100Rounds);

  bindVerdictPickers();
  start();
})();
