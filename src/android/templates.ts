export const pluginsBlock = `
plugins {
    id 'io.sentry.android.gradle' version '3.12.0'
}

`

export const pluginsBlockKts = `
plugins {
    id("io.sentry.android.gradle") version "3.12.0"
}

`

export const plugin = `
    id 'io.sentry.android.gradle' version '3.12.0'
`

export const pluginKts = `
    id("io.sentry.android.gradle") version "3.12.0"
`

export const manifest = (dsn: string) => `
    <!-- Required: set your sentry.io project identifier (DSN) -->
    <meta-data android:name="io.sentry.dsn" android:value="${dsn}" />

    <!-- enable automatic breadcrumbs for user interactions (clicks, swipes, scrolls) -->
    <meta-data android:name="io.sentry.traces.user-interaction.enable" android:value="true" />
    <!-- enable screenshot for crashes (could contain sensitive/PII data) -->
    <meta-data android:name="io.sentry.attach-screenshot" android:value="true" />
    <!-- enable view hierarchy for crashes -->
    <meta-data android:name="io.sentry.attach-view-hierarchy" android:value="true" />

    <!-- enable the performance API by setting a sample-rate, adjust in production env -->
    <meta-data android:name="io.sentry.traces.sample-rate" android:value="1.0" />
    <!-- enable profiling when starting transactions, adjust in production env -->
    <meta-data android:name="io.sentry.traces.profiling.sample-rate" android:value="1.0" />
`

export const sentryImport = `import io.sentry.Sentry;\n`;

export const sentryImportKt = `import io.sentry.Sentry\n`;

export const testErrorSnippet = `
    // waiting for view to draw to better represent a captured error with a screenshot
    findViewById(android.R.id.content).getViewTreeObserver().addOnGlobalLayoutListener(() -> {
      try {
        throw new Exception("This app uses Sentry! :)");
      } catch (Exception e) {
        Sentry.captureException(e);
      }
    });
`

export const testErrorSnippetKt = `
    // waiting for view to draw to better represent a captured error with a screenshot
    findViewById<android.view.View>(android.R.id.content).viewTreeObserver.addOnGlobalLayoutListener {
      try {
        throw Exception("This app uses Sentry! :)")
      } catch (e: Exception) {
        Sentry.captureException(e)
      }
    }
`