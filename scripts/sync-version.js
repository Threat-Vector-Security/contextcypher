/*
  Syncs app version from root package.json to:
  - server/package.json
  - src/services/LicenseService.ts (APP_VERSION)

  Usage: node scripts/sync-version.js
*/

const fs = require('fs');
const path = require('path');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function replaceInFile(filePath, replacer) {
  const content = fs.readFileSync(filePath, 'utf8');
  const updated = replacer(content);
  if (updated !== content) fs.writeFileSync(filePath, updated, 'utf8');
}

(function main() {
  const rootPkgPath = path.resolve(__dirname, '..', 'package.json');
  const serverPkgPath = path.resolve(__dirname, '..', 'server', 'package.json');
  const licenseServicePath = path.resolve(__dirname, '..', 'src', 'services', 'LicenseService.ts');

  const rootPkg = readJSON(rootPkgPath);
  const version = rootPkg.version;

  // Update server/package.json
  const serverPkg = readJSON(serverPkgPath);
  if (serverPkg.version !== version) {
    serverPkg.version = version;
    writeJSON(serverPkgPath, serverPkg);
    console.log(`[sync-version] Updated server/package.json to ${version}`);
  }

  // Update LicenseService APP_VERSION
  replaceInFile(licenseServicePath, (c) =>
    c.replace(/APP_VERSION\s*=\s*'[^']+'/, `APP_VERSION = '${version}'`)
  );
  console.log(`[sync-version] Updated LicenseService.ts APP_VERSION to ${version}`);

  console.log(`[sync-version] Synchronized version to ${version}`);
})();


