/**
 * data.js — task persistence, creation, and availability helpers.
 * No UI, no DOM interactions beyond localStorage.
 */

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const STORAGE_KEY = "lifeos_tasks";

// ---------------------------------------------------------------------------
// Seed data (declared early — loadTasks references SEED_TASKS)
// ---------------------------------------------------------------------------

/** @param {number} n - days from today */
function _daysFromToday(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Pre-built seed tasks with relative deadlines.
 * Spread: urgent (2 d), soon (5 d, 9 d), comfortable (14 d), distant (30 d).
 * IDs are fixed so the seed set is idempotent if manually re-imported.
 *
 * @type {Task[]}
 */
const SEED_TASKS = [
  {
    id: "seed_001",
    title: "Debug and submit hackathon final build",
    deadline: _daysFromToday(2),       // urgent
    estimatedHours: 8,
    priority: 1,
    category: "hackathon",
    status: "pending",
  },
  {
    id: "seed_002",
    title: "Implement ML classifier for hackathon prototype",
    deadline: _daysFromToday(5),       // soon
    estimatedHours: 18,
    priority: 1,
    category: "hackathon",
    status: "in-progress",
  },
  {
    id: "seed_003",
    title: "Prepare slide deck for data-structures presentation",
    deadline: _daysFromToday(9),       // coming up
    estimatedHours: 5,
    priority: 2,
    category: "academic",
    status: "pending",
  },
  {
    id: "seed_004",
    title: "Write literature review for AI ethics paper",
    deadline: _daysFromToday(14),      // comfortable
    estimatedHours: 12,
    priority: 1,
    category: "academic",
    status: "pending",
  },
  {
    id: "seed_005",
    title: "Complete online German language module (Unit 6)",
    deadline: _daysFromToday(30),      // relaxed
    estimatedHours: 4,
    priority: 3,
    category: "personal",
    status: "pending",
  },
];

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/**
 * Persist the full task list to localStorage.
 * @param {Task[]} tasks
 */
function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/**
 * Load tasks from localStorage.
 * On the very first load (storage empty), seeds the 5 sample tasks first
 * so a fresh browser is never empty.
 * @returns {Task[]}
 */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);

    // First-ever load — persist seeds so the browser is never blank.
    saveTasks(SEED_TASKS);
    return SEED_TASKS;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Task creation
// ---------------------------------------------------------------------------

/**
 * Generate a simple unique id (timestamp + 4-digit random suffix).
 * @returns {string}
 */
function generateId() {
  return `task_${Date.now()}_${Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0")}`;
}

/**
 * Add a new task to storage and return it.
 *
 * @typedef {Object} Task
 * @property {string}  id             - Unique identifier
 * @property {string}  title          - Short description
 * @property {string}  deadline       - ISO date string (YYYY-MM-DD)
 * @property {number}  estimatedHours - Total hours needed to complete
 * @property {1|2|3}   priority       - 1 = high, 2 = medium, 3 = low
 * @property {string}  category       - e.g. "academic", "hackathon", "personal"
 * @property {string}  status         - "pending" | "in-progress" | "done"
 *
 * @param {Omit<Task, "id">} taskData
 * @returns {Task}
 */
function addTask(taskData) {
  const task = { id: generateId(), ...taskData };
  const tasks = loadTasks();
  tasks.push(task);
  saveTasks(tasks);
  return task;
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/**
 * Returns the number of free hours available per weekday.
 * Hardcoded personal schedule — update to taste.
 *
 * @returns {{ Mon: number, Tue: number, Wed: number, Thu: number, Fri: number, Sat: number, Sun: number }}
 */
function getWeeklyHoursAvailable() {
  return { Mon: 4, Tue: 3, Wed: 3, Thu: 2, Fri: 3, Sat: 0, Sun: 5 };
}
