const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Ensures release builds use an upload keystore (CTD_UPLOAD_*) instead of the
 * debug keystore, so Play Store accepts the AAB. Survives `npx expo prebuild`.
 *
 * The keystore check is deferred to task-graph time so `assembleDebug` still works
 * when upload credentials are not configured.
 */
function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    // Project-specific names: MYAPP_UPLOAD_* in ~/.gradle/gradle.properties is shared with other apps.
    contents = contents.replace(/MYAPP_UPLOAD_/g, 'CTD_UPLOAD_');

    if (contents.includes('CTD_UPLOAD_STORE_FILE')) {
      config.modResults.contents = contents;
      return config;
    }

    if (!contents.includes('signingConfigs.debug')) {
      throw new Error(
        'withAndroidReleaseSigning: expected debug signingConfig in android/app/build.gradle'
      );
    }

    contents = contents.replace(
      /signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s*\}/,
      (match) => `${match}
        release {
            if (project.hasProperty('CTD_UPLOAD_STORE_FILE')) {
                storeFile file(CTD_UPLOAD_STORE_FILE)
                storePassword CTD_UPLOAD_STORE_PASSWORD
                keyAlias CTD_UPLOAD_KEY_ALIAS
                keyPassword CTD_UPLOAD_KEY_PASSWORD
            }
        }`
    );

    contents = contents.replace(
      /release\s*\{\s*\/\/ Caution! In production[\s\S]*?signingConfig signingConfigs\.debug/,
      `release {
            // Play Store rejects debug-signed bundles. Set CTD_UPLOAD_* in
            // ~/.gradle/gradle.properties before building release.
            if (project.hasProperty('CTD_UPLOAD_STORE_FILE')) {
                signingConfig signingConfigs.release
            }`
    );

    if (!contents.includes('gradle.taskGraph.whenReady') && contents.includes('CTD_UPLOAD_STORE_FILE')) {
      contents += `

gradle.taskGraph.whenReady { taskGraph ->
    def isReleaseAssemble = taskGraph.allTasks.any { task ->
        def n = task.name.toLowerCase()
        n.contains('assemblerelease') || n.contains('bundlerelease')
    }
    if (isReleaseAssemble && !project.hasProperty('CTD_UPLOAD_STORE_FILE')) {
        throw new GradleException(
            "Release builds require an upload keystore. Set CTD_UPLOAD_STORE_FILE, " +
            "CTD_UPLOAD_KEY_ALIAS, CTD_UPLOAD_STORE_PASSWORD, and CTD_UPLOAD_KEY_PASSWORD " +
            "in ~/.gradle/gradle.properties."
        )
    }
}
`;
    }

    if (!contents.includes('CTD_UPLOAD_STORE_FILE')) {
      throw new Error(
        'withAndroidReleaseSigning: failed to patch android/app/build.gradle for release signing'
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withAndroidReleaseSigning;
