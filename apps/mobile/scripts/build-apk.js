const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { runPreflight } = require('./preflight');

// Usage:
//   node scripts/build-apk.js [release|debug] [--skip-preflight]
//   node scripts/build-apk.js preflight [release|debug]
const args = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith('--'));
const skipPreflight = args.includes('--skip-preflight');
const checkOnly = positional[0] === 'preflight';
const targetArg = checkOnly ? positional[1] : positional[0];

const target = targetArg === 'debug' ? 'debug' : 'release';
const gradleTask = target === 'release' ? 'assembleRelease' : 'assembleDebug';
const apkFilename = target === 'release' ? 'app-release.apk' : 'app-debug.apk';

const rootDir = path.resolve(__dirname, '..');
// npm workspaces hoist dependencies, so installs must run from the monorepo root.
const workspaceRoot = path.resolve(rootDir, '..', '..');
const androidDir = path.join(rootDir, 'android');
const releaseDir = path.join(workspaceRoot, 'release');
const outputApkPath = path.join(
  androidDir,
  'app',
  'build',
  'outputs',
  'apk',
  target,
  apkFilename
);
const destApkPath = path.join(releaseDir, apkFilename);

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const gradleCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

console.log(`\n🚀 ${checkOnly ? 'Checking' : 'Starting'} ${target.toUpperCase()} APK build...`);

if (skipPreflight) {
  console.log('\n⚠️  Skipping pre-flight checks (--skip-preflight)');
} else if (!runPreflight({ rootDir, target }).ok) {
  process.exit(1);
}

if (checkOnly) {
  process.exit(0);
}

console.log('📥 Running npm install...\n');
execSync(`${npmCmd} install`, {
  cwd: workspaceRoot,
  stdio: 'inherit',
  env: process.env,
});

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

console.log(`\n🛠 Running Gradle ${gradleTask}...\n`);
const gradleStart = Date.now();
try {
  execSync(`${gradleCmd} ${gradleTask}`, {
    cwd: androidDir,
    stdio: 'inherit',
    env: process.env,
  });
} catch (error) {
  console.error(`\n❌ Gradle ${gradleTask} failed (exit code ${error.status ?? 'unknown'}). See the Gradle output above.\n`);
  process.exit(error.status || 1);
}
const gradleMinutes = ((Date.now() - gradleStart) / 60000).toFixed(1);

if (!fs.existsSync(outputApkPath)) {
  console.error(`\n❌ Gradle finished but the APK was not found at ${outputApkPath}\n`);
  process.exit(1);
}

fs.copyFileSync(outputApkPath, destApkPath);
const sizeMb = (fs.statSync(destApkPath).size / 1024 / 1024).toFixed(2);
console.log(`\n✅ Built ${apkFilename} in ${gradleMinutes} min and saved to release/${apkFilename} (${sizeMb} MB)\n`);
