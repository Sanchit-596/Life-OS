/**
 * simulator.js — pure what-if scheduler.
 * No side effects, no AI calls, no DOM or network access.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ordered day abbreviations matching getWeeklyHoursAvailable keys. */
const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count total available hours between today (inclusive) and the deadline
 * (inclusive) using the supplied daily-hours map.
 *
 * @param {string} deadlineISO  - "YYYY-MM-DD"
 * @param {{ [day: string]: number }} hoursMap
 * @returns {number}
 */
function hoursUntilDeadline(deadlineISO, hoursMap) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const deadline = new Date(deadlineISO);
  deadline.setHours(0, 0, 0, 0);

  if (deadline < today) return 0; // already past

  let total = 0;
  const cursor = new Date(today);

  while (cursor <= deadline) {
    const dayKey = DAY_KEYS[cursor.getDay()];
    total += hoursMap[dayKey] ?? 0;
    cursor.setDate(cursor.getDate() + 1);
  }

  return total;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Run a purely deterministic simulation of task feasibility.
 *
 * @typedef {Object} HypotheticalChange
 * @property {string} type           - e.g. "reduceAvailability" | "addTask" | "extendDeadline"
 * @property {string} [day]          - Day key affected (for reduceAvailability)
 * @property {number} [hoursRemoved] - Hours to subtract from that day's budget
 * @property {string} [reason]       - Human-readable explanation
 *
 * @typedef {Object} Conflict
 * @property {string} taskId
 * @property {string} title
 * @property {number} hoursNeeded
 * @property {number} hoursAvailable
 * @property {number} deficitHours
 * @property {string} deadline
 *
 * @typedef {Object} SimulationResult
 * @property {Conflict[]} conflicts
 * @property {number}     slackHours          - totalHoursAvailable - totalHoursNeeded (may be negative)
 * @property {number}     totalHoursNeeded
 * @property {number}     totalHoursAvailable
 * @property {boolean}    isFeasible
 *
 * @param {object[]}                         tasks
 * @param {{ [day: string]: number }}         hoursAvailablePerDay
 * @param {HypotheticalChange|null}          [hypotheticalChange=null]
 * @returns {SimulationResult}
 */
