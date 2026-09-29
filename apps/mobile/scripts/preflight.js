const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SIGNING_PROPS = [
  'MYAPP_UPLOAD_STORE_FILE',
  'MYAPP_UPLOAD_KEY_ALIAS',
  'MYAPP_UPLOAD_STORE_PASSWORD',
  'MYAPP_UPLOAD_KEY_PASSWORD',
];
const MIN_JAVA_MAJOR = 17;
const RULE = '═'.repeat(50);
const PREBUILD_HINT = 'Run from apps/mobile: npx expo prebuild --platform android';

function createReporter() {
  const problems = [];
  const warnings = [];
  const printHint = (hint) => {
    const lines = Array.isArray(hint) ? hint : [hint];
    lines.forEach((line) => console.log(`       ${line}`));
  };
  return {
    problems,
    warnings,
    section(title) {
      console.log(`\n${title}`);
    },
    pass(message) {
      console.log(`  ✅ ${message}`);
    },
    warn(message, hint) {
      warnings.push(message);
      console.log(`  ⚠️  ${message}`);
      if (hint) printHint(hint);
    },
    fail(message, hint) {
      problems.push(message);
      console.log(`  ❌ ${message}`);
      if (hint) printHint(hint);
    },
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function unescapeProperty(value) {
  return value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c) => {
    if (c.length === 5) return String.fromCharCode(parseInt(c.slice(1), 16));
    return { t: '\t', n: '\n', r: '\r', f: '\f' }[c] ?? c;
  });
}

/** Parses a Java `.properties` file (the format Gradle uses for gradle.properties). */
function parseProperties(text) {
  const result = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/^\s+/, '');
    if (!line || line[0] === '#' || line[0] === '!') continue;
    while (/(^|[^\\])(\\\\)*\\$/.test(line) && i + 1 < lines.length) {
      line = line.slice(0, -1) + lines[++i].replace(/^\s+/, '');
    }
    const match = line.match(/^((?:\\.|[^=:\s\\])*)\s*[=:\s]\s*(.*)$/);
    const key = unescapeProperty(match ? match[1] : line);
    result[key] = match ? unescapeProperty(match[2]) : '';
  }
  return result;
}

function readPropertiesFile(filePath) {
  return fs.existsSync(filePath) ? parseProperties(fs.readFileSync(filePath, 'utf8')) : null;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options });
}

