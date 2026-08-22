<script setup lang="ts">
import type { ProjectConventionDetail, ProjectConventionMetadata } from '~~/shared/types/project'

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

const name = ref('')
const description = ref('')
const content = ref('')

watch(convention, (value) => {
  name.value = value?.name ?? ''
  description.value = value?.description ?? ''
  content.value = value?.content ?? ''
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
</script>

<template>
  <div class="flex flex-col gap-4 h-full p-4 sm:p-6">
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
      <UButton
        :to="`/projects/${projectId}/conventions`"
        icon="i-lucide-arrow-left"
        variant="link"
        color="neutral"
        size="sm"
        class="self-start -ms-2"
        label="All conventions"
      />

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

        <div class="flex items-center justify-between gap-3">
          <p class="text-sm text-muted">
            {{ convention.versionCount }} version{{ convention.versionCount === 1 ? '' : 's' }}
            <template v-if="convention.latestVersionCreatedAtUtc">
              · last updated {{ new Date(convention.latestVersionCreatedAtUtc).toLocaleString() }}
            </template>
          </p>

          <UButton
            :loading="saving"
            :disabled="!dirty"
            icon="i-lucide-save"
            label="Save"
            @click="save"
          />
        </div>
      </div>

      <div class="flex-1 min-h-0">
        <Editor v-model="content" />
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
