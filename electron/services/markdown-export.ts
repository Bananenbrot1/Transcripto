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

export function saveMarkdown(folderPath: string, filename: string, content: string): SaveResult {
  try {
    const resolved = path.resolve(folderPath);
    if (!path.isAbsolute(resolved) || resolved !== path.normalize(resolved)) {
      return { success: false, error: 'Invalid folder path' };
    }

    const safeName = sanitizeFilename(filename);
    if (!safeName) {
      return { success: false, error: 'Invalid filename' };
    }

    fs.mkdirSync(resolved, { recursive: true });

    const filePath = path.join(resolved, `${safeName}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');

    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
