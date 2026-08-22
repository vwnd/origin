<script setup lang="ts">
import type { ProjectListResponse } from '~~/shared/types/project'

definePageMeta({
  title: 'Projects'
})

const page = ref(1)
const pageSize = 12

const { data, status } = await useFetch<ProjectListResponse>('/api/projects', {
  query: { page, pageSize },
  watch: [page]
})

const projects = computed(() => data.value?.items ?? [])
const totalCount = computed(() => data.value?.totalCount ?? 0)
</script>

<template>
  <div class="flex flex-col gap-6 p-4 sm:p-6">
    <div
      v-if="status === 'pending'"
      class="flex justify-center py-16"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="size-6 animate-spin text-muted"
      />
    </div>

    <template v-else-if="projects.length">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <UPageCard
          v-for="project in projects"
          :key="project.id"
          :title="project.name"
          :to="`/projects/${project.id}`"
          icon="i-lucide-folder"
          class="hover:ring-primary/50"
        />
      </div>

      <div
        v-if="totalCount > pageSize"
        class="flex justify-center"
      >
        <UPagination
          v-model:page="page"
          :total="totalCount"
          :items-per-page="pageSize"
        />
      </div>
    </template>

    <div
      v-else
      class="flex flex-col items-center gap-2 py-16 text-center"
    >
      <UIcon
        name="i-lucide-folder-open"
        class="size-8 text-muted"
      />
      <p class="text-muted">
        No projects yet.
      </p>
    </div>
  </div>
</template>
