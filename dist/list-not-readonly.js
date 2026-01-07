"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
/**
 * Windows read-only check:
 * - On Windows, read-only is typically indicated by the FILE_ATTRIBUTE_READONLY bit.
 * - Node doesn't expose that bit directly, but for most local NTFS files:
 *   - If the file is read-only, attempting to open it for write usually fails with EACCES/EPERM.
 *
 * This function performs a cheap write-access probe without modifying the file:
 * - Open with r+ (read/write) and immediately close.
 */
async function isReadOnlyWindows(filePath) {
    try {
        const handle = await fs.open(filePath, "r+");
        await handle.close();
        return false; // write access succeeded => not read-only
    }
    catch (err) {
        // EACCES/EPERM commonly mean no write access (read-only or permissions)
        if (err?.code === "EACCES" || err?.code === "EPERM")
            return true;
        // For other errors (e.g. locked by another process), treat as "unknown".
        // We'll classify them as read-only = true to avoid false positives.
        return true;
    }
}
async function walk(dir, onFile) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    }
    catch {
        // Can't read the directory; skip it.
        return;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        // Skip symlinks to avoid loops
        if (entry.isSymbolicLink())
            continue;
        if (entry.isDirectory()) {
            await walk(full, onFile);
        }
        else if (entry.isFile()) {
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
    }
    catch {
        console.error(`Path not found: ${root}`);
        process.exit(1);
    }
    const notReadOnly = [];
    const errors = [];
    await walk(root, async (file) => {
        try {
            const isRO = await isReadOnlyWindows(file);
            if (!isRO)
                notReadOnly.push(file);
        }
        catch (e) {
            errors.push({ file, reason: e?.message ?? String(e) });
        }
    });
    // Output results
    for (const f of notReadOnly)
        console.log(f);
    // Optional: show errors to stderr
    if (errors.length) {
        console.error("\n--- Skipped / uncertain files ---");
        for (const e of errors)
            console.error(`${e.file} :: ${e.reason}`);
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
