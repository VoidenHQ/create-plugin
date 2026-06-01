# @voiden/create-plugin

CLI tool for scaffolding a new [Voiden](https://voiden.app) community plugin. Generates a fully wired project with a Vite build config, JSX runtime shim, zip packager, manifest, and typed TypeScript entry point — ready to build and install in Voiden in under a minute.

```bash
# Recommended
npm create @voiden/plugin my-plugin

# Using npx
npx @voiden/create-plugin my-plugin
```

---

## Table of Contents

- [Quick Start](#quick-start)
- [What It Creates](#what-it-creates)
- [Generated Files Explained](#generated-files-explained)
  - [manifest.json](#manifestjson)
  - [src/plugin.ts](#srcplugints)
  - [build.mjs](#buildmjs)
  - [zip.mjs](#zipmjs)
  - [generate-manifest.mjs](#generate-manifestmjs)
  - [build-main.mjs](#build-mainmjs-main-process-only)
  - [src/main-process.ts](#srcmain-processts-main-process-only)
  - [src/skill.md](#srcskilmd)
  - [changelog.json](#changelogjson)
  - [package.json](#packagejson)
  - [tsconfig.json](#tsconfigjson)
- [CLI Prompts Reference](#cli-prompts-reference)
- [Permissions System](#permissions-system)
- [Capabilities](#capabilities)
- [Plugin API Reference](#plugin-api-reference)
- [Build, Zip, and Install Workflow](#build-zip-and-install-workflow)
- [CI / Automated Release](#ci--automated-release)
- [Where to Start Making Changes](#where-to-start-making-changes)
- [Publishing Your Plugin](#publishing-your-plugin)

---

## Quick Start

```bash
# Recommended — using npm create
npm create @voiden/plugin my-plugin

# Using npx (no install needed)
npx @voiden/create-plugin my-plugin

# Or run interactively without a name
npm create @voiden/plugin
npx @voiden/create-plugin
```

The CLI asks a series of questions, generates the project into a new folder, and prints the next steps.

```
cd my-plugin
npm install
npm run build    # compile src/plugin.ts → dist/my-plugin.js
npm run zip      # package → dist/my-plugin.zip
```

Then in Voiden: **Extensions → ⋯ → Install from file → `dist/my-plugin.zip`**

---

## What It Creates

```
my-plugin/
├── src/
│   ├── plugin.ts          ← your plugin entry point (edit this)
│   └── skill.md           ← AI skill description (optional)
├── manifest.json          ← plugin identity, permissions, capabilities
├── changelog.json         ← release history
├── package.json           ← npm metadata and scripts
├── tsconfig.json          ← TypeScript config
├── build.mjs              ← Vite build script (renderer bundle)
├── zip.mjs                ← packages dist/ into an installable .zip
├── generate-manifest.mjs  ← validates and logs manifest info
├── .gitignore
└── .github/
    └── workflows/
        └── release.yml    ← GitHub Actions: build & publish on git tag
```

If you selected **Main process (Electron)**, two extra files are added:

```
├── build-main.mjs         ← esbuild script for the Node.js side
└── src/
    └── main-process.ts    ← Electron IPC handlers
```

---

## Generated Files Explained

### `manifest.json`

The single source of truth for your plugin. Voiden reads this file when loading the plugin.

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "What this plugin does",
  "version": "1.0.0",
  "voidenVersion": ">=2.0.0",
  "author": "Your Name",
  "icon": "Plug",
  "type": "community",
  "priority": 30,
  "readme": "Shown in the Extensions browser",
  "mainProcess": false,
  "permissions": ["filesystem", "events"],
  "capabilities": {},
  "features": []
}
```

| Field | Purpose |
|---|---|
| `id` | Unique kebab-case identifier. Used as the file name for the built bundle (`dist/{id}.js`) and the zip (`dist/{id}.zip`). |
| `name` | Display name shown in the Extensions browser and sidebar. |
| `version` | SemVer string. Bump this before publishing a new release. |
| `voidenVersion` | Minimum Voiden app version required. Use `>=2.0.0` for all current features. |
| `icon` | A URL to an image shown in the Extensions browser (e.g. a hosted PNG or SVG). Leave blank for a default icon. |
| `priority` | Load order relative to other plugins. Lower numbers load first. Range: 1–99. Core extensions use 10–25. Use 30+ for community plugins. |
| `mainProcess` | Set to `true` only if your plugin registers Electron IPC handlers. Requires a separate `build-main.mjs` bundle. |
| `permissions` | Array of permission strings your plugin needs. See [Permissions System](#permissions-system). |
| `capabilities` | Auto-populated at build time — do not edit manually. See [Capabilities](#capabilities). |

---

### `src/plugin.ts`

**This is the main file you edit.** It exports a single default function that receives a `CorePluginContext` and returns `{ onload, onunload, metadata }`.

```ts
import type { CorePluginContext } from '@voiden/sdk/ui';
import manifest from '../manifest.json';

export default function createMyPlugin(context: CorePluginContext) {
  return {
    onload: async () => {
      // Register everything here
    },

    onunload: async () => {
      // Clean up subscriptions, listeners, etc.
    },

    metadata: manifest,
  };
}
```

**`onload`** — called once when the plugin is activated. Register TipTap nodes, slash commands, sidebar tabs, commands, event listeners, and context menus here.

**`onunload`** — called when the plugin is disabled or the app unloads. Cancel any subscriptions you made in `onload`. Always store unsubscribe functions and call them here to avoid memory leaks.

**`metadata`** — pass `manifest` directly. Voiden uses this to display plugin info in the Extensions browser.

---

### `build.mjs`

Runs a Vite build that compiles `src/plugin.ts` into a single ESM file at `dist/{id}.js`.

```bash
npm run build
```

**How it works:** All host-provided packages (`react`, `@tiptap/core`, `lucide-react`, etc.) are shimmed at build time. Instead of bundling React into your plugin, the build emits inline shim code that reads `window.__voiden_shims__['react']` at runtime — the Voiden app injects these shims before loading any plugin. This keeps plugin bundles small (~5–15 kB) and ensures a single React instance across all plugins.

The shim also handles a Vite dev-mode quirk where `react/jsx-runtime` exports `jsxDEV` instead of `jsx` — the generated shim falls back gracefully so your plugin works in both dev and production builds of Voiden.

**You should not need to edit `build.mjs`** unless you want to add a new host shim for a package your plugin imports.

---

### `zip.mjs`

Packages the build output into an installable `.zip` file.

```bash
npm run zip
```

The zip layout Voiden expects:

```
my-plugin.zip
├── main.js          ← required: the built renderer bundle
├── manifest.json    ← required: plugin identity and permissions
├── skill.md         ← optional: AI skill description
└── my-plugin-main.js  ← optional: main-process bundle
```

`zip.mjs` stages these files into a temp directory and runs `zip -r` before cleaning up. The output is `dist/{id}.zip`.

> **Requires `zip` on your PATH.** On macOS/Linux this is pre-installed. On Windows, install via WSL or [7-Zip CLI](https://www.7-zip.org/).

---

### `generate-manifest.mjs`

A lightweight validation script that reads `manifest.json` and prints its `id` and `version`. It runs as part of `npm run release` to confirm the manifest is valid JSON before publishing.

```bash
node generate-manifest.mjs
# Manifest ready: my-plugin v1.0.0
```

---

### `build-main.mjs` *(main process only)*

Only generated when you select **Main process (Electron)** during scaffolding. Builds `src/main-process.ts` using esbuild into a CommonJS bundle at `dist/{id}-main.cjs`.

```bash
npm run build:main
```

Node built-ins and `electron` are externalized — only your plugin logic is bundled.

---

### `src/main-process.ts` *(main process only)*

The Electron main-process entry. Register `ipcMain` handlers here. Keep this file focused on Node.js / OS-level work (file dialogs, native menus, shell commands). IPC calls from the renderer side should go through `window.electron.*` — avoid accessing the main process directly from `src/plugin.ts`.

```ts
import { ipcMain } from 'electron';

export function register() {
  ipcMain.handle('my-plugin:do-something', async (_event, payload) => {
    return { ok: true };
  });
}
```

---

### `src/skill.md`

A Markdown file that describes your plugin's capabilities to AI assistants (e.g. Claude). It is bundled into the zip as `skill.md` and can be used to teach AI tools how to interact with your plugin's block types and slash commands.

Edit it to describe what your plugin does, what block types it introduces, and how they should be used in a `.void` file.

---

### `changelog.json`

Structured release history. Update this when you ship a new version. Voiden's Extension browser may display this to users.

```json
[
  {
    "version": "1.0.0",
    "date": "2026-01-01",
    "title": "Initial release",
    "description": "First release of My Plugin.",
    "changes": {
      "Added": ["Initial plugin scaffold"]
    }
  }
]
```

---

### `package.json`

Standard npm package file. Key scripts:

| Script | What it does |
|---|---|
| `npm run build` | Compile renderer bundle via Vite → `dist/{id}.js` |
| `npm run build:main` | Compile main-process bundle via esbuild → `dist/{id}-main.cjs` *(only if mainProcess)* |
| `npm run build:runner` | Compile runner bundle via esbuild → `dist/runner.js` *(only if runner)* |
| `npm run zip` | Package `dist/` into `dist/{id}.zip` for local testing only |
| `npm run release` | Build all bundles and validate manifest — used before tagging a release |

The package name is `@voiden/plugin-{id}`. This naming is used by the Voiden registry to identify your plugin.

---

### `tsconfig.json`

TypeScript config pre-set for Voiden plugins:

| Option | Value | Why |
|---|---|---|
| `target` | `ES2020` | Voiden's Electron/Chromium supports all ES2020 features natively |
| `moduleResolution` | `bundler` | Required for Vite's module resolver |
| `jsx` | `react-jsx` | Enables `<JSX />` syntax without importing React manually |
| `strict` | `true` | Catches type errors early |
| `resolveJsonModule` | `true` | Allows `import manifest from '../manifest.json'` |

---

## CLI Prompts Reference

| Prompt | What to enter |
|---|---|
| **Plugin display name** | Human-readable name shown in the Extensions browser (e.g. `My HTTP Formatter`) |
| **Plugin ID** | Kebab-case unique identifier, auto-derived from the name. Must start with a letter and contain only `a-z`, `0-9`, `-` (e.g. `my-http-formatter`) |
| **Description** | One-line description shown in the Extensions browser |
| **Author** | Your name or team name |
| **Icon** | A URL to an image shown in the Extensions browser (e.g. a hosted PNG/SVG). Leave blank for a default icon |
| **Initial version** | SemVer starting version. Default: `1.0.0` |
| **Minimum Voiden version** | Semver range. Default: `>=2.0.0` |
| **Load priority** | Integer. Lower = loads earlier. Use `30` unless you need to load before or after a specific plugin |
| **Runner** | Yes/No — generates `src/runner.ts` and `build-runner.mjs` for `voiden-runner` CLI support |
| **Main process** | Yes/No — generates `src/main-process.ts` and `build-main.mjs` for Electron IPC handlers |
| **Permissions** | Yes/No per permission — see [Permissions System](#permissions-system) |
| **Output directory** | Where to generate the project. Default: `./{id}` |

---

## Permissions System

Permissions gate specific `context.*` APIs. You must declare every permission your plugin uses in `manifest.json`. The host app enforces permissions at call time — calling a gated API without the right permission throws a `PluginPermissionError` and shows an amber "Needs Permission" badge in the Extensions browser.

| Permission | APIs unlocked | When to use |
|---|---|---|
| `filesystem` | `context.fs.read()`, `context.fs.write()`, `context.fs.create()`, `context.fs.createDirectory()`, `context.fs.delete()`, `context.fs.list()`, `context.fs.exists()` | Reading or writing files in the active project |
| `settings` | `context.settings.get()`, `context.settings.set()`, `context.settings.delete()`, `context.settings.onChange()`, `context.ui.registerSettings()` | Persisting plugin configuration and showing a settings panel |
| `events` | `context.events.on()` | Reacting to workspace lifecycle changes |
| `commandPalette` | `context.registerCommand()` | Adding entries to the command palette (`⌘⇧P`) |
| `contextMenus` | `context.registerContextMenu()` | Injecting items into right-click context menus |

All paths passed to `context.fs.*` are relative to the active project root. There is no access to paths outside the open project.

---

## Capabilities

Capabilities describe what your plugin contributes to the editor. They are stored in `manifest.json` under `capabilities` and displayed in the Extensions browser.

**You do not declare capabilities manually.** The build script (`build.mjs`) automatically detects them at build time by scanning the compiled bundle and injects the correct `capabilities` block into the manifest. No configuration needed.

| Capability | Detected when your plugin calls | Shown in Extensions browser as |
|---|---|---|
| `blocks` | `context.registerVoidenExtension()` | Block types the plugin owns |
| `slashCommands` | `context.addVoidenSlashGroup()` or `context.addVoidenSlashCommand()` | Slash command groups |
| `requestPipeline` | `context.pipeline.addHook()` | Pipeline hooks |
| `contextMenus` | `context.registerContextMenu()` | Context menu items |
| `topBar` | `context.registerTopBarItem()` | Top bar buttons |
| `sidebar` | `context.registerSidebarTab()` | Sidebar tabs |
| `commandPalette` | `context.registerCommand()` | Command palette entries |
| `help` | `context.registerHelpCommand()` | Help commands |

For `blocks`, the build script also extracts the node names from `Node.create({ name: '...' })` calls and populates `capabilities.blocks.owns` automatically.

---

## Plugin API Reference

All APIs are available on the `context` object passed to your plugin factory. Gated APIs require the corresponding permission to be declared in `manifest.json`.

### Always available

```ts
// Register a custom TipTap block node
context.registerVoidenExtension(TiptapNode)

// Add slash commands to the editor menu
context.addVoidenSlashGroup({ name, title, commands: [{ name, label, slash, description, action }] })

// Get all registered slash command groups (including core)
context.getVoidenSlashGroups()

// Add a tab to the left or right sidebar
context.registerSidebarTab('right', { id, title, icon, component })

// Add an icon button to the top navigation bar
context.registerTopBarItem({ id, icon, tooltip, position, onClick })

// Show a toast notification
context.ui.showToast(message, 'info' | 'success' | 'warning' | 'error')
```

### `commandPalette` permission

```ts
context.registerCommand({
  id: 'my-plugin.action',
  label: 'My Plugin: Do Something',
  description: 'Optional subtitle',
  shortcut: '⌘⇧M',           // display only — not auto-bound
  action: () => { ... },
})
```

### `contextMenus` permission

```ts
context.registerContextMenu({
  id: 'my-plugin.tab-action',
  label: 'My Plugin: Tab Action',
  surface: 'tab' | 'file' | 'block',
  when: (target) => true,    // optional predicate
  action: (target) => { ... },
})
```

Surfaces:
- `tab` — right-click on an open editor tab. `target` is the `Tab` object (`{ id, title, type, source }`)
- `file` — right-click on a file or folder in the file tree. `target` is `{ path, name, type }`
- `block` — right-click via the drag handle on a block in the editor. `target` is `{ nodeType, pos }`

### `events` permission

```ts
const unsub = context.events.on('tab:changed', ({ tabId, title, type, previousTabId, previousTitle }) => { ... })
const unsub = context.events.on('file:saved',      ({ filePath }) => { ... })
const unsub = context.events.on('file:created',    ({ filePath, name, type }) => { ... })
const unsub = context.events.on('file:deleted',    ({ filePath, name }) => { ... })
const unsub = context.events.on('file:renamed',    ({ oldPath, newPath, oldName, newName, type }) => { ... })
const unsub = context.events.on('directory:created', ({ filePath, name }) => { ... })
const unsub = context.events.on('directory:deleted', ({ filePath, name }) => { ... })
const unsub = context.events.on('project:changed', ({ projectPath }) => { ... })
const unsub = context.events.on('request:sent',    ({ request }) => { ... })
const unsub = context.events.on('response:received', ({ response }) => { ... })

// Always clean up in onunload
cleanupFns.push(unsub)
```

### `filesystem` permission

All paths are relative to the active project root.

```ts
const text = await context.fs.read('config.json')
await context.fs.write('output.txt', 'hello world')
await context.fs.create('notes/new.md', '')
await context.fs.createDirectory('reports')
await context.fs.delete('temp.txt')
const entries = await context.fs.list()           // [{ name, path, type }]
const exists  = await context.fs.exists('file.md')
```

### `settings` permission

Key-value store scoped to your plugin ID. Values must be JSON-serializable.

```ts
const theme = await context.settings.get<string>('theme')
await context.settings.set('theme', 'dark')
await context.settings.delete('theme')
const unsub = context.settings.onChange((key, value) => { ... })
cleanupFns.push(unsub)

// Register a settings section in the Settings page (⚙️ → Plugins section).
// Values are read and written automatically — no custom React component needed.
// Supported field types: 'text' | 'number' | 'select' | 'toggle'
context.ui.registerSettings({
  id: 'my-plugin-settings',
  title: 'My Plugin',
  fields: [
    { type: 'toggle', key: 'enabled',  label: 'Enable feature', defaultValue: true },
    { type: 'text',   key: 'apiKey',   label: 'API Key', placeholder: 'sk-...' },
    { type: 'number', key: 'timeout',  label: 'Timeout (ms)', defaultValue: 5000, min: 0 },
    { type: 'select', key: 'mode',     label: 'Mode',
      options: [{ label: 'Fast', value: 'fast' }, { label: 'Accurate', value: 'accurate' }],
      defaultValue: 'fast' },
  ],
})
```

**Where values are stored:** `~/Library/Application Support/Voiden/plugin-settings/{your-plugin-id}.json` (macOS) — one JSON file per plugin in Electron's `userData` directory.

---

## Runner Support (`voiden-runner`)

[`voiden-runner`](https://github.com/VoidenHQ/voiden/tree/main/packages/voiden-runner) is a headless CLI that executes `.void` files outside of the Voiden desktop app — useful for CI pipelines, scripting, and automation.

If you select the **Runner** capability during scaffolding, two extra files are generated:

```
├── build-runner.mjs   ← esbuild script → dist/runner.js
└── src/
    └── runner.ts      ← RunnerFactory (pure Node.js, no browser APIs)
```

### How it works

The runner plugin system is **separate** from the Electron plugin system:

| | Electron app (`src/plugin.ts`) | `voiden-runner` CLI (`src/runner.ts`) |
|---|---|---|
| Context | `CorePluginContext` | `RunnerContext` |
| Environment | Browser (Chromium) | Node.js |
| UI APIs | Full (sidebar, editor, toasts…) | None (no-ops) |
| Build output | `dist/{id}.js` (ESM, via Vite) | `dist/runner.js` (CJS, via esbuild) |
| Distribution | Inside `.zip` → installed in Voiden | GitHub release asset `runner.js` |
| Install method | Extensions → Install from file | `voiden-runner plugin install {id}` |

### `src/runner.ts`

Exports a `RunnerFactory` — a function that receives a `RunnerContext` and returns `{ onload }`.

```ts
import type { RunnerFactory } from '@voiden/sdk/runner';

const factory: RunnerFactory = (context) => ({
  onload: async () => {
    // Register how your block type maps to an HTTP request
    context.registerBlockSchema({
      name: 'my-block',
      attrs: { url: { default: '' }, method: { default: 'GET' } },
    });

    context.onBuildRequest(async (request, blocks) => {
      const block = blocks.find((b) => b.type === 'my-block');
      if (!block) return; // not our block — pass through unchanged
      return {
        ...request,
        method: block.attrs?.method ?? 'GET',
        url: block.attrs?.url ?? request.url,
      };
    });

    context.onProcessResponse(async (response, blocks, request) => {
      if (context.verbose) {
        console.log(`[my-plugin] ${response.status} ${request.url}`);
      }
      // Use context.report.add() to emit structured assertions or log entries
    });
  },
});

export default factory;
```

### `RunnerContext` API

| Method / Property | Description |
|---|---|
| `context.registerBlockSchema(def)` | Tell the runner how to normalize your block's attrs. Mirrors the `addAttributes()` definition from your TipTap node. |
| `context.onBuildRequest(handler)` | Register a handler that reads the parsed blocks and builds/mutates the `CliRequestState`. Return the modified request or `void` to pass through. |
| `context.onProcessResponse(handler)` | Called after execution with the `CliResponseState`. Use for assertions, logging, or chaining. |
| `context.pipeline.registerHook(stage, handler, priority?)` | Hook into a named pipeline stage at a specific priority. Advanced use. |
| `context.protocols.executeWebSocket(req)` | Execute a WebSocket request (for socket plugins). |
| `context.protocols.executeGrpc(req)` | Execute a gRPC request (for gRPC plugins). |
| `context.verbose` | `true` when the runner was invoked with `--verbose`. |
| `context.report.add(entry)` | Emit a structured log, assertion, or section marker into the run report. |

#### `CliRequestState` shape

```ts
{
  method: string
  url: string
  headers:     Array<{ key: string; value: string; enabled?: boolean }>
  queryParams: Array<{ key: string; value: string; enabled?: boolean }>
  pathParams?: Array<{ key: string; value: string; enabled?: boolean }>
  body?: string
  contentType?: string
  metadata?: Record<string, any>
}
```

#### `CliResponseState` shape

```ts
{
  protocol: string       // 'http', 'websocket', 'grpc', …
  status?: number
  statusText?: string
  durationMs: number
  size?: number
  body?: string
  error?: string
  metadata?: Record<string, any>
}
```

### Build and publish the runner

```bash
npm run build:runner
# → dist/runner.js
```

Publish `dist/runner.js` as a GitHub release asset **named exactly `runner.js`** at your release tag (e.g. `v1.0.0`). The `voiden-runner` CLI looks for this asset name when installing community plugins.

```bash
# Users install your runner plugin with:
voiden-runner plugin install {your-plugin-id}
```

> Your plugin must also be listed in the [VoidenHQ/plugin-registry](https://github.com/VoidenHQ/plugin-registry) `extensions.json` before users can discover and install it via `voiden-runner`. See [Publishing Your Plugin](#publishing-your-plugin).

### Key rule: keep `src/runner.ts` free of browser APIs

`src/runner.ts` runs in plain Node.js — no `window`, no React, no DOM. Any browser-only import will crash the runner. If you share logic between `src/plugin.ts` and `src/runner.ts`, put it in a shared utility file in `src/` that imports nothing from the browser.

---

## Build, Zip, and Install Workflow

There are two separate flows — one for local development/testing, one for releasing.

### Local testing

```bash
npm run build       # compile src/plugin.ts → dist/{id}.js
npm run zip         # package into dist/{id}.zip (local use only)
```

Then in Voiden: **Extensions → ⋯ → Install from file → `dist/{id}.zip`**

The zip contains `main.js`, `manifest.json`, and `skill.md` — everything Voiden needs to load the plugin locally.

### Releasing

```bash
npm run release     # build all bundles + validate manifest
git tag v1.0.0
git push origin v1.0.0
```

The `release` script builds everything and validates the manifest but does **not** create a zip. GitHub Actions handles the actual release when you push a tag — it builds, creates the GitHub Release, and uploads the assets automatically.

> The zip is intentionally excluded from GitHub releases. It is a local development tool only.

---

## CI / Automated Release

When you select the **Runner** capability (or any combination of capabilities), the scaffold generates a GitHub Actions workflow at `.github/workflows/release.yml`. This workflow automates the full build-and-release cycle every time you push a version tag.

### How to trigger a release

```bash
git tag v1.2.0
git push origin v1.2.0
```

GitHub Actions picks up the `v*` tag, runs the full build, and creates a GitHub Release with all artifacts attached.

### What the workflow does

1. **Checks out** the repo and sets up Node 20
2. **Installs** dependencies (`npm install`)
3. **Builds the renderer bundle** — `node build.mjs` → `dist/{id}.js`
4. **Builds the main-process bundle** — `node build-main.mjs` → `dist/{id}-main.cjs` *(only if mainProcess selected)*
5. **Builds the runner bundle** — `node build-runner.mjs` → `dist/runner.js` *(only if runner selected)*
6. **Creates a GitHub Release** and uploads:
   - `manifest.json` — displayed in the Extensions browser
   - `src/skill.md` — AI skill description
   - `dist/runner.js` — consumed by `voiden-runner plugin install {id}` *(only if runner selected)*

> **The zip is not uploaded as a release asset.** It is for local testing only — use `npm run zip` to build it and install via Extensions → Install from file. Distributing via zip on GitHub releases is not the intended release mechanism.

### Generated workflow (with runner)

```yaml
name: Release Plugin

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm install
      - name: Build renderer bundle
        run: node build.mjs
      - name: Build runner bundle
        run: node build-runner.mjs
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            manifest.json
            src/skill.md
            dist/runner.js
```

> The workflow requires `permissions: contents: write` so it can create the GitHub Release. This is granted by default to `GITHUB_TOKEN` in public repos. For private repos, check your repository's Actions settings.

### Why `runner.js` must be in the release

The `voiden-runner` CLI finds your plugin's runner by looking for a release asset named **exactly `runner.js`** in your plugin's GitHub repo. If this asset is missing or misnamed, `voiden-runner plugin install {id}` will fail to install the headless runner. The generated CI workflow handles this naming automatically.

---

## Where to Start Making Changes

1. **Your plugin logic lives entirely in `src/plugin.ts`.**  
   Open this file first. Everything is in the `onload` function — add your registrations there. Unsubscribe in `onunload`.

2. **Change your plugin's name, icon, or permissions → edit `manifest.json`.**  
   The `id` field must stay kebab-case and match the built file name. Bump `version` every time you publish a new zip.

3. **Add a new block type:**
   - Define a TipTap `Node` in `src/plugin.ts`
   - Call `context.registerVoidenExtension(YourNode)`
   - Capabilities are auto-detected at build time — no manifest changes needed

4. **Add a slash command:**
   - Call `context.addVoidenSlashGroup(...)` in `onload`
   - Capabilities are auto-detected at build time — no manifest changes needed

5. **Add a sidebar panel:**
   - Write a React component in `src/plugin.ts` (or a separate file in `src/`)
   - Call `context.registerSidebarTab('right', { id, title, icon, component })` in `onload`

6. **React to workspace events:**
   - Declare `"events"` in `manifest.json` permissions
   - Call `context.events.on('tab:changed', cb)` in `onload`
   - Push the returned unsubscribe function into `cleanupFns`

7. **Support headless execution with `voiden-runner`:**
   - Select the **Runner** capability during scaffolding (or add `src/runner.ts` manually)
   - Implement `context.registerBlockSchema()` and `context.onBuildRequest()` in `src/runner.ts`
   - Build with `npm run build:runner` → `dist/runner.js`
   - Publish `dist/runner.js` as a GitHub release asset named exactly `runner.js`

8. **Test changes quickly:**
   ```bash
   npm run build && npm run zip
   # Reinstall the zip in Voiden

   npm run build:runner
   # voiden-runner plugin install {id}  (after publishing runner.js to a release)
   ```

---

## Publishing Your Plugin

### Install locally (development)

```
Extensions → ⋯ → Install from file → dist/my-plugin.zip
```

Voiden extracts the zip, reads `manifest.json`, and loads the plugin. No restart required.

### Submit to the Voiden registry

To make your plugin discoverable and installable by other Voiden users through the Extensions browser, submit a pull request to [VoidenHQ/plugin-registry](https://github.com/VoidenHQ/plugin-registry).

**Before you submit:**
- Your plugin repo must be **public** on GitHub
- Push at least one tagged release (e.g. `v1.0.0`) with the built assets attached — `manifest.json`, `dist/{id}.js`, and `src/skill.md`

**How to submit:**

1. Fork [VoidenHQ/plugin-registry](https://github.com/VoidenHQ/plugin-registry)
2. Open `extensions.json` and add your entry to the array:

```json
{
  "type": "community",
  "id": "my-plugin",
  "repo": "your-github-username/my-plugin-repo",
  "name": "My Plugin",
  "description": "One-line description shown in the Extensions browser.",
  "version": "1.0.0",
  "author": "Your Name",
  "priority": 30,
  "bundled": false,
  "voidenVersion": ">=2.0.0",
  "mainProcess": false,
  "capabilities": {},
  "features": [
    "Feature one",
    "Feature two"
  ]
}
```

3. Open a pull request — the Voiden team will review and merge once everything looks good.

> The `capabilities` field in the registry entry is populated from your built manifest. Run `npm run release` locally first so `manifest.json` is up to date, then copy the `capabilities` value into your registry entry.

---

## License

Apache-2.0 © [Phurpa Tsering](mailto:phurpa@apyhub.com)
