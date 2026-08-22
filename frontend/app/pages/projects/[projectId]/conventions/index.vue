<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type {
  ProjectConventionActivation,
  ProjectConventionListResponse,
  ProjectConventionMetadata,
  ProjectConventionSummary
} from '~~/shared/types/project'

definePageMeta({
  title: 'Conventions'
})

const route = useRoute()
const toast = useToast()
const projectId = computed(() => route.params.projectId as string)

const page = ref(1)
const pageSize = 12

const { data, status, refresh } = await useFetch<ProjectConventionListResponse>(
  () => `/api/projects/${projectId.value}/conventions`,
  {
    query: { page, pageSize },
    watch: [page]
  }
)

// A local copy of the page, because dragging rearranges rows before the server has
// confirmed the new order.
const items = ref<ProjectConventionSummary[]>([])

// TanStack keys expansion by row index, so it has to be dropped whenever the rows
// underneath those indexes change.
const expanded = ref<Record<string, boolean>>({})

watch(data, (value) => {
  items.value = [...(value?.items ?? [])]
  expanded.value = {}
}, { immediate: true })

const totalCount = computed(() => data.value?.totalCount ?? 0)
const activeCount = computed(() => items.value.filter(convention => convention.isActive).length)

// Conventions come back in execution order, so a row's position on the page is its place
// in that order. Reading it off the page rather than off `priority` keeps the numbering
// honest while a reorder is still in flight.
function position(index: number) {
  return ((page.value - 1) * pageSize) + index + 1
}

const busy = ref(new Set<string>())

function setBusy(conventionId: string, value: boolean) {
  const next = new Set(busy.value)

  if (value) {
    next.add(conventionId)
  } else {
    next.delete(conventionId)
  }

  busy.value = next
}

async function toggle(convention: ProjectConventionSummary) {
  if (busy.value.has(convention.id)) {
    return
  }

  const wasActive = convention.isActive

  // Flip first so the switch answers immediately, then settle on whatever state the
  // server says it landed on.
  convention.isActive = !wasActive
  setBusy(convention.id, true)

  try {
    const result = await $fetch<ProjectConventionActivation>(
      `/api/projects/${projectId.value}/conventions/${convention.id}/toggle`,
      { method: 'POST' }
    )

    convention.isActive = result.isActive
  } catch {
    convention.isActive = wasActive
    toast.add({ title: `Could not turn "${convention.name}" ${wasActive ? 'off' : 'on'}.`, color: 'error' })
  } finally {
    setBusy(convention.id, false)
  }
}

const reordering = ref(false)

// Sends the page's order, rolling back to `previous` if the server refuses it. Moves stay
// within the loaded page: the rows off-page are not loaded, so the server leaves them in
// the execution slots they already hold.
async function persistOrder(previous: ProjectConventionSummary[]) {
  reordering.value = true

  try {
    await $fetch(`/api/projects/${projectId.value}/conventions/re-order`, {
      method: 'POST',
      body: { conventionIds: items.value.map(convention => convention.id) }
    })
  } catch {
    items.value = previous
    toast.add({ title: 'Could not save the new order.', color: 'error' })
  } finally {
    reordering.value = false
  }
}

function reorderLocally(from: number, to: number) {
  const next = [...items.value]
  const [moved] = next.splice(from, 1)

  next.splice(to, 0, moved!)
  items.value = next
  expanded.value = {}
}

async function move(index: number, offset: -1 | 1) {
  const target = index + offset

  if (reordering.value || target < 0 || target >= items.value.length) {
    return
  }

  const previous = items.value

  reorderLocally(index, target)
  await persistOrder(previous)
}

// Reordering from the keyboard moves the row out from under the focused handle, so focus
// has to follow it to its new position.
async function moveByKey(index: number, offset: -1 | 1) {
  const target = index + offset

  if (reordering.value || target < 0 || target >= items.value.length) {
    return
  }

  await move(index, offset)
  await nextTick()

  document.querySelector<HTMLElement>(`[data-row-index="${target}"]`)?.focus()
}

const dragIndex = ref<number | null>(null)
const dragSnapshot = ref<ProjectConventionSummary[] | null>(null)

// The table owns its own `tr` elements, so a row is identified by the marker its drag
// handle carries. Expanded description rows have no handle, and so are never drop targets.
function rowIndexFrom(event: DragEvent) {
  const marker = (event.target as HTMLElement | null)
    ?.closest('tr')
    ?.querySelector<HTMLElement>('[data-row-index]')

  return marker ? Number(marker.dataset.rowIndex) : null
}

