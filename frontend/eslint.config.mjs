// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    files: ['app/components/Editor.vue'],
    rules: {
      'vue/multi-word-component-names': 'off'
    }
  }
)
