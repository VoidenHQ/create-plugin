#!/usr/bin/env node
import prompts from 'prompts';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

// ─── Helpers ────────────────────────────────────────────────────────────────

const toKebab = (str) =>
  str.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const toCamel = (str) =>
  str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

const toPascal = (str) => {
  const c = toCamel(str);
  return c.charAt(0).toUpperCase() + c.slice(1);
};

const write = (path, content) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
};

// ─── Permission definitions (mirrors @voiden/sdk PluginPermission) ────────────
//
// Each entry: { value, title, description, apiNote }
// These match the PluginPermission union type in @voiden/sdk/shared exactly.

const PERMISSIONS = [
  {
    value: 'filesystem',
    title: 'File System  (context.fs.*)',
    description: 'Read, write, create, delete and list files relative to the active project root',
  },
  {
    value: 'settings',
    title: 'Settings  (context.settings.* + context.ui.registerSettings)',
    description: 'Persist per-plugin settings (plain JSON) and register a Settings panel section',
  },
  {
    value: 'events',
    title: 'Events  (context.events.on)',
    description: 'Subscribe to workspace lifecycle events: tab:changed, file:saved, project:changed, environment:changed, request:sent, response:received',
  },
  {
    value: 'commandPalette',
    title: 'Command Palette  (context.registerCommand)',
    description: 'Add entries to the command palette — shown when the user opens it',
  },
  {
    value: 'contextMenus',
    title: 'Context Menus  (context.registerContextMenu)',
    description: 'Inject items into right-click context menus on tabs, files, or editor blocks',
  },
];

// ─── CLI entry ───────────────────────────────────────────────────────────────

const argName = process.argv[2];

console.log('\n  @voiden/create-plugin\n');
console.log('  Usage: npm create @voiden/plugin\n');

const onCancel = () => { console.log('\nCancelled.'); process.exit(1); };

// ── Step 1: basic identity ───────────────────────────────────────────────────

const identity = await prompts([
  {
    type: 'text',
    name: 'name',
    message: 'Plugin display name',
    initial: argName ?? '',
    validate: (v) => v.trim().length > 0 || 'Required',
  },
  {
    type: 'text',
    name: 'id',
    message: 'Plugin ID (kebab-case)',
    initial: (prev) => toKebab(prev),
    validate: (v) => /^[a-z][a-z0-9-]*$/.test(v) || 'Must be kebab-case (e.g. my-plugin)',
  },
  {
    type: 'text',
    name: 'description',
    message: 'Description',
    initial: '',
  },
  {
    type: 'text',
    name: 'author',
    message: 'Author',
    initial: 'Voiden Team',
  },
  {
    type: 'select',
    name: 'iconType',
    message: 'Icon type',
    choices: [
      { title: 'None (use default Voiden icon)', value: 'none' },
      { title: 'Lucide icon name  (e.g. Plug, Globe, Zap)', value: 'lucide' },
      { title: 'Local image file  (PNG, SVG, JPEG — embedded in zip)', value: 'file' },
      { title: 'URL  (hosted image)', value: 'url' },
    ],
    initial: 0,
  },
  {
    type: (prev) => prev !== 'none' ? 'text' : null,
    name: 'iconValue',
    message: (prev, values) => {
      if (values.iconType === 'lucide') return 'Lucide icon name (PascalCase, e.g. "Plug", "Globe", "Zap")';
      if (values.iconType === 'file')   return 'Icon file path relative to project root (e.g. "src/icon.png")';
      return 'Icon URL (e.g. https://cdn.example.com/icon.png)';
    },
    validate: (v) => v.trim().length > 0 || 'Required',
  },
  {
    type: 'text',
    name: 'version',
    message: 'Initial version',
    initial: '1.0.0',
  },
  {
    type: 'text',
    name: 'voidenVersion',
    message: 'Minimum Voiden version required',
    initial: '>=2.0.0',
  },
  {
    type: 'number',
    name: 'priority',
    message: 'Load priority (lower = earlier)',
    initial: 30,
  },
], { onCancel });

// ── Step 2: optional extras ───────────────────────────────────────────────────

console.log('\n  Optional extras:');
const extras = await prompts([
  { type: 'toggle', name: 'runner',      message: 'Runner — voiden-runner CLI headless support', initial: false, active: 'yes', inactive: 'no' },
  { type: 'toggle', name: 'mainProcess', message: 'Main process — Electron IPC handlers',        initial: false, active: 'yes', inactive: 'no' },
], { onCancel });

// ── Step 3: permissions ──────────────────────────────────────────────────────
//
// Permissions gate specific context APIs. Community plugins must declare them
// in manifest.json — the host app enforces them at call time.
// Maps 1-to-1 with the PluginPermission type in @voiden/sdk/shared.

