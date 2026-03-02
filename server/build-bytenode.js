// Build script to compile backend JS into V8 bytecode (.jsc) using bytenode
// Generates server_dist with minimal JS loaders

const path = require('path');
const fs = require('fs');

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  try {
    for (const entry of fs.readdirSync(p)) {
      const full = path.join(p, entry);
      try {
        const stat = fs.lstatSync(full);
        if (stat.isDirectory()) {
          rmrf(full);
        } else {
          fs.unlinkSync(full);
        }
      } catch (err) {
        // If permission denied, try to change permissions and retry
        if (err.code === 'EPERM' || err.code === 'EACCES') {
          try {
            fs.chmodSync(full, 0o777);
            const stat = fs.lstatSync(full);
            if (stat.isDirectory()) {
              rmrf(full);
            } else {
              fs.unlinkSync(full);
            }
          } catch (retryErr) {
            console.warn(`Warning: Could not remove ${full}: ${retryErr.message}`);
          }
        } else {
          throw err;
        }
      }
    }
    fs.rmdirSync(p);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'ENOTEMPTY') {
      console.warn(`Warning: Could not remove directory ${p}: ${err.message}`);
      // On Windows, sometimes we need to retry after a short delay
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        try {
          execSync(`rd /s /q "${p}" 2>nul`, { stdio: 'ignore' });
        } catch (cmdErr) {
          console.warn(`Warning: Windows rd command also failed for ${p}`);
        }
      }
    } else {
      throw err;
    }
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function build() {
  const bytenode = require('bytenode');
  const serverRoot = __dirname;
  const outDir = path.join(serverRoot, '..', 'server_dist');

  // Clean output dir
  rmrf(outDir);
  ensureDir(outDir);

  // Files and folders to include
  // Files that MUST remain plain JavaScript (not compiled)
  const excludeFromCompilation = [
    'force-production.js',    // Bootstrap entry point
    'logger.js',              // For debugging production issues
    'logger-production.js',   // For debugging production issues
    'modelResponseProcessors.js', // Dynamic function resolution incompatible with bytecode
    // Build and dev scripts that should not be in production
    'build-bytenode.js',      // This build script itself
    'clean-dist.js',          // Build utility
    'fix-missing-utils.js',   // Build utility
    'diagnostic.js',          // Development diagnostic tool
    'test-startup.js',        // Development test script
    'check-ollama-model.js'   // Development utility
  ];
  
  // Directories to process
  const includeDirs = [
    'services',
    'utils',
    'config',
    'routes',  // Include routes directory
    'data',    // Include data directory for any JS files there
    'types'    // Include types directory
  ];

  // Copy non-JS assets and node_modules runtime deps
  function copyRecursive(src, dst, skipErrors = false) {
    ensureDir(dst);
    for (const entry of fs.readdirSync(src)) {
      const s = path.join(src, entry);
      const d = path.join(dst, entry);
      try {
        const stat = fs.lstatSync(s);
        if (stat.isDirectory()) {
          copyRecursive(s, d, skipErrors);
        } else if (stat.isSymbolicLink()) {
          // Skip symbolic links in node_modules/.bin
          if (skipErrors || s.includes('node_modules\\.bin') || s.includes('node_modules/.bin')) {
            console.log(`[bytenode] Skipping symlink: ${s}`);
            continue;
          }
          // For other symlinks, try to copy the target
          try {
            const target = fs.readlinkSync(s);
            const resolvedTarget = path.resolve(path.dirname(s), target);
            if (fs.existsSync(resolvedTarget)) {
              fs.copyFileSync(resolvedTarget, d);
            }
          } catch (linkErr) {
            console.warn(`[bytenode] Warning: Could not resolve symlink ${s}: ${linkErr.message}`);
          }
        } else {
          // Copy as-is; JS will be compiled below when needed
          fs.copyFileSync(s, d);
        }
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'EACCES') {
          if (skipErrors || s.includes('node_modules\\.bin') || s.includes('node_modules/.bin')) {
            console.warn(`[bytenode] Warning: Skipping ${s} due to permission error`);
            continue;
          }
          throw err;
        } else {
          throw err;
        }
      }
    }
  }

  // Copy template of server to outDir first
  for (const dir of includeDirs) {
    const src = path.join(serverRoot, dir);
    if (fs.existsSync(src)) {
      copyRecursive(src, path.join(outDir, dir));
    }
  }

  // Dev/build scripts that should not be included in production at all
  const excludeFromProduction = [
    'build-bytenode.js',
    'clean-dist.js',
    'fix-missing-utils.js',
    'diagnostic.js',
    'test-startup.js',
    'check-ollama-model.js'
  ];

  // Copy and process all root-level JS files
  const rootFiles = fs.readdirSync(serverRoot).filter(f => f.endsWith('.js'));
  for (const file of rootFiles) {
    // Skip dev/build scripts entirely
    if (excludeFromProduction.includes(file)) {
      console.log(`[bytenode] Skipped dev/build script: ${file}`);
      continue;
    }
    
    const src = path.join(serverRoot, file);
    const dst = path.join(outDir, file);
    
    if (excludeFromCompilation.includes(file)) {
      // Copy as plain JS
      fs.copyFileSync(src, dst);
      console.log(`[bytenode] Kept plain: ${file}`);
    } else {
      // Compile to bytecode
      try {
        const base = path.basename(file, '.js');
        const jscOut = path.join(outDir, `${base}.jsc`);
        await bytenode.compileFile({ filename: src, output: jscOut });
        fs.writeFileSync(dst, `require('bytenode');module.exports = require('./${base}.jsc');`, 'utf8');
        console.log(`[bytenode] Compiled: ${file}`);
      } catch (error) {
        console.warn(`[bytenode] Failed to compile ${file}, copying as plain JS:`, error.message);
        fs.copyFileSync(src, dst);
      }
    }
  }

  // Compile ALL JS files in directories (with error handling)
  async function compileDir(dirRel) {
    const dir = path.join(serverRoot, dirRel);
    const outBase = path.join(outDir, dirRel);
    if (!fs.existsSync(dir)) return;
    
    for (const entry of fs.readdirSync(dir)) {
      const s = path.join(dir, entry);
      const dLoader = path.join(outBase, entry);
      const stat = fs.lstatSync(s);
      
      if (stat.isDirectory()) {
        await compileDir(path.join(dirRel, entry));
      } else if (entry.endsWith('.js')) {
        const fullPath = path.join(dirRel, entry);
        
        // Check if this file should be excluded
        if (excludeFromCompilation.some(exclude => fullPath.includes(exclude) || entry === exclude)) {
          console.log(`[bytenode] Kept plain: ${fullPath}`);
          continue;
        }
        
        try {
          const base = path.basename(entry, '.js');
          const jscOut = path.join(outBase, `${base}.jsc`);
          await bytenode.compileFile({ filename: s, output: jscOut });
          fs.writeFileSync(dLoader, `require('bytenode');module.exports = require('./${base}.jsc');`, 'utf8');
          console.log(`[bytenode] Compiled: ${fullPath}`);
        } catch (error) {
          console.warn(`[bytenode] Failed to compile ${fullPath}, keeping as plain JS:`, error.message);
          // File already copied in copyRecursive
        }
      }
    }
  }

  // Process all directories with async/await
  for (const dir of includeDirs) {
    await compileDir(dir);
  }

  // Copy package.json minimal and node_modules
  const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
  // Ensure bytenode is a dependency for runtime
  pkg.dependencies = pkg.dependencies || {};
  if (!pkg.dependencies.bytenode) pkg.dependencies.bytenode = pkg.devDependencies?.bytenode || '^1.3.6';
  // Remove dev scripts to reduce noise
  delete pkg.devDependencies;
  pkg.scripts = { start: 'node force-production.js' };
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(pkg, null, 2));

  // Copy node_modules (runtime only) - skip dev-only packages
  const nodeModulesSrc = path.join(serverRoot, 'node_modules');
  const nodeModulesDst = path.join(outDir, 'node_modules');
  if (fs.existsSync(nodeModulesSrc)) {
    console.log('[bytenode] Copying node_modules (this may take a while)...');
    
    // List of packages to skip (dev-only)
    const skipPackages = [
      'javascript-obfuscator', // Build-time only, causes path length issues
      '@javascript-obfuscator',
      'typescript',
      '@types',
      'eslint',
      '@eslint',
      'prettier',
      'jest',
      '@jest',
      'webpack',
      '@webpack-cli',
      'webpack-cli',
      'babel-loader',
      '@babel',
      'nodemon',
      'rimraf',
      'terser-webpack-plugin',
      'css-loader',
      'style-loader',
      'postcss-loader',
      'sass-loader',
      'file-loader',
      'url-loader',
      'html-webpack-plugin',
      'copy-webpack-plugin',
      'clean-webpack-plugin',
      '@testing-library',
      'react-test-renderer',
      'enzyme',
      'react-dev-utils',
      'react-scripts'
    ];
    
    // CRITICAL: Never skip these runtime dependencies
    const requiredPackages = [
      'bytenode',
      'express',
      'cors',
      'axios',
      'openai',
      '@anthropic-ai',
      '@google',
      'dotenv',
      'helmet',
      'express-rate-limit',
      'node-cache',
      'semver',
      'debug'
    ];
    
    // Custom copy that skips certain packages
    ensureDir(nodeModulesDst);
    for (const entry of fs.readdirSync(nodeModulesSrc)) {
      // Skip .bin directory entirely - it contains symlinks that cause permission issues
      if (entry === '.bin') {
        console.log('[bytenode] Skipping node_modules/.bin directory');
        continue;
      }
      // Check if this is a required package
      const isRequired = requiredPackages.some(req => entry === req || entry.startsWith(req));
      
      if (isRequired) {
        console.log(`[bytenode] Keeping required package: ${entry}`);
        const src = path.join(nodeModulesSrc, entry);
        const dst = path.join(nodeModulesDst, entry);
        copyRecursive(src, dst, true); // Skip errors for node_modules
        continue;
      }
      
      if (skipPackages.includes(entry)) {
        console.log(`[bytenode] Skipping dev-only package: ${entry}`);
        continue;
      }
      
      const src = path.join(nodeModulesSrc, entry);
      const dst = path.join(nodeModulesDst, entry);
      const stat = fs.lstatSync(src);
      
      if (stat.isDirectory()) {
        // For scoped packages, check inside
        if (entry.startsWith('@') && skipPackages.some(skip => entry.includes(skip))) {
          console.log(`[bytenode] Skipping scoped dev package: ${entry}`);
          continue;
        }
        copyRecursive(src, dst, true); // Skip errors for node_modules
      } else {
        fs.copyFileSync(src, dst);
      }
    }
  }

  // Count compiled vs plain files (excluding node_modules)
  let compiledCount = 0;
  let plainCount = 0;
  let nodeModulesCount = 0;
  
  function countFiles(dir, isNodeModules = false) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = fs.lstatSync(fullPath);
      
      // Check if we're entering node_modules
      const inNodeModules = isNodeModules || entry === 'node_modules';
      
      if (stat.isDirectory()) {
        countFiles(fullPath, inNodeModules);
      } else if (inNodeModules && entry.endsWith('.js')) {
        nodeModulesCount++;
      } else if (entry.endsWith('.jsc')) {
        compiledCount++;
      } else if (entry.endsWith('.js')) {
        // Count JS files that are loaders (small) vs actual plain JS
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes("require('bytenode')")) {
          // This is a loader, don't count it as plain
        } else {
          plainCount++;
        }
      }
    }
  }
  
  countFiles(outDir);
  
  const projectTotal = compiledCount + plainCount;
  const protectionPercentage = projectTotal > 0 ? ((compiledCount / projectTotal) * 100).toFixed(1) : 0;
  
  console.log(`[bytenode] Build complete at ${outDir}`);
  console.log(`[bytenode] Compiled ${compiledCount} files to bytecode`);
  console.log(`[bytenode] Kept ${plainCount} files as plain JavaScript (excluding node_modules)`);
  console.log(`[bytenode] Node modules: ${nodeModulesCount} files (not included in protection calculation)`);
  console.log(`[bytenode] Protection coverage: ${protectionPercentage}% of project files`);
}

build().catch(err => {
  console.error('[bytenode] Build failed:', err);
  process.exit(1);
});
