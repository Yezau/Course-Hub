<template>
  <component
    :is="linkTo ? RouterLink : 'div'"
    :to="linkTo || undefined"
    class="flex min-w-0 items-center gap-3"
  >
    <span class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-900 text-sm font-semibold text-white">
      <img
        v-if="resolvedLogoUrl"
        :src="resolvedLogoUrl"
        :alt="displayTitle"
        class="h-full w-full object-cover"
      />
      <span v-else>{{ normalizedLogoText }}</span>
    </span>

    <span
      class="block min-w-0 truncate text-sm font-semibold text-slate-950 sm:text-base"
      :title="displayTitle"
    >
      {{ displayTitle }}
    </span>
  </component>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { resolveAssetUrl } from '@/utils/api'

const props = defineProps({
  title: {
    type: String,
    default: ''
  },
  logoText: {
    type: String,
    default: ''
  },
  logoUrl: {
    type: String,
    default: ''
  },
  linkTo: {
    type: String,
    default: ''
  }
})

const displayTitle = computed(() => `${props.title || ''}`.trim())

const resolvedLogoUrl = computed(() => resolveAssetUrl(props.logoUrl))

const normalizedLogoText = computed(() => {
  const source = `${props.logoText || props.title || 'S'}`.trim()
  return source.slice(0, 2).toUpperCase() || 'S'
})
</script>
