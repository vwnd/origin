<script setup lang="ts">
import type { ProjectConventionContent } from '~~/shared/types/project'

definePageMeta({
  title: 'Version'
})

const route = useRoute()
const projectId = computed(() => route.params.projectId as string)
const conventionId = computed(() => route.params.conventionId as string)
const versionId = computed(() => route.params.versionId as string)

const { data: revision, status } = await useFetch<ProjectConventionContent>(
  () => `/api/projects/${projectId.value}/conventions/${conventionId.value}/versions/${versionId.value}/content`
)
</script>

<template>
  <ConventionRevision
    :revision="revision"
    :pending="status === 'pending'"
    :back-to="`/projects/${projectId}/conventions/${conventionId}`"
    empty-message="This version could not be found."
  />
</template>
