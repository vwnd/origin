<template>
  <ContentRenderer
    v-if="page"
    :value="page"
  />
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'demo'
})
const route = useRoute()
const { data: page } = await useAsyncData(route.path, () => {
  return queryCollection('content').path(route.path).first()
})
</script>
