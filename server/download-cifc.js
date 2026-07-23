import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DOCX_PATH = path.join(ROOT, 'CIFC_Document_Links.docx');
const OUTPUT_ROOT = path.join(ROOT, 'data', 'extracted', 'CIFC');
const MANIFEST_PATH = path.join(ROOT, 'data', 'cifc-manifest.json');

const CATEGORY_DIRS = {
  AR: path.join(OUTPUT_ROOT, 'AR'),
  PPT: path.join(OUTPUT_ROOT, 'PPT'),
  Transcripts: path.join(OUTPUT_ROOT, 'Transcripts'),
};

function extractPdfUrlsFromDocx(docxPath) {
  if (!fs.existsSync(docxPath)) {
    throw new Error(`Missing ${docxPath}`);
  }

  const xml = execSync(`unzip -p "${docxPath}" word/document.xml`, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });

  const urls = [...xml.matchAll(/https:\/\/files\.cholamandalam\.com\/[^"'<>\s]+\.pdf/gi)]
    .map((match) => match[0].replace(/&amp;/g, '&'));

  return [...new Set(urls)];
}

function categorizeUrl(url) {
  const lower = url.toLowerCase();

  if (
    lower.includes('annual_report') ||
    lower.includes('annual-report') ||
    lower.includes('chola_annual_reports')
  ) {
    return 'AR';
  }

  if (lower.includes('investor_presentation') || lower.includes('presentation')) {
    return 'PPT';
  }

  if (lower.includes('transcript') || lower.includes('earnings_call')) {
    return 'Transcripts';
  }

  return 'Transcripts';
}

function buildFilename(url, category, index) {
  const base = path.basename(new URL(url).pathname, '.pdf');
  const safeBase = base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return `CIFC_${category}_${String(index).padStart(2, '0')}_${safeBase}.pdf`;
}

async function downloadPdf(url, destPath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CIFC-Knowledge-Bot/1.0)',
      Accept: 'application/pdf,*/*',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length < 1024) {
    throw new Error(`File too small (${buffer.length} bytes)`);
  }

  if (!contentType.includes('pdf') && !buffer.slice(0, 4).toString().startsWith('%PDF')) {
    throw new Error(`Not a PDF (${contentType || 'unknown content type'})`);
  }

  fs.writeFileSync(destPath, buffer);
  return buffer.length;
}

async function downloadAll() {
  console.log('Reading CIFC document links from docx...\n');
  const urls = extractPdfUrlsFromDocx(DOCX_PATH);
  console.log(`Found ${urls.length} PDF URLs\n`);

  for (const dir of Object.values(CATEGORY_DIRS)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const manifest = {
    downloadedAt: new Date().toISOString(),
    sourceDocx: path.basename(DOCX_PATH),
    documents: [],
    failed: [],
  };

  let index = 1;
  for (const url of urls) {
    const category = categorizeUrl(url);
    const filename = buildFilename(url, category, index);
    const destPath = path.join(CATEGORY_DIRS[category], filename);

    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1024) {
      console.log(`Skip (exists): ${filename}`);
      manifest.documents.push({
        url,
        category,
        filename,
        path: destPath,
        bytes: fs.statSync(destPath).size,
        status: 'cached',
      });
      index += 1;
      continue;
    }

    process.stdout.write(`Downloading [${category}] ${filename}... `);
    try {
      const bytes = await downloadPdf(url, destPath);
      console.log(`OK (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
      manifest.documents.push({
        url,
        category,
        filename,
        path: destPath,
        bytes,
        status: 'downloaded',
      });
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      manifest.failed.push({ url, category, filename, error: err.message });
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    }

    index += 1;
  }

  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log('\nDownload summary');
  console.log(`  Success: ${manifest.documents.length}`);
  console.log(`  Failed:  ${manifest.failed.length}`);
  console.log(`  Manifest: ${MANIFEST_PATH}`);

  if (manifest.failed.length > 0) {
    process.exitCode = 1;
  }
}

downloadAll().catch((err) => {
  console.error('CIFC download failed:', err);
  process.exit(1);
});
