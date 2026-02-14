const fs = require('node:fs');
const path = require('node:path');

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').trim();
}

function saveMarkdown(folderPath, filename, content) {
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
    return { success: false, error: err.message };
  }
}

module.exports = { saveMarkdown };
