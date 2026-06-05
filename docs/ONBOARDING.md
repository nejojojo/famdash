# Onboarding

## Connecting your real Apple Health data (Route B)

### 1. Read this first (privacy)

This is **operator-only and eyes-open**: your real metrics — resting heart rate, HRV, sleep efficiency, steps — plus approximately 30 days of history get committed to a **public** GitHub repository, served on a **public** GitHub Pages dashboard, and sent to the Gemini API for analysis. This is **permanent and irreversible**: forks, caches, and GitHub's own archive infrastructure mean the data persists even if you later delete the file or the repository.

Only do this for **your own** data. Do **not** onboard another family member's real data this way — that requires their explicit informed consent and a private repository, which is out of scope here. Family members without their own Apple Watch and Shortcut should remain on `"source": "synthetic"` in `family.json`.

---

### 2. Create a GitHub personal access token

You need a fine-grained PAT scoped narrowly to this repository so the Shortcut can commit your feed file.

1. Go to **github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Under **Repository access**, choose **Only select repositories** and pick this repository.
3. Under **Permissions → Repository permissions**, set **Contents** to **Read and write**. No other permissions are needed.
4. Set a short expiration (30–90 days is reasonable; you can regenerate it).
5. Click **Generate token** and copy it immediately — GitHub will not show it again.

**Security warning:** this token can write any file in the repository. If it leaks, **revoke it immediately** in GitHub → Settings → Developer settings → Fine-grained tokens. Do not paste it into any app, service, or script other than the Shortcut described below.

---

### 3. The feed contract

The Shortcut must produce a file at `feeds/me.json` in the repository root. The file is a JSON array of daily records covering approximately the last 30 days:

```json
[
  {"date":"2026-06-04","rhr":58.2,"sleep_eff":91.0,"steps":9034,"hrv":64.7},
  {"date":"2026-06-03","rhr":59.0,"sleep_eff":88.5,"steps":7210,"hrv":61.2},
  ...
]
```

Rules the pipeline enforces:

- Each object must have a `"date"` field in `YYYY-MM-DD` format.
- The four metrics are `rhr` (resting heart rate, bpm), `sleep_eff` (sleep efficiency, 0–100), `steps` (step count), and `hrv` (heart rate variability, ms). Any metric may be `null` — the pipeline handles gaps gracefully.
- The array must contain at least **7 distinct dates**.
- The newest date in the array must be **within 2 days** of today, otherwise the pipeline treats the feed as stale.
- Entry order does not matter; duplicates for the same date are deduplicated (last entry wins).

**Computing `sleep_eff`:** sleep efficiency is `(total minutes asleep ÷ total minutes in bed) × 100` for the night. Apple Health stores these as separate sample types. If your Shortcut cannot reliably compute this — for example because in-bed time is missing or the aggregation is ambiguous — emit `null` for that field rather than a guess.

---

### 4. Build the Shortcut

Apple Shortcuts is built into iOS — no additional app is required. You assemble this once. The Shortcut runs two HTTP requests on every execution: a GET to read the file's current SHA, then a PUT to overwrite the file. The two-request pattern is mandatory because GitHub's Contents API requires the existing file's SHA when updating; omitting it returns a `422` error.

**Actions in order:**

