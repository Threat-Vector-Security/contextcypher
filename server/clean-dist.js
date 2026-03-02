// Script to clean server_dist before Tauri packaging
// Removes unnecessary files that cause path length issues in NSIS installer

const fs = require('fs');
const path = require('path');

function deleteDeep(dir, patterns) {
  if (!fs.existsSync(dir)) return;
  
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Check if this directory should be deleted entirely
      if (patterns.dirs.includes(entry)) {
        console.log(`Removing directory: ${fullPath}`);
        rmrf(fullPath);
      } else {
        // Recurse into directory
        deleteDeep(fullPath, patterns);
      }
    } else {
      // Check if this file should be deleted
      if (patterns.files.some(pattern => entry.match(pattern))) {
        console.log(`Removing file: ${fullPath}`);
        fs.unlinkSync(fullPath);
      }
    }
  }
}

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  for (const entry of fs.readdirSync(p)) {
    const full = path.join(p, entry);
    const stat = fs.lstatSync(full);
    if (stat.isDirectory()) rmrf(full); 
    else fs.unlinkSync(full);
  }
  fs.rmdirSync(p);
}

// Clean patterns
const cleanPatterns = {
  dirs: [
    // TypeScript typings and definitions (not needed at runtime)
    'typings',
    '@types',
    '.git',
    '.github',
    'test',
    'tests',
    '__tests__',
    'spec',
    'docs',
    'example',
    'examples',
    '.vscode',
    '.idea',
    'coverage',
    '.nyc_output'
  ],
  files: [
    // TypeScript files
    /\.d\.ts$/,
    /\.ts$/,
    /\.tsx$/,
    // Map files
    /\.map$/,
    // Markdown and documentation
    /\.md$/i,
    /readme/i,
    /changelog/i,
    /license/i,
    /contributing/i,
    // Config files not needed at runtime
    /\.eslintrc/,
    /\.prettierrc/,
    /\.gitignore$/,
    /\.npmignore$/,
    /tsconfig\.json$/,
    /jest\.config/,
    /\.babelrc/,
    /webpack\.config/,
    // Other unnecessary files
    /\.yml$/,
    /\.yaml$/,
    /Makefile$/,
    /\.editorconfig$/
  ]
};

const serverDistPath = path.join(__dirname, '..', 'server_dist');
const nodeModulesPath = path.join(serverDistPath, 'node_modules');

console.log('[clean-dist] Starting cleanup of server_dist...');

// Special handling for node_modules
if (fs.existsSync(nodeModulesPath)) {
  console.log('[clean-dist] Cleaning node_modules...');
  
  // Clean inside each package in node_modules
  const packages = fs.readdirSync(nodeModulesPath);
  for (const pkg of packages) {
    const pkgPath = path.join(nodeModulesPath, pkg);
    if (fs.statSync(pkgPath).isDirectory()) {
      // Skip essential runtime packages
      if (['bytenode'].includes(pkg)) {
        console.log(`[clean-dist] Keeping essential package: ${pkg}`);
        continue;
      }
      
      // For scoped packages like @babel, @types, etc
      if (pkg.startsWith('@')) {
        const scopedPackages = fs.readdirSync(pkgPath);
        for (const scopedPkg of scopedPackages) {
          const scopedPkgPath = path.join(pkgPath, scopedPkg);
          if (fs.statSync(scopedPkgPath).isDirectory()) {
            deleteDeep(scopedPkgPath, cleanPatterns);
          }
        }
      } else {
        deleteDeep(pkgPath, cleanPatterns);
      }
    }
  }
  
  // Remove packages that are dev-only
  const devOnlyPackages = [
    'javascript-obfuscator', // This is what's causing the issue
    'typescript',
    'eslint',
    'prettier',
    'jest',
    '@types',
    'webpack',
    'babel-core',
    '@babel'
  ];
  
  for (const pkg of devOnlyPackages) {
    const pkgPath = path.join(nodeModulesPath, pkg);
    if (fs.existsSync(pkgPath)) {
      console.log(`[clean-dist] Removing dev-only package: ${pkg}`);
      rmrf(pkgPath);
    }
  }
}

// Clean the rest of server_dist
deleteDeep(serverDistPath, cleanPatterns);

// Count remaining files
let fileCount = 0;
function countFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      countFiles(fullPath);
    } else {
      fileCount++;
    }
  }
}

countFiles(serverDistPath);
console.log(`[clean-dist] Cleanup complete. ${fileCount} files remaining.`);