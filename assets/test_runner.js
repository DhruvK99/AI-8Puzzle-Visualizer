/**
 * assets/test_runner.js
 * Automated Test Suite for the Interactive 8-Puzzle UCS Solver.
 * Covers:
 * - Suite 1: Puzzle Utilities & Legal Movement Rules
 * - Suite 2: Binary Min-Heap & Uniform Cost Search (UCS) Optimality
 * - Suite 3: Solution Path Integrity & Step-by-Step Transition Verification
 * - Suite 4: Edge Cases, Unsolvable Inputs & Resource Limit Handling
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const PuzzleUtils = require('../js/puzzle.js');
    const UCSSolver = require('../js/ucs.js');
    module.exports = factory(PuzzleUtils, UCSSolver);
  } else {
    root.TestSuite = factory(root.PuzzleUtils, root.UCSSolver);
  }
})(typeof self !== 'undefined' ? self : this, function (PuzzleUtils, UCSSolver) {
  'use strict';

  function runAllTests() {
    const results = [];
    let passed = 0;
    let failed = 0;

    function assert(suite, name, condition, details = '') {
      if (condition) {
        passed++;
        results.push({ suite, name, status: 'PASS', details });
      } else {
        failed++;
        results.push({ suite, name, status: 'FAIL', details });
      }
    }

    // =========================================================================
    // SUITE 1: PUZZLE UTILITIES & STRICT LEGAL MOVEMENT
    // =========================================================================
    const S1 = '1. Puzzle Utilities & Legal Movement';

    const validDefault = PuzzleUtils.validateBoard([2, 8, 3, 1, 6, 4, 7, 0, 5]);
    assert(S1, 'Accepts valid 9-element permutation (0..8)', validDefault.valid === true);

    const shortBoard = PuzzleUtils.validateBoard([1, 2, 3, 4, 5, 6, 7, 8]);
    assert(S1, 'Rejects board with fewer than 9 cells', shortBoard.valid === false, shortBoard.error);

    const dupBoard = PuzzleUtils.validateBoard([1, 1, 3, 4, 5, 6, 7, 8, 0]);
    assert(S1, 'Rejects board with duplicate and missing values', dupBoard.valid === false, dupBoard.error);

    const twoBlanks = PuzzleUtils.validateBoard([0, 0, 2, 3, 4, 5, 6, 7, 8]);
    assert(S1, 'Rejects board without exactly one blank (0)', twoBlanks.valid === false, twoBlanks.error);

    const outOfRange = PuzzleUtils.validateBoard([1, 2, 3, 4, 5, 6, 7, 9, 0]);
    assert(S1, 'Rejects board with out-of-range value (9)', outOfRange.valid === false, outOfRange.error);

    // Corner successor counts (indices 0, 2, 6, 8 -> 2 moves each)
    const cornerTopLeft = PuzzleUtils.getLegalSuccessors([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const cornerBottomRight = PuzzleUtils.getLegalSuccessors([1, 2, 3, 4, 5, 6, 7, 8, 0]);
    assert(
      S1,
      'Corner blank position generates exactly 2 legal successors',
      cornerTopLeft.length === 2 && cornerBottomRight.length === 2,
      `Top-Left: ${cornerTopLeft.length}, Bottom-Right: ${cornerBottomRight.length}`
    );

    // Edge successor counts (indices 1, 3, 5, 7 -> 3 moves each)
    const edgeTop = PuzzleUtils.getLegalSuccessors([1, 0, 2, 3, 4, 5, 6, 7, 8]);
    const edgeLeft = PuzzleUtils.getLegalSuccessors([1, 2, 3, 0, 4, 5, 6, 7, 8]);
    assert(
      S1,
      'Edge blank position (excluding corners) generates exactly 3 legal successors',
      edgeTop.length === 3 && edgeLeft.length === 3,
      `Top-Edge: ${edgeTop.length}, Left-Edge: ${edgeLeft.length}`
    );

    // Centre successor count (index 4 -> 4 moves: Up, Down, Left, Right)
    const centreSuccessors = PuzzleUtils.getLegalSuccessors([1, 2, 3, 8, 0, 4, 7, 6, 5]);
    const centreDirections = centreSuccessors.map((s) => s.action).sort().join(',');
    assert(
      S1,
      'Centre blank position generates all 4 orthogonal directions (Down, Left, Right, Up)',
      centreSuccessors.length === 4 && centreDirections === 'Down,Left,Right,Up',
      `Directions: ${centreDirections}`
    );

    // Explicitly reject diagonal move (index 0 -> index 4)
    const diagCheck = PuzzleUtils.isValidTransition(
      [0, 1, 2, 3, 4, 5, 6, 7, 8],
      [4, 1, 2, 3, 0, 5, 6, 7, 8]
    );
    assert(S1, 'Forbids diagonal blank movement', diagCheck.valid === false, diagCheck.reason);

    // Explicitly reject row-wrapping move (index 2 -> index 3)
    const wrapCheck = PuzzleUtils.isValidTransition(
      [1, 2, 0, 3, 4, 5, 6, 7, 8],
      [1, 2, 3, 0, 4, 5, 6, 7, 8]
    );
    assert(S1, 'Forbids row-wrapping between index 2 (row 0, col 2) and index 3 (row 1, col 0)', wrapCheck.valid === false, wrapCheck.reason);

    // Explicitly reject swapping two numbered tiles directly without moving blank
    const numberedSwapCheck = PuzzleUtils.isValidTransition(
      [1, 2, 3, 8, 0, 4, 7, 6, 5],
      [2, 1, 3, 8, 0, 4, 7, 6, 5]
    );
    assert(S1, 'Forbids swapping two numbered tiles directly', numberedSwapCheck.valid === false, numberedSwapCheck.reason);

    // Solvability relative to arbitrary goal states
    const solvPDF = PuzzleUtils.checkSolvability(
      PuzzleUtils.DEFAULT_INITIAL_STATE,
      PuzzleUtils.DEFAULT_GOAL_STATE
    );
    assert(S1, 'Correctly identifies PDF default puzzle as solvable', solvPDF.solvable === true);

    const unsolvParity = PuzzleUtils.checkSolvability(
      [2, 1, 3, 8, 0, 4, 7, 6, 5],
      [1, 2, 3, 8, 0, 4, 7, 6, 5]
    );
    assert(S1, 'Correctly identifies opposite-parity board as unsolvable', unsolvParity.solvable === false);

    // =========================================================================
    // SUITE 2: UNIFORM COST SEARCH & PRIORITY QUEUE
    // =========================================================================
    const S2 = '2. Uniform Cost Search (UCS) & Priority Queue';

    const pq = new UCSSolver.MinPriorityQueue();
    pq.push({ key: 'c', state: [], g: 5, depth: 5 });
    pq.push({ key: 'a', state: [], g: 1, depth: 1 });
    pq.push({ key: 'b1', state: [], g: 3, depth: 3 });
    pq.push({ key: 'b2', state: [], g: 3, depth: 3 });

    const p1 = pq.pop();
    const p2 = pq.pop();
    const p3 = pq.pop();
    const p4 = pq.pop();
    assert(
      S2,
      'MinPriorityQueue orders by lowest g(n) and breaks ties deterministically by FIFO sequence',
      p1.key === 'a' && p2.key === 'b1' && p3.key === 'b2' && p4.key === 'c'
    );

    // Zero-move already-solved puzzle
    const zeroRes = UCSSolver.solveUCS(
      PuzzleUtils.DEFAULT_GOAL_STATE,
      PuzzleUtils.DEFAULT_GOAL_STATE
    );
    assert(
      S2,
      'Handles already-solved puzzle (0 moves, g=0, 1 board)',
      zeroRes.solved === true &&
        zeroRes.stats.totalMoves === 0 &&
        zeroRes.stats.pathCost === 0 &&
        zeroRes.solutionPath.length === 1
    );

    // One-move puzzle
    const oneMoveInit = [1, 2, 3, 8, 4, 0, 7, 6, 5];
    const oneRes = UCSSolver.solveUCS(oneMoveInit, PuzzleUtils.DEFAULT_GOAL_STATE);
    assert(
      S2,
      'Solves 1-move puzzle optimally with g=1 and 2 boards',
      oneRes.solved === true &&
        oneRes.stats.totalMoves === 1 &&
        oneRes.stats.pathCost === 1 &&
        oneRes.solutionPath.length === 2
    );

    // PDF Example Puzzle (2 8 3 / 1 6 4 / 7 _ 5 -> 1 2 3 / 8 _ 4 / 7 6 5) takes 5 optimal moves
    const pdfRes = UCSSolver.solveUCS(
      PuzzleUtils.DEFAULT_INITIAL_STATE,
      PuzzleUtils.DEFAULT_GOAL_STATE
    );
    assert(
      S2,
      'Solves Assignment PDF default puzzle optimally in 5 moves (g = 5)',
      pdfRes.solved === true &&
        pdfRes.stats.totalMoves === 5 &&
        pdfRes.stats.pathCost === 5,
      `Moves: ${pdfRes.stats.totalMoves}, Expanded: ${pdfRes.stats.nodesExpanded}`
    );

    // Custom weighted step-cost test to prove UCS genuinely orders by path cost g(n) rather than pure BFS depth
    const weightedRes = UCSSolver.solveUCS(
      PuzzleUtils.DEFAULT_INITIAL_STATE,
      PuzzleUtils.DEFAULT_GOAL_STATE,
      { stepCostFn: () => 2 }
    );
    assert(
      S2,
      'Accumulates path cost g(n) accurately using step-cost function',
      weightedRes.solved === true && weightedRes.stats.pathCost === 10
    );

    // =========================================================================
    // SUITE 3: SOLUTION PATH VERIFICATION (PHASE 9B)
    // =========================================================================
    const S3 = '3. Reconstructed Solution Path Integrity';

    assert(
      S3,
      'Renders exactly d + 1 boards for a d-move solution (6 boards for 5 moves)',
      pdfRes.solutionPath.length === pdfRes.stats.totalMoves + 1 &&
        pdfRes.solutionPath.length === 6
    );

    assert(
      S3,
      'First solution board matches Initial State and final board matches Goal State',
      PuzzleUtils.areBoardsEqual(pdfRes.solutionPath[0].state, PuzzleUtils.DEFAULT_INITIAL_STATE) &&
        PuzzleUtils.areBoardsEqual(
          pdfRes.solutionPath[pdfRes.solutionPath.length - 1].state,
          PuzzleUtils.DEFAULT_GOAL_STATE
        )
    );

    const pathVerification = PuzzleUtils.verifySolutionPath(
      pdfRes.solutionPath,
      PuzzleUtils.DEFAULT_INITIAL_STATE,
      PuzzleUtils.DEFAULT_GOAL_STATE
    );
    assert(
      S3,
      'Every consecutive board transition in reconstructed solution is a single legal orthogonal blank move',
      pathVerification.valid === true,
      pathVerification.reason
    );

    // Verify tamper detection on skipped intermediate state
    const corruptedPath = [
      pdfRes.solutionPath[0],
      pdfRes.solutionPath[2], // skipped Step 1!
      ...pdfRes.solutionPath.slice(3)
    ];
    const corruptedCheck = PuzzleUtils.verifySolutionPath(
      corruptedPath,
      PuzzleUtils.DEFAULT_INITIAL_STATE,
      PuzzleUtils.DEFAULT_GOAL_STATE
    );
    assert(
      S3,
      'Path verifier detects and rejects skipped intermediate states',
      corruptedCheck.valid === false,
      corruptedCheck.reason
    );

    // =========================================================================
    // SUITE 4: UNSOLVABLE INPUTS, RANDOM GENERATOR & RESOURCE LIMITS
    // =========================================================================
    const S4 = '4. Unsolvable Inputs, Random Generator & Resource Limits';

    const unsolvRes = UCSSolver.solveUCS(
      [2, 1, 3, 8, 0, 4, 7, 6, 5],
      PuzzleUtils.DEFAULT_GOAL_STATE
    );
    assert(
      S4,
      'Gracefully rejects unsolvable puzzle prior to search with clear explanation',
      unsolvRes.solved === false &&
        unsolvRes.status === 'unsolvable' &&
        unsolvRes.stats.nodesExpanded === 0
    );

    const limitRes = UCSSolver.solveUCS(
      [2, 8, 1, 0, 4, 3, 7, 6, 5], // 12-move puzzle
      PuzzleUtils.DEFAULT_GOAL_STATE,
      { maxExpandedNodes: 5 }
    );
    assert(
      S4,
      'Stops safely when maxExpandedNodes limit is reached and reports status="limit-reached"',
      limitRes.solved === false &&
        limitRes.status === 'limit-reached' &&
        limitRes.stats.nodesExpanded === 5
    );

    const randomBoard = PuzzleUtils.generateRandomSolvableBoard(PuzzleUtils.DEFAULT_GOAL_STATE, 14);
    const randomCheck = PuzzleUtils.checkSolvability(randomBoard, PuzzleUtils.DEFAULT_GOAL_STATE);
    assert(
      S4,
      'Random generator always produces a valid, solvable permutation relative to Goal State',
      randomCheck.valid === true &&
        randomCheck.solvable === true &&
        !PuzzleUtils.areBoardsEqual(randomBoard, PuzzleUtils.DEFAULT_GOAL_STATE)
    );

    return {
      total: passed + failed,
      passed,
      failed,
      results
    };
  }

  // Allow direct CLI execution via `node assets/test_runner.js`
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    const summary = runAllTests();
    console.log('====================================================');
    console.log(`8-PUZZLE UCS AUTOMATED TEST SUITE: ${summary.passed}/${summary.total} PASSED`);
    console.log('====================================================');
    summary.results.forEach((r) => {
      console.log(`[${r.status}] (${r.suite}) ${r.name}${r.details ? ' — ' + r.details : ''}`);
    });
    if (summary.failed > 0) {
      process.exitCode = 1;
    }
  }

  return { runAllTests };
});