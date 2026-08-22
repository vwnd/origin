<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ProjectConventionListResponse, ProjectConventionSummary } from '~~/shared/types/project'

definePageMeta({
  title: 'Conventions'
})

const route = useRoute()
const projectId = computed(() => route.params.projectId as string)

const page = ref(1)
const pageSize = 12

const { data, status } = await useFetch<ProjectConventionListResponse>(
  () => `/api/projects/${projectId.value}/conventions`,
  {
    query: { page, pageSize },
    watch: [page]
  }
)

const items = computed(() => data.value?.items ?? [])
const totalCount = computed(() => data.value?.totalCount ?? 0)

const columns: TableColumn<ProjectConventionSummary>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'description', header: 'Description' },
  { accessorKey: 'versionCount', header: 'Versions' },
  { accessorKey: 'latestVersionCreatedAtUtc', header: 'Last updated' }
]

function open(convention: ProjectConventionSummary) {
  return navigateTo(`/projects/${projectId.value}/conventions/${convention.id}`)
}
</script>

<template>
  <div class="flex flex-col gap-4 p-4 sm:p-6">
    <div
      v-if="status === 'pending'"
      class="flex justify-center py-16"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="size-6 animate-spin text-muted"
      />
    </div>

    <template v-else-if="items.length">
      <UTable
        :data="items"
        :columns="columns"
        class="rounded-xl ring ring-default bg-default"
        :ui="{ tr: 'cursor-pointer data-[selectable=true]:hover:bg-elevated/50' }"
        @select="(_event, row) => open(row.original)"
      >
        <template #name-cell="{ row }">
          <span class="font-medium text-highlighted">{{ row.original.name }}</span>
        </template>

        <template #description-cell="{ row }">
          <span class="line-clamp-2 max-w-xl text-muted">{{ row.original.description ?? '—' }}</span>
        </template>

        <template #versionCount-cell="{ row }">
          <UBadge
            variant="subtle"
            color="neutral"
          >
            {{ row.original.versionCount }}
          </UBadge>
        </template>

        <template #latestVersionCreatedAtUtc-cell="{ row }">
          <span class="text-muted">
            {{ row.original.latestVersionCreatedAtUtc
              ? new Date(row.original.latestVersionCreatedAtUtc).toLocaleString()
              : 'No versions' }}
          </span>
        </template>
      </UTable>

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
        name="i-lucide-file-text"
        class="size-8 text-muted"
      />
      <p class="text-muted">
        No conventions for this project yet.
      </p>
    </div>
  </div>
</template>
