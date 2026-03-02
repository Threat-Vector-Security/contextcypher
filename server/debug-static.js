// Debug script to check static file serving
const path = require('path');
const fs = require('fs');

console.log('=== Static File Debug ===');
console.log('__dirname:', __dirname);
console.log('process.env.FRONTEND_PATH:', process.env.FRONTEND_PATH);

const possibleStaticPaths = [
  path.join(__dirname, '..', 'dist'),        // NPM package structure
  path.join(__dirname, '..', 'frontend'),    // MSI/enterprise structure
  path.join(__dirname, '..', 'build'),       // Development structure
  process.env.FRONTEND_PATH                   // Custom path via environment variable
].filter(Boolean);

console.log('\nChecking possible static paths:');
possibleStaticPaths.forEach((p, i) => {
  console.log(`${i + 1}. ${p}`);
  if (fs.existsSync(p)) {
    console.log('   ✓ EXISTS');
    const indexPath = path.join(p, 'index.html');
    if (fs.existsSync(indexPath)) {
      console.log('   ✓ Has index.html');
      const stats = fs.statSync(indexPath);
      console.log(`   - Size: ${stats.size} bytes`);
      console.log(`   - Modified: ${stats.mtime}`);
    } else {
      console.log('   ✗ No index.html');
    }
    
    // List first few files
    const files = fs.readdirSync(p).slice(0, 5);
    console.log('   - Files:', files.join(', '), files.length > 5 ? '...' : '');
  } else {
    console.log('   ✗ DOES NOT EXIST');
  }
});

// Test which path would be selected
let staticPath = null;
for (const possiblePath of possibleStaticPaths) {
  if (fs.existsSync(possiblePath)) {
    staticPath = possiblePath;
    break;
  }
}

console.log('\nSelected static path:', staticPath || 'NONE');

if (staticPath) {
  const indexPath = path.join(staticPath, 'index.html');
  console.log('Full index.html path:', indexPath);
  console.log('Index.html exists:', fs.existsSync(indexPath));
}