function outputOf(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`.trim();
}

function jdkTool(tool) {
  const exe = process.platform === 'win32' ? `${tool}.exe` : tool;
  const javaHome = process.env.JAVA_HOME;
  if (javaHome && fs.existsSync(path.join(javaHome, 'bin', exe))) {
    return path.join(javaHome, 'bin', exe);
  }
  return tool;
}

function tryRequire(id, fromDir) {
  try {
    return require(require.resolve(id, { paths: [fromDir] }));
  } catch {
    return null;
  }
}

function checkProject(ctx, report) {
  const { rootDir, androidDir, appDir, target } = ctx;
  report.section('📁 Project');

  try {
    readJson(path.join(rootDir, 'package.json'));
    report.pass('package.json');
  } catch (error) {
    report.fail('package.json is missing or invalid', error.message);
  }

  try {
    const appJson = readJson(path.join(rootDir, 'app.json'));
    ctx.androidPackage = appJson?.expo?.android?.package;
    if (ctx.androidPackage) {
      report.pass(`app.json (android.package: ${ctx.androidPackage})`);
    } else {
      report.fail('app.json has no expo.android.package');
    }
  } catch (error) {
    report.fail('app.json is missing or invalid', error.message);
  }

  if (!fs.existsSync(androidDir)) {
    report.fail('android/ folder not found', PREBUILD_HINT);
    return;
  }

  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
  const requiredFiles = [
    `android/${gradlew}`,
    'android/settings.gradle',
    'android/build.gradle',
    'android/app/build.gradle',
    'android/gradle/wrapper/gradle-wrapper.properties',
  ];
  const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(rootDir, file)));
  if (missing.length) {
    report.fail(`Android project incomplete, missing: ${missing.join(', ')}`, [
      `Regenerate it. ${PREBUILD_HINT}`,
    ]);
    return;
  }
  report.pass('Android project and Gradle wrapper');

  const appGradle = fs.readFileSync(path.join(appDir, 'build.gradle'), 'utf8');
  const applicationId = appGradle.match(/applicationId\s+['"]([^'"]+)['"]/)?.[1];
  if (ctx.androidPackage && applicationId && applicationId !== ctx.androidPackage) {
    report.warn(
      `android/app/build.gradle applicationId (${applicationId}) differs from app.json (${ctx.androidPackage})`,
      `The android/ folder may be stale. ${PREBUILD_HINT}`
    );
  }

  if (target === 'release') {
    if (appGradle.includes('MYAPP_UPLOAD_STORE_FILE')) {
      report.pass('Release signing config wired into build.gradle');
    } else {
      report.fail('android/app/build.gradle has no MYAPP_UPLOAD_* release signing config', [
        'plugins/withAndroidReleaseSigning.js was not applied.',
        PREBUILD_HINT,
      ]);
    }
  } else if (!fs.existsSync(path.join(appDir, 'debug.keystore'))) {
    report.fail('android/app/debug.keystore not found', PREBUILD_HINT);
  }
}

function checkToolchain(ctx, report) {
  const { rootDir, androidDir } = ctx;
  report.section('⚙️  Toolchain');

  const rnPackage = tryRequire('react-native/package.json', rootDir);
  const semver = tryRequire('semver', rootDir);
  const nodeRange = rnPackage?.engines?.node;
  if (nodeRange && semver && !semver.satisfies(process.versions.node, nodeRange)) {
    report.fail(`Node.js ${process.versions.node} does not satisfy react-native's "${nodeRange}"`);
  } else {
    report.pass(`Node.js ${process.versions.node}`);
  }

  const javaHome = process.env.JAVA_HOME;
  const javaExe = process.platform === 'win32' ? 'java.exe' : 'java';
  if (javaHome && !fs.existsSync(path.join(javaHome, 'bin', javaExe))) {
    report.fail(`JAVA_HOME points to an invalid JDK: ${javaHome}`, 'Set JAVA_HOME to a JDK 17+ install folder.');
  } else {
    const result = run(jdkTool('java'), ['-version']);
    const versionText = outputOf(result);
    const match = versionText.match(/version "(\d+)(?:\.(\d+))?/);
    if (result.error || !match) {
      report.fail('Java not found', `Install JDK ${MIN_JAVA_MAJOR}+ and set JAVA_HOME.`);
    } else {
      const major = match[1] === '1' ? Number(match[2]) : Number(match[1]);
      if (major < MIN_JAVA_MAJOR) {
        report.fail(`Java ${major} found, but Gradle needs JDK ${MIN_JAVA_MAJOR}+`, `Current: ${versionText.split('\n')[0]}`);
      } else {
        report.pass(`Java ${versionText.split('\n')[0].match(/"([^"]+)"/)?.[1] ?? major}`);
      }
    }
  }

  const localProps = readPropertiesFile(path.join(androidDir, 'local.properties'));
  const sdkDir = localProps?.['sdk.dir'] || process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdkDir) {
    report.fail('Android SDK location not set', 'Set ANDROID_HOME, or sdk.dir in android/local.properties.');
  } else if (!fs.existsSync(path.join(sdkDir, 'platforms'))) {
    report.fail(`Android SDK not found at ${sdkDir}`, 'Install the SDK via Android Studio and fix ANDROID_HOME.');
  } else {
    report.pass(`Android SDK (${sdkDir})`);
    if (!fs.existsSync(path.join(sdkDir, 'licenses', 'android-sdk-license'))) {
      report.warn('Android SDK licenses not accepted', 'Run: sdkmanager --licenses');
    }
  }
}