function onDragStart(index: number, event: DragEvent) {
  if (reordering.value) {
    event.preventDefault()
    return
  }

  dragIndex.value = index
  dragSnapshot.value = items.value
  expanded.value = {}

  // Firefox will not start a drag without a payload.
  event.dataTransfer?.setData('text/plain', items.value[index]!.id)

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

// Rows are rearranged as the pointer passes over them, so the list itself is the drag
// preview and there is no separate drop indicator to keep in sync.
function onDragOver(event: DragEvent) {
  if (dragIndex.value === null) {
    return
  }

  const over = rowIndexFrom(event)

  if (over === null) {
    return
  }

  event.preventDefault()

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }

  if (over !== dragIndex.value) {
    reorderLocally(dragIndex.value, over)
    dragIndex.value = over
  }
}

// Runs on drop and again on dragend, which is what catches a drag released outside the
// table; the null check makes the second call a no-op.
async function endDrag(event?: DragEvent) {
  event?.preventDefault()

  if (dragIndex.value === null) {
    return
  }

  const previous = dragSnapshot.value

  dragIndex.value = null
  dragSnapshot.value = null

  if (!previous || previous.every((convention, index) => convention.id === items.value[index]?.id)) {
    return
  }

  await persistOrder(previous)
}

const pendingDelete = ref<ProjectConventionSummary | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  const convention = pendingDelete.value

  if (!convention) {
    return
  }

  deleting.value = true

  try {
    await $fetch(`/api/projects/${projectId.value}/conventions/${convention.id}`, { method: 'DELETE' })

    // Deleting the only row on a page would leave it empty, so step back instead.
    if (items.value.length === 1 && page.value > 1) {
      page.value -= 1
    } else {
      await refresh()
    }

    pendingDelete.value = null
    toast.add({ title: `Deleted "${convention.name}".`, color: 'success' })
  } catch {
    toast.add({ title: `Could not delete "${convention.name}".`, color: 'error' })
  } finally {
    deleting.value = false
  }
}

// null means the project has no conventions yet, so there is no row to insert below.
const insertAfter = ref<number | null>(null)
const createOpen = ref(false)
const creating = ref(false)
const draftName = ref('')
const draftDescription = ref('')

function openCreate(afterIndex: number | null) {
  insertAfter.value = afterIndex
  draftName.value = ''
  draftDescription.value = ''
  createOpen.value = true
}

async function create() {
  const name = draftName.value.trim()

  if (!name) {
    toast.add({ title: 'A convention needs a name.', color: 'error' })
    return
  }

  creating.value = true

  try {
    const created = await $fetch<ProjectConventionMetadata>(
      `/api/projects/${projectId.value}/conventions`,
      {
        method: 'POST',
        body: { name, description: draftDescription.value.trim() || null }
      }
    )

    // A new convention runs last, so it has to be moved into place. That takes the whole
    // project's order, not just this page's: rearranging a page's slots alone would push
    // the page's last convention past the ones on the page after it.
    if (insertAfter.value !== null) {
      const all = await $fetch<ProjectConventionListResponse>(
        `/api/projects/${projectId.value}/conventions`,
        { query: { page: 1, pageSize: 100 } }
      )

      const order = all.items.map(convention => convention.id).filter(id => id !== created.id)

      order.splice(position(insertAfter.value), 0, created.id)

      await $fetch(`/api/projects/${projectId.value}/conventions/re-order`, {
        method: 'POST',
        body: { conventionIds: order }
      })
    }

    await refresh()

    createOpen.value = false
    toast.add({ title: `Added "${created.name}".`, color: 'success' })
  } catch {
    toast.add({ title: 'Could not add the convention.', color: 'error' })
  } finally {
    creating.value = false
  }
}

