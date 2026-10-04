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
- **Daily Puzzle**: Easy (7×7–8×8, 1–2 obstacles), Medium (9×9–10×10, 3–4) and Hard (11×11–12×12, 5–7) every day. Solving any one keeps the streak; solving all three earns a 👑 on the calendar.
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

Release builds are signed with this app's own upload keystore. Create it once (keep it outside the repo and back it up). Run this in PowerShell, because keytool's password prompt doesn't always work in Git Bash. Choose a strong password when asked and save it in a password manager:

```powershell
keytool -genkeypair -v -storetype PKCS12 -keystore C:/Users/<you>/.android-keys/connect-the-dots-upload.keystore -alias connect-the-dots -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Connect the Dots, OU=Mobile, O=<your name or studio>, C=<country code>"
```

Then add the signing properties to your user-level Gradle properties file. On Windows it is `C:\Users\<you>\.gradle\gradle.properties`, and on macOS/Linux `~/.gradle/gradle.properties`. Open it from PowerShell:

```powershell
notepad $env:USERPROFILE\.gradle\gradle.properties
```

- If Notepad asks to create the file, say yes. The file only exists after something has written to it.
- To find it in File Explorer, paste `%USERPROFILE%\.gradle` into the address bar. Turn on **View → Show → File name extensions**, otherwise the file shows as just `gradle`.
- If the file already has lines for other apps (for example `MYAPP_UPLOAD_*`), leave them. Add these lines below them:

```properties
CTD_UPLOAD_STORE_FILE=C:/Users/<you>/.android-keys/connect-the-dots-upload.keystore
CTD_UPLOAD_KEY_ALIAS=connect-the-dots
CTD_UPLOAD_STORE_PASSWORD=<your keystore password>
CTD_UPLOAD_KEY_PASSWORD=<your keystore password>
```

Use forward slashes in the path. For a PKCS12 keystore, both password lines hold the same password you typed in keytool. This file holds your keystore password, so never copy it into the repo.

> This project reads `CTD_UPLOAD_*`, not the common `MYAPP_UPLOAD_*` names. `gradle.properties` in your home folder applies to every Android project on the machine, so separate names stop this app from being signed with another app's key.

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

## Publish to Google Play (signed AAB)

