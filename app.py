"""Interactive helper menu for common Connect the Dots dev and release tasks.

Run from anywhere:  python app.py
"""

import json
import os
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


def build_aab():
    start = time.time()
    code = run_steps(
        ("node scripts/build-apk.js preflight release", MOBILE),
        ("npm install", ROOT),
        ("npx expo prebuild --platform android --no-install", MOBILE),
        # Gradle doesn't watch workspace packages (packages/core), so force a fresh JS bundle.
        (f"{GRADLEW} createBundleReleaseJsAndAssets --rerun bundleRelease", ANDROID),
    )
    if code != 0:
        return code

    built = ANDROID / "app" / "build" / "outputs" / "bundle" / "release" / "app-release.aab"
    if not built.exists():
        print(f"\nGradle finished but the AAB was not found at {built}")
        return 1

    RELEASE.mkdir(exist_ok=True)
    dest = RELEASE / built.name
    shutil.copyfile(built, dest)
    size_mb = dest.stat().st_size / 1024 / 1024
    minutes = (time.time() - start) / 60
    print(f"\nBuilt {built.name} in {minutes:.1f} min -> release/{built.name} ({size_mb:.2f} MB)")
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
