// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  modules: ['@sentry/nuxt/module'],

  sentry: {
    sourceMapsUploadOptions: {
      org: 'TEST_ORG_SLUG',
      project: 'TEST_PROJECT_SLUG'
    },

    autoInjectServerSentry: 'top-level-import'
  },

  sourcemap: {
    client: 'hidden'
  }
})