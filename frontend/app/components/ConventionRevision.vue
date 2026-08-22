<script setup lang="ts">
import type { ProjectConventionContent } from '~~/shared/types/project'

// The latest and pinned-version routes render the same thing; only the revision
// they fetch and the words above it differ.
const props = defineProps<{
  revision?: ProjectConventionContent | null
  pending: boolean
  backTo: string
  emptyMessage: string
}>()

const content = ref('')

watch(() => props.revision, (value) => {
  content.value = value?.content ?? ''
}, { immediate: true })
</script>

<template>
  <div class="flex flex-col gap-4 h-full p-4 sm:p-6">
    <div
      v-if="pending"
      class="flex justify-center py-16"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="size-6 animate-spin text-muted"
      />
    </div>

    <template v-else-if="revision">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <UButton
          :to="backTo"
          icon="i-lucide-arrow-left"
          variant="link"
          color="neutral"
          size="sm"
          class="-ms-2"
          :label="revision.conventionName"
        />

        <p class="text-sm text-muted">
          Version {{ revision.versionNumber }} of {{ revision.versionCount }}
          · {{ new Date(revision.createdAtUtc).toLocaleString() }}
        </p>
      </div>

      <div class="flex-1 min-h-0">
        <Editor v-model="content" />
      </div>
    </template>

    <div
      v-else
      class="flex flex-col items-center gap-3 py-16 text-center"
    >
      <UIcon
        name="i-lucide-file-question"
        class="size-8 text-muted"
      />
      <p class="text-muted">
        {{ emptyMessage }}
      </p>
      <UButton
        :to="backTo"
        variant="subtle"
        color="neutral"
        icon="i-lucide-arrow-left"
        label="Back to convention"
      />
    </div>
  </div>
</template>
