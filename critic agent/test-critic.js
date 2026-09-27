/**
 * test-critic.js — tests for explainConsequences() in critic-agent.js.
 *
 * No real API calls are made (AI_ENDPOINT_URL is still a placeholder).
 * Test 1 resolves locally; Tests 2 and 3 will return the fallback string
 * until a real endpoint is wired up.
 *
 * Node.js:  node test-critic.js
 * Browser:  load critic-agent.js first, then this file via <script> tags.
 */

const { explainConsequences } = require("./critic-agent.js");

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

/** Test 1 — Feasible plan, no conflicts, 5 h of slack. */
const TEST_1_FEASIBLE = {
  conflicts: [],
  slackHours: 5,
  totalHoursNeeded: 15,
  totalHoursAvailable: 20,
  isFeasible: true,
};

/** Test 2 — One conflict: seed_001. */
const TEST_2_ONE_CONFLICT = {
  conflicts: [
    {
      taskId: "seed_001",
      title: "Debug and submit hackathon final build",
      hoursNeeded: 8,
      hoursAvailable: 3,
      deficitHours: 5,
      deadline: "2026-09-28",
    },
  ],
  slackHours: -5,
  totalHoursNeeded: 8,
  totalHoursAvailable: 3,
  isFeasible: false,
};

/**
 * Test 3 — Three conflicts with deficitHours 12, 7, and 3.
 * Conflicts are intentionally listed out of order (7 → 12 → 3) to verify
 * the Critic leads with the worst one (deficit 12) regardless of list order.
 */
const TEST_3_THREE_CONFLICTS = {
  conflicts: [
    {
      taskId: "seed_002",
      title: "Implement ML classifier for hackathon prototype",
      hoursNeeded: 18,
      hoursAvailable: 11,
      deficitHours: 7,
      deadline: "2026-10-02",
    },
    {
      taskId: "seed_004",
      title: "Write literature review for AI ethics paper",
      hoursNeeded: 12,
      hoursAvailable: 0,
      deficitHours: 12,
      deadline: "2026-09-29",
    },
    {
      taskId: "seed_003",
      title: "Prepare slide deck for data-structures presentation",
      hoursNeeded: 5,
      hoursAvailable: 2,
      deficitHours: 3,
      deadline: "2026-10-01",
    },
  ],
  slackHours: -22,
  totalHoursNeeded: 35,
  totalHoursAvailable: 13,
  isFeasible: false,
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runCriticTests() {
  const tests = [
    {
      name: "Test 1 — Feasible plan, no conflicts, 5 h slack",
      input: TEST_1_FEASIBLE,
      note: "Expected: local short-circuit — no fetch call, slackHours in response.",
    },
    {
      name: "Test 2 — One conflict (seed_001, deficit 5 h, deadline 2026-09-28)",
      input: TEST_2_ONE_CONFLICT,
      note: "Expected: AI response naming seed_001 and the 5 h shortfall, or fallback if endpoint is placeholder.",
    },
    {
      name: "Test 3 — Three conflicts; worst conflict (deficit 12 h) should lead",
      input: TEST_3_THREE_CONFLICTS,
      note: "Expected: AI response leads with seed_004 (deficit 12 h), then seed_002 (7 h), then seed_003 (3 h).",
    },
  ];

  for (const { name, input, note } of tests) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`${name}`);
    console.log(`Note: ${note}`);
    console.log("Input:", JSON.stringify(input, null, 2));

    const response = await explainConsequences(input);

    console.log("Response:", response);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("All tests ran.");
}

runCriticTests();
