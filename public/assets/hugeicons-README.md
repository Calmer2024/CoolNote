# CoolNote icons

UI icons use the Stroke Rounded SVG data from `@hugeicons/core-free-icons@4.3.5`.
The MIT license is included in `hugeicons-LICENSE.md`.

`scripts/hugeicons-map.json` records the original Hugeicons export for every
existing CoolNote icon name, so saved category and task-list icons keep working.
The generator creates `src/shared/components/hugeicons.generated.json`; `Icon`
renders those shapes directly as inline SVG. Heading masks are embedded as data
URLs in `hugeicons-headings.generated.css`. Neither needs a separate SVG request.
The local sprite and standalone SVGs are retained as catalog and design assets.

To regenerate, install the pinned package in a temporary directory, then run:

```powershell
npm install --prefix "$env:TEMP/coolnote-hugeicons" --no-save --no-package-lock @hugeicons/core-free-icons@4.3.5
node scripts/generate-hugeicons.mjs "$env:TEMP/coolnote-hugeicons/node_modules/@hugeicons/core-free-icons"
npm run check:icons
```

Normal builds use the checked-in geometry and need no additional package or
network requests for icons. The older Lucide sprite is a historical asset.
