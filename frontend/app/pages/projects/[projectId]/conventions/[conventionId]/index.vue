<script setup lang="ts">
import type {
  ProjectConventionActivation,
  ProjectConventionDetail,
  ProjectConventionMetadata
} from '~~/shared/types/project'

definePageMeta({
  title: 'Convention'
})

const route = useRoute()
const toast = useToast()

const projectId = computed(() => route.params.projectId as string)
const conventionId = computed(() => route.params.conventionId as string)

const { data: convention, status } = await useFetch<ProjectConventionDetail>(
  () => `/api/projects/${projectId.value}/conventions/${conventionId.value}`
)

// Newest first, as the API returns them.
const versions = computed(() => convention.value?.versions ?? [])

const name = ref('')
const description = ref('')

watch(convention, (value) => {
  name.value = value?.name ?? ''
  description.value = value?.description ?? ''
}, { immediate: true })

const dirty = computed(() =>
  name.value !== (convention.value?.name ?? '')
  || description.value !== (convention.value?.description ?? ''))

const saving = ref(false)

async function save() {
  if (!name.value.trim()) {
    toast.add({ title: 'A convention needs a name.', color: 'error' })
    return
  }

  saving.value = true

  try {
    const saved = await $fetch<ProjectConventionMetadata>(
      `/api/projects/${projectId.value}/conventions/${conventionId.value}/metadata`,
      {
        method: 'POST',
        body: { name: name.value.trim(), description: description.value.trim() || null }
      }
    )

    if (convention.value) {
      convention.value = { ...convention.value, name: saved.name, description: saved.description }
    }

    toast.add({ title: 'Convention saved.', color: 'success' })
  } catch {
    toast.add({ title: 'Could not save the convention.', color: 'error' })
  } finally {
    saving.value = false
  }
}

const toggling = ref(false)

// Activation is not part of the metadata form: it takes effect on its own, without a save.
async function toggleActive() {
  if (!convention.value || toggling.value) {
    return
  }

  const wasActive = convention.value.isActive

  convention.value = { ...convention.value, isActive: !wasActive }
  toggling.value = true

  try {
    const result = await $fetch<ProjectConventionActivation>(
      `/api/projects/${projectId.value}/conventions/${conventionId.value}/toggle`,
      { method: 'POST' }
    )

    if (convention.value) {
      convention.value = { ...convention.value, isActive: result.isActive }
    }
  } catch {
    if (convention.value) {
      convention.value = { ...convention.value, isActive: wasActive }
    }

    toast.add({ title: `Could not turn this convention ${wasActive ? 'off' : 'on'}.`, color: 'error' })
  } finally {
    toggling.value = false
  }
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

    <template v-else-if="convention">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <UButton
          :to="`/projects/${projectId}/conventions`"
          icon="i-lucide-arrow-left"
          variant="link"
          color="neutral"
          size="sm"
          class="-ms-2"
          label="All conventions"
        />

        <USwitch
          :model-value="convention.isActive"
          :loading="toggling"
          :label="convention.isActive ? 'Active' : 'Inactive'"
          :description="convention.isActive
            ? `Runs ${convention.priority === 0 ? 'first' : `in position ${convention.priority + 1}`} for this project.`
            : 'Skipped for this project.'"
          @update:model-value="toggleActive"
        />
      </div>

      <div class="flex flex-col gap-4 rounded-xl ring ring-default bg-default p-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            label="Name"
            required
          >
            <UInput
              v-model="name"
              placeholder="Duplicate Doors"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Description"
            hint="Optional"
          >
            <UTextarea
              v-model="description"
              :rows="2"
              autoresize
              placeholder="What this convention checks for."
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2">
          <UButton
            :to="`/projects/${projectId}/conventions/${conventionId}/latest`"
            :disabled="!versions.length"
            icon="i-lucide-file-text"
            variant="subtle"
            color="neutral"
            label="View latest"
          />

          <UButton
            :loading="saving"
            :disabled="!dirty"
            icon="i-lucide-save"
            label="Save"
            @click="save"
          />
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <h2 class="text-sm font-medium text-highlighted">
          Version history
        </h2>

        <div
          v-if="versions.length"
          class="divide-y divide-default rounded-xl ring ring-default bg-default"
        >
          <div
            v-for="version in versions"
            :key="version.id"
            class="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div class="flex items-baseline gap-3">
              <span class="font-medium text-highlighted">Version {{ version.number }}</span>
              <span class="text-sm text-muted">{{ new Date(version.createdAtUtc).toLocaleString() }}</span>
            </div>

            <UButton
              :to="`/projects/${projectId}/conventions/${conventionId}/versions/${version.id}`"
              icon="i-lucide-eye"
              variant="ghost"
              color="neutral"
              size="sm"
              label="View version"
            />
          </div>
        </div>

        <p
          v-else
          class="rounded-xl ring ring-default bg-default px-4 py-6 text-center text-muted"
        >
          No revisions yet.
        </p>
      </div>
    </template>

    <div
      v-else
      class="flex flex-col items-center gap-2 py-16 text-center"
    >
      <UIcon
        name="i-lucide-file-question"
        class="size-8 text-muted"
      />
      <p class="text-muted">
        This convention could not be found.
      </p>
    </div>
  </div>
</template>
