export function getRunScriptTemplate(
    orgSlug: string,
    projectSlug: string,
    apiKey: string,
    uploadSource = true,
): string {
    // eslint-disable-next-line no-useless-escape
    return `# This script is responsable to upload debug symbols and source context for Sentry.\\nif which sentry-cli >/dev/null; then\\nexport SENTRY_ORG=${orgSlug}\\nexport SENTRY_PROJECT=${projectSlug}\\nexport SENTRY_AUTH_TOKEN=${apiKey}\\nERROR=$(sentry-cli debug-files upload ${uploadSource ? "--include-sources " : ""}\"$DWARF_DSYM_FOLDER_PATH\" 2>&1 >/dev/null)\\nif [ ! $? -eq 0 ]; then\\necho \"warning: sentry-cli - $ERROR\"\\nfi\\nelse\\necho \"warning: sentry-cli not installed, download from https://github.com/getsentry/sentry-cli/releases\"\\nfi\\n`;
}

export const scriptInputPath = "\"${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Resources/DWARF/${TARGET_NAME}\"";

export function getSwiftSnippet(dsn: string): string {
    return `           SentrySDK.start { options in
            options.dsn = "${dsn}"
            options.enableTracing = true
            #if DEBUG
            options.debug = true
            options.environment = "Development"
            #else
            options.environment = "Release"
            #endif
            options.attachScreenshot = true
            options.attachViewHierarchy = true
            options.enableTimeToFullDisplay = true
        }
        //Remove the next line after running the app once.
        SentrySDK.capture(message: "This app uses Sentry! :)")\n`;
}

export function getObjcSnippet(dsn: string): string {
    return `        [SentrySDK startWithConfigureOptions:^(SentryOptions * options) {
        options.dsn = @"${dsn}";
        options.enableTracing = YES;
    #if DEBUG
        options.debug = YES;
        options.environment = @"Development";
    #else
        options.environment = @"Release";
    #endif
        options.attachScreenshot = YES;
        options.attachViewHierarchy = YES;
        options.enableTimeToFullDisplay = YES;
    }];
    //Remove the next line after running the app once.
    [SentrySDK captureMessage:@"This app uses Sentry!"]\n`;
}