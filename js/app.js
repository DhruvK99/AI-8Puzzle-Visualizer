/**
 * js/app.js
 * UI State Controller, SPA View Router, Board-by-Board Solution Visualizer,
 * Search Event Inspector, and Synchronized Playback Timer Engine.
 */
(function () {
  'use strict';

  const AppState = {
    currentView: 'home',
    visualizationMode: 'solution', // 'solution' | 'search'
    initialBoard: PuzzleUtils.DEFAULT_INITIAL_STATE.slice(),
    goalBoard: PuzzleUtils.DEFAULT_GOAL_STATE.slice(),
    isInputDirty: false,
    lastResult: null,
    solutionStepIndex: 0,
    searchEventIndex: 0,
    playbackTimer: null,
    isPlaying: false,
    isPaused: false,
    playbackSpeedMs: 700,
    maxExpandedLimit: 25000
  };

  /**
   * Scrolls the #solution-boards-container smoothly so the active highlighted card
   * stays visible inside the scroll box without jumping the outer window.
   */
  function scrollCardIntoContainer(cardEl) {
    const container = document.getElementById('solution-boards-container');
    if (!container || !cardEl) return;

    const containerRect = container.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();

    if (cardRect.top < containerRect.top) {
      container.scrollTop -= (containerRect.top - cardRect.top) + 12;
    } else if (cardRect.bottom > containerRect.bottom) {
      container.scrollTop += (cardRect.bottom - containerRect.bottom) + 12;
    }
  }

  /**
   * Renders a 3x3 puzzle board into a container element.
   * Optionally highlights `movedTile` or animates the transition from `prevBoard`.
   */
  function renderBoardToDOM(container, board, options = {}) {
    if (!container) return;
    container.innerHTML = '';

    if (!Array.isArray(board) || board.length !== 9) {
      container.textContent = '—';
      return;
    }

    const highlightTile = options.movedTile !== undefined ? options.movedTile : null;
    const prevBoard = options.prevBoard || null;
    let transitionInfo = null;

    if (prevBoard) {
      const check = PuzzleUtils.isValidTransition(prevBoard, board);
      if (check.valid) {
        transitionInfo = check;
      }
    }

    for (let i = 0; i < 9; i++) {
      const val = board[i];
      const cell = document.createElement('div');
      cell.className = 'puzzle-tile';

      if (val === 0) {
        cell.classList.add('tile-blank');
        cell.textContent = '_';
        cell.setAttribute('aria-label', 'Blank tile');
      } else {
        cell.textContent = String(val);
        cell.setAttribute('aria-label', 'Tile ' + val);
        if (highlightTile === val) {
          cell.classList.add('tile-moved');
        }
      }

      // Subtle legal transition animation when stepping between consecutive states
      if (transitionInfo && (i === transitionInfo.fromIndex || i === transitionInfo.toIndex)) {
        const dRow = Math.floor(transitionInfo.toIndex / 3) - Math.floor(transitionInfo.fromIndex / 3);
        const dCol = (transitionInfo.toIndex % 3) - (transitionInfo.fromIndex % 3);
        const sign = i === transitionInfo.fromIndex ? 1 : -1;
        cell.style.transform = 'translate(' + (sign * dCol * 12) + 'px, ' + (sign * dRow * 12) + 'px)';
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            cell.style.transform = 'translate(0, 0)';
          });
        });
      }

      container.appendChild(cell);
    }
  }

  /**
   * Builds the two 3x3 editable input grids for Initial and Goal states.
   */
  function renderEditableInputGrids() {
    const initGrid = document.getElementById('input-initial-grid');
    const goalGrid = document.getElementById('input-goal-grid');
    if (!initGrid || !goalGrid) return;

    initGrid.innerHTML = '';
    goalGrid.innerHTML = '';

    for (let i = 0; i < 9; i++) {
      const initInput = document.createElement('input');
      initInput.type = 'text';
      initInput.maxLength = 1;
      initInput.className = 'editable-cell-input';
      initInput.dataset.index = String(i);
      initInput.value = AppState.initialBoard[i] === 0 ? '_' : String(AppState.initialBoard[i]);
      initInput.setAttribute('aria-label', 'Initial State cell ' + (i + 1));
      initInput.addEventListener('input', handleManualGridInput);
      initGrid.appendChild(initInput);

      const goalInput = document.createElement('input');
      goalInput.type = 'text';
      goalInput.maxLength = 1;
      goalInput.className = 'editable-cell-input';
      goalInput.dataset.index = String(i);
      goalInput.value = AppState.goalBoard[i] === 0 ? '_' : String(AppState.goalBoard[i]);
      goalInput.setAttribute('aria-label', 'Goal State cell ' + (i + 1));
      goalInput.addEventListener('input', handleManualGridInput);
      goalGrid.appendChild(goalInput);
    }

    updateInputValidationBanner();
  }

  /**
   * Reads the current values from the editable 3x3 grids.
   */
  function readBoardsFromInputs() {
    const initInputs = document.querySelectorAll('#input-initial-grid .editable-cell-input');
    const goalInputs = document.querySelectorAll('#input-goal-grid .editable-cell-input');

    const initial = Array.from(initInputs).map((el) => PuzzleUtils.parseCellValue(el.value));
    const goal = Array.from(goalInputs).map((el) => PuzzleUtils.parseCellValue(el.value));
    return { initial, goal };
  }

  /**
   * Live-validates the manual input grids and displays clear solvability feedback.
   */
  function updateInputValidationBanner() {
    const feedback = document.getElementById('input-validation-feedback');
    if (!feedback) return null;

    const { initial, goal } = readBoardsFromInputs();
    const check = PuzzleUtils.checkSolvability(initial, goal);

    feedback.className = 'alert py-2 px-3 small mt-3 mb-3';
    if (!check.valid) {
      feedback.classList.add('alert-danger');
      feedback.textContent = 'Invalid Input: ' + check.reason;
    } else if (!check.solvable) {
      feedback.classList.add('alert-warning');
      feedback.textContent = check.reason;
    } else {
      feedback.classList.add('alert-success');
      const zeroMove = PuzzleUtils.areBoardsEqual(initial, goal);
      feedback.textContent = zeroMove
        ? check.reason + ' (Initial state already matches Goal State — 0 moves required).'
        : check.reason;
    }
    return check;
  }

  /**
   * Triggered whenever the user edits any cell in the Initial or Goal 3x3 input boards.
   * Marks the input state as modified if it differs from the last solved configuration
   * and disables stale playback stepping until the new board is validated and solved.
   */
  function handleManualGridInput() {
    stopPlaybackTimer();
    AppState.isPaused = false;

    const check = updateInputValidationBanner();
    const { initial, goal } = readBoardsFromInputs();

    const matchesStored =
      check &&
      check.valid &&
      PuzzleUtils.areBoardsEqual(initial, AppState.initialBoard) &&
      PuzzleUtils.areBoardsEqual(goal, AppState.goalBoard);

    AppState.isInputDirty = !matchesStored;

    const alertBox = document.getElementById('global-alert');
    if (alertBox && check && check.valid && check.solvable) {
      alertBox.classList.add('d-none');
    }

    updateToolbarControls();
  }

  /**
   * Synchronizes the currently entered DOM input boards into AppState and validates them.
   * Used by BOTH the toolbar "Run UCS" button and the "Validate & Solve with UCS" button
   * so manual edits are never ignored or overwritten by stale state.
   */
  function syncInputsToStateAndValidate() {
    const initInputs = document.querySelectorAll('#input-initial-grid .editable-cell-input');
    const goalInputs = document.querySelectorAll('#input-goal-grid .editable-cell-input');

    if (initInputs.length === 9 && goalInputs.length === 9) {
      const { initial, goal } = readBoardsFromInputs();
      const check = PuzzleUtils.checkSolvability(initial, goal);

      updateInputValidationBanner();

      if (!check.valid || !check.solvable) {
        stopPlaybackTimer();
        AppState.isPaused = false;
        const alertBox = document.getElementById('global-alert');
        if (alertBox) {
          alertBox.className = 'alert alert-danger py-2 px-3 small';
          alertBox.textContent = check.reason;
          alertBox.classList.remove('d-none');
        }
        switchView('input');
        updateToolbarControls();
        return false;
      }

      AppState.initialBoard = initial;
      AppState.goalBoard = goal;
      AppState.isInputDirty = false;
    }

    return true;
  }

  /**
   * Stops any active playback interval timer cleanly.
   */
  function stopPlaybackTimer() {
    if (AppState.playbackTimer !== null) {
      clearInterval(AppState.playbackTimer);
      AppState.playbackTimer = null;
    }
    AppState.isPlaying = false;
  }

  /**
   * Synchronizes the toolbar buttons and step indicator badge.
   */
  function updateToolbarControls() {
    const pauseBtn = document.getElementById('ctrl-pause');
    const resumeBtn = document.getElementById('ctrl-resume');
    const prevBtn = document.getElementById('ctrl-prev');
    const nextBtn = document.getElementById('ctrl-next');
    const resetBtn = document.getElementById('ctrl-reset');
    const stepBadge = document.getElementById('toolbar-step-indicator');
    const statusBadge = document.getElementById('toolbar-status-badge');

    const totalItems = getActiveSequenceLength();
    const currentIndex = getActiveSequenceIndex();
    const dirty = AppState.isInputDirty;

    if (pauseBtn) pauseBtn.disabled = dirty || !AppState.isPlaying;
    if (resumeBtn) {
      resumeBtn.disabled = dirty || AppState.isPlaying || !AppState.isPaused || currentIndex >= totalItems - 1;
    }
    if (prevBtn) prevBtn.disabled = dirty || totalItems === 0 || currentIndex <= 0;
    if (nextBtn) nextBtn.disabled = dirty || totalItems === 0 || currentIndex >= totalItems - 1;
    if (resetBtn) resetBtn.disabled = dirty || totalItems === 0;

    if (stepBadge) {
      if (dirty) {
        stepBadge.textContent = 'Unsolved Edits';
      } else if (AppState.currentView === 'search' || AppState.visualizationMode === 'search') {
        const maxEv = Math.max(0, totalItems - 1);
        stepBadge.textContent = 'Event ' + currentIndex + ' / ' + maxEv;
      } else {
        const maxMoves = Math.max(0, totalItems - 1);
        stepBadge.textContent = 'Step ' + currentIndex + ' / ' + maxMoves;
      }
    }

    if (statusBadge) {
      if (dirty) {
        statusBadge.textContent = 'Input Modified — Click Run UCS';
      } else if (AppState.isPlaying) {
        statusBadge.textContent = 'Running';
      } else if (AppState.isPaused) {
        statusBadge.textContent = 'Paused';
      } else if (AppState.lastResult) {
        statusBadge.textContent = AppState.lastResult.solved
          ? 'Solved (' + AppState.lastResult.stats.totalMoves + ' moves)'
          : AppState.lastResult.status.toUpperCase();
      } else {
        statusBadge.textContent = 'Ready';
      }
    }
  }

  function getActiveSequenceLength() {
    if (!AppState.lastResult) return 0;
    if (AppState.currentView === 'search' || AppState.visualizationMode === 'search') {
      return AppState.lastResult.searchEvents.length;
    }
    return AppState.lastResult.solutionPath.length;
  }

  function getActiveSequenceIndex() {
    if (AppState.currentView === 'search' || AppState.visualizationMode === 'search') {
      return AppState.searchEventIndex;
    }
    return AppState.solutionStepIndex;
  }

  /**
   * Executes UCS on the current Initial and Goal states and updates all views.
   */
  function executeSolver(autoPlay = false) {
    stopPlaybackTimer();
    AppState.isPaused = false;
    AppState.isInputDirty = false;

    const alertBox = document.getElementById('global-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const limitInput = document.getElementById('ucs-limit-input');
    if (limitInput) {
      AppState.maxExpandedLimit = Math.max(100, Number(limitInput.value) || 25000);
    }

    const result = UCSSolver.solveUCS(AppState.initialBoard, AppState.goalBoard, {
      maxExpandedNodes: AppState.maxExpandedLimit
    });

    AppState.lastResult = result;
    AppState.solutionStepIndex = 0;
    AppState.searchEventIndex = 0;

    // Update Sidebar Badges
    const movesBadge = document.getElementById('nav-badge-moves');
    const expBadge = document.getElementById('nav-badge-expanded');
    if (movesBadge) {
      movesBadge.textContent = result.solved ? result.stats.totalMoves + 'm' : '!';
    }
    if (expBadge) {
      expBadge.textContent = String(result.stats.nodesExpanded);
    }

    if (!result.solved && alertBox) {
      alertBox.className = 'alert alert-warning py-2 px-3 small';
      alertBox.textContent = result.errorMessage || 'Puzzle could not be solved.';
      alertBox.classList.remove('d-none');
    }

    renderAllViews();

    if (autoPlay && getActiveSequenceLength() > 1) {
      startPlayback();
    }
  }

  /**
   * Renders the complete sequence of separate 3x3 boards in Solution Path Mode
   * or Search Expansion Snapshots in Search Mode.
   */
  function renderVisualizerView() {
    renderBoardToDOM(document.getElementById('vis-initial-board'), AppState.initialBoard);
    renderBoardToDOM(document.getElementById('vis-goal-board'), AppState.goalBoard);

    const seqContainer = document.getElementById('solution-boards-container');
    const verBadge = document.getElementById('verification-badge');
    const panelTitle = document.getElementById('sequence-panel-title');
    const panelDesc = document.getElementById('sequence-panel-desc');

    if (!seqContainer) return;
    seqContainer.innerHTML = '';

    const result = AppState.lastResult;
    if (!result) return;

    if (AppState.visualizationMode === 'solution') {
      if (panelTitle) panelTitle.textContent = 'Final Solution Path Sequence';
      if (panelDesc) {
        panelDesc.textContent =
          'Every solution state from Step 0 to the Goal State is rendered as its own independent 3×3 board connected by downward arrows (↓).';
      }

      if (!result.solved || result.solutionPath.length === 0) {
        if (verBadge) verBadge.textContent = result.status.toUpperCase();
        seqContainer.innerHTML =
          '<div class="p-3 small text-muted">' +
          (result.errorMessage || 'No solution path available for this configuration.') +
          '</div>';
        renderBoardToDOM(document.getElementById('vis-current-board'), AppState.initialBoard);
        renderSuccessorsOrGoalMessage(AppState.initialBoard, false);
        return;
      }

      if (verBadge) {
        verBadge.textContent =
          result.verification && result.verification.valid
            ? 'Verified (' + result.solutionPath.length + ' boards)'
            : 'Unverified';
      }

      // Render d + 1 separate 3x3 DOM boards connected by downward arrows (↓)
      const path = result.solutionPath;
      path.forEach((stepObj, idx) => {
        const card = document.createElement('div');
        card.className = 'solution-step-card';
        card.dataset.stepIndex = String(idx);
        if (idx === AppState.solutionStepIndex) {
          card.classList.add('active-step');
        }

        const boardEl = document.createElement('div');
        boardEl.className = 'puzzle-board board-sm m-0';
        renderBoardToDOM(boardEl, stepObj.state, { movedTile: stepObj.movedTile });

        const metaEl = document.createElement('div');
        metaEl.className = 'flex-grow-1';

        let stepHeading = 'Step ' + idx + ' — After Move ' + idx;
        if (idx === 0) stepHeading = 'Step 0 — Initial State';
        else if (idx === path.length - 1) stepHeading = 'Final Step ' + idx + ' — Goal State';

        const tileTag =
          stepObj.movedTile !== null
            ? '<span class="badge-soft ms-1">Tile ' + stepObj.movedTile + ' (' + stepObj.action + ')</span>'
            : '';

        metaEl.innerHTML =
          '<div class="fw-semibold small">' + stepHeading + '</div>' +
          '<div class="small text-muted">' + stepObj.description + '</div>' +
          '<div class="mt-1">' +
          '<span class="badge-soft">Cost g(n) = ' + stepObj.g + '</span>' +
          tileTag +
          '</div>';

        card.appendChild(boardEl);
        card.appendChild(metaEl);
        card.addEventListener('click', () => {
          stopPlaybackTimer();
          setSolutionStep(idx);
        });

        seqContainer.appendChild(card);

        if (idx < path.length - 1) {
          const arrow = document.createElement('div');
          arrow.className = 'solution-step-arrow';
          arrow.textContent = '↓';
          seqContainer.appendChild(arrow);
        }
      });

      syncActiveVisualizerBoard();
    } else {
      // Search Snapshots Mode
      if (panelTitle) panelTitle.textContent = 'UCS Search Expansion Snapshots';
      if (panelDesc) {
        panelDesc.textContent =
          'Displays nodes in the exact order popped from the UCS priority queue. Consecutive expanded nodes may come from different branches.';
      }
      const events = result.searchEvents || [];
      if (verBadge) verBadge.textContent = events.length + ' Events';

      const maxRender = Math.min(events.length, 500);
      for (let i = 0; i < maxRender; i++) {
        const ev = events[i];
        const card = document.createElement('div');
        card.className = 'solution-step-card mb-2';
        card.dataset.stepIndex = String(i);
        if (i === AppState.searchEventIndex) {
          card.classList.add('active-step');
        }

        const boardEl = document.createElement('div');
        boardEl.className = 'puzzle-board board-sm m-0';
        renderBoardToDOM(boardEl, ev.currentState, { movedTile: ev.movedTile });

        const metaEl = document.createElement('div');
        metaEl.className = 'flex-grow-1';
        metaEl.innerHTML =
          '<div class="fw-semibold small">Expansion #' + (i + 1) + (ev.isGoal ? ' (GOAL REACHED)' : '') + '</div>' +
          '<div class="small text-muted">Action from parent: ' + ev.action + '</div>' +
          '<div class="mt-1">' +
          '<span class="badge-soft">g(n) = ' + ev.g + '</span>' +
          '<span class="badge-soft ms-1">Depth = ' + ev.depth + '</span>' +
          '</div>';

        card.appendChild(boardEl);
        card.appendChild(metaEl);
        card.addEventListener('click', () => {
          stopPlaybackTimer();
          setSearchEventStep(i);
        });
        seqContainer.appendChild(card);
      }

      syncActiveVisualizerBoard();
    }
  }

  /**
   * Updates the top active board, successor/completion panel, and the brown `.active-step`
   * highlight in BOTH Solution Path Mode and Search Snapshots Mode.
   */
  function syncActiveVisualizerBoard() {
    const result = AppState.lastResult;
    if (!result) return;

    const currentBoardEl = document.getElementById('vis-current-board');
    const currentCaption = document.getElementById('vis-current-caption');
    const currentLabel = document.getElementById('vis-current-label');

    if (AppState.visualizationMode === 'solution' && result.solved && result.solutionPath.length > 0) {
      const idx = Math.min(AppState.solutionStepIndex, result.solutionPath.length - 1);
      const stepObj = result.solutionPath[idx];
      const prevBoard = idx > 0 ? result.solutionPath[idx - 1].state : null;

      if (currentLabel) currentLabel.textContent = 'Solution Step ' + idx + ' of ' + (result.solutionPath.length - 1);
      if (currentCaption) {
        currentCaption.textContent = stepObj.description + ' | Cost g(n) = ' + stepObj.g;
      }
      renderBoardToDOM(currentBoardEl, stepObj.state, {
        movedTile: stepObj.movedTile,
        prevBoard: prevBoard
      });

      const isFinalStep =
        idx === result.solutionPath.length - 1 &&
        PuzzleUtils.areBoardsEqual(stepObj.state, AppState.goalBoard);

      renderSuccessorsOrGoalMessage(stepObj.state, isFinalStep);

      const cards = document.querySelectorAll('#solution-boards-container .solution-step-card');
      cards.forEach((c, cIdx) => {
        const isCurrent = cIdx === idx;
        c.classList.toggle('active-step', isCurrent);
        if (isCurrent) {
          scrollCardIntoContainer(c);
        }
      });
    } else if (result.searchEvents && result.searchEvents.length > 0) {
      const idx = Math.min(AppState.searchEventIndex, result.searchEvents.length - 1);
      const ev = result.searchEvents[idx];
      if (currentLabel) currentLabel.textContent = 'Search Expansion #' + (idx + 1);
      if (currentCaption) {
        currentCaption.textContent = 'g(n) = ' + ev.g + ', Depth = ' + ev.depth + ' (Parent -> Current action: ' + ev.action + ')';
      }
      renderBoardToDOM(currentBoardEl, ev.currentState, {
        movedTile: ev.movedTile,
        prevBoard: ev.parentState
      });

      renderSuccessorsOrGoalMessage(ev.currentState, Boolean(ev.isGoal));

      const cards = document.querySelectorAll('#solution-boards-container .solution-step-card');
      cards.forEach((c, cIdx) => {
        const isCurrent = cIdx === idx;
        c.classList.toggle('active-step', isCurrent);
        if (isCurrent) {
          scrollCardIntoContainer(c);
        }
      });
    }
  }

  /**
   * Renders the legal successor boards for a given 3x3 board state.
   */
  function renderSuccessorsFromBoard(board) {
    const container = document.getElementById('vis-successors-container');
    if (!container) return;
    container.replaceChildren();

    const successors = PuzzleUtils.getLegalSuccessors(board);
    successors.forEach((succ) => {
      const item = document.createElement('div');
      item.className = 'successor-item';

      const title = document.createElement('div');
      title.className = 'small fw-semibold mb-1';
      title.textContent = succ.action + ' (Tile ' + succ.movedTile + ')';

      const bEl = document.createElement('div');
      bEl.className = 'puzzle-board board-sm';
      renderBoardToDOM(bEl, succ.state, { movedTile: succ.movedTile });

      const sub = document.createElement('div');
      sub.className = 'small text-muted mt-1';
      sub.textContent = '+1 Step Cost';

      item.appendChild(title);
      item.appendChild(bEl);
      item.appendChild(sub);
      container.appendChild(item);
    });
  }

  /**
   * Switches between showing legal successor states for intermediate nodes and
   * showing a "Search Complete / Goal State Reached" summary card when the goal node
   * is selected in either Solution Path Mode or Search Snapshots Mode.
   */
  function renderSuccessorsOrGoalMessage(board, goalReached) {
    const container = document.getElementById('vis-successors-container');
    if (!container) return;

    const panel = container.closest('.academic-panel');
    const panelTitleEl = panel ? panel.querySelector('.panel-title') : null;
    const panelSubtitleEl = panel ? panel.querySelector('p.small.text-muted') : null;

    if (!goalReached) {
      if (panelTitleEl) {
        panelTitleEl.textContent = 'Generated Legal Successor States';
      }
      if (panelSubtitleEl) {
        panelSubtitleEl.textContent =
          'Orthogonal blank-tile swaps available from the currently selected board (Corner: 2, Edge: 3, Centre: 4).';
      }
      renderSuccessorsFromBoard(board);
      return;
    }

    if (panelTitleEl) {
      panelTitleEl.textContent = 'Search Complete';
    }
    if (panelSubtitleEl) {
      panelSubtitleEl.textContent =
        'Goal test succeeded upon removing the Goal State from the priority queue.';
    }

    container.replaceChildren();

    const stats =
      AppState.lastResult && AppState.lastResult.stats
        ? AppState.lastResult.stats
        : { pathCost: 0, totalMoves: 0 };

    const message = document.createElement('div');
    message.className = 'goal-reached-message text-center p-4 w-100 rounded';
    message.style.backgroundColor = 'var(--surface-neutral)';
    message.style.border = '1px solid var(--border-subtle)';
    message.setAttribute('role', 'status');

    const title = document.createElement('h5');
    title.className = 'fw-semibold mb-2';
    title.style.color = 'var(--accent-burgundy)';
    title.textContent = '✓ Goal State Reached';

    const description = document.createElement('p');
    description.className = 'small text-muted mb-3';
    description.textContent =
      'Uniform Cost Search has found the optimal solution. The goal node has been selected, and the search is complete.';

    const metricsRow = document.createElement('div');
    metricsRow.className = 'd-flex justify-content-center gap-3 mb-3 flex-wrap';
    metricsRow.innerHTML =
      '<div class="px-3 py-2 rounded" style="background: var(--surface-card); border: 1px solid var(--border-subtle); min-width: 130px;">' +
      '<div class="small text-muted">Final path cost</div>' +
      '<div class="fw-bold fs-5">' + stats.pathCost + '</div>' +
      '</div>' +
      '<div class="px-3 py-2 rounded" style="background: var(--surface-card); border: 1px solid var(--border-subtle); min-width: 130px;">' +
      '<div class="small text-muted">Total moves</div>' +
      '<div class="fw-bold fs-5">' + stats.totalMoves + '</div>' +
      '</div>';

    const footerNote = document.createElement('p');
    footerNote.className = 'small text-muted mb-0';
    footerNote.textContent = 'No further successors were generated for the goal event.';

    message.append(title, description, metricsRow, footerNote);
    container.appendChild(message);
  }

  /**
   * Renders the Search Process View for the current searchEventIndex.
   */
  function renderSearchProcessView() {
    const result = AppState.lastResult;
    const events = result && result.searchEvents ? result.searchEvents : [];

    const slider = document.getElementById('search-event-slider');
    const counter = document.getElementById('search-event-counter');

    if (events.length === 0) {
      if (counter) counter.textContent = '0 / 0';
      if (slider) {
        slider.max = '0';
        slider.value = '0';
      }
      return;
    }

    const idx = Math.min(AppState.searchEventIndex, events.length - 1);
    const ev = events[idx];

    if (counter) counter.textContent = (idx + 1) + ' / ' + events.length;
    if (slider) {
      slider.max = String(events.length - 1);
      slider.value = String(idx);
    }

    renderBoardToDOM(document.getElementById('search-parent-board'), ev.parentState);
    const parentKeyEl = document.getElementById('search-parent-key');
    if (parentKeyEl) {
      parentKeyEl.textContent = ev.parentKey ? '[' + ev.parentKey + ']' : 'None (Root State)';
    }

    renderBoardToDOM(document.getElementById('search-current-board'), ev.currentState, {
      movedTile: ev.movedTile,
      prevBoard: ev.parentState
    });
    const curMetaEl = document.getElementById('search-current-meta');
    if (curMetaEl) {
      curMetaEl.textContent = ev.isGoal
        ? 'Goal Reached! [' + ev.currentKey + ']'
        : 'Action: ' + ev.action + ' [' + ev.currentKey + ']';
    }

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };
    setTxt('sp-cost', ev.g);
    setTxt('sp-depth', ev.depth);
    setTxt('sp-generated', ev.nodesGenerated);
    setTxt('sp-expanded', ev.nodesExpanded);
    setTxt('sp-frontier-size', ev.frontierSize);
    setTxt('sp-explored-size', ev.exploredCount);

    const succContainer = document.getElementById('search-event-successors');
    if (succContainer) {
      succContainer.innerHTML = '';
      if (ev.generatedSuccessors.length === 0) {
        succContainer.innerHTML = '<div class="small text-muted">Goal reached — no further successors generated.</div>';
      } else {
        ev.generatedSuccessors.forEach((s) => {
          const item = document.createElement('div');
          item.className = 'successor-item';
          const bEl = document.createElement('div');
          bEl.className = 'puzzle-board board-sm my-1';
          renderBoardToDOM(bEl, s.state, { movedTile: s.movedTile });

          const statusLabel =
            s.disposition === 'added-to-frontier'
              ? 'Added to Frontier'
              : s.disposition === 'updated-cheaper-path'
                ? 'Updated Cheaper Path'
                : 'Skipped (Closed/Higher g)';

          item.innerHTML = '<div class="small fw-semibold">' + s.action + ' (Tile ' + s.movedTile + ')</div>';
          item.appendChild(bEl);
          const badge = document.createElement('div');
          badge.className = 'small text-muted';
          badge.textContent = 'g=' + s.g + ' | ' + statusLabel;
          item.appendChild(badge);
          succContainer.appendChild(item);
        });
      }
    }

    const frontierTbody = document.getElementById('sp-frontier-tbody');
    if (frontierTbody) {
      frontierTbody.innerHTML = '';
      if (!ev.frontierSnapshot || ev.frontierSnapshot.length === 0) {
        frontierTbody.innerHTML = '<tr><td colspan="5" class="text-muted text-center">Frontier empty</td></tr>';
      } else {
        ev.frontierSnapshot.forEach((fItem, fIdx) => {
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + (fIdx + 1) + '</td>' +
            '<td class="mono-state">[' + fItem.key + ']</td>' +
            '<td><strong>' + fItem.g + '</strong></td>' +
            '<td>' + fItem.depth + '</td>' +
            '<td>' + fItem.action + '</td>';
          frontierTbody.appendChild(tr);
        });
      }
    }

    const expList = document.getElementById('sp-explored-list');
    if (expList) {
      expList.textContent =
        ev.exploredSnapshot && ev.exploredSnapshot.length > 0
          ? ev.exploredSnapshot.map((k) => '[' + k + ']').join(' → ')
          : '—';
    }
  }

  /**
   * Renders the Solution Summary View.
   */
  function renderSummaryView() {
    const result = AppState.lastResult;
    if (!result) return;
    const s = result.stats;

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };

    setTxt(
      'sum-status',
      result.solved
        ? 'Solution Found (Optimal Path Verified)'
        : 'Not Solved (' + result.status + ': ' + (result.errorMessage || '') + ')'
    );
    setTxt('sum-moves', result.solved ? s.totalMoves : 'N/A');
    setTxt('sum-cost', result.solved ? s.pathCost : 'N/A');
    setTxt('sum-generated', s.nodesGenerated.toLocaleString());
    setTxt('sum-expanded', s.nodesExpanded.toLocaleString());
    setTxt('sum-explored', s.exploredCount.toLocaleString());
    setTxt('sum-depth', s.maxDepth);
    setTxt('sum-time', s.executionTimeMs + ' ms');
    setTxt('sum-memory', s.memory.formatted + ' (' + s.memory.approxBytes.toLocaleString() + ' B)');
    setTxt('sum-memory-note', s.memory.methodology);
  }

  function renderAllViews() {
    renderEditableInputGrids();
    renderVisualizerView();
    renderSearchProcessView();
    renderSummaryView();
    updateToolbarControls();
  }

  /**
   * Step Navigation & Autoplay Functions
   */
  function setSolutionStep(idx) {
    if (!AppState.lastResult || !AppState.lastResult.solutionPath.length) return;
    const maxIdx = AppState.lastResult.solutionPath.length - 1;
    AppState.solutionStepIndex = Math.max(0, Math.min(maxIdx, idx));
    syncActiveVisualizerBoard();
    updateToolbarControls();
  }

  function setSearchEventStep(idx) {
    if (!AppState.lastResult || !AppState.lastResult.searchEvents.length) return;
    const maxIdx = AppState.lastResult.searchEvents.length - 1;
    AppState.searchEventIndex = Math.max(0, Math.min(maxIdx, idx));
    renderSearchProcessView();
    if (AppState.visualizationMode === 'search') {
      syncActiveVisualizerBoard();
    }
    updateToolbarControls();
  }

  function stepNext() {
    if (AppState.isInputDirty) return false;
    const len = getActiveSequenceLength();
    if (len === 0) return false;

    if (AppState.currentView === 'search' || AppState.visualizationMode === 'search') {
      if (AppState.searchEventIndex < len - 1) {
        setSearchEventStep(AppState.searchEventIndex + 1);
        return true;
      }
    } else {
      if (AppState.solutionStepIndex < len - 1) {
        setSolutionStep(AppState.solutionStepIndex + 1);
        return true;
      }
    }
    return false;
  }

  function stepPrev() {
    if (AppState.isInputDirty) return;
    if (AppState.currentView === 'search' || AppState.visualizationMode === 'search') {
      if (AppState.searchEventIndex > 0) {
        setSearchEventStep(AppState.searchEventIndex - 1);
      }
    } else {
      if (AppState.solutionStepIndex > 0) {
        setSolutionStep(AppState.solutionStepIndex - 1);
      }
    }
  }

  function startPlayback() {
    stopPlaybackTimer();
    const len = getActiveSequenceLength();
    if (len <= 1) {
      updateToolbarControls();
      return;
    }

    if (getActiveSequenceIndex() >= len - 1) {
      if (AppState.currentView === 'search' || AppState.visualizationMode === 'search') {
        setSearchEventStep(0);
      } else {
        setSolutionStep(0);
      }
    }

    AppState.isPlaying = true;
    AppState.isPaused = false;
    updateToolbarControls();

    AppState.playbackTimer = setInterval(() => {
      const advanced = stepNext();
      if (!advanced) {
        stopPlaybackTimer();
        AppState.isPaused = false;
        updateToolbarControls();
      }
    }, AppState.playbackSpeedMs);
  }

  function pausePlayback() {
    if (!AppState.isPlaying) return;
    stopPlaybackTimer();
    AppState.isPaused = true;
    updateToolbarControls();
  }

  function resumePlayback() {
    if (AppState.isInputDirty || AppState.isPlaying || !AppState.isPaused) return;
    startPlayback();
  }

  function resetPlayback() {
    if (AppState.isInputDirty) return;
    stopPlaybackTimer();
    AppState.isPaused = false;
    setSolutionStep(0);
    setSearchEventStep(0);
    updateToolbarControls();
  }

  /**
   * SPA Navigation Switcher
   */
  function switchView(viewName) {
    AppState.currentView = viewName;

    document.querySelectorAll('.app-view').forEach((sec) => {
      sec.classList.toggle('active-view', sec.id === 'view-' + viewName);
    });

    document.querySelectorAll('#sidebar-nav-list .sidebar-nav-link').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) sidebar.classList.remove('sidebar-open');

    if (viewName === 'visualizer') {
      syncActiveVisualizerBoard();
    }

    updateToolbarControls();
  }

  /**
   * Initialize Event Listeners
   */
  function initApp() {
    document.querySelectorAll('#sidebar-nav-list .sidebar-nav-link').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    document.querySelectorAll('.nav-jump-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.target));
    });

    const mobileBtn = document.getElementById('btn-mobile-menu');
    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => {
        const sidebar = document.getElementById('app-sidebar');
        if (sidebar) sidebar.classList.toggle('sidebar-open');
      });
    }

    // Toolbar "Run UCS" reads and validates any manual input edits first
    document.getElementById('ctrl-run')?.addEventListener('click', () => {
      if (!syncInputsToStateAndValidate()) {
        return;
      }
      if (AppState.currentView === 'home' || AppState.currentView === 'input') {
        switchView('visualizer');
      }
      executeSolver(true);
    });

    document.getElementById('ctrl-pause')?.addEventListener('click', pausePlayback);
    document.getElementById('ctrl-resume')?.addEventListener('click', resumePlayback);
    document.getElementById('ctrl-next')?.addEventListener('click', () => {
      stopPlaybackTimer();
      stepNext();
    });
    document.getElementById('ctrl-prev')?.addEventListener('click', () => {
      stopPlaybackTimer();
      stepPrev();
    });
    document.getElementById('ctrl-reset')?.addEventListener('click', resetPlayback);

    document.getElementById('ctrl-speed')?.addEventListener('change', (e) => {
      AppState.playbackSpeedMs = Number(e.target.value) || 700;
      if (AppState.isPlaying) {
        startPlayback();
      }
    });

    const modeSolBtn = document.getElementById('mode-btn-solution');
    const modeSearchBtn = document.getElementById('mode-btn-search');
    modeSolBtn?.addEventListener('click', () => {
      stopPlaybackTimer();
      AppState.visualizationMode = 'solution';
      modeSolBtn.className = 'btn-burgundy';
      modeSearchBtn.className = 'btn-neutral';
      renderVisualizerView();
      updateToolbarControls();
    });
    modeSearchBtn?.addEventListener('click', () => {
      stopPlaybackTimer();
      AppState.visualizationMode = 'search';
      modeSearchBtn.className = 'btn-burgundy';
      modeSolBtn.className = 'btn-neutral';
      renderVisualizerView();
      updateToolbarControls();
    });

    document.getElementById('search-event-slider')?.addEventListener('input', (e) => {
      stopPlaybackTimer();
      setSearchEventStep(Number(e.target.value));
    });

    // "Validate & Solve with UCS" uses the same unified sync & validation helper
    document.getElementById('btn-apply-solve')?.addEventListener('click', () => {
      if (!syncInputsToStateAndValidate()) {
        return;
      }
      executeSolver(false);
      switchView('visualizer');
    });

    document.getElementById('btn-reset-pdf-default')?.addEventListener('click', () => {
      AppState.initialBoard = PuzzleUtils.DEFAULT_INITIAL_STATE.slice();
      AppState.goalBoard = PuzzleUtils.DEFAULT_GOAL_STATE.slice();
      AppState.isInputDirty = false;
      executeSolver(false);
    });

    document.getElementById('btn-generate-random')?.addEventListener('click', () => {
      const { goal } = readBoardsFromInputs();
      const goalCheck = PuzzleUtils.validateBoard(goal, 'Goal State');
      const targetGoal = goalCheck.valid ? goal : PuzzleUtils.DEFAULT_GOAL_STATE.slice();
      AppState.goalBoard = targetGoal;
      AppState.initialBoard = PuzzleUtils.generateRandomSolvableBoard(targetGoal, 16);
      AppState.isInputDirty = false;
      executeSolver(false);
    });

    document.getElementById('btn-load-preset')?.addEventListener('click', () => {
      const sel = document.getElementById('preset-selector');
      const key = sel ? sel.value : 'pdfDefault';
      const preset = PuzzleUtils.PRESET_PUZZLES[key];
      if (!preset) return;
      AppState.initialBoard = preset.initial.slice();
      AppState.goalBoard = preset.goal.slice();
      AppState.isInputDirty = false;
      executeSolver(false);
    });

    executeSolver(false);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApp);
    } else {
      initApp();
    }
  }

  if (typeof window !== 'undefined') {
    window.EightPuzzleApp = {
      AppState,
      syncInputsToStateAndValidate,
      renderSuccessorsOrGoalMessage,
      executeSolver,
      switchView,
      stepNext,
      stepPrev,
      startPlayback,
      pausePlayback,
      resumePlayback,
      resetPlayback
    };
  }
})();