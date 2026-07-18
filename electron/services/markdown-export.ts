import * as fs from 'node:fs';
import * as path from 'node:path';

interface SaveResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').trim();
}

export function saveTextFile(
  folderPath: string,
  filename: string,
  content: string,
  extension: string = 'md',
): SaveResult {
  try {
    const resolved = path.resolve(folderPath);
    if (!path.isAbsolute(resolved) || resolved !== path.normalize(resolved)) {
      return { success: false, error: 'Invalid folder path' };
    }

    const safeName = sanitizeFilename(filename);
    if (!safeName) {
      return { success: false, error: 'Invalid filename' };
    }

    const safeExt = sanitizeFilename(extension.replace(/^\./, '')) || 'md';

    fs.mkdirSync(resolved, { recursive: true });

    const filePath = path.join(resolved, `${safeName}.${safeExt}`);

    // Guard against path traversal: the resolved file path must stay inside
    // the user-chosen folder, even after joining with the sanitized name.
    if (!filePath.startsWith(resolved + path.sep) && filePath !== resolved) {
      return { success: false, error: 'File path escapes the target folder' };
    }

    fs.writeFileSync(filePath, content, 'utf-8');

    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export function saveMarkdown(folderPath: string, filename: string, content: string): SaveResult {
  return saveTextFile(folderPath, filename, content, 'md');
}
