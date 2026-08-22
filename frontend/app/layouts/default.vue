<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { ProjectListResponse } from '~~/shared/types/project'

const route = useRoute()

const { data } = await useFetch<ProjectListResponse>('/api/projects', {
  query: { pageSize: 100 }
})

const links = computed<NavigationMenuItem[]>(() => [{
  label: 'Projects',
  icon: 'i-lucide-folder',
  to: '/projects',
  defaultOpen: true,
  children: (data.value?.items ?? []).map(project => ({
    label: project.name,
    to: `/projects/${project.id}/conventions`
  }))
}])
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar>
      <template #header>
        <NuxtLink
          to="/"
          class="flex items-center gap-2 focus-visible:outline-3 outline-primary/25 rounded-md p-1 -ms-1"
        >
          <AppLogo class="w-auto h-6 shrink-0" />
        </NuxtLink>
      </template>

      <UNavigationMenu
        :items="links"
        orientation="vertical"
      />

      <template #footer>
        <UColorModeButton />
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar :title="(route.meta.title as string | undefined) ?? 'Dashboard'">
          <template #left>
            <UDashboardSidebarToggle class="lg:hidden" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
