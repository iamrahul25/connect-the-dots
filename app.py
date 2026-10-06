"""Interactive helper menu for common Connect the Dots dev and release tasks.

Run from anywhere:  python app.py
"""

import os
import shutil
import subprocess
import sys
import time
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
        (f"{GRADLEW} bundleRelease", ANDROID),
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
    ("Run prechecks (release preflight)", lambda: run("npm run preflight-apk")),
    ("Run on Android device/emulator (expo run:android)", lambda: run("npm run android")),
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
