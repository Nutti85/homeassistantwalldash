# MyKid Manual Login Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a one-time, user-operated MyKid sign-in profile and inspect the raw n8n extraction schema without writing data to PostgreSQL or Home Assistant.

**Architecture:** A temporary Chromium GUI container serves a LAN-only browser desktop while mounting the existing `mykid_browser_profile` volume as its explicit Chromium user-data directory. Once the user signs in, remove the GUI service and let the private Browserless service reuse that profile. A separate inactive n8n discovery workflow calls Browserless once and terminates after shaping a schema-only diagnostic result.

**Tech Stack:** Portainer Compose stack, `lscr.io/linuxserver/chromium:85edbc44-ls80`, Browserless Chromium v2.55.2, n8n HTTP Request and Code nodes.

**Spec:** `docs/superpowers/specs/2026-08-27-mykid-manual-login-browser-design.md`

## Global Constraints

- Bind the temporary GUI only to `192.168.1.50`; never publish it on all interfaces.
- Mount only `mykid_browser_profile`; do not mount n8n, database, dashboard, or host credential files.
- Use `--user-data-dir=/config/mykid-profile` in the GUI and `--user-data-dir=/data/mykid-profile` in Browserless, backed by the same named-volume root.
- Do not run Browserless and the GUI Chromium concurrently against the shared profile.
- Do not enter, store, print, or transmit MyKid credentials from n8n, code, logs, or chat.
- Keep the existing n8n import and publish workflows inactive; the discovery workflow has no PostgreSQL or Home Assistant nodes.
- Delete the temporary GUI service and close its LAN port immediately after the authenticated-profile check.

---

### Task 1: Deploy the isolated manual-login GUI

**Files:**
- Modify: Portainer local stack `mykid-browserless` (ID rediscovered immediately before change)

**Interfaces:**
- Consumes: named volume `mykid-browserless_mykid_browser_profile` and the existing private Browserless stack.
- Produces: `http://192.168.1.50:9230/`, an authenticated-user-operated Chromium desktop with the shared profile mounted at `/config/mykid-profile`.

- [ ] **Step 1: Re-discover the active Portainer environment and `mykid-browserless` stack**

Run the Portainer environment/stack listing and confirm the stack ID, compose type, active state, volume name, and that Browserless has no published host port.

- [ ] **Step 2: Stop Browserless before mounting the profile in the GUI service**

Update the stack to leave `mykid-browserless` scaled to zero or stopped while the temporary GUI runs. Confirm there is no running process with `/data/mykid-profile` mounted before starting Chromium.

- [ ] **Step 3: Add the temporary GUI service**

Add this service without attaching it to `n8n_default`:

```yaml
  mykid-login-browser:
    image: lscr.io/linuxserver/chromium:85edbc44-ls80
    container_name: mykid-login-browser
    environment:
      PUID: "999"
      PGID: "999"
      TZ: Europe/Oslo
      CHROME_CLI: "--user-data-dir=/config/mykid-profile https://mykid.no/nb/logg_inn"
    ports:
      - "192.168.1.50:9230:3000"
    volumes:
      - mykid_browser_profile:/config/mykid-profile
    shm_size: "2g"
    mem_limit: 2g
    restart: "no"
```

Keep the existing volume declaration. Do not add credentials, Browserless tokens, or other service networks to this container.

- [ ] **Step 4: Verify the GUI boundary**

Use Portainer container inspection to verify that only port `192.168.1.50:9230` is published, that the GUI has only the profile volume, and that its networks do not include `n8n_default`.

- [ ] **Step 5: Hand the browser to the user for login**

Open `http://192.168.1.50:9230/` in the Codex browser panel. The user completes MyKid login directly, accepts any ordinary MyKid terms, and confirms the authenticated parent landing page. The agent does not type credentials, passwords, one-time codes, or CAPTCHA responses.

- [ ] **Step 6: Commit the compose/documentation change if a repository artifact was added**

Do not commit Portainer-only configuration. If a repository compose example or documentation was added, stage only those MyKid files and commit with:

```bash
git commit -m "docs: document MyKid GUI login bootstrap"
```

### Task 2: Verify profile persistence and close the GUI boundary

**Files:**
- Modify: Portainer local stack `mykid-browserless` (ID rediscovered immediately before change)

**Interfaces:**
- Consumes: the GUI-written Chromium profile volume.
- Produces: a running private Browserless service that can reach authenticated MyKid with `--user-data-dir=/data/mykid-profile` and has no published port.

- [ ] **Step 1: Remove the temporary GUI service and port**

Update the stack to delete `mykid-login-browser` and its `9230` mapping. Do not remove the named profile volume. Confirm the login container no longer exists.

- [ ] **Step 2: Restore private Browserless**

Restore the original `mykid-browserless` service configuration: `TOKEN` remains configured, `ENABLE_DEBUGGER: "false"`, no `ports` section, and the sole `n8n_default` network attachment.

- [ ] **Step 3: Run an authenticated, read-only Browserless check**

Call `/chromium/function` once with `--user-data-dir=/data/mykid-profile` and a function that navigates only to `https://mykid.no/foreldre` and returns one of:

```json
{ "status": "authenticated" }
{ "status": "session_expired" }
{ "status": "source_changed" }
```

It must return neither HTML nor visible portal text. Confirm an `authenticated` response before continuing.

- [ ] **Step 4: Restart Browserless and repeat the same check**

