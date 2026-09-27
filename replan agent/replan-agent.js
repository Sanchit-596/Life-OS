/**
 * replan-agent.js
 *
 * POSTs to the local proxy server (server.js) which handles IAM auth and
 * forwards the request to watsonx.ai. Keeps credentials off the browser.
 */

const SYSTEM_PROMPT = `You are the reasoning engine inside LIFE OS. You receive a task list, weekly hours available, and a structured conflict report, and produce a diagnosis plus a fix.

Respond with ONLY valid JSON, no markdown fences, no text outside the JSON, in exactly this shape:
{
  "whatBroke": string,
  "whyItBroke": string,
  "howItsFixed": string,
  "changes": [ { "taskId": string, "title": string, "action": "defer"|"reallocate_hours"|"reduce_scope", "detail": string, "day": string } ],
  "newSlackHours": number
}

Rules:
1. If isFeasible is true and conflicts is empty: whatBroke says "Nothing — your plan holds up", whyItBroke is empty, howItsFixed says no changes needed, changes is an empty array.
2. Otherwise: whatBroke names the single worst conflict with real numbers (task, deadline, hour shortfall). whyItBroke explains the root cause in one sentence (what change caused it). howItsFixed summarizes your fix in one sentence.
3. changes resolves conflicts worst-first: prefer reallocating hours from lower-priority tasks, then deferring, then reducing scope. Never drop a priority-1 task unless there is truly no alternative. Each change includes which day it applies to. Maximum 4 changes.
4. Each field under 40 words, plain language, real numbers, no jargon, no markdown.`;

/** Fallback returned whenever the AI response cannot be used. */
const FALLBACK = {
  whatBroke:    "Couldn't generate a replan",
  whyItBroke:   "",
  howItsFixed:  "",
  changes:      [],
  newSlackHours: null,
};

/** Fields every valid replan response must contain. */
const REQUIRED_FIELDS = ["whatBroke", "whyItBroke", "howItsFixed", "changes", "newSlackHours"];

/**
 * Generates a replan diagnosis by calling an AI endpoint.
 *
 * @param {Array<{
 *   id: string,
 *   title: string,
 *   deadline: string,
 *   estimatedHours: number,
 *   priority: number,
 *   category: string,
 *   status: string
 * }>} tasks
 *
 * @param {Record<string, number>} hoursAvailablePerDay
 *   e.g. { Mon: 4, Tue: 3, Wed: 3, Thu: 2, Fri: 3, Sat: 0, Sun: 5 }
 *
 * @param {{
 *   conflicts: Array<{
 *     taskId: string,
 *     title: string,
 *     hoursNeeded: number,
 *     hoursAvailable: number,
 *     deficitHours: number,
 *     deadline: string
 *   }>,
 *   slackHours: number,
 *   totalHoursNeeded: number,
 *   totalHoursAvailable: number,
 *   isFeasible: boolean
 * }>} simulationResult
 *
 * @returns {Promise<{
 *   whatBroke: string,
 *   whyItBroke: string,
 *   howItsFixed: string,
 *   changes: Array<{
 *     taskId: string,
 *     title: string,
 *     action: "defer"|"reallocate_hours"|"reduce_scope",
 *     detail: string,
 *     day: string
 *   }>,
 *   newSlackHours: number|null
 * }>}
 */
async function generateReplan(tasks, hoursAvailablePerDay, simulationResult) {
  try {
    // ── 1. Call the local proxy ──────────────────────────────────────────────
    const response = await fetch("http://localhost:3001/api/replan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks, hoursAvailablePerDay, simulationResult }),
    });

    if (!response.ok) {
      console.error(`[replan-agent] HTTP ${response.status}: ${response.statusText}`);
      return FALLBACK;
    }

    const responseBody = await response.json();

    // Unwrap the assistant message content (standard OpenAI-compatible shape).
    // Fall back to treating the whole body as the content if the shape differs.
    const raw =
      responseBody?.choices?.[0]?.message?.content ??
      (typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody));

    // ── 2. Strip accidental markdown fences ─────────────────────────────────
    const jsonText = raw.trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");

    // ── 3. Parse and validate ────────────────────────────────────────────────
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error("[replan-agent] JSON parse failed:", parseErr.message);
      console.error("[replan-agent] Raw response was:", raw);
      return FALLBACK;
    }

    const missingFields = REQUIRED_FIELDS.filter((f) => !(f in parsed));
    if (missingFields.length > 0) {
      console.error("[replan-agent] Response missing required fields:", missingFields.join(", "));
      return FALLBACK;
    }

    // ── 4. Filter out changes whose taskId isn't in the input task list ──────
    const knownIds = new Set(tasks.map((t) => t.id));
    const safeChanges = Array.isArray(parsed.changes)
      ? parsed.changes.filter((c) => knownIds.has(c.taskId))
      : [];

    return {
      whatBroke:     parsed.whatBroke,
      whyItBroke:    parsed.whyItBroke,
      howItsFixed:   parsed.howItsFixed,
      changes:       safeChanges,
      newSlackHours: parsed.newSlackHours,
    };
  } catch (err) {
    console.error("[replan-agent] Unexpected error:", err);
    return FALLBACK;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Example call (commented out — uncomment to test manually)
// Run with:  node replan-agent.js
// ─────────────────────────────────────────────────────────────────────────────

/*
const tasks = [
  { id: "t1", title: "Finish Project Report",  deadline: "2026-10-02T09:00:00", estimatedHours: 6, priority: 1, category: "work",     status: "pending" },
  { id: "t2", title: "Client Brief Review",    deadline: "2026-10-01T17:00:00", estimatedHours: 3, priority: 1, category: "work",     status: "pending" },
  { id: "t3", title: "Read chapter 4",         deadline: "2026-10-05T00:00:00", estimatedHours: 2, priority: 3, category: "personal", status: "pending" },
];

const hoursAvailablePerDay = { Mon: 4, Tue: 3, Wed: 3, Thu: 2, Fri: 3, Sat: 0, Sun: 5 };

const simulationResult = {
  conflicts: [
    {
      taskId:         "t1",
      title:          "Finish Project Report",
      hoursNeeded:    6,
      hoursAvailable: 3,
      deficitHours:   3,
      deadline:       "2026-10-02T09:00:00",
    },
  ],
  slackHours:          -3,
  totalHoursNeeded:    11,
  totalHoursAvailable: 17,
  isFeasible:          false,
};

const result = await generateReplan(tasks, hoursAvailablePerDay, simulationResult);
console.log(JSON.stringify(result, null, 2));
*/
