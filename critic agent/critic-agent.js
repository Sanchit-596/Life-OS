/**
 * critic-agent.js — explains the consequences of a simulation result using AI.
 * Browser: loaded as a plain <script> tag.
 * Node.js: required via CommonJS — const { explainConsequences } = require("./critic-agent.js");
 */

const AI_ENDPOINT_URL = "https://YOUR_WATSONX_ENDPOINT_HERE";

const CRITIC_SYSTEM_PROMPT =
  "You are the Critic inside LIFE OS, a personal planning app. You receive a structured conflict report and explain the consequences clearly and honestly. If isFeasible is true and conflicts is empty, briefly confirm the plan holds up, citing the real slackHours number. Otherwise, lead with the single worst conflict first (highest deficitHours), naming the task, deadline, and exact hour shortfall as real numbers — never vague hedging language like 'might be tight'. Mention any other conflicts briefly after, worst first. Keep the entire response under 120 words, plain text only, no markdown, no greetings, no filler.";

/**
 * Sends a SimulationResult to the AI endpoint and returns a plain-text
 * explanation of its consequences.
 *
 * @param {object} simulationResult - Output from runSimulation()
 * @returns {Promise<string>}
 */
async function explainConsequences(simulationResult) {
  // Guard: missing or malformed input — no fetch call.
  if (
    simulationResult == null ||
    typeof simulationResult !== "object" ||
    typeof simulationResult.isFeasible !== "boolean" ||
    !Array.isArray(simulationResult.conflicts)
  ) {
    return "Invalid simulation result — nothing to critique";
  }

  // Short-circuit: feasible plan with no conflicts — no fetch call needed.
  if (simulationResult.isFeasible && simulationResult.conflicts.length === 0) {
    return `Plan is on track. You have ${simulationResult.slackHours}h of slack across all active tasks.`;
  }

  try {
    const response = await fetch(AI_ENDPOINT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: CRITIC_SYSTEM_PROMPT },
          { role: "user",   content: JSON.stringify(simulationResult) },
        ],
      }),
    });

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (err) {
    console.error(err);
    return "Couldn't reach the Critic agent — try again";
  }
}

// ---------------------------------------------------------------------------
// Example call (commented out)
// ---------------------------------------------------------------------------

// explainConsequences({
//   conflicts: [{
//     taskId: "seed_001",
//     title: "Debug and submit hackathon final build",
//     hoursNeeded: 8,
//     hoursAvailable: 3,
//     deficitHours: 5,
//     deadline: "2026-09-28"
//   }],
//   slackHours: -5,
//   totalHoursNeeded: 8,
//   totalHoursAvailable: 3,
//   isFeasible: false
// }).then(console.log);

// CommonJS export — safe in browsers (typeof module is undefined there).
if (typeof module !== "undefined") {
  module.exports = { explainConsequences };
}