console.log('\n  Permissions — gate specific context APIs (enable all you need):');
const permToggles = await prompts(
  PERMISSIONS.map((p) => ({
    type: 'toggle',
    name: p.value,
    message: `${p.title}`,
    initial: false,
    active: 'yes',
    inactive: 'no',
  })),
  { onCancel },
);
const permissions = Object.entries(permToggles).filter(([, v]) => v).map(([k]) => k);

// ── Output dir — always derived from plugin ID ────────────────────────────────

const outDir = `./${identity.id}`;
const dir = resolve(process.cwd(), outDir);
if (existsSync(dir)) {
  const { ok } = await prompts({
    type: 'confirm',
    name: 'ok',
    message: `${outDir} already exists. Continue?`,
    initial: false,
  }, { onCancel });
  if (!ok) process.exit(1);
}

// ─── Generate files ──────────────────────────────────────────────────────────

const { id, name, description, author, iconType, iconValue, version, voidenVersion, priority } = identity;
const icon = (iconType && iconType !== 'none') ? iconValue?.trim() || undefined : undefined;
const hasMainProcess = extras.mainProcess;
const hasRunner      = extras.runner;
const fnName = `create${toPascal(toCamel(id))}Plugin`;

// Permission flags
const needsFilesystem    = permissions.includes('filesystem');
const needsSettings      = permissions.includes('settings');
const needsEvents        = permissions.includes('events');
const needsCommandPalette = permissions.includes('commandPalette');
const needsContextMenus  = permissions.includes('contextMenus');

// ── manifest.json ─────────────────────────────────────────────────────────────

const manifest = {
  id,
  name,
  description,
  version,
  voidenVersion,
  author,
  ...(icon ? { icon } : {}),
  type: 'community',
  priority,
  readme: description,
  mainProcess: hasMainProcess,
  // Declared permissions — community plugins must list every gated API they use.
  // The host app (plugins.tsx) enforces these at call time using PluginPermission
  // from @voiden/sdk/shared. Missing a permission causes a PluginPermissionError
  // and shows an amber "Needs Permission" badge in the Extension Browser.
  permissions,
  capabilities: {},
  features: [],
};

