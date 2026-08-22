<script setup lang="ts">
import type { ProjectConventionContent } from '~~/shared/types/project'

definePageMeta({
  title: 'Latest revision'
})

const route = useRoute()
const projectId = computed(() => route.params.projectId as string)
const conventionId = computed(() => route.params.conventionId as string)

const { data: revision, status } = await useFetch<ProjectConventionContent>(
  () => `/api/projects/${projectId.value}/conventions/${conventionId.value}/content`
)
</script>

<template>
  <ConventionRevision
    :revision="revision"
    :pending="status === 'pending'"
    :back-to="`/projects/${projectId}/conventions/${conventionId}`"
    empty-message="This convention has no revisions yet."
  />
</template>
