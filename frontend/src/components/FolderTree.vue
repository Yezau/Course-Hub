<template>
  <div v-if="nodes.length" class="space-y-1">
    <div v-for="folder in nodes" :key="folder.id" class="space-y-1">
      <div
        class="group flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition"
        :class="[
          currentFolderId === folder.id
            ? 'bg-sky-100 text-sky-900 shadow-sm'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
          dropFolderId === folder.id ? 'ring-1 ring-sky-300 bg-sky-50' : ''
        ]"
        :style="{ paddingLeft: `${level * 14 + 12}px` }"
        @click="$emit('select-folder', folder.id)"
        @dragover.prevent="draggingEnabled ? $emit('drag-over-folder', folder.id) : null"
        @drop.prevent="$emit('drop-folder', folder.id)"
      >
        <button
          v-if="hasChildren(folder)"
          type="button"
          class="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"
          @click.stop="$emit('toggle-folder', folder.id)"
        >
          <svg
            class="h-3.5 w-3.5 transition-transform"
            :class="{ 'rotate-90': isExpanded(folder.id) }"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M7.05 4.55a.75.75 0 011.06 0l4.9 4.9a.75.75 0 010 1.06l-4.9 4.9a.75.75 0 11-1.06-1.06L11.42 10 7.05 5.61a.75.75 0 010-1.06z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
        <span v-else class="block h-6 w-6 shrink-0"></span>

        <div class="flex min-w-0 flex-1 items-center gap-2">
          <svg class="h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M3 5.75A1.75 1.75 0 014.75 4h5.31c.47 0 .91.22 1.2.58l1.42 1.8c.1.13.25.2.42.2h6.17A1.75 1.75 0 0121 8.33v9.92A1.75 1.75 0 0119.25 20H4.75A1.75 1.75 0 013 18.25V5.75z"
            />
          </svg>
          <span class="truncate font-medium">{{ folder.name }}</span>
        </div>

        <span
          v-if="folder.material_count || folder.child_count"
          class="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-slate-500"
        >
          {{ folder.material_count || 0 }}/{{ folder.child_count || 0 }}
        </span>
      </div>

      <FolderTree
        v-if="isExpanded(folder.id)"
        :folders="folders"
        :current-folder-id="currentFolderId"
        :expanded-ids="expandedIds"
        :drop-folder-id="dropFolderId"
        :dragging-enabled="draggingEnabled"
        :parent-id="folder.id"
        :level="level + 1"
        @select-folder="$emit('select-folder', $event)"
        @toggle-folder="$emit('toggle-folder', $event)"
        @drag-over-folder="$emit('drag-over-folder', $event)"
        @drop-folder="$emit('drop-folder', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  folders: {
    type: Array,
    required: true
  },
  currentFolderId: {
    type: [Number, String],
    default: null
  },
  expandedIds: {
    type: Array,
    default: () => []
  },
  dropFolderId: {
    type: [Number, String],
    default: null
  },
  draggingEnabled: {
    type: Boolean,
    default: false
  },
  parentId: {
    type: [Number, String],
    default: null
  },
  level: {
    type: Number,
    default: 0
  }
})

defineEmits(['select-folder', 'toggle-folder', 'drag-over-folder', 'drop-folder'])

const normalizeId = (value) => (value === undefined || value === null || value === '' ? null : Number(value))

const nodes = computed(() => {
  return props.folders.filter((folder) => normalizeId(folder.parent_id) === normalizeId(props.parentId))
})

function isExpanded(folderId) {
  return props.expandedIds.includes(folderId)
}

function hasChildren(folder) {
  if (Number(folder.child_count || 0) > 0) {
    return true
  }

  return props.folders.some((item) => normalizeId(item.parent_id) === normalizeId(folder.id))
}
</script>
