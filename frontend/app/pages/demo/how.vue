<template>
  <NuxtLayout
    name="demo"
    prev="/demo/why"
    class="w-full h-full flex flex-col items-center justify-center"
  >
    <div class="w-full flex-1 p-16 flex flex-col items-center justify-center">
      <ContentRenderer
        v-if="page"
        class="max-h-fit max-w-full"
        :value="page"
      />
    </div>
    <UButton
      class="max-w-fit"
      color="primary"
      to="/projects"
    >
      Ready for the demo?
    </UButton>
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