**(a) Collect Health samples for the last 30 days.**
Add four "Find Health Samples" actions, one for each metric:
- Resting Heart Rate
- Heart Rate Variability (SDNN)
- Step Count
- Sleep Analysis (you'll need both "Asleep" and "In Bed" durations to compute efficiency)

Filter each query to the last 30 days.

**(b) Aggregate per calendar day.**
Group each metric's samples by date. For `rhr` and `hrv`, take the day's value (Apple Health typically stores one resting HR reading per day). For `steps`, sum all samples for the day. For sleep, compute `(sum of asleep minutes ÷ sum of in-bed minutes) × 100`; if in-bed minutes is zero or missing for a day, set that day's `sleep_eff` to `null`.

**(c) Build the JSON array and Base64-encode it.**
Construct a text variable containing the JSON array (one object per day). Shortcuts has a "Base64 Encode" action — apply it to the text variable. Store the result as `encodedContent`.

**(d) GET the current file SHA.**
Add a "Get Contents of URL" action:
- URL: `https://api.github.com/repos/<owner>/<repo>/contents/feeds/me.json`
  (replace `<owner>` and `<repo>` with the actual GitHub username and repository name)
- Method: **GET**
- Headers:
  - `Authorization`: `Bearer <YOUR_TOKEN>`
  - `Accept`: `application/vnd.github+json`

Parse the response JSON and extract the `sha` field. Store it as `fileSha`.

If this is the very first time the file is being created, the GET returns a `404` because the file does not yet exist. In that case `fileSha` will be empty — handle this with an "If" action (see step e).

**(e) PUT the updated file.**
Add another "Get Contents of URL" action:
- URL: same as above
- Method: **PUT**
- Headers: same as above, plus `Content-Type: application/json`
- Request body (JSON):
  ```json
  {
    "message": "feed",
    "content": "<encodedContent>",
    "sha": "<fileSha>"
  }
  ```

Use an "If `fileSha` is empty" branch: when empty (first-ever commit), omit the `sha` key from the body entirely. When non-empty, include it. GitHub requires the correct current SHA on every update after the first.

**Why you must GET the SHA on every run:** the SHA changes with every commit — including the commit the Shortcut itself just made on the previous day. You cannot cache yesterday's SHA; it will be stale and the PUT will return `422`.

**One device per person:** if two devices run the same Shortcut against the same file close together in time, one will have a stale SHA and the PUT will fail with `409`. Pick one device and run the Shortcut only from there.

---

### 5. Schedule the Shortcut

1. Open Shortcuts → **Automation** tab → **+** → **Personal Automation**.
2. Choose **Time of Day**, set it to **7:00 AM**, frequency **Daily**.
3. Add the action **Run Shortcut** and select your feed Shortcut.
4. On the confirmation screen, turn **Ask Before Running** **off**. This is required for the Shortcut to commit overnight data without you having to tap anything each morning.

The daily GitHub Action runs at 14:00 UTC (22:00 MYT, i.e. 10pm) and commits `data.json`. The Shortcut running at 07:00 local time posts your feed well before the pipeline reads it that evening, giving a comfortable window — adjust to your timezone if needed.

---

### 6. Register and verify

The operator member `me` is already present in `family.json`:

```json
{ "id": "me", "name": "Me", "source": "feed" }
```

No changes to `family.json` are needed.

After the Shortcut's first successful run commits `feeds/me.json`, validate it locally:

```
npm run check-feed -- me
```

Expected output on success:

```
✓ feeds/me.json looks good
```

If the validator passes, the next daily pipeline run will display your real data as a **● real** card on the dashboard instead of a synthetic card.

---

### 7. Troubleshooting

**`422` from the PUT request.**
The SHA you sent is wrong or missing. Make sure the GET runs on every Shortcut execution — not just the first time — and that you extract the `sha` field from the GET response before the PUT. Recheck the "If fileSha is empty" branching logic.

**`404` on the first-ever PUT.**
This is expected. When the file does not yet exist, omit the `sha` field from the PUT body entirely. GitHub creates the file fresh. On all subsequent runs the file exists, so the GET will return a SHA and you must include it.

**`401` or `403` from either request.**
Token problem. Verify the fine-grained PAT has **Contents: Read and write** on this specific repository, that you copied the token correctly (no trailing whitespace), and that it has not expired. Regenerate and update the Shortcut if needed.

**Dashboard shows "not synced yet".**
No valid feed has been committed, or the feed has fewer than 7 days of entries. Confirm `feeds/me.json` exists in the repository (check github.com), then run `npm run check-feed -- me` to see the exact failure reason.

**Dashboard shows "last synced N days ago".**
The feed file exists and previously passed validation, but today's entry has not landed yet. Either the Shortcut has not run today, it ran but the PUT failed silently, or the entry date is in the future. Check Shortcuts → Automation for the last run time, and inspect the Shortcut's response from the PUT action.

**`409` conflict error.**
Two devices ran the Shortcut against the same file at nearly the same time. Designate exactly one device to run this Shortcut and disable or delete the automation on all others.

**`check-feed` reports an error before the first Shortcut run.**
The validator can only help after `feeds/me.json` exists in the repository. First-run Shortcut debugging — confirming the token works, the SHA flow is correct, and the initial commit lands — must be done manually by inspecting the Shortcut's response output step by step.