write(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

// ── changelog.json ────────────────────────────────────────────────────────────

const changelog = [
  {
    version,
    date: new Date().toISOString().slice(0, 10),
    title: 'Initial release',
    description: `First release of ${name}.`,
    changes: {
      Added: ['Initial plugin scaffold'],
    },
  },
];
write(join(dir, 'changelog.json'), JSON.stringify(changelog, null, 2));

// ── package.json ──────────────────────────────────────────────────────────────

let sdkVersion = '1.0.10';
try {
  const res = await fetch('https://registry.npmjs.org/@voiden/sdk/latest');
  if (res.ok) sdkVersion = (await res.json()).version ?? sdkVersion;
} catch { /* offline — fall back to pinned version */ }

const pkgJson = {
  name: `@voiden/plugin-${id}`,
  version,
  type: 'module',
  private: false,
  description,
  main: './src/plugin.ts',
  scripts: {
    build: 'node build.mjs && node build-main.mjs',
    'build:main': 'node build-main.mjs',
    ...(hasRunner      ? { 'build:runner': 'node build-runner.mjs' } : {}),
    zip: 'node zip.mjs',
    release: [
      'node build.mjs && node build-main.mjs',
      hasRunner ? '&& node build-runner.mjs' : '',
      '&& node generate-manifest.mjs',
    ].filter(Boolean).join(' '),
  },
  peerDependencies: {
    '@voiden/sdk': `>=${sdkVersion}`,
    react: '^18.2.0',
    'react-dom': '^18.2.0',
  },
  devDependencies: {
    '@voiden/sdk': 'latest',
    esbuild: '^0.20.0',
    typescript: '^5.0.0',
    vite: '^5.0.0',
  },
};
write(join(dir, 'package.json'), JSON.stringify(pkgJson, null, 2));

// ── tsconfig.json ─────────────────────────────────────────────────────────────

const tsconfig = {
  compilerOptions: {
    target: 'ES2020',
    module: 'ESNext',
    moduleResolution: 'bundler',
    jsx: 'react-jsx',
    strict: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
  },
  include: ['src'],
  exclude: ['node_modules', 'dist'],
};
write(join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

// ── .gitignore ────────────────────────────────────────────────────────────────

write(join(dir, '.gitignore'), `node_modules/
dist/
*.tsbuildinfo
`);

// ── .github/workflows/release.yml ────────────────────────────────────────────
// Triggered by pushing a version tag (e.g. git tag v1.0.0 && git push --tags).
// Builds all artifacts, creates a GitHub Release, and uploads:
//   • dist/runner.js       → consumed by `voiden-runner plugin install {id}` (if runner)
//   • manifest.json        → displayed in Extensions browser
//   • src/skill.md         → AI skill description (if present)
// Note: zip is for local testing only (install via Extensions → Install from file)
//       and is NOT uploaded as a release asset.

const releaseFiles = [
  'dist/manifest.json',
  'changelog.json',
  `dist/${id}.js`,
  'src/skill.md',
  ...(hasMainProcess ? [`dist/${id}-main.cjs`] : []),
  ...(hasRunner ? ['dist/runner.js'] : []),
].map(f => `            ${f}`).join('\n');

write(join(dir, '.github', 'workflows', 'release.yml'), `name: Release Plugin

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

      - name: Build main-process bundle
        run: node build-main.mjs
${hasRunner ? `
      - name: Build runner bundle
        # dist/runner.js — consumed by: voiden-runner plugin install ${id}
        run: node build-runner.mjs
` : ''}
      - name: Generate manifest
        # Inlines any local icon as base64 → writes dist/manifest.json
        run: node generate-manifest.mjs

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
${releaseFiles}
`);

// ── generate-manifest.mjs ─────────────────────────────────────────────────────
// Reads manifest.json, inlines any local icon file as a base64 data URL,
// and writes the result to dist/manifest.json for the GitHub release upload.
// This ensures community installs (which download manifest.json from the
// release) get a self-contained icon instead of a broken relative path.

write(join(dir, 'generate-manifest.mjs'), `#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf8'))
const out = { ...manifest }

if (out.icon && !out.icon.startsWith('http') && !out.icon.startsWith('data:')) {
  const iconPath = resolve(out.icon)
  if (existsSync(iconPath)) {
    const ext = iconPath.split('.').pop().toLowerCase()
    const mime = ext === 'svg' ? 'image/svg+xml' : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : \`image/\${ext}\`
    out.icon = \`data:\${mime};base64,\` + readFileSync(iconPath).toString('base64')
    console.log(\`Inlined icon as base64 (\${mime})\`)
  } else {
    console.warn(\`Warning: icon file not found at \${iconPath} — icon will be missing in community installs\`)
  }
}

mkdirSync('dist', { recursive: true })
writeFileSync('dist/manifest.json', JSON.stringify(out, null, 2))
console.log(\`Manifest ready: \${out.id} v\${out.version} → dist/manifest.json\`)
`);

// ── zip.mjs ───────────────────────────────────────────────────────────────────
// Packages the built plugin into a zip for local installation in Voiden.
// Zip format: manifest.json + main.js (+ optional skill.md, *-main.js) at root.
// Install in Voiden via Extensions → Install from file.

write(join(dir, 'zip.mjs'), `#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { join, resolve } from 'path'

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf8'))
const pluginId = manifest.id

// Verify the renderer bundle was built
const mainSrc = \`dist/\${pluginId}.js\`
if (!existsSync(mainSrc)) {
  console.error(\`\\n  Error: dist/\${pluginId}.js not found. Run \\\`npm run build\\\` first.\\n\`)
  process.exit(1)
}

// Stage files into a temp dir so zip -j (junk paths) isn't needed
const staging = resolve(\`dist/__staging__\`)
if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })

// Required: {id}.js
copyFileSync(mainSrc, join(staging, \`\${pluginId}.js\`))

// manifest.json — embed local icon files as base64 data URLs before staging
const manifestForZip = { ...manifest }
if (manifestForZip.icon && !manifestForZip.icon.startsWith('http') && !manifestForZip.icon.startsWith('data:')) {
  const iconPath = resolve(manifestForZip.icon)
  if (existsSync(iconPath)) {
    const iconExt = iconPath.split('.').pop().toLowerCase()
    const mime = iconExt === 'svg' ? 'image/svg+xml' : (iconExt === 'jpg' || iconExt === 'jpeg') ? 'image/jpeg' : \`image/\${iconExt}\`
    manifestForZip.icon = \`data:\${mime};base64,\` + readFileSync(iconPath).toString('base64')
  }
}
writeFileSync(join(staging, 'manifest.json'), JSON.stringify(manifestForZip, null, 2))

// Optional: skill.md
if (existsSync('src/skill.md')) {
  copyFileSync('src/skill.md', join(staging, 'skill.md'))
}

// Optional: changelog.json
if (existsSync('changelog.json')) {
  copyFileSync('changelog.json', join(staging, 'changelog.json'))
}

// Optional: main-process bundle — keep exact build output name
const mainProcessSrc = \`dist/\${pluginId}-main.cjs\`
if (existsSync(mainProcessSrc)) {
  copyFileSync(mainProcessSrc, join(staging, \`\${pluginId}-main.cjs\`))
}

// Create the zip
const outZip = resolve(\`dist/\${pluginId}.zip\`)
if (existsSync(outZip)) rmSync(outZip)

try {
  execSync(\`zip -r "\${outZip}" .\`, { cwd: staging, stdio: 'inherit' })
} catch {
  console.error('\\n  Error: zip command failed. Make sure zip is installed.\\n')
  process.exit(1)
} finally {
  rmSync(staging, { recursive: true, force: true })
}

const sizeKb = (readFileSync(outZip).length / 1024).toFixed(1)
console.log(\`
  ✓ dist/\${pluginId}.zip  (\${sizeKb} kB)

  To install in Voiden:
    Extensions → ⋯ → Install from file → select dist/\${pluginId}.zip
\`)
`);

// ── build.mjs (renderer — Vite + shim plugin) ─────────────────────────────────

write(join(dir, 'build.mjs'), `#!/usr/bin/env node
import { build } from 'vite'
import { readFileSync, existsSync } from 'fs'

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf8'))
const pluginId = manifest.id
const entry = existsSync('./src/plugin.tsx') ? './src/plugin.tsx'
  : existsSync('./src/plugin.ts') ? './src/plugin.ts'
  : existsSync('./src/index.tsx') ? './src/index.tsx'
  : './src/index.ts'

// Packages provided by the host app at runtime via window.__voiden_shims__
const STATIC_SHIMS = {
  'react': \`const _s=window.__voiden_shims__['react'];export default _s;export const {useState,useEffect,useCallback,useMemo,useRef,useContext,createContext,forwardRef,memo,Fragment,createElement,cloneElement,Children,StrictMode,Suspense,lazy,isValidElement,Component,PureComponent,createRef,startTransition,useReducer,useLayoutEffect,useImperativeHandle,useDebugValue,useTransition,useDeferredValue,useId}=_s;\`,
  // In Vite dev mode the host may expose jsxDEV instead of jsx — fall back gracefully.
  'react/jsx-runtime': \`const _s=window.__voiden_shims__?.['react/jsx-runtime']??{};const _r=window.__voiden_shims__?.['react']??{};export const jsx=_s.jsx??_s.jsxDEV??_r.createElement;export const jsxs=_s.jsxs??_s.jsxDEV??_r.createElement;export const Fragment=_s.Fragment??_r.Fragment;\`,
  'react-dom': \`const _s=window.__voiden_shims__['react-dom'];export default _s;export const {createPortal,flushSync,render,unmountComponentAtNode}=_s;\`,
  'react-dom/client': \`const _s=window.__voiden_shims__['react-dom/client'];export default _s;export const {createRoot,hydrateRoot}=_s;\`,
  '@tanstack/react-query': \`const _s=window.__voiden_shims__['@tanstack/react-query'];export default _s;export const {useQuery,useMutation,useQueryClient,useInfiniteQuery,QueryClient,QueryClientProvider,QueryCache,MutationCache,useIsFetching,useIsMutating,useSuspenseQuery,useSuspenseInfiniteQuery,useSuspenseQueries,useQueries,HydrationBoundary,dehydrate,hydrate,focusManager,onlineManager,replaceEqualDeep,hashKey}=_s;\`,
  '@tiptap/react': \`const _s=window.__voiden_shims__['@tiptap/react'];export default _s;export const {ReactNodeViewRenderer,NodeViewWrapper,NodeViewContent,useEditor,EditorContent,ReactRenderer,FloatingMenu,BubbleMenu,useReactNodeView,useCurrentEditor}=_s;\`,
  '@codemirror/state': \`const _s=window.__voiden_shims__['@codemirror/state'];export default _s;export const {Extension,RangeSetBuilder,StateField,EditorState,Prec,Annotation,AnnotationType,ChangeDesc,ChangeSet,Compartment,EditorSelection,Facet,Line,MapMode,Range,RangeSet,RangeValue,SelectionRange,StateEffect,StateEffectType,Text,Transaction,combineConfig,countColumn,findClusterBreak,findColumn}=_s;\`,
  '@codemirror/view': \`const _s=window.__voiden_shims__['@codemirror/view'];export default _s;export const {keymap,EditorView,Decoration,DecorationSet,WidgetType,ViewPlugin,ViewUpdate,MatchDecorator,GutterMarker,drawSelection,dropCursor,highlightActiveLine,highlightSpecialChars,lineNumbers,rectangularSelection,scrollPastEnd}=_s;\`,
  '@codemirror/autocomplete': \`const _s=window.__voiden_shims__['@codemirror/autocomplete'];export default _s;export const {CompletionContext,CompletionResult,autocompletion,completeAnyWord,closeBrackets,closeBracketsKeymap,completionKeymap,ifIn,ifNotIn,snippetCompletion}=_s;\`,
  '@tiptap/core': \`const _s=window.__voiden_shims__['@tiptap/core']||{};export default _s;export const {Editor,Extension,Node,NodeViewProps,Range,JSONContent,generateJSON,mergeAttributes,getSchema}=_s;\`,
  '@tiptap/pm/model': \`const _s=window.__voiden_shims__['@tiptap/pm/model']||{};export default _s;export const {DOMParser,Fragment,Node,Slice}=_s;\`,
  '@tiptap/pm/state': \`const _s=window.__voiden_shims__['@tiptap/pm/state']||{};export default _s;export const {EditorState,Plugin,PluginKey}=_s;\`,
  '@tiptap/pm/tables': \`const _s=window.__voiden_shims__['@tiptap/pm/tables']||{};export default _s;export const {CellSelection}=_s;\`,
  '@tiptap/pm/view': \`const _s=window.__voiden_shims__['@tiptap/pm/view']||{};export default _s;export const {EditorView}=_s;\`,
  '@tiptap/suggestion': \`const _s=window.__voiden_shims__['@tiptap/suggestion']||{};export default _s;\`,
  'lucide-react': \`const _s=window.__voiden_shims__['lucide-react']||{};export default _s;export const {AlertCircle,ArrowDown,ArrowLeft,ArrowRight,ArrowUp,BookOpen,Check,CheckCheck,ChevronDown,ChevronRight,ChevronsDownUp,ChevronsUpDown,Circle,CircleAlert,CircleX,Clock,Copy,CornerDownLeft,Download,ExternalLink,Eye,FileText,Folder,FolderOpen,History,Info,Link,Loader,Loader2,Play,Plus,Radio,Search,Sparkles,Trash2,X,XCircle}=_s;\`,
  'zustand': \`const _s=window.__voiden_shims__['zustand']||{};export default _s;export const {create}=_s;\`,
  '@voiden/sdk': \`const _s=window.__voiden_shims__['@voiden/sdk']||{};export default _s;export const {PipelineStage,PluginContext,RequestCompilationContext,SlashCommandGroup,UIExtension}=_s;\`,
  '@voiden/sdk/shared': \`const _s=window.__voiden_shims__['@voiden/sdk/shared']||{};export default _s;export const {Request,RequestParam,parseCookies}=_s;\`,
  'tippy.js': \`const _s=window.__voiden_shims__['tippy.js']||{};export default _s;\`,
  'react-markdown': \`const _s=window.__voiden_shims__['react-markdown']||{};export default _s?.default??_s;\`,
  'remark-gfm': \`const _s=window.__voiden_shims__['remark-gfm']||{};export default _s?.default??_s;\`,
  'buffer': \`export const Buffer=globalThis.Buffer;export default{Buffer:globalThis.Buffer};\`,
}

// Host app module exports — resolved to window.__voiden_shims__ at runtime
const CORE_EXPORTS = {
  '@voiden/sdk/ui': [
    'PluginContext','CorePluginContext','Plugin','SlashCommand','SlashCommandGroup',
    'Tab','EditorAction','StatusBarItem','PluginHelpers',
    'BlockPasteHandler','BlockExtension','PatternHandler',
    // New plugin API types (SDK >=1.0.11)
    'PluginCommand','PluginTopBarItem','PluginContextMenuItem',
    'PluginFS','PluginVault','PluginSettings','PluginSettingsSection',
    'PluginEventCallback','PluginEvents',
  ],
  '@/core/file-system/hooks/useFileSystem': ['prosemirrorToMarkdown'],
  '@/core/editors/voiden/extensions': ['voidenExtensions'],
  '@/core/editors/voiden/VoidenEditor': ['useEditorStore','useVoidenEditorStore','proseClasses'],
  '@/core/editors/voiden/utils/expandLinkedBlocks': ['expandLinkedBlocksInDoc'],
  '@/core/editors/voiden/markdownConverter': ['parseMarkdown'],
  '@/core/request-engine/getRequestFromJson': ['getTable','parseAuthNode','buildHeadersWithCookies','findNode','findNodes','createNewRequestObject','getRequest'],
  '@/core/request-engine/stores/responseStore': ['useResponseStore'],
  '@/core/request-engine/requestOrchestrator': ['requestOrchestrator'],
  '@/core/request-engine/runtimeVariables': ['replaceProcessVariablesInText'],
  '@/core/request-engine/pipeline': ['hookRegistry','PipelineStage'],
  '@/core/history/adapterRegistry': ['historyAdapterRegistry'],
  '@/core/stores/panelStore': ['usePanelStore'],
  '@/core/stores/responsePanelPosition': ['getResponsePanelPosition'],
  '@/core/environment/hooks': ['useActiveEnvironment','useEnvironments'],
  // @/plugins exports — usePluginStore, useEditorEnhancementStore, emitPluginEvent, getContextMenuItems
  '@/plugins': ['useEditorEnhancementStore','usePluginStore','emitPluginEvent','getContextMenuItems'],
  '@/main': ['getQueryClient'],
}

function shimPlugin() {
  return {
    name: 'voiden-shims',
    enforce: 'pre',
    resolveId(id) {
      if (id in STATIC_SHIMS) return { id: \`\\0shim:\${id}\`, syntheticNamedExports: 'default' }
      if (id in CORE_EXPORTS) return \`\\0shim:\${id}\`
      return null
    },
    load(id) {
      if (!id.startsWith('\\0shim:')) return null
      const mod = id.slice('\\0shim:'.length)
      if (mod in STATIC_SHIMS) return STATIC_SHIMS[mod]
      const exports = CORE_EXPORTS[mod] || []
      const key = JSON.stringify(mod)
      const named = exports.map(n => \`export const \${n}=_s.\${n};\`).join('\\n')
      return \`const _s=(window.__voiden_shims__||{})[\${key}]||{};export default _s;\\n\${named}\`
    },
    renderChunk(code) {
      const caps = {}
      if (/registerVoidenExtension/.test(code)) {
        const owns = []
        const re = /\\.create\\(\\s*\\{[^}]*?name:\\s*["']([^"']+)["']/g
        let m
        while ((m = re.exec(code)) !== null) {
          if (!owns.includes(m[1])) owns.push(m[1])
        }
        caps.blocks = owns.length ? { owns } : {}
      }
      if (/addVoidenSlashGroup|addVoidenSlashCommand/.test(code)) caps.slashCommands = {}
      if (/addHook\\b/.test(code)) caps.requestPipeline = {}
      if (/registerContextMenu/.test(code)) caps.contextMenus = {}
      if (/registerTopBarItem/.test(code)) caps.topBar = {}
      if (/registerSidebarTab/.test(code)) caps.sidebar = {}
      if (/registerCommand\\b/.test(code)) caps.commandPalette = {}
      if (/registerHelpCommand/.test(code)) caps.help = {}
      const finalManifest = { ...manifest, capabilities: { ...manifest.capabilities, ...caps } }
      const mfStr = JSON.stringify(finalManifest)
      return {
        code: \`globalThis["__voiden_bundle_version__"]=2;\\nexport const __voiden_bundle_version__=2;\\nexport const __voiden_manifest__=\${mfStr};\\n\${code}\`,
        map: null,
      }
    },
  }
}

await build({
  configFile: false,
  plugins: [
    shimPlugin(),
    { name: 'skip-css', resolveId(id) { if (id.endsWith('.css')) return '\\0empty' }, load(id) { if (id === '\\0empty') return 'export default {}' } },
    { name: 'node-buffer', enforce: 'pre', resolveId(id) { if (id === 'buffer') return '\\0buf' }, load(id) { if (id === '\\0buf') return 'export const Buffer=globalThis.Buffer;export default{Buffer:globalThis.Buffer}' } },
  ],
  esbuild: { jsx: 'automatic' },
  build: {
    lib: { entry, formats: ['es'], fileName: () => \`\${pluginId}.js\` },
    outDir: 'dist',
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    rollupOptions: {
      onwarn(w, warn) { if (w.code === 'MODULE_LEVEL_DIRECTIVE' || w.code === 'UNRESOLVED_IMPORT') return; warn(w) },
      output: { inlineDynamicImports: true },
    },
  },
  logLevel: 'info',
})
`);

// ── build-main.mjs (always generated — skips gracefully if src/main-process.ts absent) ──

write(join(dir, 'build-main.mjs'), `#!/usr/bin/env node
import { build } from 'esbuild'
import { existsSync, readFileSync } from 'fs'

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf8'))
const pluginId = manifest.id
const entry = './src/main-process.ts'

if (!existsSync(entry)) {
  console.log('No main-process.ts found — skipping')
  process.exit(0)
}

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: \`dist/\${pluginId}-main.cjs\`,
  external: [
    'electron',
    'node:*',
    'child_process', 'fs', 'path', 'os', 'http', 'https', 'net', 'crypto',
    'worker_threads', 'stream', 'events', 'util', 'url', 'buffer',
    '@voiden/sdk',
  ],
  minify: true,
})
console.log(\`Built dist/\${pluginId}-main.cjs\`)
`);

// ── build-runner.mjs (only if runner) ────────────────────────────────────────
// Builds src/runner.ts via esbuild into dist/runner.js (CJS, Node.js target).
// This file is published as a GitHub release asset named "runner.js" so that
// `voiden-runner plugin install <id>` can download and use it headlessly.

if (hasRunner) {
  write(join(dir, 'build-runner.mjs'), `#!/usr/bin/env node
import { build } from 'esbuild'
import { existsSync, readFileSync } from 'fs'

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf8'))
const entry = './src/runner.ts'

if (!existsSync(entry)) {
  console.error('No src/runner.ts found — create it before running build:runner')
  process.exit(1)
}

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/runner.js',
  external: [
    // These are provided by voiden-runner at load time — do not bundle them.
    '@voiden/sdk',
    '@voiden/sdk/runner',
    '@voiden/executors',
    'electron',
    'node:*',
    'child_process', 'fs', 'path', 'os', 'http', 'https', 'net',
    'crypto', 'worker_threads', 'stream', 'events', 'util', 'url', 'buffer',
  ],
  minify: true,
})

console.log(\`Built dist/runner.js — publish this as a "runner.js" GitHub release asset.\`)
console.log(\`Users install it with: voiden-runner plugin install \${manifest.id}\`)
`);
}

// ── src/runner.ts (only if runner) ────────────────────────────────────────────

if (hasRunner) {
  const runnerTs = `import type { RunnerFactory } from '@voiden/sdk/runner';

const factory: RunnerFactory = (context) => ({
  onload: async () => {
    // Register the block schema so voiden-runner can parse your blocks in .void files.
    // Mirror the attrs defined in your TipTap Node.create() in src/plugin.ts.
    // context.registerBlockSchema({
    //   name: '${id}',
    //   attrs: { label: { default: '' } },
    // });

    context.onBuildRequest(async (request, blocks) => {
      const block = blocks.find((b) => b.type === '${id}');
      if (!block) return;
      // Modify the request based on block attrs
      return request;
    });

    context.onProcessResponse(async (response, blocks, request) => {
      if (context.verbose) {
        console.log(\`[${id}] \${request.method} \${request.url} → \${response.status}\`);
      }
    });
  },
});

export default factory;
`;
  write(join(dir, 'src', 'runner.ts'), runnerTs);
}

// ── src/plugin.ts ─────────────────────────────────────────────────────────────

const needsCleanup = needsEvents;

const permissionBoilerplate = [
  needsCommandPalette ? `
      // Permission: commandPalette
      context.registerCommand({
        id: '${id}.example-command',
        label: '${name}: Example Command',
        description: 'Replace this with your command description',
        action: () => {
          context.ui.showToast?.('${name} command executed', 'info');
        },
      });` : '',

  needsContextMenus ? `
      // Permission: contextMenus
      context.registerContextMenu({
        id: '${id}.tab-action',
        label: '${name}: Tab Action',
        surface: 'tab',
        action: (tab) => {
          console.log('${name} tab action on', tab);
        },
      });` : '',

  needsEvents ? `
      // Permission: events
      const unsubTab = context.events.on('tab:changed', ({ tabId, title }) => {
        console.log('${name}: tab changed to', title, tabId);
      });
      cleanupFns.push(unsubTab);` : '',

  needsFilesystem ? `
      // Permission: filesystem
      // const content = await context.fs.read('config.json');
      // await context.fs.write('output.txt', 'hello');
      // const entries = await context.fs.list();` : '',

  needsSettings ? `
      // Permission: settings
      // const value = await context.settings.get<string>('my-key');
      // await context.settings.set('my-key', 'value');

      // context.ui.registerSettings({
      //   id: '${id}-settings',
      //   title: '${name} Settings',
      //   fields: [
      //     { type: 'toggle', key: 'enabled', label: 'Enable feature', defaultValue: true },
      //     { type: 'text',   key: 'apiKey',  label: 'API Key', placeholder: 'sk-...' },
      //     { type: 'number', key: 'timeout', label: 'Timeout (ms)', defaultValue: 5000, min: 0 },
      //     { type: 'select', key: 'mode',    label: 'Mode',
      //       options: [{ label: 'Fast', value: 'fast' }, { label: 'Accurate', value: 'accurate' }],
      //       defaultValue: 'fast' },
      //   ],
      // });` : '',
].filter(Boolean).join('\n');

const pluginTs = `import type { CorePluginContext } from '@voiden/sdk/ui';
// import { Node, mergeAttributes } from '@tiptap/core'; // uncomment if using custom blocks
// import React from 'react';                            // uncomment if using sidebar
import manifest from '../manifest.json';

type PluginContext = CorePluginContext;

export default function ${fnName}(context: PluginContext) {
${needsCleanup ? '  const cleanupFns: Array<() => void> = [];' : ''}
  return {
    onload: async () => {

      // ── Custom TipTap block node ──────────────────────────────────────────
      // const MyNode = Node.create({
      //   name: '${id}',
      //   group: 'block',
      //   atom: true,
      //   addAttributes() { return { label: { default: '' } }; },
      //   parseHTML() { return [{ tag: 'div[data-type="${id}"]' }]; },
      //   renderHTML({ HTMLAttributes }) {
      //     return ['div', mergeAttributes(HTMLAttributes, { 'data-type': '${id}' })];
      //   },
      // });
      // context.registerVoidenExtension(MyNode);

      // ── Slash command ─────────────────────────────────────────────────────
      // context.addVoidenSlashGroup({
      //   name: '${id}',
      //   title: '${name}',
      //   commands: [{
      //     name: '${id}',
      //     label: 'Insert ${name}',
      //     slash: '/${id}',
      //     description: 'Insert a ${name} block',
      //     action: (editor) => editor?.chain().focus().insertContent({ type: '${id}' }).run(),
      //   }],
      // });

      // ── Sidebar tab ───────────────────────────────────────────────────────
      // const SidebarView = () => React.createElement('div', { style: { padding: 16 } }, '${name}');
      // context.registerSidebarTab('right', { id: '${id}', title: '${name}', icon: null, component: SidebarView });

      // ── Top bar button ────────────────────────────────────────────────────
      // context.registerTopBarItem({ id: '${id}.topbar', icon: MyIcon, tooltip: '${name}', position: 'right', onClick: () => {} });

      // ── Request pipeline ──────────────────────────────────────────────────
      // Hooks run in order: PreProcessing → RequestCompilation → PreSend → PostProcessing
      //
      // Stage 1 — PreProcessing  { editor, requestState, cancel }
      //   Validate or cancel before the request is built. editor is available here.
      // context.pipeline.addHook(PipelineStage.PreProcessing, ({ editor, requestState, cancel }) => {
      //   if (!requestState.url) cancel(); // abort if no URL
      // });
      //
      // Stage 2 — RequestCompilation  { editor, requestState, addHeader, addQueryParam }
      //   Compile editor content into the request. editor is available here.
      //   addHeader / addQueryParam are convenience helpers that push into requestState.
      // context.pipeline.addHook(PipelineStage.RequestCompilation, ({ editor, requestState, addHeader, addQueryParam }) => {
      //   addHeader('X-Plugin-Id', '${id}');
      //   addQueryParam('source', '${id}');
      // });
      //
      // Stage 3 — PreSend  { requestState, metadata }
      //   Last chance to modify the request before it is sent. No editor here.
      // context.pipeline.addHook(PipelineStage.PreSend, ({ requestState, metadata }) => {
      //   metadata.sentAt = Date.now();
      //   requestState.headers.push({ key: 'X-Sent-By', value: '${id}', enabled: true });
      // });
      //
      // Stage 4 — PostProcessing  { requestState, responseState, metadata }
      //   Inspect or transform the response after it is received. No editor here.
      // context.pipeline.addHook(PipelineStage.PostProcessing, ({ requestState, responseState, metadata }) => {
      //   const duration = Date.now() - (metadata.sentAt ?? 0);
      //   console.log(\`[${id}] \${requestState.method} → \${responseState.status} (\${duration}ms)\`);
      // });
${permissionBoilerplate}
    },

    onunload: async () => {
      ${needsCleanup ? 'cleanupFns.forEach((fn) => fn());' : ''}
    },

    metadata: manifest,
  };
}
`.replace(/\n{3,}/g, '\n\n');

write(join(dir, 'src', 'plugin.ts'), pluginTs);

// ── src/main-process.ts (only if mainProcess) ─────────────────────────────────

if (hasMainProcess) {
  write(join(dir, 'src', 'main-process.ts'), `import { ipcMain } from 'electron';

/**
 * Main-process entry for ${name}.
 * Register IPC handlers here. This file is bundled separately via build-main.mjs.
 */
export function register() {
  ipcMain.handle('${id}:example', async (_event, payload: any) => {
    return { ok: true, payload };
  });
}
`);
}

// ── src/skill.md ──────────────────────────────────────────────────────────────

const skillLines = [`# ${name}`, ``, description, ``];
if (permissions.length > 0) skillLines.push(`- Permissions: ${permissions.join(', ')}`);
skillLines.push(`- See src/plugin.ts for registered capabilities`);
write(join(dir, 'src', 'skill.md'), skillLines.join('\n') + '\n');

// ─── Done ─────────────────────────────────────────────────────────────────────

const permissionNote = permissions.length > 0
  ? `\n  Permissions declared: ${permissions.join(', ')}`
  : '';

console.log(`
  Plugin scaffolded at ${outDir}/${permissionNote}

  Files created:
    manifest.json        changelog.json
    package.json         tsconfig.json
    build.mjs            zip.mjs
    generate-manifest.mjs${hasMainProcess ? '\n    build-main.mjs' : ''}${hasRunner ? '\n    build-runner.mjs' : ''}
    .gitignore
    src/plugin.ts${hasMainProcess ? '\n    src/main-process.ts' : ''}${hasRunner ? '\n    src/runner.ts' : ''}
    src/skill.md

  Next steps:
    cd ${outDir}
    npm install
    npm run build       # build the renderer bundle
    npm run zip         # package to dist/${id}.zip${hasRunner ? `
    npm run build:runner  # build dist/runner.js for voiden-runner CLI

  Runner (headless):
    Publish dist/runner.js as a GitHub release asset named "runner.js"
    Users install it with: voiden-runner plugin install ${id}` : ''}

  Install in Voiden:
    Extensions → ⋯ → Install from file → dist/${id}.zip
`);
