/**
 * Stages a loadable extension directory and creates a distributable zip.
 *
 * Usage:
 *   node scripts/package.cjs chrome    → dist/chrome/ + dist/rootwise-chrome.zip
 *   node scripts/package.cjs firefox   → dist/firefox/ + dist/rootwise-firefox.zip
 *   node scripts/package.cjs           → both
 *
 * Firefox dev loading: about:debugging → Load Temporary Add-on
 *   → navigate to dist/firefox/ → select manifest.json
 */

const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Source dirs/files (relative to ROOT) included in every package
const SHARED_DIRS = ['src/markup', 'src/styles', 'src/img', 'dist/scripts'];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function stage(browser) {
  const isFirefox = browser === 'firefox';
  const manifestSrc = isFirefox
    ? path.join(ROOT, 'manifest.firefox.json')
    : path.join(ROOT, 'manifest.json');
  const stageDir = path.join(ROOT, 'dist', browser);

  // Clear and recreate stage directory
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  // Write manifest as manifest.json
  fs.copyFileSync(manifestSrc, path.join(stageDir, 'manifest.json'));

  // Copy shared directories preserving relative structure
  for (const dir of SHARED_DIRS) {
    const fullSrc = path.join(ROOT, dir);
    if (fs.existsSync(fullSrc)) {
      copyDir(fullSrc, path.join(stageDir, dir));
    }
  }

  console.log(`[${browser}] staged → dist/${browser}/`);
}

async function zip(browser) {
  const stageDir = path.join(ROOT, 'dist', browser);
  const outFile = path.join(ROOT, 'dist', `rootwise-${browser}.zip`);

  const output = fs.createWriteStream(outFile);
  const archive = archiver('zip', { zlib: { level: 9 } });

  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(stageDir, false);
    archive.finalize();
  });

  const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`[${browser}] zipped  → dist/rootwise-${browser}.zip (${kb} KB)`);
}

async function main() {
  const target = process.argv[2];
  const browsers = target ? [target] : ['chrome', 'firefox'];

  for (const b of browsers) {
    if (!['chrome', 'firefox'].includes(b)) {
      console.error(`Unknown browser: ${b}. Use 'chrome' or 'firefox'.`);
      process.exit(1);
    }
    await stage(b);
    await zip(b);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
