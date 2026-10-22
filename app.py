"""Interactive helper menu for common Connect the Dots dev and release tasks.

Run from anywhere:  python app.py
"""

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MOBILE = ROOT / "apps" / "mobile"
ANDROID = MOBILE / "android"
RELEASE = ROOT / "release"

IS_WINDOWS = os.name == "nt"
GRADLEW = "gradlew.bat" if IS_WINDOWS else "./gradlew"


def run(cmd, cwd=ROOT):
    print(f"\n> {cmd}   (in {cwd.relative_to(ROOT) if cwd != ROOT else '.'})\n")
    try:
        return subprocess.run(cmd, cwd=cwd, shell=True).returncode
    except KeyboardInterrupt:
        print("\nInterrupted.")
        return 130


def run_steps(*steps):
    """Run (cmd, cwd) pairs in order, stopping at the first failure."""
    for cmd, cwd in steps:
        code = run(cmd, cwd)
        if code != 0:
            return code
    return 0


def bump_app_version():
    """Increment expo.android.versionCode and the patch of expo.version in app.json.

    Returns the original file text so the bump can be rolled back if the build fails.
    """
    app_json = MOBILE / "app.json"
    original = app_json.read_text(encoding="utf-8")
    config = json.loads(original)
    expo = config["expo"]

    old_code = expo["android"]["versionCode"]
    expo["android"]["versionCode"] = old_code + 1

    old_version = expo["version"]
    major, minor, patch = (int(part) for part in old_version.split("."))
    expo["version"] = f"{major}.{minor}.{patch + 1}"

    app_json.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        f"\nBumped app.json: versionCode {old_code} -> {expo['android']['versionCode']}, "
        f"version {old_version} -> {expo['version']}"
    )
    return original


def build_aab():
    start = time.time()
    code = run("node scripts/build-apk.js preflight release", MOBILE)
    if code != 0:
        return code

    # Play Console rejects any versionCode it has already seen, so every AAB needs a new one.
    # Prebuild copies version/versionCode from app.json into android/app/build.gradle.
    original_app_json = bump_app_version()
    code = run_steps(
        ("npm install", ROOT),
        ("npx expo prebuild --platform android --no-install", MOBILE),
        # Gradle doesn't watch workspace packages (packages/core), so force a fresh JS bundle.
        (f"{GRADLEW} createBundleReleaseJsAndAssets --rerun bundleRelease", ANDROID),
    )
    if code != 0:
        (MOBILE / "app.json").write_text(original_app_json, encoding="utf-8")
        print("\nBuild failed, so app.json was restored to its previous version.")
        return code

    built = ANDROID / "app" / "build" / "outputs" / "bundle" / "release" / "app-release.aab"
    if not built.exists():
        (MOBILE / "app.json").write_text(original_app_json, encoding="utf-8")
        print(f"\nGradle finished but the AAB was not found at {built}")
        return 1

    RELEASE.mkdir(exist_ok=True)
    dest = RELEASE / built.name
    shutil.copyfile(built, dest)
    size_mb = dest.stat().st_size / 1024 / 1024
    minutes = (time.time() - start) / 60
    print(f"\nBuilt {built.name} in {minutes:.1f} min -> release/{built.name} ({size_mb:.2f} MB)")
    return 0


def gradle_user_properties():
    """Read key=value pairs from ~/.gradle/gradle.properties (or $GRADLE_USER_HOME)."""
    gradle_home = Path(os.environ.get("GRADLE_USER_HOME") or Path.home() / ".gradle")
    props_file = gradle_home / "gradle.properties"
    props = {}
    if props_file.exists():
        for line in props_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith(("#", "!")) and "=" in line:
                key, value = line.split("=", 1)
                props[key.strip()] = value.strip()
    return props_file, props


def find_keytool():
    exe = "keytool.exe" if IS_WINDOWS else "keytool"
    if os.environ.get("JAVA_HOME"):
        candidate = Path(os.environ["JAVA_HOME"]) / "bin" / exe
        if candidate.exists():
            return str(candidate)
    return shutil.which("keytool")


def sha1_from_keytool_output(text):
    match = re.search(r"SHA1:\s*([0-9A-Fa-f:]{59})", text)
    return match.group(1).upper() if match else None


def normalize_sha1(value):
    hex_only = re.sub(r"[^0-9A-Fa-f]", "", value).upper()
    return ":".join(hex_only[i : i + 2] for i in range(0, len(hex_only), 2))


