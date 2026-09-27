/**
 * server.js
 *
 * Minimal Express proxy that forwards requests to watsonx.ai, keeping API
 * credentials and IAM token exchange off the browser.
 *
 * Start with:  node server.js
 * Requires Node 18+ (uses built-in fetch).
 */

const express = require("express");
const cors    = require("cors");

// ── Configuration ────────────────────────────────────────────────────────────
const IBM_API_KEY        = "ApiKey-dcd9a14e-4c51-452b-ab02-6261f0852d11";                  // TODO: replace
const WATSONX_PROJECT_ID = "4f113e98-3a29-436d-87c0-57814865bb31";           // TODO: replace
const WATSONX_URL        = "https://eu-de.ml.cloud.ibm.com";    // TODO: adjust region if needed

const PORT = 3001;

// ── System prompt (must match replan-agent.js exactly) ───────────────────────
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

// ── IAM token cache ──────────────────────────────────────────────────────────
let _iamToken     = null;
let _iamExpiresAt = 0; // Unix timestamp in seconds

/**
 * Returns a valid IBM IAM access token, fetching a fresh one only when
 * the cached token is missing or expires within the next 60 seconds.
 */
async function getIamToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_iamToken && now < _iamExpiresAt - 60) {
    return _iamToken;
  }

  const res = await fetch("https://iam.cloud.ibm.com/identity/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=" + IBM_API_KEY,
  });

  if (!res.ok) {
    throw new Error(`IAM token fetch failed: HTTP ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  _iamToken     = data.access_token;
  _iamExpiresAt = now + 3600; // IAM tokens are valid for ~3600 s
  return _iamToken;
}

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

/**
 * POST /api/replan
 *
 * Body: { tasks, hoursAvailablePerDay, simulationResult }
 * Returns the raw watsonx.ai response JSON.
 */
app.post("/api/replan", async (req, res) => {
  try {
    const { tasks, hoursAvailablePerDay, simulationResult } = req.body;

    const token = await getIamToken();

    const watsonxRes = await fetch(
      `${WATSONX_URL}/ml/v1/text/chat?version=2024-10-08`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
        },
        body: JSON.stringify({
          model_id:   "meta-llama/llama-3-1-8b-instruct",
          project_id: WATSONX_PROJECT_ID,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: JSON.stringify({ tasks, hoursAvailablePerDay, simulationResult }, null, 2),
            },
          ],
        }),
      }
    );

    const responseBody = await watsonxRes.json();

    if (!watsonxRes.ok) {
      console.error("[server] watsonx.ai error:", responseBody);
      return res.status(watsonxRes.status).json({ error: responseBody });
    }

    res.json(responseBody);
  } catch (err) {
    console.error("[server] /api/replan error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/critic
 *
 * Body: { simulationResult }
 * Returns the raw watsonx.ai response JSON.
 */
const CRITIC_SYSTEM_PROMPT = `You are the Critic inside LIFE OS, a personal planning app. You receive a structured conflict report and explain the consequences clearly and honestly. If isFeasible is true and conflicts is empty, briefly confirm the plan holds up, citing the real slackHours number. Otherwise, lead with the single worst conflict first (highest deficitHours), naming the task, deadline, and exact hour shortfall as real numbers — never vague hedging language like 'might be tight'. Mention any other conflicts briefly after, worst first. Keep the entire response under 120 words, plain text only, no markdown, no greetings, no filler.`;

app.post("/api/critic", async (req, res) => {
  try {
    const { simulationResult } = req.body;

    const token = await getIamToken();

    const watsonxRes = await fetch(
      `${WATSONX_URL}/ml/v1/text/chat?version=2024-10-08`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
        },
        body: JSON.stringify({
          model_id:   "meta-llama/llama-3-1-8b-instruct",
          project_id: WATSONX_PROJECT_ID,
          messages: [
            { role: "system", content: CRITIC_SYSTEM_PROMPT },
            {
              role: "user",
              content: JSON.stringify(simulationResult),
            },
          ],
        }),
      }
    );

    const responseBody = await watsonxRes.json();

    if (!watsonxRes.ok) {
      console.error("[server] watsonx.ai error:", responseBody);
      return res.status(watsonxRes.status).json({ error: responseBody });
    }

    res.json(responseBody);
  } catch (err) {
    console.error("[server] /api/critic error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Proxy running on http://localhost:${PORT}`);
});