function runSimulation(tasks, hoursAvailablePerDay, hypotheticalChange = null) {
  // 1. Apply hypothetical change to a local copy of the hours map.
  const hoursMap = { ...hoursAvailablePerDay };

  if (hypotheticalChange) {
    if (
      hypotheticalChange.type === "reduceAvailability" &&
      hypotheticalChange.day != null &&
      hypotheticalChange.hoursRemoved != null
    ) {
      const current = hoursMap[hypotheticalChange.day] ?? 0;
      hoursMap[hypotheticalChange.day] = Math.max(
        0,
        current - hypotheticalChange.hoursRemoved
      );
    }
  }

  // 2. Consider only pending / in-progress (not done) tasks.
  const pending = tasks.filter((t) => t.status !== "done");

  // 3. Evaluate each task independently against its own deadline window.
  const conflicts = [];
  let totalHoursNeeded = 0;
  let totalHoursAvailable = 0;

  for (const task of pending) {
    const needed = task.estimatedHours ?? 0;
    const available = hoursUntilDeadline(task.deadline, hoursMap);

    totalHoursNeeded += needed;
    totalHoursAvailable += available;

    if (needed > available) {
      conflicts.push({
        taskId: task.id,
        title: task.title,
        hoursNeeded: needed,
        hoursAvailable: available,
        deficitHours: parseFloat((needed - available).toFixed(2)),
        deadline: task.deadline,
      });
    }
  }

  const slackHours = parseFloat(
    (totalHoursAvailable - totalHoursNeeded).toFixed(2)
  );

  return {
    conflicts,
    slackHours,
    totalHoursNeeded,
    totalHoursAvailable,
    isFeasible: conflicts.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Test cases (4 × console.log)
// ---------------------------------------------------------------------------

// Shared availability schedule (matches getWeeklyHoursAvailable in data.js)
const HOURS = { Mon: 4, Tue: 3, Wed: 3, Thu: 2, Fri: 3, Sat: 0, Sun: 5 };

/** Build a minimal task object. */
function makeTask(id, title, deadline, estimatedHours, status = "pending") {
  return { id, title, deadline, estimatedHours, priority: 2, category: "test", status };
}

/** Produce a deadline N calendar days from today as "YYYY-MM-DD". */
function daysFromNow(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Test 1: Plenty of slack ──────────────────────────────────────────────────
// Two tasks with generous deadlines and low hour estimates.
console.log("=== TEST 1: Plenty of slack ===");
{
  const tasks = [
    makeTask("t1", "Read research paper", daysFromNow(14), 3),
    makeTask("t2", "Write personal journal entry", daysFromNow(21), 1),
  ];
  const result = runSimulation(tasks, HOURS, null);
  console.log(result);
  console.assert(result.isFeasible === true, "Test 1 FAILED: expected isFeasible=true");
  console.assert(result.conflicts.length === 0, "Test 1 FAILED: expected no conflicts");
  console.log("Test 1 PASSED ✓\n");
}

// ── Test 2: Exactly one conflict ─────────────────────────────────────────────
// One tight task that cannot fit; one comfortable task that can.
console.log("=== TEST 2: One conflict ===");
{
  const tasks = [
    makeTask("t3", "Complete take-home exam", daysFromNow(1), 20), // 1 day ≈ 2–9 h available
    makeTask("t4", "Grocery shopping list", daysFromNow(30), 1),
  ];
  const result = runSimulation(tasks, HOURS, null);
  console.log(result);
  console.assert(result.isFeasible === false, "Test 2 FAILED: expected isFeasible=false");
  console.assert(result.conflicts.length === 1, "Test 2 FAILED: expected exactly 1 conflict");
  console.assert(result.conflicts[0].taskId === "t3", "Test 2 FAILED: wrong conflicting task");
  console.log("Test 2 PASSED ✓\n");
}

// ── Test 3: Multiple conflicts + hypothetical change ─────────────────────────
// Two already-tight tasks made worse by removing Sunday hours.
console.log("=== TEST 3: Multiple conflicts with hypothetical change ===");
{
  const tasks = [
    makeTask("t5", "Build hackathon MVP", daysFromNow(2), 25),
    makeTask("t6", "Submit assignment draft", daysFromNow(3), 22),
    makeTask("t7", "Relaxing walk", daysFromNow(60), 1), // should not conflict
  ];
  const hypothetical = {
    type: "reduceAvailability",
    day: "Sun",
    hoursRemoved: 5,
    reason: "Family event all day Sunday",
  };
  const result = runSimulation(tasks, HOURS, hypothetical);
  console.log(result);
  console.assert(result.isFeasible === false, "Test 3 FAILED: expected isFeasible=false");
  console.assert(result.conflicts.length >= 2, "Test 3 FAILED: expected ≥2 conflicts");
  const conflictIds = result.conflicts.map((c) => c.taskId);
  console.assert(conflictIds.includes("t5"), "Test 3 FAILED: t5 should conflict");
  console.assert(conflictIds.includes("t6"), "Test 3 FAILED: t6 should conflict");
  console.log("Test 3 PASSED ✓\n");
}

// ── Test 4: Empty task list ───────────────────────────────────────────────────
console.log("=== TEST 4: Empty task list ===");
{
  const result = runSimulation([], HOURS, null);
  console.log(result);
  console.assert(result.isFeasible === true,       "Test 4 FAILED: expected isFeasible=true");
  console.assert(result.conflicts.length === 0,    "Test 4 FAILED: expected no conflicts");
  console.assert(result.totalHoursNeeded === 0,    "Test 4 FAILED: expected 0 hours needed");
  console.assert(result.totalHoursAvailable === 0, "Test 4 FAILED: expected 0 hours available");
  console.assert(result.slackHours === 0,          "Test 4 FAILED: expected 0 slack");
  console.log("Test 4 PASSED ✓\n");
}