def check_aab_signature():
    """Compare the SHA1 of the CTD_UPLOAD_* keystore with the certificate that signed release/app-release.aab."""
    keytool = find_keytool()
    if not keytool:
        print("keytool not found. Install a JDK and add it to PATH or set JAVA_HOME.")
        return 1

    aab = RELEASE / "app-release.aab"
    if not aab.exists():
        print(f"AAB not found at {aab}. Build it first with option 3.")
        return 1

    props_file, props = gradle_user_properties()
    required = ["CTD_UPLOAD_STORE_FILE", "CTD_UPLOAD_KEY_ALIAS", "CTD_UPLOAD_STORE_PASSWORD"]
    missing = [key for key in required if not props.get(key)]
    if missing:
        print(f"Missing in {props_file}: {', '.join(missing)}")
        return 1

    keystore = Path(props["CTD_UPLOAD_STORE_FILE"])
    if not keystore.exists():
        print(f"Keystore not found at {keystore} (CTD_UPLOAD_STORE_FILE)")
        return 1

    env = dict(os.environ, CTD_KEYTOOL_STOREPASS=props["CTD_UPLOAD_STORE_PASSWORD"])
    keystore_out = subprocess.run(
        [keytool, "-list", "-v", "-keystore", str(keystore), "-alias", props["CTD_UPLOAD_KEY_ALIAS"],
         "-storepass:env", "CTD_KEYTOOL_STOREPASS"],
        capture_output=True, text=True, env=env,
    )
    keystore_sha1 = sha1_from_keytool_output(keystore_out.stdout)
    if not keystore_sha1:
        print(f"Could not read the keystore certificate:\n{keystore_out.stdout}{keystore_out.stderr}")
        return 1

    aab_out = subprocess.run([keytool, "-printcert", "-jarfile", str(aab)], capture_output=True, text=True)
    aab_sha1 = sha1_from_keytool_output(aab_out.stdout)
    if not aab_sha1:
        print(f"{aab.name} is not signed (or keytool could not read it):\n{aab_out.stdout}{aab_out.stderr}")
        return 1

    owner = re.search(r"Owner:\s*(.+)", aab_out.stdout)
    print(f"Keystore  {keystore}  (alias {props['CTD_UPLOAD_KEY_ALIAS']})")
    print(f"  SHA1: {keystore_sha1}")
    print(f"AAB       release/{aab.name}  ({owner.group(1).strip() if owner else 'unknown owner'})")
    print(f"  SHA1: {aab_sha1}")

    if keystore_sha1 != aab_sha1:
        print("\nMISMATCH: the AAB was not signed with the CTD_UPLOAD_* keystore. Rebuild it with option 3.")
        return 1
    print("\nMATCH: the AAB is signed with the CTD_UPLOAD_* keystore.")

    try:
        expected = input("\nPaste the SHA1 Play Console expects (or press Enter to skip): ").strip()
    except (KeyboardInterrupt, EOFError):
        print()
        return 0
    if expected:
        if normalize_sha1(expected) == aab_sha1:
            print("MATCH: Play Console will accept this upload key.")
        else:
            print(
                f"MISMATCH: Play Console expects {normalize_sha1(expected)}.\n"
                "Either sign with the keystore Play expects, or request an upload key reset in\n"
                "Play Console > Test and release > App integrity > App signing."
            )
            return 1
    return 0


def sdk_tool(subdir, name):
    """Locate an Android SDK tool, falling back to whatever is on PATH."""
    exe = f"{name}.exe" if IS_WINDOWS else name
    sdk_roots = [os.environ.get("ANDROID_HOME"), os.environ.get("ANDROID_SDK_ROOT")]
    if IS_WINDOWS and os.environ.get("LOCALAPPDATA"):
        sdk_roots.append(str(Path(os.environ["LOCALAPPDATA"]) / "Android" / "Sdk"))
    else:
        sdk_roots.append(str(Path.home() / "Library" / "Android" / "sdk"))
        sdk_roots.append(str(Path.home() / "Android" / "Sdk"))
    for root in filter(None, sdk_roots):
        candidate = Path(root) / subdir / exe
        if candidate.exists():
            return str(candidate)
    return shutil.which(name)


def connected_devices(adb):
    out = subprocess.run([adb, "devices"], capture_output=True, text=True).stdout
    return [line.split()[0] for line in out.splitlines()[1:] if line.strip().endswith("device")]


