<template>
  <div class="relative min-h-dvh w-full flex flex-col bg-default">
    <div class="absolute right-4 top-4 z-10">
      <UColorModeButton />
    </div>

    <slot />

    <div class="sticky bottom-0 z-10 flex items-center justify-between p-4">
      <div>
        <UTooltip
          v-if="prev"
          text="Previous"
          :kbds="['arrowleft']"
        >
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="subtle"
            size="xl"
            class="rounded-full"
            aria-label="Previous page"
            @click="goTo(prev)"
          />
        </UTooltip>
      </div>

      <div>
        <UTooltip
          v-if="next"
          text="Next"
          :kbds="['arrowright']"
        >
          <UButton
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="subtle"
            size="xl"
            class="rounded-full"
            aria-label="Next page"
            @click="goTo(next)"
          />
        </UTooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  /** Route the back button and left arrow key navigate to. */
  prev?: string
  /** Route the forward button and right arrow key navigate to. */
  next?: string
}>()

const router = useRouter()

function goTo(to?: string) {
  if (to) {
    router.push(to)
  }
}

defineShortcuts({
  arrowleft: () => goTo(props.prev),
  arrowright: () => goTo(props.next),
  pageup: () => goTo(props.prev),
  pagedown: () => goTo(props.next)
})
</script>
