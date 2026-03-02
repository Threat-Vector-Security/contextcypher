// Quick fix to add missing utils files to server_dist
const fs = require('fs');
const path = require('path');

console.log('=== FIXING MISSING UTILS ===');
console.log('This script copies missing utils files that were added after build-bytenode.js ran');

const serverRoot = __dirname;
const buildRoot = path.join(serverRoot, '..', 'server_dist');

// Check if server_dist exists
if (!fs.existsSync(buildRoot)) {
  console.error('ERROR: server_dist directory not found! Run build-bytenode.js first.');
  process.exit(1);
}

const missingUtils = [
  'riskMatrix.js',
  'cypherConverter.js', 
  'streamUtils.js'
];

const utilsSrc = path.join(serverRoot, 'utils');
const utilsDst = path.join(buildRoot, 'utils');

// Ensure utils directory exists
if (!fs.existsSync(utilsDst)) {
  fs.mkdirSync(utilsDst, { recursive: true });
}

// Copy missing files
let fixed = 0;
for (const file of missingUtils) {
  const src = path.join(utilsSrc, file);
  const dst = path.join(utilsDst, file);
  
  if (!fs.existsSync(src)) {
    console.error(`WARNING: Source file ${file} not found in server/utils/`);
    continue;
  }
  
  if (fs.existsSync(dst)) {
    console.log(`SKIP: ${file} already exists in server_dist/utils/`);
    continue;
  }
  
  // For now, just copy the plain JS files
  // In production, these should be compiled to bytecode
  console.log(`COPY: ${file} -> server_dist/utils/`);
  fs.copyFileSync(src, dst);
  fixed++;
}

if (fixed > 0) {
  console.log(`\n✅ Fixed ${fixed} missing utils files`);
  console.log('NOTE: These files are NOT bytecode compiled for security.');
  console.log('Run build-bytenode.js again for full bytecode compilation.');
} else {
  console.log('\n✅ No missing files to fix');
}

console.log('=========================\n');