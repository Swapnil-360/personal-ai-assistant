const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const binary = fs.existsSync(chromePath) ? chromePath : edgePath;
console.log('Using browser binary:', binary);

function buildPdfAndPng(htmlFileName, pdfFileName, pngFileName) {
  const htmlPath = path.resolve(__dirname, htmlFileName);
  const pdfPath = path.resolve(__dirname, pdfFileName);
  const pngPath = path.resolve(__dirname, pngFileName);
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');

  console.log(`\n========================================`);
  console.log(`Building: ${htmlFileName} -> ${pdfFileName} & ${pngFileName}`);
  console.log(`========================================`);

  // 1. Generate PDF
  const pdfArgs = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    '--run-all-compositor-stages-before-draw',
    `--print-to-pdf=${pdfPath}`,
    fileUrl
  ];

  const pdfResult = spawnSync(binary, pdfArgs, { encoding: 'utf-8', timeout: 15000 });
  if (fs.existsSync(pdfPath)) {
    const stats = fs.statSync(pdfPath);
    console.log(`✅ SUCCESS! Generated ${pdfPath} (${stats.size} bytes)`);
  } else {
    console.error(`❌ Failed to generate PDF: ${pdfPath}`);
  }

  // 2. Generate PNG Screenshot (2x Retina scale)
  const pngArgs = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=1200,3400',
    `--screenshot=${pngPath}`,
    fileUrl
  ];

  const pngResult = spawnSync(binary, pngArgs, { encoding: 'utf-8', timeout: 15000 });
  if (fs.existsSync(pngPath)) {
    const stats = fs.statSync(pngPath);
    console.log(`✅ SUCCESS! Generated ${pngPath} (${stats.size} bytes)`);
  } else {
    console.error(`❌ Failed to generate PNG: ${pngPath}`);
  }

  // 3. Copy to Ironmanthemeportfolio
  const portfolioDest = path.join('D:\\Projects\\Ironmanthemeportfolio\\public', pdfFileName);
  try {
    if (fs.existsSync(pdfPath)) {
      fs.copyFileSync(pdfPath, portfolioDest);
      console.log(`✅ SUCCESS! Copied ${pdfFileName} to portfolio: ${portfolioDest}`);
    }
  } catch (err) {
    console.warn(`Portfolio copy notice for ${pdfFileName}:`, err.message);
  }
}

// 1. Compile Color Version
buildPdfAndPng('resume.html', 'resume.pdf', 'resume.png');

// 2. Compile Black & White Version
buildPdfAndPng('resume_bw.html', 'resume_bw.pdf', 'resume_bw.png');
