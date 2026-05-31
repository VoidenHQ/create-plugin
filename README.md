# @voiden/create-plugin

CLI tool for scaffolding a new [Voiden](https://voiden.app) community plugin. Generates a fully wired project with a Vite build config, JSX runtime shim, zip packager, manifest, and typed TypeScript entry point — ready to build and install in Voiden in under a minute.

```bash
npm create @voiden/plugin
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
- [Where to Start Making Changes](#where-to-start-making-changes)
- [Publishing Your Plugin](#publishing-your-plugin)

---

## Quick Start

```bash
# Scaffold a new plugin interactively
npm create @voiden/plugin

# Or pass the display name directly
npm create @voiden/plugin "My Plugin"
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
└── .gitignore
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
  "capabilities": {
    "blocks": {
      "owns": ["my-block"],
      "allowExtensions": true,
      "description": "Owns the my-block block type"
    },
    "slashCommands": {
      "groups": [{ "name": "my-plugin", "commands": ["Insert My Block"] }]
    }
  },
  "features": []
}
```

| Field | Purpose |
|---|---|
| `id` | Unique kebab-case identifier. Used as the file name for the built bundle (`dist/{id}.js`) and the zip (`dist/{id}.zip`). |
| `name` | Display name shown in the Extensions browser and sidebar. |
| `version` | SemVer string. Bump this before publishing a new release. |
| `voidenVersion` | Minimum Voiden app version required. Use `>=2.0.0` for all current features. |
| `icon` | Any [lucide-react](https://lucide.dev) icon name (e.g. `"Zap"`, `"Plug"`, `"Star"`). |
| `priority` | Load order relative to other plugins. Lower numbers load first. Range: 1–99. Core extensions use 10–25. Use 30+ for community plugins. |
| `mainProcess` | Set to `true` only if your plugin registers Electron IPC handlers. Requires a separate `build-main.mjs` bundle. |
| `permissions` | Array of permission strings your plugin needs. See [Permissions System](#permissions-system). |
| `capabilities.blocks.owns` | Block type names (TipTap node names) your plugin registers and owns. |
| `capabilities.slashCommands.groups` | Slash command groups your plugin exposes in the editor. |

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
| `npm run zip` | Package `dist/` into `dist/{id}.zip` |
| `npm run release` | Run build (+ build:main if applicable), zip, and validate manifest in one shot |

The package name is `@voiden/plugin-{id}`. If you plan to publish to npm for others to install, keep this name.

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
| **Icon** | A [lucide-react](https://lucide.dev/icons) icon name (e.g. `Zap`, `Globe`, `Code2`). Leave blank for no icon |
| **Initial version** | SemVer starting version. Default: `1.0.0` |
| **Minimum Voiden version** | Semver range. Default: `>=2.0.0` |
| **Load priority** | Integer. Lower = loads earlier. Use `30` unless you need to load before or after a specific plugin |
| **Capabilities** | Multi-select. See [Capabilities](#capabilities) |
| **Permissions** | Multi-select. See [Permissions System](#permissions-system) |
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

Capabilities describe what your plugin contributes to the editor. They are declared in `manifest.json` under `capabilities` and affect how the host app handles your plugin.

| Capability | What it adds | Key API |
|---|---|---|
| **Blocks (TipTap nodes)** | Custom block types that can be inserted into `.void` files | `context.registerVoidenExtension(Node)` |
| **Request pipeline hooks** | Intercept and transform HTTP requests before they are sent, and process responses | `context.onBuildRequest()`, `context.onProcessResponse()` |
| **Slash commands** | `/command` entries in the editor slash menu | `context.addVoidenSlashGroup()` |
| **Sidebar tab** | A panel tab in the left or right sidebar | `context.registerSidebarTab()` |
| **Paste handler** | Transform pasted text into a block (e.g. paste a curl command → HTTP request block) | `context.paste.registerBlockOwner()` |
| **Main process (Electron)** | Node.js IPC handlers for OS-level operations | `ipcMain.handle()` in `src/main-process.ts` |

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

// Register a React component in the Settings page (⚙️ → Plugins section)
context.ui.registerSettings({
  id: 'my-plugin-settings',
  title: 'My Plugin',
  component: MySettingsPanel,
})
```

---

## Build, Zip, and Install Workflow

```
┌─────────────┐    npm run build     ┌──────────────────────┐
│ src/plugin.ts│ ─────────────────▶  │ dist/my-plugin.js    │
└─────────────┘                      └──────────┬───────────┘
                                                │
                                    npm run zip │
                                                ▼
                                     ┌─────────────────────┐
                                     │ dist/my-plugin.zip  │
                                     │   main.js           │
                                     │   manifest.json     │
                                     │   skill.md          │
                                     └──────────┬──────────┘
                                                │
                                  Voiden: Extensions → Install from file
                                                │
                                                ▼
                                     Plugin active in Voiden ✓
```

Use `npm run release` to do all steps in one command:

```bash
npm run release
# → build → zip → validate manifest
```

---

## Where to Start Making Changes

1. **Your plugin logic lives entirely in `src/plugin.ts`.**  
   Open this file first. Everything is in the `onload` function — add your registrations there. Unsubscribe in `onunload`.

2. **Change your plugin's name, icon, or permissions → edit `manifest.json`.**  
   The `id` field must stay kebab-case and match the built file name. Bump `version` every time you publish a new zip.

3. **Add a new block type:**
   - Define a TipTap `Node` in `src/plugin.ts`
   - Call `context.registerVoidenExtension(YourNode)`
   - Add the block name to `capabilities.blocks.owns` in `manifest.json`

4. **Add a slash command:**
   - Call `context.addVoidenSlashGroup(...)` in `onload`
   - Add it to `capabilities.slashCommands.groups` in `manifest.json`

5. **Add a sidebar panel:**
   - Write a React component in `src/plugin.ts` (or a separate file in `src/`)
   - Call `context.registerSidebarTab('right', { id, title, icon, component })` in `onload`

6. **React to workspace events:**
   - Declare `"events"` in `manifest.json` permissions
   - Call `context.events.on('tab:changed', cb)` in `onload`
   - Push the returned unsubscribe function into `cleanupFns`

7. **Test changes quickly:**
   ```bash
   npm run build && npm run zip
   # Then reinstall the zip in Voiden
   ```

---

## Publishing Your Plugin

### Install locally (development)

```
Extensions → ⋯ → Install from file → dist/my-plugin.zip
```

Voiden extracts the zip, reads `manifest.json`, and loads the plugin. No restart required.

### Publish to the Voiden registry *(coming soon)*

The public Voiden plugin registry will allow users to discover and install your plugin directly from the Extensions browser. Documentation will be added here when the registry opens.

### Publish to npm

If you want developers to be able to install the source via npm:

```bash
npm login
npm publish --access public
```

The package will be available as `@voiden/plugin-{your-id}`.

---

## License

Apache-2.0 © [Phurpa Tsering](mailto:phurpa@apyhub.com)