function checkDependencies(ctx, report) {
  const { rootDir } = ctx;
  report.section('📦 Dependencies');
  const missing = ['expo', 'react-native'].filter((pkg) => !tryRequire(`${pkg}/package.json`, rootDir));
  if (missing.length) {
    report.warn(`Not installed: ${missing.join(', ')}`, 'npm install runs next and should fix this.');
    return;
  }
  const expoVersion = tryRequire('expo/package.json', rootDir).version;
  const rnVersion = tryRequire('react-native/package.json', rootDir).version;
  report.pass(`expo ${expoVersion}, react-native ${rnVersion}`);
}

function gradlePropertySources(androidDir) {
  const gradleUserHome = process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle');
  const envValues = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('ORG_GRADLE_PROJECT_')) envValues[key.slice('ORG_GRADLE_PROJECT_'.length)] = value;
  }
  const userPropsPath = path.join(gradleUserHome, 'gradle.properties');
  const projectPropsPath = path.join(androidDir, 'gradle.properties');
  return {
    userPropsPath,
    sources: [
      { label: 'ORG_GRADLE_PROJECT_* env var', values: envValues },
      { label: userPropsPath, values: readPropertiesFile(userPropsPath) || {} },
      { label: projectPropsPath, values: readPropertiesFile(projectPropsPath) || {} },
    ],
  };
}

function listAliases(keytool, keystorePath, env) {
  const result = run(keytool, ['-list', '-keystore', keystorePath, '-storepass:env', 'PREFLIGHT_STORE_PASS'], { env });
  return outputOf(result)
    .split('\n')
    .filter((line) => /Entry,?\s*$/.test(line.trim()))
    .map((line) => line.split(',')[0].trim());
}

