const fs = require('fs');
const path = require('path');

// Get all SVG files in a directory recursively
function getSvgFiles(dir, baseDir = dir) {
  let results = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      results = results.concat(getSvgFiles(filePath, baseDir));
    } else if (file.endsWith('.svg')) {
      const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/');
      results.push({
        filename: file,
        path: relativePath,
        subcategory: path.basename(path.dirname(filePath))
      });
    }
  }

  return results;
}

// Generate manifest for vendor icons
function generateVendorIconsManifest() {
  const vendorsDir = path.join(__dirname, '..', 'public', 'icons', 'vendors');
  const manifest = {
    aws: {},
    azure: {},
    gcp: {},
    ibm: {}
  };

  // Process each vendor
  for (const vendor of Object.keys(manifest)) {
    const vendorDir = path.join(vendorsDir, vendor);

    if (fs.existsSync(vendorDir)) {
      const entries = fs.readdirSync(vendorDir);
      const subcategories = entries.filter(item => {
        return fs.statSync(path.join(vendorDir, item)).isDirectory();
      });

      for (const subcategory of subcategories) {
        const subcategoryDir = path.join(vendorDir, subcategory);
        const icons = getSvgFiles(subcategoryDir)
          .map(icon => icon.filename)
          .sort();

        if (icons.length > 0) {
          manifest[vendor][subcategory] = icons;
        }
      }

      // Handle root-level icons (no subcategory)
      const rootIcons = entries
        .filter(item => item.toLowerCase().endsWith('.svg'))
        .sort();

      if (rootIcons.length > 0) {
        manifest[vendor].general = rootIcons;
      }
    }
  }

  // Write manifest to JSON file
  const outputPath = path.join(__dirname, '..', 'src', 'data', 'vendorIconsManifest.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

  // Count icons
  let totalIcons = 0;
  for (const vendor of Object.keys(manifest)) {
    let vendorTotal = 0;
    for (const subcategory of Object.keys(manifest[vendor])) {
      vendorTotal += manifest[vendor][subcategory].length;
    }
    console.log(`${vendor.toUpperCase()}: ${vendorTotal} icons`);
    totalIcons += vendorTotal;
  }
  console.log(`Total vendor icons: ${totalIcons}`);
  console.log(`Manifest written to: ${outputPath}`);
}

// Run the script
generateVendorIconsManifest();
