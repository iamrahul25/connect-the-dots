# Connect the Dots

A relaxing neon puzzle game for Android, iOS and the web. Connect matching colored dots with paths, never cross another path, and **fill every cell of the grid** to solve the level. Grids grow and new mechanics appear as you progress.

Built with Expo (React Native + React Native Web), Skia for the board, and Reanimated for animation. The full design is in [`PLAN.md`](PLAN.md).

## Screenshots

| Home | Game | Daily Puzzle |
| :---: | :---: | :---: |
| <img src="docs/screenshots/home-page.png" width="250" alt="Home screen" /> | <img src="docs/screenshots/game-page.png" width="250" alt="Level 4 in progress" /> | <img src="docs/screenshots/daily-puzzle.png" width="250" alt="Daily puzzle calendar" /> |

## Features

- **100 handcrafted-by-generator levels** in 5 themed packs: Dawn, Lagoon, Ember, Aurora and Cosmos (5×5 up to 12×12).
- **Every level has exactly one solution**, verified by an exact solver.
- **New mechanics over time:** walls (blocked cells), bridges (two paths cross over each other) and warps (paths wrap around the edges).
- **Daily Puzzle** with a calendar, streak, best streak and solved count.
- **Star rating** (up to 3 stars per level) based on how close you get to the perfect move count.
- **Hints** that draw one correct path (earn more by getting ★★★), plus **Undo** and **Restart**.
- **Live HUD** showing moves, connected flows and fill percentage.
- **Soft Neon Night look:** glowing paths, glossy dots, glass UI and a different color theme for each pack.
- **Animations and effects:** path glow while drawing, pop when a flow connects, celebration burst and star reveal on level complete, animated ambient background.
- **Sound and haptics:** a musical note for each cell drawn, chimes on completion, ambient music per pack, vibration feedback on phones.
- **Accessibility:** colorblind mode (accessible palette + symbols on dots) and reduce-motion mode.
- **Progress saved on the device**, with an option to reset it.
- **Level generator CLI** that creates, rates and validates levels from a config file.

## Run the app

Requires [Node.js](https://nodejs.org/) 20+ and the [Expo Go](https://expo.dev/go) app on your phone (or an Android emulator).

```bash
# install everything once, from the repo root
npm install

# start the dev server
npm start
```

Then scan the QR code with Expo Go (Android) or the Camera app (iOS), or press `a` to open an Android emulator.

Run in a browser instead:

```bash
npm run web
```

> Run commands from the repo root with `npm …`, or run `npx expo …` inside `apps/mobile`. Running `npx expo start` in the repo root fails with `Unable to resolve "../../App"`.

### Other useful commands

```bash
npm test                 # run core game logic tests
npm run typecheck        # type-check all packages
npm run levels:build     # regenerate all 100 levels from tools/levelgen/levels.config.json
npm run levels:validate  # check every level is valid, solvable and has a unique solution
npm run export:web       # build the static web version into apps/mobile/dist
```

## Build an APK

### Option 1: Cloud build with EAS (easiest)

No Android Studio needed. You need a free [Expo account](https://expo.dev/signup).

```bash
npm install -g eas-cli
cd apps/mobile
eas login
eas build -p android --profile preview
```

When the build finishes, EAS prints a download link for the `.apk`. Open it on your phone to install. (`--profile production` builds an `.aab` for the Play Store instead.)

### Option 2: Local build

Requires JDK 17 and the Android SDK (`ANDROID_HOME` set), for example via Android Studio.

Release builds are signed with your upload keystore. Add these to `~/.gradle/gradle.properties` (on Windows: `C:\Users\<you>\.gradle\gradle.properties`):

```properties
MYAPP_UPLOAD_STORE_FILE=C:/Users/<you>/.android-keys/upload.keystore
MYAPP_UPLOAD_KEY_ALIAS=my-key-alias
MYAPP_UPLOAD_STORE_PASSWORD=...
MYAPP_UPLOAD_KEY_PASSWORD=...
```

Then, from the repo root:

```bash
npm run preflight-apk    # check toolchain, dependencies and signing without building
npm run release-apk      # signed release APK -> release/app-release.apk
npm run test-apk         # debug APK -> release/app-debug.apk (no keystore needed)
```

`release-apk` runs the pre-flight checks, `npm install` and `gradlew assembleRelease`, then copies the APK into the `release/` folder at the repo root.

> **Windows: `hermesc.exe was blocked by your organization's Device Guard policy`.** Smart App Control is blocking the unsigned Hermes compiler from npm. Turn it off in Windows Security → App & browser control → Smart App Control settings, then build again. You can also build with EAS (Option 1) or inside WSL instead.

### Install and test on an emulator

The commands below use `adb` and `emulator` from the Android SDK (`platform-tools` and `emulator` folders). Add both folders to your `PATH`.

```bash
# 1. start an emulator (or open one from Android Studio's Device Manager)
emulator -list-avds              # list your virtual devices
emulator -avd Pixel_10           # start one by name

# 2. check the emulator is connected (it should show as "device")
adb devices

# 3. install the APK (-r replaces an existing install and keeps its data)
adb install -r release/app-release.apk

# 4. launch the app
adb shell monkey -p com.connectthedots.game 1

# 5. watch JavaScript logs and crashes while you play
adb logcat ReactNativeJS:V AndroidRuntime:E *:S
```

If the install fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, a build signed with a different key (such as a debug build) is already installed. Uninstall it first:

```bash
adb uninstall com.connectthedots.game
adb install release/app-release.apk
```

With more than one device or emulator connected, pick one with `-s`, for example `adb -s emulator-5554 install -r release/app-release.apk`. To install on a real phone, turn on USB debugging in Developer options, connect it over USB, and run the same commands.

## Project structure

```
apps/mobile/        Expo app (screens, board rendering, audio, storage)
packages/core/      Game rules, solver and shared types
levels/             Level JSON files (pack-01 … pack-05) and daily puzzles
tools/levelgen/     Level generator and audio generator CLI
PLAN.md             Full game design and technical plan
```
