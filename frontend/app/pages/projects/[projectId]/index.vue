<script setup lang="ts">
// A project is its conventions; the bare project route is just the way in.
const route = useRoute()

await navigateTo(`/projects/${route.params.projectId}/conventions`, { replace: true })
</script>

<template>
  <div />
</template>