Google Play takes an Android App Bundle (`.aab`), not an APK. It must be signed with your upload keystore, set up the same way as for a local release APK (the `CTD_UPLOAD_*` properties in `~/.gradle/gradle.properties`, see [Option 2](#option-2-local-build)).

### Quick reference (Windows, PowerShell)

One-time setup: open your user-level Gradle properties file and add the signing lines (keep any lines that are already there for other apps):

```powershell
notepad $env:USERPROFILE\.gradle\gradle.properties
```

```properties
CTD_UPLOAD_STORE_FILE=C:/Users/conne/.android-keys/connect-the-dots-upload.keystore
CTD_UPLOAD_KEY_ALIAS=connect-the-dots
CTD_UPLOAD_STORE_PASSWORD=<your keystore password>
CTD_UPLOAD_KEY_PASSWORD=<your keystore password>
```

Every release, starting from the repo root (if you are in `apps/mobile/android`, run `cd ../../..` first):

```powershell
npm run preflight-apk -w mobile
cd apps/mobile/android
./gradlew.bat bundleRelease
keytool -printcert -jarfile app/build/outputs/bundle/release/app-release.aab

# open the folder with the signed AAB, ready to upload
explorer C:\all-projects\connect-the-dots\apps\mobile\android\app\build\outputs\bundle\release
```

`keytool` must show `Owner: CN=Connect the Dots, ...`. The file to upload is `app-release.aab` in that folder. The details of each step are below.

### Package name

The package name (Play Console calls it the application ID) is **`com.connectthedots.game`**. It is set in `apps/mobile/app.json` under `expo.android.package`, and prebuild copies it into `applicationId` in `apps/mobile/android/app/build.gradle`.

Once you upload the first build to Play Console, the package name is permanent. It must also be unique across Google Play. If Play says it is already taken, change it before the first upload (see below).

**Check that the AAB has the right package name.** Run these from `apps/mobile/android`:

```powershell
# what the build is configured with (Git Bash: grep applicationId app/build.gradle)
Select-String -Path app/build.gradle -Pattern "applicationId"

# what is actually inside the AAB, using bundletool
java -jar C:/path/to/bundletool-all.jar dump manifest --bundle=app/build/outputs/bundle/release/app-release.aab --xpath=/manifest/@package
```

Both should print `com.connectthedots.game`, and it must match the package name of your app in Play Console. Download bundletool once, as `bundletool-all-<version>.jar`, from [github.com/google/bundletool/releases](https://github.com/google/bundletool/releases). `npm run preflight-apk` also warns if `app.json` and `build.gradle` disagree.

**Change the package name** (only before the first upload):

1. In `apps/mobile/app.json`, set `expo.android.package` to the new name, for example `com.yourname.connectthedots`. Use lowercase letters, digits, underscores and dots, with at least two parts. Update `expo.ios.bundleIdentifier` too if you want both platforms to match.
2. Regenerate the Android project. Run this from `apps/mobile`:

   ```bash
   npx expo prebuild --platform android --clean
   ```

   `--clean` deletes and recreates `android/`. That's safe here: the folder is generated and gitignored, the signing setup is re-applied by `plugins/withAndroidReleaseSigning.js`, and the keystore lives outside the project.
3. Rebuild the AAB and run the checks above again. Both commands should now print the new name.

### 1. Build the signed AAB

From the repo root (works in Git Bash and PowerShell):

```bash
npm run preflight-apk          # optional: checks the keystore and passwords, and shows the certificate owner
cd apps/mobile/android
./gradlew.bat bundleRelease     # macOS/Linux: ./gradlew bundleRelease
```

When you see `BUILD SUCCESSFUL`, the signed bundle is at:

```
apps/mobile/android/app/build/outputs/bundle/release/app-release.aab
```

With the repo cloned to `C:\all-projects\connect-the-dots`, the full path is `C:\all-projects\connect-the-dots\apps\mobile\android\app\build\outputs\bundle\release\app-release.aab`. Open the folder in File Explorer from PowerShell:

```powershell
explorer C:\all-projects\connect-the-dots\apps\mobile\android\app\build\outputs\bundle\release
```

In the Play Console upload dialog, paste that folder path into the file picker's address bar and pick `app-release.aab`. Each `bundleRelease` overwrites this file, so check the signature (step 2) after every build before uploading.

To build in the cloud instead, run `eas build -p android --profile production` from `apps/mobile`. When EAS asks for Android credentials, give it your existing upload keystore. Don't let it generate a new one.

> If the build fails with `hermesc.exe was blocked by your organization's Device Guard policy`, see the Windows note under [Option 2](#option-2-local-build). Retrying sometimes works.

### 2. Check that the AAB is signed

Stay in `apps/mobile/android`. The paths below are relative to that folder and give `NoSuchFileException` if you run them from the repo root.

```bash
# verify the signature
jarsigner -verify app/build/outputs/bundle/release/app-release.aab

# show the signing certificate and its fingerprints
keytool -printcert -jarfile app/build/outputs/bundle/release/app-release.aab
```

- `jar verified.` means the bundle is signed. `jar is unsigned.` means the `CTD_UPLOAD_*` properties were not picked up, so fix them and rebuild.
- Check that `keytool` shows `Owner: CN=Connect the Dots, ...`. Any other owner means the build used a different app's keystore.
- The warnings printed after `jar verified.` are normal for an upload-key-signed `.aab` and can be ignored: `certificate chain is invalid` / `PKIX path building failed`, `signer certificate is self-signed`, `signatures that do not include a timestamp`, `POSIX file permission`, `Manifest is missing when reading via JarInputStream`, and `Entry ... is signed in JarFile but is not signed in JarInputStream`. Add `-verbose -certs` only if you want the full per-file listing, which is very long.
- `keytool` prints the certificate `Owner` and its `SHA1` and `SHA256` fingerprints. In Play Console, go to **Test and release → App integrity → App signing**. The SHA-256 must match the **Upload key certificate**. For the first upload of a new app, Play registers this key as the upload key.

### 3. Upload to Play Console

1. Bump the version first. Every upload needs a higher `versionCode` than the last one. Set `expo.android.versionCode` (and `expo.version` for the visible version name) in `apps/mobile/app.json`, then run `npx expo prebuild --platform android` in `apps/mobile` so `android/` picks it up.
2. In Play Console, open your app, go to **Testing** (internal, closed, or open) or **Production**, and choose **Create new release**.
3. Upload `app-release.aab`, add release notes, and roll out.

Play re-signs the app with its own app signing key before delivering it to users. Keep the upload keystore and its passwords backed up somewhere safe. If you lose them, you have to ask Google to reset the upload key.

## Project structure

```
apps/mobile/        Expo app (screens, board rendering, audio, storage)
packages/core/      Game rules, solver and shared types
levels/             Level JSON files (pack-01 … pack-05) and daily puzzles
tools/levelgen/     Level generator and audio generator CLI
PLAN.md             Full game design and technical plan
```
