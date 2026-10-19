/**
 * js/ucs.js
 * Uniform Cost Search (UCS) Implementation using a Binary Min-Heap Priority Queue.
 *
 * Implements:
 * - Initial state path cost g(n) = 0
 * - Priority queue ordered by lowest accumulated path cost g(n) with deterministic FIFO tie-breaking
 * - Goal test performed when a node is removed (popped) from the priority queue
 * - Unit step cost (+1 per legal move)
 * - Duplicate state & cheaper-path relaxation handling
 * - Parent pointer reconstruction & strict solution verification
 * - Detailed search event recording for real-time Search Process visualization
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const PuzzleUtils = require('./puzzle.js');
    module.exports = factory(PuzzleUtils);
  } else {
    root.UCSSolver = factory(root.PuzzleUtils);
  }
})(typeof self !== 'undefined' ? self : this, function (PuzzleUtils) {
  'use strict';

  /**
   * Binary Min-Heap Priority Queue ordered by:
   * 1. Lowest path cost g(n)
   * 2. Lowest insertion sequence number (deterministic tie-breaker)
   */
  class MinPriorityQueue {
    constructor() {
      this._heap = [];
      this._seqCounter = 0;
    }

    size() {
      return this._heap.length;
    }

    isEmpty() {
      return this._heap.length === 0;
    }

    /**
     * Compares two heap items a and b. Returns true if a has higher priority (smaller g, or equal g & smaller seq).
     */
    _less(a, b) {
      if (a.g !== b.g) {
        return a.g < b.g;
      }
      return a.seq < b.seq;
    }

    push(node) {
      const entry = Object.assign({}, node, { seq: this._seqCounter++ });
      this._heap.push(entry);
      this._siftUp(this._heap.length - 1);
      return entry;
    }

    pop() {
      if (this._heap.length === 0) return null;
      const top = this._heap[0];
      const bottom = this._heap.pop();
      if (this._heap.length > 0) {
        this._heap[0] = bottom;
        this._siftDown(0);
      }
      return top;
    }

    peek() {
      return this._heap.length > 0 ? this._heap[0] : null;
    }

    /**
     * Returns a sorted snapshot of the top `limit` active (non-stale) entries in the priority queue.
     */
    toSortedSnapshot(bestCostByState, exploredSet, limit = 12) {
      const active = [];
      const seenKeys = new Set();
      const sorted = this._heap.slice().sort((a, b) => (a.g !== b.g ? a.g - b.g : a.seq - b.seq));
      for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i];
        if (exploredSet && exploredSet.has(item.key)) continue;
        if (bestCostByState && bestCostByState.get(item.key) !== item.g) continue;
        if (seenKeys.has(item.key)) continue;
        seenKeys.add(item.key);
        active.push({
          key: item.key,
          state: item.state.slice(),
          g: item.g,
          depth: item.depth,
          action: item.action || 'Initial'
        });
        if (active.length >= limit) break;
      }
      return active;
    }

    _siftUp(index) {
      let idx = index;
      while (idx > 0) {
        const parentIdx = Math.floor((idx - 1) / 2);
        if (this._less(this._heap[idx], this._heap[parentIdx])) {
          const tmp = this._heap[idx];
          this._heap[idx] = this._heap[parentIdx];
          this._heap[parentIdx] = tmp;
          idx = parentIdx;
        } else {
          break;
        }
      }
    }

    _siftDown(index) {
      let idx = index;
      const length = this._heap.length;
      while (true) {
        const left = 2 * idx + 1;
        const right = 2 * idx + 2;
        let smallest = idx;

        if (left < length && this._less(this._heap[left], this._heap[smallest])) {
          smallest = left;
        }
        if (right < length && this._less(this._heap[right], this._heap[smallest])) {
          smallest = right;
        }
        if (smallest !== idx) {
          const tmp = this._heap[idx];
          this._heap[idx] = this._heap[smallest];
          this._heap[smallest] = tmp;
          idx = smallest;
        } else {
          break;
        }
      }
    }
  }

  /**
   * High-resolution timer helper working in both Browser and Node.js environments.
   */
  function nowMs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  /**
   * Reconstructs the solution path from initial state to goal state using parent pointers.
   */
  function reconstructSolutionPath(goalKey, nodeRecords) {
    const path = [];
    let currentKey = goalKey;
    const visitedGuard = new Set();

    while (currentKey !== null && currentKey !== undefined) {
      if (visitedGuard.has(currentKey)) {
        throw new Error('Cycle detected during parent pointer path reconstruction.');
      }
      visitedGuard.add(currentKey);

      const record = nodeRecords.get(currentKey);
      if (!record) {
        throw new Error(`Missing node record for key "${currentKey}" during reconstruction.`);
      }

      path.push({
        step: 0, // assigned after reversal
        state: record.state.slice(),
        key: record.key,
        g: record.g,
        depth: record.depth,
        action: record.action,
        movedTile: record.movedTile,
        fromIndex: record.fromIndex,
        toIndex: record.toIndex,
        description: record.description,
        parentKey: record.parentKey
      });

      currentKey = record.parentKey;
    }

    path.reverse();
    for (let i = 0; i < path.length; i++) {
      path[i].step = i;
    }
    return path;
  }

  /**
   * Estimates approximate memory usage of UCS data structures in bytes and human-readable KB.
   * Explicitly calculated from node records, priority queue allocations, and explored state keys.
   */
  function estimateMemoryUsage(nodeRecordsCount, maxFrontierSize, exploredCount) {
    // Approximate footprint per stored state record in JS engine (~160 bytes per node record,
    // ~72 bytes per heap entry, ~48 bytes per explored string key).
    const bytes =
      nodeRecordsCount * 160 +
      maxFrontierSize * 72 +
      exploredCount * 48;
    const kb = bytes / 1024;
    return {
      approxBytes: bytes,
      approxKB: Number(kb.toFixed(2)),
      formatted: kb < 1024 ? `~${kb.toFixed(1)} KB` : `~${(kb / 1024).toFixed(2)} MB`,
      methodology:
        'Approximate structural estimate computed from tracked node records (~160 B/record), peak priority-queue entries (~72 B/entry), and closed-set keys (~48 B/key). JavaScript runtimes do not expose exact per-invocation heap allocations.'
    };
  }

  /**
   * Executes Uniform Cost Search (UCS) on the 8-Puzzle.
   *
   * @param {number[]} initialBoard - 9-element array (0..8)
   * @param {number[]} goalBoard    - 9-element array (0..8)
   * @param {object}   options      - { maxExpandedNodes, maxRecordedEvents, stepCostFn }
   */
  function solveUCS(initialBoard, goalBoard, options = {}) {
    const maxExpandedNodes = options.maxExpandedNodes || 25000;
    const maxRecordedEvents = options.maxRecordedEvents || 2500;
    const stepCostFn =
      typeof options.stepCostFn === 'function' ? options.stepCostFn : () => 1;

    const startTime = nowMs();

    // 1. Validate boards & check solvability relative to goalBoard
    const solvability = PuzzleUtils.checkSolvability(initialBoard, goalBoard);
    if (!solvability.valid) {
      return {
        algorithm: 'Uniform Cost Search (UCS)',
        status: 'invalid',
        solved: false,
        errorMessage: solvability.reason,
        solvability,
        solutionPath: [],
        searchEvents: [],
        stats: {
          solutionFound: false,
          totalMoves: 0,
          pathCost: 0,
          nodesGenerated: 0,
          nodesExpanded: 0,
          exploredCount: 0,
          maxDepth: 0,
          executionTimeMs: Number((nowMs() - startTime).toFixed(3)),
          memory: estimateMemoryUsage(0, 0, 0)
        }
      };
    }

    if (!solvability.solvable) {
      return {
        algorithm: 'Uniform Cost Search (UCS)',
        status: 'unsolvable',
        solved: false,
        errorMessage: solvability.reason,
        solvability,
        solutionPath: [],
        searchEvents: [],
        stats: {
          solutionFound: false,
          totalMoves: 0,
          pathCost: 0,
          nodesGenerated: 0,
          nodesExpanded: 0,
          exploredCount: 0,
          maxDepth: 0,
          executionTimeMs: Number((nowMs() - startTime).toFixed(3)),
          memory: estimateMemoryUsage(0, 0, 0)
        }
      };
    }

    // 2. Initialize UCS structures
    const frontier = new MinPriorityQueue();
    const bestCostByState = new Map(); // stateKey -> lowest known g(n)
    const explored = new Set();        // closed set of expanded stateKeys
    const exploredHistory = [];        // ordered list of expanded stateKeys
    const nodeRecords = new Map();     // stateKey -> node metadata for path reconstruction
    const searchEvents = [];

    const initialKey = PuzzleUtils.stateToKey(initialBoard);
    const goalKey = PuzzleUtils.stateToKey(goalBoard);

    const rootNode = {
      key: initialKey,
      state: initialBoard.slice(),
      g: 0,
      depth: 0,
      parentKey: null,
      parentState: null,
      action: 'Initial State',
      movedTile: null,
      fromIndex: null,
      toIndex: null,
      description: 'Initial puzzle configuration (g = 0)'
    };

    nodeRecords.set(initialKey, rootNode);
    bestCostByState.set(initialKey, 0);
    frontier.push(rootNode);

    let nodesGenerated = 1; // Root node initialized
    let nodesExpanded = 0;
    let maxDepth = 0;
    let maxFrontierSize = 1;

    // 3. Main UCS Priority Queue Loop
    while (!frontier.isEmpty()) {
      const current = frontier.pop();

      // If this state was already expanded with an equal or lower cost, skip stale heap entry
      if (explored.has(current.key)) {
        continue;
      }

      // If a strictly cheaper path to current.key was found after this entry was pushed, skip stale entry
      const bestKnownG = bestCostByState.get(current.key);
      if (bestKnownG !== undefined && current.g > bestKnownG) {
        continue;
      }

      // Mark node as expanded / moved to Closed Set
      explored.add(current.key);
      exploredHistory.push(current.key);
      nodesExpanded++;
      if (current.depth > maxDepth) {
        maxDepth = current.depth;
      }

      // Goal Test upon removal from Priority Queue (canonical UCS optimality check)
      const isGoal = current.key === goalKey;

      if (isGoal) {
        if (searchEvents.length < maxRecordedEvents) {
          searchEvents.push({
            eventIndex: searchEvents.length,
            currentState: current.state.slice(),
            currentKey: current.key,
            parentState: current.parentState ? current.parentState.slice() : null,
            parentKey: current.parentKey,
            action: current.action,
            movedTile: current.movedTile,
            g: current.g,
            depth: current.depth,
            isGoal: true,
            generatedSuccessors: [],
            nodesGenerated,
            nodesExpanded,
            frontierSize: Math.max(0, bestCostByState.size - explored.size),
            exploredCount: explored.size,
            frontierSnapshot: frontier.toSortedSnapshot(bestCostByState, explored, 8),
            exploredSnapshot: exploredHistory.slice(-8)
          });
        }

        const solutionPath = reconstructSolutionPath(goalKey, nodeRecords);
        const verification = PuzzleUtils.verifySolutionPath(
          solutionPath,
          initialBoard,
          goalBoard
        );

        if (!verification.valid) {
          return {
            algorithm: 'Uniform Cost Search (UCS)',
            status: 'verification-error',
            solved: false,
            errorMessage: `Path verification failed: ${verification.reason}`,
            solvability,
            solutionPath: [],
            searchEvents,
            stats: {
              solutionFound: false,
              totalMoves: 0,
              pathCost: 0,
              nodesGenerated,
              nodesExpanded,
              exploredCount: explored.size,
              maxDepth,
              executionTimeMs: Number((nowMs() - startTime).toFixed(3)),
              memory: estimateMemoryUsage(nodeRecords.size, maxFrontierSize, explored.size)
            }
          };
        }

        const executionTimeMs = Number((nowMs() - startTime).toFixed(3));
        const memory = estimateMemoryUsage(nodeRecords.size, maxFrontierSize, explored.size);

        return {
          algorithm: 'Uniform Cost Search (UCS)',
          status: 'solved',
          solved: true,
          errorMessage: null,
          solvability,
          verification,
          solutionPath,
          searchEvents,
          stats: {
            solutionFound: true,
            totalMoves: solutionPath.length - 1,
            pathCost: current.g,
            nodesGenerated,
            nodesExpanded,
            exploredCount: explored.size,
            frontierRemaining: Math.max(0, bestCostByState.size - explored.size),
            maxDepth,
            executionTimeMs,
            memory
          }
        };
      }

      // Check safe expansion limit
      if (nodesExpanded >= maxExpandedNodes) {
        const executionTimeMs = Number((nowMs() - startTime).toFixed(3));
        const memory = estimateMemoryUsage(nodeRecords.size, maxFrontierSize, explored.size);
        return {
          algorithm: 'Uniform Cost Search (UCS)',
          status: 'limit-reached',
          solved: false,
          errorMessage: `Search stopped safely after expanding ${nodesExpanded.toLocaleString()} nodes (configured resource limit = ${maxExpandedNodes.toLocaleString()}). The puzzle is solvable, but requires deeper exploration.`,
          solvability,
          solutionPath: [],
          searchEvents,
          stats: {
            solutionFound: false,
            totalMoves: 0,
            pathCost: current.g,
            nodesGenerated,
            nodesExpanded,
            exploredCount: explored.size,
            maxDepth,
            executionTimeMs,
            memory
          }
        };
      }

      // 4. Expand current node and generate legal successors
      const legalMoves = PuzzleUtils.getLegalSuccessors(current.state);
      const eventSuccessors = [];

      for (let i = 0; i < legalMoves.length; i++) {
        const move = legalMoves[i];
        const moveCost = stepCostFn(current.state, move.state, move.action);
        const childG = current.g + moveCost;
        const childDepth = current.depth + 1;

        let disposition = 'skipped-explored';

        if (!explored.has(move.key)) {
          const existingG = bestCostByState.get(move.key);

          if (existingG === undefined) {
            // Brand-new state discovered
            disposition = 'added-to-frontier';
            nodesGenerated++;
            bestCostByState.set(move.key, childG);

            const childRecord = {
              key: move.key,
              state: move.state.slice(),
              g: childG,
              depth: childDepth,
              parentKey: current.key,
              parentState: current.state.slice(),
              action: move.action,
              movedTile: move.movedTile,
              fromIndex: move.fromIndex,
              toIndex: move.toIndex,
              description: move.description
            };

            nodeRecords.set(move.key, childRecord);
            frontier.push(childRecord);
          } else if (childG < existingG) {
            // Strictly cheaper path to a state currently in the frontier
            disposition = 'updated-cheaper-path';
            bestCostByState.set(move.key, childG);

            const updatedRecord = {
              key: move.key,
              state: move.state.slice(),
              g: childG,
              depth: childDepth,
              parentKey: current.key,
              parentState: current.state.slice(),
              action: move.action,
              movedTile: move.movedTile,
              fromIndex: move.fromIndex,
              toIndex: move.toIndex,
              description: move.description
            };

            nodeRecords.set(move.key, updatedRecord);
            frontier.push(updatedRecord);
          } else {
            disposition = 'skipped-higher-or-equal-cost';
          }
        }

        eventSuccessors.push({
          state: move.state.slice(),
          key: move.key,
          action: move.action,
          movedTile: move.movedTile,
          g: childG,
          depth: childDepth,
          disposition
        });
      }

      if (frontier.size() > maxFrontierSize) {
        maxFrontierSize = frontier.size();
      }

      // Record search snapshot event
      if (searchEvents.length < maxRecordedEvents) {
        searchEvents.push({
          eventIndex: searchEvents.length,
          currentState: current.state.slice(),
          currentKey: current.key,
          parentState: current.parentState ? current.parentState.slice() : null,
          parentKey: current.parentKey,
          action: current.action,
          movedTile: current.movedTile,
          g: current.g,
          depth: current.depth,
          isGoal: false,
          generatedSuccessors: eventSuccessors,
          nodesGenerated,
          nodesExpanded,
          frontierSize: Math.max(0, bestCostByState.size - explored.size),
          exploredCount: explored.size,
          frontierSnapshot: frontier.toSortedSnapshot(bestCostByState, explored, 8),
          exploredSnapshot: exploredHistory.slice(-8)
        });
      }
    }

    // Frontier exhausted without finding Goal
    const executionTimeMs = Number((nowMs() - startTime).toFixed(3));
    const memory = estimateMemoryUsage(nodeRecords.size, maxFrontierSize, explored.size);
    return {
      algorithm: 'Uniform Cost Search (UCS)',
      status: 'exhausted',
      solved: false,
      errorMessage: 'Frontier exhausted without reaching the Goal State.',
      solvability,
      solutionPath: [],
      searchEvents,
      stats: {
        solutionFound: false,
        totalMoves: 0,
        pathCost: 0,
        nodesGenerated,
        nodesExpanded,
        exploredCount: explored.size,
        maxDepth,
        executionTimeMs,
        memory
      }
    };
  }

  return {
    MinPriorityQueue,
    solveUCS,
    reconstructSolutionPath,
    estimateMemoryUsage
  };
});