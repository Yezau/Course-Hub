<template>
  <span
    ref="triggerRef"
    class="inline-flex items-center"
    tabindex="0"
    @mouseenter="showTooltip"
    @mouseleave="hideTooltip"
    @focus="showTooltip"
    @blur="hideTooltip"
  >
    <span
      class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold text-slate-500 transition hover:border-sky-300 hover:text-sky-600 focus:outline-none focus-visible:border-sky-400 focus-visible:text-sky-600"
      aria-hidden="true"
    >
      ?
    </span>
  </span>

  <Teleport to="body">
    <span
      v-if="visible"
      ref="tooltipRef"
      class="pointer-events-none fixed z-[100] w-56 rounded-xl bg-slate-950 px-3 py-2 text-[11px] leading-5 text-white shadow-xl"
      :style="tooltipStyle"
      role="tooltip"
    >
      {{ text }}
    </span>
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  text: {
    type: String,
    required: true
  }
})

const EDGE_OFFSET = 8
const GAP = 8

const triggerRef = ref(null)
const tooltipRef = ref(null)
const visible = ref(false)
const tooltipStyle = ref({
  top: '-9999px',
  left: '-9999px'
})

function updatePosition() {
  if (!triggerRef.value || !tooltipRef.value) {
    return
  }

  const triggerRect = triggerRef.value.getBoundingClientRect()
  const tooltipRect = tooltipRef.value.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2)
  left = Math.max(EDGE_OFFSET, Math.min(left, viewportWidth - tooltipRect.width - EDGE_OFFSET))

  let top = triggerRect.bottom + GAP
  if (top + tooltipRect.height > viewportHeight - EDGE_OFFSET) {
    top = triggerRect.top - tooltipRect.height - GAP
  }

  top = Math.max(EDGE_OFFSET, top)

  tooltipStyle.value = {
    top: `${top}px`,
    left: `${left}px`
  }
}

function showTooltip() {
  visible.value = true
  nextTick(updatePosition)
}

function hideTooltip() {
  visible.value = false
}

function handleViewportChange() {
  if (!visible.value) {
    return
  }

  updatePosition()
}

function bindViewportListeners() {
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
}

function unbindViewportListeners() {
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
}

watch(visible, (isVisible) => {
  if (isVisible) {
    bindViewportListeners()
    nextTick(updatePosition)
    return
  }

  unbindViewportListeners()
})

onBeforeUnmount(() => {
  unbindViewportListeners()
})
</script>