def start_emulator(adb):
    emulator = sdk_tool("emulator", "emulator")
    if not emulator:
        print("No emulator binary found. Start an emulator from Android Studio and retry.")
        return False
    avds = subprocess.run([emulator, "-list-avds"], capture_output=True, text=True).stdout.split()
    if not avds:
        print("No AVDs found. Create one in Android Studio (Device Manager) and retry.")
        return False

    print(f"No running device found. Starting emulator '{avds[0]}'...")
    subprocess.Popen(
        [emulator, "-avd", avds[0]],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if IS_WINDOWS else 0,
    )
    subprocess.run([adb, "wait-for-device"])
    print("Waiting for Android to finish booting...")
    deadline = time.time() + 180
    while time.time() < deadline:
        booted = subprocess.run(
            [adb, "shell", "getprop", "sys.boot_completed"], capture_output=True, text=True
        ).stdout.strip()
        if booted == "1":
            return True
        time.sleep(2)
    print("Emulator did not finish booting within 3 minutes.")
    return False


def run_apk_in_emulator():
    apk = RELEASE / "app-release.apk"
    if not apk.exists():
        print(f"APK not found at {apk}. Build it first with option 2.")
        return 1

    adb = sdk_tool("platform-tools", "adb")
    if not adb:
        print("adb not found. Install Android SDK platform-tools or set ANDROID_HOME.")
        return 1

    try:
        if not connected_devices(adb) and not start_emulator(adb):
            return 1

        package = json.loads((MOBILE / "app.json").read_text(encoding="utf-8"))["expo"]["android"]["package"]
        return run_steps(
            (f'"{adb}" install -r "{apk}"', ROOT),
            (f'"{adb}" shell monkey -p {package} -c android.intent.category.LAUNCHER 1', ROOT),
        )
    except KeyboardInterrupt:
        print("\nInterrupted.")
        return 130


def serve_website(port=8765):
    """Serve index.html and website/ like GitHub Pages does, and open it in the browser."""
    url = f"http://localhost:{port}/"
    with socket.socket() as sock:
        if sock.connect_ex(("127.0.0.1", port)) == 0:
            print(f"Port {port} is already in use, so the site is probably running. Opening {url}")
            webbrowser.open(url)
            return 0

    print(f"Serving the website at {url}  (press Ctrl+C to stop)")
    threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    code = run(f'"{sys.executable}" -m http.server {port}')
    return 0 if code == 130 else code


def open_release_folder():
    RELEASE.mkdir(exist_ok=True)
    if IS_WINDOWS:
        os.startfile(RELEASE)
    elif sys.platform == "darwin":
        subprocess.run(["open", RELEASE])
    else:
        subprocess.run(["xdg-open", RELEASE])
    return 0


OPTIONS = [
    ("Start the application (npm start)", lambda: run("npm start")),
    ("Build APK file (Release)", lambda: run("npm run release-apk")),
    ("Build AAB file (Release) - Play Store", build_aab),
    ("Check AAB signature (keystore SHA1 vs release/app-release.aab)", check_aab_signature),
    ("Run .apk file in emulator (adb install + launch)", run_apk_in_emulator),
    ("Run prechecks (release preflight)", lambda: run("npm run preflight-apk")),
    ("Run on Android device/emulator (expo run:android)", lambda: run("npm run android")),
    ("Run website locally (index.html at localhost:8765)", serve_website),
    ("Typecheck all packages", lambda: run("npm run typecheck")),
    ("Lint mobile app", lambda: run("npm run lint -w mobile")),
    ("Run core tests", lambda: run("npm test")),
    ("Validate levels", lambda: run("npm run levels:validate")),
    ("Build levels", lambda: run("npm run levels:build")),
    ("Clean Android build (gradlew clean)", lambda: run(f"{GRADLEW} clean", ANDROID)),
    ("Open release folder", open_release_folder),
]


def print_menu():
    print("\n" + "=" * 52)
    print("  Connect the Dots - Developer Menu")
    print("=" * 52)
    for i, (label, _) in enumerate(OPTIONS, start=1):
        print(f"  {i:>2}. {label}")
    print("   0. Exit")
    print("=" * 52)


def main():
    sys.stdout.reconfigure(line_buffering=True)
    while True:
        print_menu()
        try:
            choice = input("Press a number and Enter: ").strip()
        except (KeyboardInterrupt, EOFError):
            print()
            return

        if choice in ("0", "q", "exit"):
            return
        if not choice.isdigit() or not 1 <= int(choice) <= len(OPTIONS):
            print(f"\nInvalid choice: {choice!r}")
            continue

        label, action = OPTIONS[int(choice) - 1]
        print(f"\n--- {label} ---")
        code = action()
        status = "Done" if code == 0 else f"Failed (exit code {code})"
        print(f"\n--- {status} ---")
        try:
            input("Press Enter to return to the menu...")
        except (KeyboardInterrupt, EOFError):
            print()
            return


if __name__ == "__main__":
    main()