Restart only the `mykid-browserless` service through the stack update, then run the identical read-only check. Confirm it remains `authenticated`; otherwise stop and report `session_expired` without any data ingestion.

### Task 3: Create a read-only n8n extraction discovery workflow

**Files:**
- Create: n8n workflow `Klara – Inspect MyKid source shape (read-only)`
- Modify: n8n HTTP Header Auth credential `MyKid Browserless private API`

**Interfaces:**
- Consumes: `MYKID_BROWSERLESS_PRIVATE_URL`, the existing Browserless token via the named n8n credential, and the authenticated profile.
- Produces: one execution result containing only `status`, top-level key names, per-section record counts, and per-section field-name sets.

- [ ] **Step 1: Create the Browserless header credential**

Create an n8n `httpHeaderAuth` credential named `MyKid Browserless private API` with header name `Authorization` and the service token value formatted as `Bearer <token>`. Do not put the token in workflow JSON.

- [ ] **Step 2: Create an inactive manual-only workflow**

Create `Klara – Inspect MyKid source shape (read-only)` with these nodes and connections:

```text
Manual trigger
  -> Build Browserless request
  -> Extract structured snapshot
  -> Reduce to schema-only diagnostic
```

Set `saveDataSuccessExecution: none`, `saveManualExecutions: false`, timezone `Europe/Oslo`, and no schedule trigger. The full snapshot exists only between the HTTP Request node and the schema reducer in the active manual editor session.

- [ ] **Step 3: Configure the Browserless request**

Before the run, add exactly these non-secret n8n stack environment variables while preserving every existing n8n environment value:

```text
MYKID_BROWSERLESS_PRIVATE_URL=http://mykid-browserless:3000
MYKID_PARENT_BASE_URL=https://mykid.no/foreldre
```

The first Code node must be an exact copy of the existing `Build MyKid Browserless request` node from `Klara – Import MyKid kindergarten feed` and emit its `code` and `context.parentBaseUrl`. It must retain these mandatory source rules:

```js
await page.goto(base.toString(), { waitUntil: 'domcontentloaded' });
if (await login()) return { status: 'session_expired', reason: 'MyKid showed a login page' };
// discover only the six visible parent links, then visit each link once
return { status: 'ok', source_updated_at: new Date().toISOString(), sections };
```

The HTTP Request node posts that JSON body to:

```js
{{$env.MYKID_BROWSERLESS_PRIVATE_URL}}/chromium/function?launch={{encodeURIComponent(JSON.stringify({args:['--user-data-dir=/data/mykid-profile']}))}}
```

with the named header credential. It has no retry, database, Home Assistant, file, or AI nodes. The response may contain live MyKid text transiently; it must flow directly into the schema reducer and must not be saved in n8n execution history.

- [ ] **Step 4: Implement the schema-only reducer**

The final Code node must return only this shape:

```js
const snapshot = $json.body ?? $json;
const sections = snapshot.sections && typeof snapshot.sections === 'object' ? snapshot.sections : {};
const describe = (rows) => Array.isArray(rows) ? {
  count: rows.length,
  fields: [...new Set(rows.flatMap((row) => row && typeof row === 'object' ? Object.keys(row) : []))].sort(),
} : { count: 0, fields: [] };
return [{ json: {
  status: String(snapshot.status ?? 'invalid_snapshot'),
  section_names: Object.keys(sections).sort(),
  section_shapes: Object.fromEntries(Object.entries(sections).map(([name, rows]) => [name, describe(rows)])),
} }];
```

Never return titles, texts, dates, names, HTML, cookies, URLs to individual portal records, or screenshots.

- [ ] **Step 5: Validate and run the workflow once**

Run strict n8n workflow validation, then execute the manual trigger once. Record only the status, section names, per-section counts, and field names. Confirm the execution graph contains no PostgreSQL or Home Assistant node.

- [ ] **Step 6: Commit the exported workflow template and documentation only after redaction review**

If the workflow is exported to `n8n/mykid-source-shape-discovery.json`, inspect it for tokens, profile paths, source content, and credential values. Commit only the redacted template and documentation:

```bash
git commit -m "feat: add read-only MyKid source discovery"
```

### Task 4: Decide parser inputs from the observed schema

**Files:**
- Modify: `docs/n8n-mykid-kindergarten-events.md` (create if missing)
- Modify: `docs/superpowers/specs/2026-08-26-mykid-kindergarten-events-design.md`

**Interfaces:**
- Consumes: the schema-only diagnostic from Task 3.
- Produces: a documented parser contract for noticeboard, weekly plans, newsletters, events, birthdays, and today updates.

- [ ] **Step 1: Record the actual collection and field contract without portal content**

Document each observed section name, allowed field names, required versus optional date/time fields, and the maximum observed record count. Do not include example child names, titles, body text, URLs, or screenshots.

- [ ] **Step 2: Update the extractor contract**

Replace assumptions based on visible labels with the observed route/selector and field contract. Preserve the explicit `session_expired`, `source_changed`, and `invalid_snapshot` outcomes.

- [ ] **Step 3: Define synthetic fixtures from the contract**

Create synthetic rows using neutral text such as `Eksempel oppslag` and ISO/Norwegian dates. Cover all six sections, zero rows, malformed date, missing required field, and one session-expired result.

- [ ] **Step 4: Commit the contract-only documentation**

```bash
git commit -m "docs: define observed MyKid source contract"
```
