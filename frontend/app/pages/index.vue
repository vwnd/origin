<script setup lang="ts">
definePageMeta({
  layout: 'landing'
})

const title = 'NerdShit'
const description = 'Don\'t send the puppy to clean up it\'s own mess.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
    <h1 class="flex items-center justify-center font-black tracking-tight text-highlighted text-6xl sm:text-8xl">
      <SplatIcon
        class="inline-block h-[1em] w-[0.65em] shrink-0 text-primary -mx-1 translate-y-[0.06em]"
        aria-hidden="true"
      />
      <span>rigo</span>
    </h1>

    <p class="max-w-md text-lg text-muted sm:text-xl">
      Don't send the puppy to clean up it's own mess.
    </p>

    <UButton
      label="Let's starting cleaning up"
      to="/projects"
      trailing-icon="i-lucide-arrow-right"
      size="lg"
    />
  </div>
</template>