const columns: TableColumn<ProjectConventionSummary>[] = [
  { id: 'drag', header: '' },
  { id: 'expand', header: '' },
  { id: 'order', header: '#' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'versionCount', header: 'Versions' },
  { accessorKey: 'latestVersionCreatedAtUtc', header: 'Last updated' },
  { accessorKey: 'isActive', header: 'Active' },
  { id: 'actions', header: '' }
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
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-muted">
          {{ activeCount }} of {{ items.length }} active, in execution order.
        </p>

        <UIcon
          v-if="reordering"
          name="i-lucide-loader-2"
          class="size-4 animate-spin text-muted"
        />
      </div>

      <!-- Drop targets are resolved by delegation, because the rows belong to the table. -->
      <div
        @dragover="onDragOver"
        @drop="endDrag"
      >
        <UTable
          v-model:expanded="expanded"
          :data="items"
          :columns="columns"
          class="rounded-xl ring ring-default bg-default"
          :ui="{ tr: 'cursor-pointer data-[selectable=true]:hover:bg-elevated/50 data-[expanded=true]:bg-elevated/50' }"
          @select="(_event, row) => open(row.original)"
        >
          <template #drag-cell="{ row }">
            <div @click.stop>
              <UButton
                :data-row-index="row.index"
                draggable="true"
                icon="i-lucide-grip-vertical"
                variant="ghost"
                color="neutral"
                size="xs"
                square
                class="cursor-grab active:cursor-grabbing"
                :disabled="reordering"
                :aria-label="`Reorder ${row.original.name}: drag, or press the up and down arrow keys`"
                @dragstart="onDragStart(row.index, $event)"
                @dragend="endDrag()"
                @keydown.up.prevent="moveByKey(row.index, -1)"
                @keydown.down.prevent="moveByKey(row.index, 1)"
              />
            </div>
          </template>

          <template #expand-cell="{ row }">
            <div @click.stop>
              <UButton
                v-if="row.original.description"
                icon="i-lucide-chevron-down"
                variant="ghost"
                color="neutral"
                size="xs"
                square
                :aria-label="`${row.getIsExpanded() ? 'Hide' : 'Show'} what ${row.original.name} checks for`"
                :ui="{ leadingIcon: ['transition-transform', row.getIsExpanded() ? 'duration-200 rotate-180' : ''] }"
                @click="row.toggleExpanded()"
              />
            </div>
          </template>

          <template #order-cell="{ row }">
            <span class="tabular-nums text-muted">{{ position(row.index) }}</span>
          </template>

          <template #name-cell="{ row }">
            <span
              class="font-medium"
              :class="row.original.isActive ? 'text-highlighted' : 'text-muted'"
            >{{ row.original.name }}</span>
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

          <template #isActive-cell="{ row }">
            <div @click.stop>
              <USwitch
                :model-value="row.original.isActive"
                :loading="busy.has(row.original.id)"
                :aria-label="`Turn ${row.original.name} ${row.original.isActive ? 'off' : 'on'}`"
                @update:model-value="toggle(row.original)"
              />
            </div>
          </template>

          <template #expanded="{ row }">
            <!-- The expanded cell inherits the table's whitespace-nowrap, which a paragraph
                 of prose has no use for. -->
            <p class="max-w-3xl px-2 py-1 text-muted whitespace-normal">
              {{ row.original.description }}
            </p>
          </template>

          <template #actions-cell="{ row }">
            <div
              class="flex justify-end gap-1"
              @click.stop
            >
              <UButton
                icon="i-lucide-plus"
                variant="ghost"
                color="neutral"
                size="sm"
                :aria-label="`Add a convention below ${row.original.name}`"
                @click="openCreate(row.index)"
              />

              <UButton
                icon="i-lucide-trash-2"
                variant="ghost"
                color="error"
                size="sm"
                :aria-label="`Delete ${row.original.name}`"
                @click="pendingDelete = row.original"
              />
            </div>
          </template>
        </UTable>
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
      class="flex flex-col items-center gap-4 py-20 text-center"
    >
      <p class="text-4xl text-dimmed select-none">
        :/
      </p>

      <p class="text-muted">
        No conventions for this project yet.
      </p>

      <UButton
        icon="i-lucide-plus"
        label="Add a convention"
        @click="openCreate(null)"
      />
    </div>

    <UModal
      v-model:open="createOpen"
      title="New convention"
      :description="insertAfter === null
        ? 'It will be the first convention this project runs.'
        : `It will run at position ${position(insertAfter) + 1}.`"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField
            label="Name"
            required
          >
            <UInput
              v-model="draftName"
              placeholder="Duplicate Doors"
              autofocus
              class="w-full"
              @keydown.enter="create"
            />
          </UFormField>

          <UFormField
            label="Description"
            hint="Optional"
          >
            <UTextarea
              v-model="draftDescription"
              :rows="2"
              autoresize
              placeholder="What this convention checks for."
              class="w-full"
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            :disabled="creating"
            @click="createOpen = false"
          />
          <UButton
            icon="i-lucide-plus"
            label="Create"
            :loading="creating"
            @click="create"
          />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!pendingDelete"
      title="Delete this convention?"
      :description="pendingDelete
        ? `“${pendingDelete.name}” and every version of it will be removed. This cannot be undone.`
        : undefined"
      @update:open="(value: boolean) => { if (!value) pendingDelete = null }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            :disabled="deleting"
            @click="pendingDelete = null"
          />
          <UButton
            color="error"
            icon="i-lucide-trash-2"
            label="Delete"
            :loading="deleting"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
