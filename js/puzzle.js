/**
 * js/puzzle.js
 * 8-Puzzle State Representation, Input Validation, Inversion-Parity Solvability,
 * Strictly Legal Blank-Tile Movement Engine, and Solution Path Validator.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PuzzleUtils = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Default example states from the Assignment PDF (Page 3) */
  const DEFAULT_INITIAL_STATE = Object.freeze([2, 8, 3, 1, 6, 4, 7, 0, 5]);
  const DEFAULT_GOAL_STATE = Object.freeze([1, 2, 3, 8, 0, 4, 7, 6, 5]);
  const CANONICAL_GOAL_STATE = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 0]);

  /** Preset solvable test configurations relative to DEFAULT_GOAL_STATE */
  const PRESET_PUZZLES = Object.freeze({
    pdfDefault: {
      name: 'Assignment PDF Example (5 Moves)',
      initial: [2, 8, 3, 1, 6, 4, 7, 0, 5],
      goal: [1, 2, 3, 8, 0, 4, 7, 6, 5]
    },
    oneMove: {
      name: 'One-Move Verification (1 Move)',
      initial: [1, 2, 3, 8, 4, 0, 7, 6, 5],
      goal: [1, 2, 3, 8, 0, 4, 7, 6, 5]
    },
    alreadySolved: {
      name: 'Already Solved State (0 Moves)',
      initial: [1, 2, 3, 8, 0, 4, 7, 6, 5],
      goal: [1, 2, 3, 8, 0, 4, 7, 6, 5]
    },
    moderateDepth: {
      name: 'Moderate Challenge (12 Moves)',
      initial: [2, 8, 1, 0, 4, 3, 7, 6, 5],
      goal: [1, 2, 3, 8, 0, 4, 7, 6, 5]
    },
    unsolvableDemo: {
      name: 'Unsolvable Parity Example (Swapped 1 & 2)',
      initial: [2, 1, 3, 8, 0, 4, 7, 6, 5],
      goal: [1, 2, 3, 8, 0, 4, 7, 6, 5]
    }
  });

  /**
   * Serializes a 9-element board array into a compact key string, e.g. "2,8,3,1,6,4,7,0,5".
   */
  function stateToKey(board) {
    if (!Array.isArray(board) || board.length !== 9) {
      throw new Error('Invalid board passed to stateToKey: expected 9-element array.');
    }
    return board.join(',');
  }

  /**
   * Parses a state key string back into a 9-element number array.
   */
  function keyToState(key) {
    return key.split(',').map(Number);
  }

  /**
   * Checks equality of two 9-element boards.
   */
  function areBoardsEqual(boardA, boardB) {
    if (!Array.isArray(boardA) || !Array.isArray(boardB)) return false;
    if (boardA.length !== 9 || boardB.length !== 9) return false;
    for (let i = 0; i < 9; i++) {
      if (boardA[i] !== boardB[i]) return false;
    }
    return true;
  }

  /**
   * Validates that a board has exactly 9 positions, contains integers 0..8
   * each occurring exactly once, and has exactly one blank tile (0).
   */
  function validateBoard(board, label = 'Board') {
    if (!Array.isArray(board)) {
      return { valid: false, error: `${label} must be a 9-element array.` };
    }
    if (board.length !== 9) {
      return {
        valid: false,
        error: `${label} must contain exactly 9 positions (found ${board.length}).`
      };
    }

    const seen = new Set();
    const duplicates = new Set();
    let blankCount = 0;

    for (let i = 0; i < 9; i++) {
      const val = board[i];
      if (typeof val !== 'number' || !Number.isInteger(val) || Number.isNaN(val)) {
        return {
          valid: false,
          error: `${label} has a non-integer or incomplete value at cell ${i + 1} (row ${Math.floor(i / 3) + 1}, col ${(i % 3) + 1}). Use 0 (or _) for the blank tile.`
        };
      }
      if (val < 0 || val > 8) {
        return {
          valid: false,
          error: `${label} contains out-of-range value "${val}" at cell ${i + 1}. Only values 0 through 8 are allowed.`
        };
      }
      if (val === 0) {
        blankCount++;
      }
      if (seen.has(val)) {
        duplicates.add(val);
      }
      seen.add(val);
    }

    if (blankCount !== 1) {
      return {
        valid: false,
        error: `${label} must contain exactly one blank tile (0). Found ${blankCount} blank tiles.`
      };
    }

    if (duplicates.size > 0) {
      const missing = [];
      for (let v = 0; v <= 8; v++) {
        if (!seen.has(v)) missing.push(v);
      }
      return {
        valid: false,
        error: `${label} has duplicate value(s) [${Array.from(duplicates).join(', ')}] and is missing [${missing.join(', ')}]. Every value 0–8 must appear once.`
      };
    }

    return { valid: true, error: null };
  }

  /**
   * Counts standard inversions in a 9-element board (ignoring the blank tile 0).
   * On a 3x3 grid (odd width = 3), any legal horizontal move changes inversions by 0,
   * and any legal vertical move cycles a tile past 2 tiles, changing inversions by
   * -2, 0, or +2. Therefore, (inversions mod 2) is an exact invariant under all legal moves.
   */
  function countInversions(board) {
    const tiles = board.filter((v) => v !== 0);
    let inversions = 0;
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        if (tiles[i] > tiles[j]) {
          inversions++;
        }
      }
    }
    return inversions;
  }

  /**
   * Checks whether initialBoard can reach goalBoard via legal 8-puzzle moves.
   * Validates both boards first, then compares inversion parities.
   */
  function checkSolvability(initialBoard, goalBoard) {
    const initCheck = validateBoard(initialBoard, 'Initial State');
    if (!initCheck.valid) {
      return {
        valid: false,
        solvable: false,
        initialInversions: null,
        goalInversions: null,
        reason: initCheck.error
      };
    }

    const goalCheck = validateBoard(goalBoard, 'Goal State');
    if (!goalCheck.valid) {
      return {
        valid: false,
        solvable: false,
        initialInversions: null,
        goalInversions: null,
        reason: goalCheck.error
      };
    }

    const initialInversions = countInversions(initialBoard);
    const goalInversions = countInversions(goalBoard);
    const initialParity = initialInversions % 2;
    const goalParity = goalInversions % 2;
    const solvable = initialParity === goalParity;

    if (!solvable) {
      return {
        valid: true,
        solvable: false,
        initialInversions,
        goalInversions,
        reason: `Unsolvable configuration: Initial State has ${initialInversions} inversion(s) (${initialParity === 0 ? 'even' : 'odd'} parity), whereas Goal State has ${goalInversions} inversion(s) (${goalParity === 0 ? 'even' : 'odd'} parity). On a 3×3 grid, legal moves preserve inversion parity.`
      };
    }

    return {
      valid: true,
      solvable: true,
      initialInversions,
      goalInversions,
      reason: `Valid & solvable: Initial (${initialInversions} inversions) and Goal (${goalInversions} inversions) share ${initialParity === 0 ? 'even' : 'odd'} inversion parity.`
    };
  }

  /**
   * Generates all strictly legal successor states from a valid 9-element board.
   *
   * CRITICAL MOVEMENT RULES:
   * - Only the blank tile (0) moves.
   * - It swaps places with one immediately orthogonal numbered tile:
   *     Up    (row > 0, delta = -3)
   *     Down  (row < 2, delta = +3)
   *     Left  (col > 0, delta = -1)
   *     Right (col < 2, delta = +1)
   * - Diagonal moves, jumping over tiles, wrapping across row boundaries, or
   *   swapping two numbered tiles directly are strictly impossible.
   */
  function getLegalSuccessors(board) {
    const check = validateBoard(board, 'Current State');
    if (!check.valid) {
      throw new Error(check.error);
    }

    const blankIndex = board.indexOf(0);
    const row = Math.floor(blankIndex / 3);
    const col = blankIndex % 3;

    const candidateDirections = [
      { action: 'Up', dRow: -1, dCol: 0 },
      { action: 'Down', dRow: 1, dCol: 0 },
      { action: 'Left', dRow: 0, dCol: -1 },
      { action: 'Right', dRow: 0, dCol: 1 }
    ];

    const successors = [];

    for (let i = 0; i < candidateDirections.length; i++) {
      const dir = candidateDirections[i];
      const newRow = row + dir.dRow;
      const newCol = col + dir.dCol;

      // Explicit grid row and column boundary check (0 <= row <= 2, 0 <= col <= 2)
      if (newRow >= 0 && newRow <= 2 && newCol >= 0 && newCol <= 2) {
        const targetIndex = newRow * 3 + newCol;
        const movedTile = board[targetIndex];
        const nextState = board.slice();

        // Swap blank (0) and the adjacent numbered tile
        nextState[blankIndex] = movedTile;
        nextState[targetIndex] = 0;

        successors.push({
          state: nextState,
          key: nextState.join(','),
          action: dir.action,
          movedTile: movedTile,
          fromIndex: blankIndex,
          toIndex: targetIndex,
          stepCost: 1,
          description: `Move Blank ${dir.action} (swap with tile ${movedTile})`
        });
      }
    }

    return successors;
  }

  /**
   * Verifies whether transitioning from boardA to boardB is a single legal 8-puzzle move.
   * Returns { valid: boolean, action, movedTile, fromIndex, toIndex, reason }.
   */
  function isValidTransition(boardA, boardB) {
    const checkA = validateBoard(boardA, 'Previous Board');
    if (!checkA.valid) return { valid: false, reason: checkA.error };

    const checkB = validateBoard(boardB, 'Next Board');
    if (!checkB.valid) return { valid: false, reason: checkB.error };

    const blankA = boardA.indexOf(0);
    const blankB = boardB.indexOf(0);

    if (blankA === blankB) {
      return {
        valid: false,
        reason: 'Blank tile did not change position between consecutive steps.'
      };
    }

    const rowA = Math.floor(blankA / 3);
    const colA = blankA % 3;
    const rowB = Math.floor(blankB / 3);
    const colB = blankB % 3;

    const dRow = rowB - rowA;
    const dCol = colB - colA;
    const manhattan = Math.abs(dRow) + Math.abs(dCol);

    if (manhattan !== 1) {
      return {
        valid: false,
        reason: `Illegal blank movement from (${rowA}, ${colA}) to (${rowB}, ${colB}): Manhattan distance is ${manhattan} (must be exactly 1 orthogonal step; no diagonal, jumping, or row-wrapping allowed).`
      };
    }

    const movedTile = boardA[blankB];
    if (movedTile === 0 || boardB[blankA] !== movedTile) {
      return {
        valid: false,
        reason: `Adjacent tile ${movedTile} did not properly swap with the blank tile.`
      };
    }

    // Confirm all other 7 positions remain completely unchanged
    for (let i = 0; i < 9; i++) {
      if (i !== blankA && i !== blankB && boardA[i] !== boardB[i]) {
        return {
          valid: false,
          reason: `Unrelated tile at index ${i} changed from ${boardA[i]} to ${boardB[i]} during transition.`
        };
      }
    }

    let action = '';
    if (dRow === -1 && dCol === 0) action = 'Up';
    else if (dRow === 1 && dCol === 0) action = 'Down';
    else if (dRow === 0 && dCol === -1) action = 'Left';
    else if (dRow === 0 && dCol === 1) action = 'Right';

    return {
      valid: true,
      action,
      movedTile,
      fromIndex: blankA,
      toIndex: blankB,
      reason: `Legal move: Blank moved ${action} (swapped with tile ${movedTile}).`
    };
  }

  /**
   * Strictly validates a reconstructed solution path array of step objects or board arrays
   * against the requested initial and goal states before any UI rendering occurs.
   */
  function verifySolutionPath(stepsOrBoards, initialBoard, goalBoard) {
    if (!Array.isArray(stepsOrBoards) || stepsOrBoards.length === 0) {
      return { valid: false, reason: 'Solution path is empty or not an array.' };
    }

    const boards = stepsOrBoards.map((item) => (Array.isArray(item) ? item : item.state));

    // Check every individual board is a valid 0..8 permutation
    for (let i = 0; i < boards.length; i++) {
      const check = validateBoard(boards[i], `Solution Step ${i}`);
      if (!check.valid) {
        return { valid: false, reason: check.error, failedStep: i };
      }
    }

    // Check first board equals initialBoard
    if (!areBoardsEqual(boards[0], initialBoard)) {
      return {
        valid: false,
        reason: `Step 0 board [${boards[0].join(', ')}] does not match requested Initial State [${initialBoard.join(', ')}].`,
        failedStep: 0
      };
    }

    // Check last board equals goalBoard
    const lastIdx = boards.length - 1;
    if (!areBoardsEqual(boards[lastIdx], goalBoard)) {
      return {
        valid: false,
        reason: `Final Step ${lastIdx} board [${boards[lastIdx].join(', ')}] does not match requested Goal State [${goalBoard.join(', ')}].`,
        failedStep: lastIdx
      };
    }

    // Check every consecutive pair (Step i -> Step i+1)
    for (let i = 0; i < boards.length - 1; i++) {
      const transition = isValidTransition(boards[i], boards[i + 1]);
      if (!transition.valid) {
        return {
          valid: false,
          reason: `Invalid transition between Step ${i} and Step ${i + 1}: ${transition.reason}`,
          failedStep: i + 1
        };
      }
    }

    return {
      valid: true,
      totalMoves: boards.length - 1,
      totalBoards: boards.length,
      reason: `Verified ${boards.length} board(s) and ${boards.length - 1} legal transition(s).`
    };
  }

  /**
   * Generates a guaranteed solvable random 8-puzzle configuration relative to goalBoard
   * by performing a controlled walk of legal blank moves from the goal state.
   * Ensures the resulting state is non-trivial (not already equal to goalBoard) and
   * has a reasonable demonstration depth (6 to 16 moves).
   */
  function generateRandomSolvableBoard(goalBoard = DEFAULT_GOAL_STATE, walkSteps = 18) {
    const goalCheck = validateBoard(goalBoard, 'Goal State');
    if (!goalCheck.valid) {
      throw new Error(goalCheck.error);
    }

    let current = goalBoard.slice();
    let previousKey = null;
    const steps = Math.max(6, Math.min(40, Number(walkSteps) || 18));

    for (let i = 0; i < steps; i++) {
      const successors = getLegalSuccessors(current);
      const filtered = successors.filter((s) => s.key !== previousKey);
      const pool = filtered.length > 0 ? filtered : successors;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      previousKey = current.join(',');
      current = chosen.state;
    }

    // Ensure we never return a board identical to the goal state
    if (areBoardsEqual(current, goalBoard)) {
      const successors = getLegalSuccessors(current);
      current = successors[0].state;
    }

    return current;
  }

  /**
   * Parses user text/grid input (accepting '_' or '' or '0' as the blank tile).
   */
  function parseCellValue(raw) {
    if (raw === null || raw === undefined) return NaN;
    const trimmed = String(raw).trim();
    if (trimmed === '_' || trimmed === '0') return 0;
    if (trimmed === '') return NaN;
    if (!/^[0-8]$/.test(trimmed)) return NaN;
    return Number(trimmed);
  }

  return {
    DEFAULT_INITIAL_STATE,
    DEFAULT_GOAL_STATE,
    CANONICAL_GOAL_STATE,
    PRESET_PUZZLES,
    stateToKey,
    keyToState,
    areBoardsEqual,
    validateBoard,
    countInversions,
    checkSolvability,
    getLegalSuccessors,
    isValidTransition,
    verifySolutionPath,
    generateRandomSolvableBoard,
    parseCellValue
  };
});