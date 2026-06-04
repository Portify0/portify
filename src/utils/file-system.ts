import * as fs from "fs-extra";
import * as path from "path";
import * as logger from "../logger.js";

interface WriteResult {
  backupCreated?: string;
  bytesWritten: number;
  fileCreated: boolean;
  fileModified: boolean;
}

/**
 * Writes a file with optional automated backup if the file already exists.
 * @param filePath The absolute or relative path to the file.
 * @param content The string content to write.
 * @param backup Whether to create a backup.
 * @param dryRun Whether to perform a dry run (no actual writes).
 */
export function writeWithBackup(
  filePath: string,
  content: string,
  backup: boolean = false,
  dryRun: boolean = false
): WriteResult {
  const resolvedPath = path.resolve(filePath);
  const fileExists = fs.existsSync(resolvedPath);
  let backupCreated: string | undefined;

  let fileModified = false;
  let fileCreated = false;

  if (fileExists) {
    const existingContent = fs.readFileSync(resolvedPath, "utf-8");
    if (existingContent === content) {
      // Content is identical: no-op (idempotency!)
      return {
        bytesWritten: 0,
        fileCreated: false,
        fileModified: false
      };
    }
    fileModified = true;
  } else {
    fileCreated = true;
  }

  if (!dryRun) {
    // 1. Create backup if file exists and backup option is true
    if (fileExists && backup) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const dir = path.dirname(resolvedPath);
      const ext = path.extname(resolvedPath);
      const base = path.basename(resolvedPath, ext);
      backupCreated = path.join(dir, `${base}.portify-backup-${timestamp}${ext}`);
      
      fs.copySync(resolvedPath, backupCreated);
      logger.dim(`Created backup of existing file at: ${backupCreated}`);
    }

    // 2. Ensure parent directory exists
    fs.ensureDirSync(path.dirname(resolvedPath));

    // 3. Write content
    fs.writeFileSync(resolvedPath, content, "utf-8");
  }

  return {
    backupCreated,
    bytesWritten: Buffer.byteLength(content, "utf-8"),
    fileCreated,
    fileModified
  };
}
