<template>
  <NuxtLayout
    name="demo"
    prev="/demo/welcome"
    next="/demo/what"
  >
    <div class="w-full flex-1 p-16 flex flex-col items-center justify-center">
      <ContentRenderer
        v-if="page"
        :value="page"
      />
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false
})
const route = useRoute()
const { data: page } = await useAsyncData(route.path, () => {
  return queryCollection('content').path(route.path).first()
})
</script>