function checkSigning(ctx, report) {
  const { androidDir, appDir } = ctx;
  report.section('🔐 Release signing');

  const { userPropsPath, sources } = gradlePropertySources(androidDir);
  const props = {};
  for (const name of SIGNING_PROPS) {
    const source = sources.find((s) => s.values[name]);
    if (source) props[name] = { value: source.values[name], label: source.label };
  }

  const missing = SIGNING_PROPS.filter((name) => !props[name]);
  if (missing.length) {
    report.fail(`Missing Gradle signing properties: ${missing.join(', ')}`, [
      `Add them to ${userPropsPath}:`,
      ...SIGNING_PROPS.map((name) => `  ${name}=...`),
    ]);
    return;
  }
  report.pass(`MYAPP_UPLOAD_* properties (from ${props.MYAPP_UPLOAD_STORE_FILE.label})`);

  const alias = props.MYAPP_UPLOAD_KEY_ALIAS.value;
  const storePass = props.MYAPP_UPLOAD_STORE_PASSWORD.value;
  const keyPass = props.MYAPP_UPLOAD_KEY_PASSWORD.value;
  // Gradle's file() in the app module resolves relative paths against android/app.
  const keystorePath = path.resolve(appDir, props.MYAPP_UPLOAD_STORE_FILE.value);

  if (!fs.existsSync(keystorePath) || !fs.statSync(keystorePath).isFile()) {
    report.fail(`Keystore not found: ${keystorePath}`, [
      'If this app was ever released, restore that exact keystore file to this path.',
      'Generating a new key means you cannot update the existing Play Store app.',
      'Only for a brand-new app, create one with:',
      `  keytool -genkeypair -v -storetype PKCS12 -keystore "${keystorePath}" -alias ${alias} -keyalg RSA -keysize 2048 -validity 10000`,
    ]);
    return;
  }
  report.pass(`Keystore exists (${keystorePath})`);
  if (!path.relative(androidDir, keystorePath).startsWith('..')) {
    report.warn('Keystore is inside android/, which `expo prebuild --clean` deletes', [
      'Move it outside the project and set MYAPP_UPLOAD_STORE_FILE to its absolute path (forward slashes).',
    ]);
  }

  const keytool = jdkTool('keytool');
  const env = { ...process.env, PREFLIGHT_STORE_PASS: storePass, PREFLIGHT_KEY_PASS: keyPass };
  const list = run(
    keytool,
    ['-list', '-v', '-keystore', keystorePath, '-alias', alias, '-storepass:env', 'PREFLIGHT_STORE_PASS'],
    { env }
  );
  if (list.error) {
    report.warn('keytool not found, skipping password and alias verification', 'Set JAVA_HOME to your JDK.');
    return;
  }

  const listOutput = outputOf(list);
  if (list.status !== 0) {
    if (/password was incorrect|password verification failed/i.test(listOutput)) {
      report.fail('MYAPP_UPLOAD_STORE_PASSWORD is wrong for this keystore');
    } else if (/does not exist/i.test(listOutput)) {
      const aliases = listAliases(keytool, keystorePath, env);
      report.fail(
        `Alias "${alias}" not found in keystore`,
        aliases.length ? `Aliases in this keystore: ${aliases.join(', ')}` : undefined
      );
    } else if (/keystore format|not a valid|invalid/i.test(listOutput)) {
      report.fail('File is not a valid keystore', listOutput.split('\n')[0]);
    } else {
      report.fail('keytool could not read the keystore', listOutput.split('\n')[0]);
    }
    return;
  }
  report.pass(`Keystore opens and alias "${alias}" exists`);

  const owner = listOutput.match(/Owner:\s*(.+)/i)?.[1]?.trim() ?? '';
  if (/CN=Android Debug/i.test(owner)) {
    report.fail('Keystore contains the Android debug certificate', 'Play Console rejects debug-signed builds.');
  }

  const certreq = run(
    keytool,
    ['-certreq', '-keystore', keystorePath, '-alias', alias, '-storepass:env', 'PREFLIGHT_STORE_PASS', '-keypass:env', 'PREFLIGHT_KEY_PASS'],
    { env }
  );
  if (/not supported for PKCS12/i.test(certreq.stderr || '')) {
    // keytool silently swaps in the store password here, but Gradle uses the key password as-is and fails.
    report.fail('MYAPP_UPLOAD_KEY_PASSWORD differs from MYAPP_UPLOAD_STORE_PASSWORD on a PKCS12 keystore', [
      'PKCS12 keystores created by keytool use the store password for the key too.',
    ]);
  } else if (certreq.status === 0) {
    report.pass('Key password unlocks the private key');
  } else {
    report.fail('MYAPP_UPLOAD_KEY_PASSWORD cannot unlock the private key', outputOf(certreq).split('\n')[0]);
  }
}

/**
 * Cheap checks for everything Gradle would otherwise only discover minutes into the build.
 * Returns { ok, problems, warnings }.
 */
function runPreflight({ rootDir, target }) {
  const androidDir = path.join(rootDir, 'android');
  const ctx = { rootDir, target, androidDir, appDir: path.join(androidDir, 'app') };
  const report = createReporter();

  console.log(`\n${RULE}\n  🔍 PRE-FLIGHT CHECKS (${target.toUpperCase()})\n${RULE}`);

  checkProject(ctx, report);
  checkToolchain(ctx, report);
  checkDependencies(ctx, report);
  if (target === 'release' && fs.existsSync(androidDir)) {
    checkSigning(ctx, report);
  }

  const { problems, warnings } = report;
  const warningNote = warnings.length ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : '';
  if (problems.length) {
    console.log(`\n${RULE}\n  ❌ PREFLIGHT FAILED: ${problems.length} problem${problems.length > 1 ? 's' : ''}${warningNote}\n${RULE}`);
    console.log('\nFix the issues above. Gradle build was NOT started.\n');
  } else {
    console.log(`\n${RULE}\n  ✅ PREFLIGHT PASSED${warningNote}\n${RULE}\n`);
  }

  return { ok: problems.length === 0, problems, warnings };
}

module.exports = { runPreflight };
