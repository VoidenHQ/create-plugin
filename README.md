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
- [CLI Prompts Reference](#cli-prompts-reference)
- [Generated Files Explained](#generated-files-explained)
  - [manifest.json](#manifestjson)
  - [src/plugin.ts](#srcplugints)
  - [build.mjs](#buildmjs)
  - [build-main.mjs](#build-mainmjs)
  - [zip.mjs](#zipmjs)
  - [generate-manifest.mjs](#generate-manifestmjs)
  - [src/main-process.ts](#srcmain-processts-main-process-only)
  - [src/skill.md](#srcskilmd)
  - [changelog.json](#changelogjson)
  - [package.json](#packagejson)
  - [tsconfig.json](#tsconfigjson)
- [Icon System](#icon-system)
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
npm run build    # compile src/plugin.ts → dist/my-plugin.js + dist/my-plugin-main.cjs
npm run zip      # package → dist/my-plugin.zip
```

Then in Voiden: **Extensions → ⋯ → Install from file → `dist/my-plugin.zip`**

---

## What It Creates

```
my-plugin/
├── src/
│   ├── plugin.ts          ← your plugin entry point (edit this)
│   ├── main-process.ts    ← Electron IPC handlers (only if main process selected)
│   └── skill.md           ← AI skill description (optional)
├── manifest.json          ← plugin identity, permissions, capabilities
├── changelog.json         ← release history
├── package.json           ← npm metadata and scripts
├── tsconfig.json          ← TypeScript config
├── build.mjs              ← Vite build script (renderer bundle)
├── build-main.mjs         ← esbuild script for the main-process bundle (always generated)
├── zip.mjs                ← packages dist/ into an installable .zip
├── generate-manifest.mjs  ← validates and logs manifest info
├── .gitignore
└── .github/
    └── workflows/
        └── release.yml    ← GitHub Actions: build & publish on git tag
```

If you selected **Runner**, one extra pair of files is added:

```
├── build-runner.mjs       ← esbuild script for voiden-runner CLI
└── src/
    └── runner.ts          ← RunnerFactory (pure Node.js, no browser APIs)
```

---

## CLI Prompts Reference

Every prompt shown during `npm create @voiden/plugin` is explained below.

### Identity

| Prompt | What to enter | Notes |
|---|---|---|
| **Plugin display name** | Human-readable name shown in the Extensions browser (e.g. `My HTTP Formatter`) | Required |
| **Plugin ID** | Kebab-case unique identifier. Auto-derived from the display name. Must start with a letter and contain only `a-z 0-9 -` (e.g. `my-http-formatter`) | Required. Used as the output filename: `dist/{id}.js`, `dist/{id}.zip` |
| **Description** | One-line description shown in the Extensions browser and in `manifest.json` | Optional |
| **Author** | Your name or team name. Defaults to `Voiden Team` | Optional |
| **Icon type** | Choose how the plugin icon is displayed — see [Icon System](#icon-system) | Select one of four options |
| **Initial version** | SemVer starting version. Default: `1.0.0` | Bump this before every release |
| **Minimum Voiden version** | SemVer range the plugin requires. Default: `>=2.0.0` | Use `>=2.0.0` for all current features |
| **Load priority** | Integer. Lower = loads earlier relative to other plugins. Default: `30`. Core extensions use `10–25`; use `30+` for community plugins | |

### Optional extras

| Prompt | What it does |
|---|---|
| **Runner** | Generates `src/runner.ts` and `build-runner.mjs` for [`voiden-runner`](https://github.com/VoidenHQ/voiden/tree/main/packages/voiden-runner) CLI headless support. Select this if you want your plugin to work in CI pipelines or automated scripts outside the Voiden desktop app |
| **Main process** | Generates `src/main-process.ts` with Electron IPC handler stubs. Select this if your plugin needs to access native OS features (file dialogs, native menus, shell commands) from the Electron main process. Note: `build-main.mjs` is **always generated** regardless of this choice — you can add `src/main-process.ts` later |

### Permissions

Each permission gates a specific group of `context.*` APIs. Enable every permission your plugin will use — the host enforces them at call time and shows a warning badge if a permission is missing.

| Prompt | APIs unlocked |
|---|---|
| **File System** | `context.fs.read/write/create/delete/list/exists` |
| **Settings** | `context.settings.get/set/delete/onChange` + `context.ui.registerSettings` |
| **Events** | `context.events.on(...)` for workspace lifecycle events |
| **Command Palette** | `context.registerCommand(...)` |
| **Context Menus** | `context.registerContextMenu(...)` |

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
  "icon": "Globe",
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
| `id` | Unique kebab-case identifier. Used as the file name for the built bundle (`dist/{id}.js`) and the zip (`dist/{id}.zip`). Must match the value set at scaffold time |
| `name` | Display name shown in the Extensions browser and sidebar |
| `version` | SemVer string. Bump this before publishing a new release |
| `voidenVersion` | Minimum Voiden app version required. Use `>=2.0.0` for all current features |
| `icon` | See [Icon System](#icon-system) |
| `priority` | Load order relative to other plugins. Lower numbers load first. Range: 1–99. Core extensions use 10–25. Use 30+ for community plugins |
| `mainProcess` | Set to `true` if your plugin has a `src/main-process.ts` that registers Electron IPC handlers |
| `permissions` | Array of permission strings your plugin needs. See [Permissions System](#permissions-system) |
| `capabilities` | Auto-populated at build time by `build.mjs` — do not edit manually. See [Capabilities](#capabilities) |

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

**`onunload`** — called when the plugin is disabled or the app unloads. Cancel any subscriptions made in `onload`. Always store unsubscribe functions and call them here to avoid memory leaks.

**`metadata`** — pass `manifest` directly. Voiden uses this to display plugin info in the Extensions browser.

The entry file can be named `plugin.ts` or `plugin.tsx` (for JSX) — the build script detects both automatically.

---

### `build.mjs`

Runs a Vite build that compiles your plugin entry point into a single ESM file at `dist/{id}.js`.

```bash
npm run build
# Builds: dist/{id}.js  (renderer bundle)
#         dist/{id}-main.cjs  (main-process bundle, if src/main-process.ts exists)
```

**Entry point detection** — `build.mjs` automatically selects the entry file in this priority order:

1. `src/plugin.tsx`
2. `src/plugin.ts`
3. `src/index.tsx`
4. `src/index.ts`

Use `.tsx` if your plugin includes JSX (React sidebar components). Use `.ts` for logic-only plugins.

**How shimming works** — all host-provided packages (`react`, `@tiptap/core`, `lucide-react`, etc.) are shimmed at build time. Instead of bundling React into your plugin, the build emits inline shim code that reads `window.__voiden_shims__['react']` at runtime — the Voiden app injects these shims before loading any plugin. This keeps plugin bundles small (~5–15 kB) and ensures a single React instance across all plugins.

You should not need to edit `build.mjs` unless you want to add a shim for a package the host does not already provide.

---

### `build-main.mjs`

Builds `src/main-process.ts` using esbuild into a CommonJS bundle at `dist/{id}-main.cjs`. This file is **always generated** regardless of whether you selected main process during scaffolding.

```bash
npm run build:main
# Builds: dist/{id}-main.cjs
```

If `src/main-process.ts` does not exist, the script prints `No main-process.ts found — skipping` and exits cleanly. This means you can add main-process support at any time by simply creating `src/main-process.ts` — no build config changes needed.

Node built-ins (`fs`, `path`, `os`, etc.) and `electron` are externalized — only your plugin logic is bundled.

**Required file for the main-process bundle:**

| Stage | Filename |
|---|---|
| Source | `src/main-process.ts` |
| Build output | `dist/{id}-main.cjs` |
| Inside zip | `{id}-main.cjs` (same name, no rename) |
| After installation on disk | `main-process.js` (Voiden saves it under this fixed name) |
| Loaded by Electron | from `{installPath}/main-process.js` |

---

### `zip.mjs`

Packages the build output into an installable `.zip` file.

```bash
npm run zip
# Output: dist/{id}.zip
```

The zip layout Voiden expects at the root:

```
my-plugin.zip
├── {id}.js           ← required: the renderer bundle (same name as build output)
├── manifest.json     ← required: plugin identity and permissions
├── changelog.json    ← optional: release history
├── skill.md          ← optional: AI skill description
└── {id}-main.cjs     ← optional: main-process bundle (same name as build output)
```

**Local image icons are embedded automatically.** If `manifest.icon` points to a local file (e.g. `"src/icon.png"`), `zip.mjs` reads the file, converts it to a base64 data URL, and writes the result into `manifest.json` inside the zip. The original path reference stays in your source `manifest.json`. The image file itself is not included in the zip — only the embedded data URL in the manifest.

> **Requires `zip` on your PATH.** On macOS/Linux this is pre-installed. On Windows, install via WSL or [7-Zip CLI](https://www.7-zip.org/).

---

### `generate-manifest.mjs`

A lightweight validation script that reads `manifest.json` and prints its `id` and `version`. Runs as part of `npm run release` to confirm the manifest is valid JSON before publishing.

```bash
node generate-manifest.mjs
# Manifest ready: my-plugin v1.0.0
```

---

### `src/main-process.ts` *(main process only)*

Only generated when you select **Main process** during scaffolding. Register `ipcMain` handlers here. Keep this file focused on Node.js / OS-level work (file dialogs, native menus, shell commands).

```ts
import { ipcMain } from 'electron';

export function register() {
  ipcMain.handle('my-plugin:do-something', async (_event, payload) => {
    return { ok: true };
  });
}
```

You can add this file at any time after scaffolding — `build-main.mjs` picks it up automatically.

---

### `src/skill.md`

A Markdown file describing your plugin's capabilities to AI assistants (e.g. Claude). Bundled into the zip as `skill.md`. Edit it to describe what your plugin does, what block types it introduces, and how they should be used in a `.void` file.

---

### `changelog.json`

Structured release history. Update this when you ship a new version. Voiden's Extension browser displays this to users. Also included in the zip and uploaded as a GitHub release asset.

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
| `npm run build` | Compile renderer bundle via Vite → `dist/{id}.js`, then compile main-process bundle via esbuild → `dist/{id}-main.cjs` (skips gracefully if `src/main-process.ts` absent) |
| `npm run build:main` | Compile main-process bundle only → `dist/{id}-main.cjs` |
| `npm run build:runner` | Compile runner bundle → `dist/runner.js` *(only if runner selected)* |
| `npm run zip` | Package `dist/` into `dist/{id}.zip` for local testing |
| `npm run release` | Build all bundles and validate manifest — run before tagging a release |

The package name is `@voiden/plugin-{id}`.

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

## Icon System

Voiden supports three icon types for community plugins. Set the `icon` field in `manifest.json` to one of these formats:

### 1. Lucide icon name

Use any icon name from [lucide-react](https://lucide.dev/icons/) in **PascalCase**. Voiden resolves the name to the actual icon component at render time.

```json
"icon": "Plug"
"icon": "Globe"
"icon": "Zap"
"icon": "Database"
```

This is the recommended option — no image hosting required, icons are always sharp at any size, and they adapt to the app theme.

During scaffolding, select **Lucide icon name** and enter the PascalCase name.

### 2. Local image file (PNG, SVG, JPEG)

Reference a local file relative to your project root. During `npm run zip`, `zip.mjs` reads the file and embeds it as a base64 data URL directly into `manifest.json` inside the zip. The image file itself is not included in the zip.

```json
"icon": "src/icon.png"
"icon": "src/icon.svg"
```

Your source `manifest.json` keeps the file path as a human-readable reference. Only the zip's copy of `manifest.json` contains the embedded data URL — so the zip remains fully self-contained with no external dependencies.

During scaffolding, select **Local image file** and enter the path relative to the project root (e.g. `src/icon.png`).

### 3. Direct URL

A fully qualified `https://` URL to a hosted image.

```json
"icon": "https://cdn.example.com/my-plugin-icon.png"
```

During scaffolding, select **URL** and enter the full URL.

### Fallback

If `icon` is omitted or the value cannot be resolved (e.g. an unrecognised Lucide name), Voiden shows a default icon: the Voiden logo for core extensions, and a generic people icon for community plugins.

### Detection rules (Voiden core)

| `icon` value | Resolved as |
|---|---|
| Starts with `http://` or `https://` | Image URL → `<img src={icon}>` |
| Starts with `data:` | Embedded data URL → `<img src={icon}>` |
| Anything else | Lucide icon name lookup → `<LucideIcon name={icon}>` |

---

## Permissions System

Permissions gate specific `context.*` APIs. You must declare every permission your plugin uses in `manifest.json`. The host app enforces permissions at call time — calling a gated API without the right permission throws a `PluginPermissionError` and shows an amber "Needs Permission" badge in the Extensions browser.

| Permission | APIs unlocked | When to use |
|---|---|---|
| `filesystem` | `context.fs.read()`, `.write()`, `.create()`, `.createDirectory()`, `.delete()`, `.list()`, `.exists()` | Reading or writing files in the active project |
| `settings` | `context.settings.get/set/delete/onChange()`, `context.ui.registerSettings()` | Persisting plugin configuration and showing a settings panel |
| `events` | `context.events.on()` | Reacting to workspace lifecycle changes |
| `commandPalette` | `context.registerCommand()` | Adding entries to the command palette (`⌘⇧P`) |
| `contextMenus` | `context.registerContextMenu()` | Injecting items into right-click context menus |

All paths passed to `context.fs.*` are relative to the active project root. There is no access to paths outside the open project.

---

## Capabilities

Capabilities describe what your plugin contributes to the editor. Stored in `manifest.json` under `capabilities` and displayed in the Extensions browser.

**You do not declare capabilities manually.** The `build.mjs` script automatically detects them at build time by scanning the compiled bundle.

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

For `blocks`, the build script also extracts node names from `Node.create({ name: '...' })` calls and populates `capabilities.blocks.owns` automatically.

---

## Plugin API Reference

All APIs are available on the `context` object passed to your plugin factory. Gated APIs require the corresponding permission declared in `manifest.json`.

### Always available

```ts
context.registerVoidenExtension(TiptapNode)
context.addVoidenSlashGroup({ name, title, commands: [{ name, label, slash, description, action }] })
context.getVoidenSlashGroups()
context.registerSidebarTab('right', { id, title, icon, component })
context.registerTopBarItem({ id, icon, tooltip, position, onClick })
context.ui.showToast(message, 'info' | 'success' | 'warning' | 'error')
```

### `commandPalette` permission

```ts
context.registerCommand({
  id: 'my-plugin.action',
  label: 'My Plugin: Do Something',
  description: 'Optional subtitle',
  shortcut: '⌘⇧M',
  action: () => { ... },
})
```

### `contextMenus` permission

```ts
context.registerContextMenu({
  id: 'my-plugin.tab-action',
  label: 'My Plugin: Tab Action',
  surface: 'tab' | 'file' | 'block',
  when: (target) => true,
  action: (target) => { ... },
})
```

### `events` permission

```ts
const unsub = context.events.on('tab:changed',       ({ tabId, title }) => { ... })
const unsub = context.events.on('file:saved',        ({ filePath }) => { ... })
const unsub = context.events.on('project:changed',   ({ projectPath }) => { ... })
const unsub = context.events.on('request:sent',      ({ request }) => { ... })
const unsub = context.events.on('response:received', ({ response }) => { ... })
// Always clean up in onunload:
cleanupFns.push(unsub)
```

### `filesystem` permission

```ts
const text    = await context.fs.read('config.json')
await context.fs.write('output.txt', 'hello world')
await context.fs.create('notes/new.md', '')
await context.fs.createDirectory('reports')
await context.fs.delete('temp.txt')
const entries = await context.fs.list()           // [{ name, path, type }]
const exists  = await context.fs.exists('file.md')
```

### `settings` permission

```ts
const theme = await context.settings.get<string>('theme')
await context.settings.set('theme', 'dark')
await context.settings.delete('theme')
const unsub = context.settings.onChange((key, value) => { ... })

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

---

## Runner Support (`voiden-runner`)

[`voiden-runner`](https://github.com/VoidenHQ/voiden/tree/main/packages/voiden-runner) is a headless CLI that executes `.void` files outside the Voiden desktop app — useful for CI pipelines, scripting, and automation.

If you select **Runner** during scaffolding, two extra files are generated:

```
├── build-runner.mjs   ← esbuild script → dist/runner.js
└── src/
    └── runner.ts      ← RunnerFactory (pure Node.js, no browser APIs)
```

| | Electron app (`src/plugin.ts`) | `voiden-runner` CLI (`src/runner.ts`) |
|---|---|---|
| Context | `CorePluginContext` | `RunnerContext` |
| Environment | Browser (Chromium) | Node.js |
| Build output | `dist/{id}.js` (ESM, via Vite) | `dist/runner.js` (CJS, via esbuild) |
| Distribution | Inside `.zip` | GitHub release asset `runner.js` |
| Install method | Extensions → Install from file | `voiden-runner plugin install {id}` |

```bash
npm run build:runner
# → dist/runner.js
# Publish as a GitHub release asset named exactly "runner.js"
```

---

## Build, Zip, and Install Workflow

### Local testing

```bash
npm run build       # compile renderer + main-process bundles
npm run zip         # package into dist/{id}.zip
```

Then in Voiden: **Extensions → ⋯ → Install from file → `dist/{id}.zip`**

### Releasing

```bash
npm run release     # build all bundles + validate manifest
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions builds, creates the release, and uploads all assets automatically.

---

## CI / Automated Release

The scaffold generates `.github/workflows/release.yml`. Triggered by pushing a version tag.

### What the workflow does

1. Checks out the repo and sets up Node 20
2. Installs dependencies (`npm install`)
3. Builds the renderer bundle → `dist/{id}.js`
4. Renames it to `dist/main.js` (required name for the GitHub release asset)
5. Builds the main-process bundle → `dist/{id}-main.cjs` (skips gracefully if `src/main-process.ts` absent)
6. Builds the runner bundle → `dist/runner.js` *(only if runner selected)*
7. Creates a GitHub Release and uploads:

| Asset | Purpose |
|---|---|
| `manifest.json` | Plugin identity, read by the Extensions browser |
| `changelog.json` | Release history, displayed to users |
| `dist/{id}.js` | Renderer bundle — same filename as the build output |
| `src/skill.md` | AI skill description |
| `dist/{id}-main.cjs` | Main-process bundle *(only if main process selected)* |
| `dist/runner.js` | Runner bundle *(only if runner selected)* |

### How to trigger a release

```bash
git tag v1.2.0
git push origin v1.2.0
```

---

## Where to Start Making Changes

1. **Plugin logic** → `src/plugin.ts`. Everything is in `onload`. Unsubscribe in `onunload`.
2. **Name, icon, permissions** → `manifest.json`. Bump `version` every release.
3. **Add a block type** → define a TipTap `Node`, call `context.registerVoidenExtension(YourNode)`.
4. **Add a slash command** → call `context.addVoidenSlashGroup(...)` in `onload`.
5. **Add a sidebar panel** → write a React component, call `context.registerSidebarTab(...)`.
6. **Add main-process support after the fact** → create `src/main-process.ts`. Run `npm run build:main`. No other config changes needed.
7. **React to workspace events** → declare `"events"` in permissions, call `context.events.on(...)`.

```bash
# Fast iteration loop:
npm run build && npm run zip
# Reinstall the zip in Voiden: Extensions → ⋯ → Install from file
```

---

## Publishing Your Plugin

### Install locally (development)

```
Extensions → ⋯ → Install from file → dist/my-plugin.zip
```

### Submit to the Voiden registry

1. Fork [VoidenHQ/plugin-registry](https://github.com/VoidenHQ/plugin-registry)
2. Add your entry to `extensions.json`
3. Push at least one tagged release with `manifest.json`, `dist/main.js`, and `src/skill.md` attached
4. Open a pull request

```json
{
  "type": "community",
  "id": "my-plugin",
  "repo": "your-github-username/my-plugin-repo",
  "name": "My Plugin",
  "description": "One-line description.",
  "version": "1.0.0",
  "author": "Your Name",
  "priority": 30,
  "bundled": false,
  "voidenVersion": ">=2.0.0",
  "mainProcess": false,
  "capabilities": {},
  "features": []
}
```

---

## License

Apache-2.0 © [Phurpa Tsering](mailto:phurpa@apyhub.com)
