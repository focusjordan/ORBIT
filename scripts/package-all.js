/**
 * ORBIT Packaging & Monorepo Distribution Automation Script
 * 
 * Automates the creation of installable NPM (.tgz) and PyPI source/wheel archives 
 * for dry-run verification across all decoupled workspace packages.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PACKAGES_DIR = path.join(__dirname, '../packages');
const DIST_DIR = path.join(__dirname, '../dist');
const DIST_JS_DIR = path.join(DIST_DIR, 'js');
const DIST_PY_DIR = path.join(DIST_DIR, 'python');

// Ensure clean distribution directories
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });
fs.mkdirSync(DIST_JS_DIR, { recursive: true });
fs.mkdirSync(DIST_PY_DIR, { recursive: true });

const packages = fs.readdirSync(PACKAGES_DIR).filter(item => {
  return fs.statSync(path.join(PACKAGES_DIR, item)).isDirectory();
});

console.log(`📦 Found ${packages.length} packages inside monorepo workspace.`);

for (const pkgName of packages) {
  const pkgPath = path.join(PACKAGES_DIR, pkgName);
  console.log(`\n======================================================`);
  console.log(`🔨 Building standalone package: @orbit/${pkgName}`);
  console.log(`======================================================`);

  // 1. Build NPM Package
  try {
    console.log(`🔹 Running npm pack for @orbit/${pkgName}...`);
    // Run npm pack and capture stdout which gives the package filename
    const stdout = execSync('npm pack', { cwd: pkgPath, encoding: 'utf8' }).trim();
    const tgzName = stdout.split('\n').pop(); // Handle multi-line outputs safely
    const sourceTgz = path.join(pkgPath, tgzName);
    const destTgz = path.join(DIST_JS_DIR, tgzName);

    fs.renameSync(sourceTgz, destTgz);
    console.log(`   ✅ NPM archive created: dist/js/${tgzName}`);
  } catch (error) {
    console.error(`   ❌ Failed to build NPM package @orbit/${pkgName}:`, error.message);
  }

  // 2. Build Python Package (if pyproject.toml exists)
  const pyProjectFile = path.join(pkgPath, 'pyproject.toml');
  if (fs.existsSync(pyProjectFile)) {
    console.log(`🔹 pyproject.toml found. Building PyPI distribution...`);
    
    // Create python package directory structure locally inside package first
    // Python setuptools needs package files inside a directory of the same name (with underscore)
    const pyPkgName = `orbit_${pkgName}`;
    const pyLocalPkgDir = path.join(pkgPath, pyPkgName);
    fs.mkdirSync(pyLocalPkgDir, { recursive: true });

    // Copy package README if it doesn't exist to make build succeed
    const readmePath = path.join(pkgPath, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(
        readmePath,
        `# ${pyPkgName}\n\nStandalone Python package for ORBIT ${pkgName.toUpperCase()} analysis.`
      );
    }

    // Copy script files into the python module folder
    const pkgScriptsDir = path.join(pkgPath, 'scripts');
    if (fs.existsSync(pkgScriptsDir)) {
      const pyScripts = fs.readdirSync(pkgScriptsDir).filter(f => f.endsWith('.py'));
      for (const script of pyScripts) {
        fs.copyFileSync(path.join(pkgScriptsDir, script), path.join(pyLocalPkgDir, script));
      }
      
      // Create empty __init__.py for standard python package recognition
      fs.writeFileSync(path.join(pyLocalPkgDir, '__init__.py'), '');
    }

    try {
      // Build python source & wheel packages
      // Check if 'build' module is installed
      let hasBuildModule = false;
      try {
        execSync('python3 -c "import build"', { stdio: 'ignore' });
        hasBuildModule = true;
      } catch (e) {}

      if (hasBuildModule) {
        execSync('python3 -m build', { cwd: pkgPath, stdio: 'inherit' });
      } else {
        console.log(`⚠️ 'build' module not found in Python. Falling back to setuptools sdist/bdist_wheel...`);
        execSync('python3 setup.py sdist bdist_wheel', { cwd: pkgPath, stdio: 'ignore' });
      }

      // Move built files from packages/<pkg>/dist to dist/python/
      const pkgDistDir = path.join(pkgPath, 'dist');
      if (fs.existsSync(pkgDistDir)) {
        const builtFiles = fs.readdirSync(pkgDistDir);
        for (const file of builtFiles) {
          fs.renameSync(path.join(pkgDistDir, file), path.join(DIST_PY_DIR, file));
        }
        // Cleanup local package dist folder
        fs.rmSync(pkgDistDir, { recursive: true, force: true });
        console.log(`   ✅ Python wheels/sdists populated under dist/python/`);
      }
    } catch (pyError) {
      console.error(`   ⚠️ PyPI packaging run skipped/failed (likely due to build tools missing):`, pyError.message);
    } finally {
      // Cleanup copied local package structure
      if (fs.existsSync(pyLocalPkgDir)) {
        fs.rmSync(pyLocalPkgDir, { recursive: true, force: true });
      }
    }
  }
}

console.log(`\n======================================================`);
console.log(`🎉 Monorepo Packaging Finished successfully!`);
console.log(`📂 Output files:`);
console.log(`   - JS packages: dist/js/`);
fs.readdirSync(DIST_JS_DIR).forEach(f => console.log(`     └─ ${f}`));
console.log(`   - Python packages: dist/python/`);
fs.readdirSync(DIST_PY_DIR).forEach(f => console.log(`     └─ ${f}`));
console.log(`======================================================\n`);
