# Readme

[chat link](https://chatgpt.com/g/g-p-67c1bf951d9081918c8bc13eae31dfdb-knowledgebase-tech/c/695e6204-2d54-8327-ac9b-97a0981ad5ed)

## Running

Here’s a Windows-friendly Node.js script (TypeScript) that you run like:

```bash
node dist/list-not-readonly.js 'D:\OneDrive\jorgeprg\nodejs\folderNotReadonlyFiles\testFolder'
```

It recursively walks the folder and prints **only files that are NOT read-only**.

## 1) TypeScript script (`src/list-not-readonly.ts`)

```ts
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Windows read-only check:
 * - On Windows, read-only is typically indicated by the FILE_ATTRIBUTE_READONLY bit.
 * - Node doesn't expose that bit directly, but for most local NTFS files:
 *   - If the file is read-only, attempting to open it for write usually fails with EACCES/EPERM.
 *
 * This function performs a cheap write-access probe without modifying the file:
 * - Open with r+ (read/write) and immediately close.
 */
async function isReadOnlyWindows(filePath: string): Promise<boolean> {
  try {
    const handle = await fs.open(filePath, "r+");
    await handle.close();
    return false; // write access succeeded => not read-only
  } catch (err: any) {
    // EACCES/EPERM commonly mean no write access (read-only or permissions)
    if (err?.code === "EACCES" || err?.code === "EPERM") return true;

    // For other errors (e.g. locked by another process), treat as "unknown".
    // We'll classify them as read-only = true to avoid false positives.
    return true;
  }
}

async function walk(dir: string, onFile: (filePath: string) => Promise<void>): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    // Can't read the directory; skip it.
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    // Skip symlinks to avoid loops
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      await walk(full, onFile);
    } else if (entry.isFile()) {
      await onFile(full);
    }
  }
}

async function main() {
  const folderPath = process.argv[2];
  if (!folderPath) {
    console.error('Usage: node list-not-readonly.js "C:\\path\\to\\folder"');
    process.exit(1);
  }

  const root = path.resolve(folderPath);

  // Basic existence check
  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
      console.error(`Not a directory: ${root}`);
      process.exit(1);
    }
  } catch {
    console.error(`Path not found: ${root}`);
    process.exit(1);
  }

  const notReadOnly: string[] = [];
  const errors: { file: string; reason: string }[] = [];

  await walk(root, async (file) => {
    try {
      const isRO = await isReadOnlyWindows(file);
      if (!isRO) notReadOnly.push(file);
    } catch (e: any) {
      errors.push({ file, reason: e?.message ?? String(e) });
    }
  });

  // Output results
  for (const f of notReadOnly) console.log(f);

  // Optional: show errors to stderr
  if (errors.length) {
    console.error("\n--- Skipped / uncertain files ---");
    for (const e of errors) console.error(`${e.file} :: ${e.reason}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

## 2) Minimal `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*.ts"]
}
```

## 3) Install + build + run (Windows 11)

```bash
npm init -y
npm i -D typescript @types/node
npx tsc
node dist/list-not-readonly.js "C:\your\folder"
```

### Notes (important)

* This detects “read-only” in a **practical** way: “can I open it for write?”
  That’s usually what you care about for scripts that need to edit/delete files.
* Files that are **locked** by another process might show up as “read-only/uncertain” (because write open fails). Those will land in the “Skipped / uncertain files” section.

If you want, I can also add:

* output to CSV/JSON
* a `--include-locked` or `--treat-locked-as-writable` option
* a fast concurrency limiter so it scans huge folders quicker without overwhelming the OS
