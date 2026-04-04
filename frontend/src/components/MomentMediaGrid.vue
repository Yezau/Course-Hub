<template>
  <div v-if="visibleMedia.length">
    <div v-if="isSingleMedia && isVideoMediaItem(visibleMedia[0])"
      class="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100" :class="singleWrapperClass">
      <div v-if="isMediaFailed(visibleMedia[0])"
        class="flex min-h-[220px] items-center justify-center bg-slate-100 text-sm text-slate-400">
        媒体加载失败
      </div>
      <video v-else :src="mediaSrc(visibleMedia[0])" :title="visibleMedia[0].file_name || fallbackAlt" controls
        playsinline preload="metadata" class="block w-full bg-slate-950 object-contain" :class="singleVideoClass"
        @error="markMediaFailed(visibleMedia[0])" @click.stop />

      <button v-if="clickable" type="button"
        class="absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-black/75"
        @click="handleVideoPreviewClick($event, visibleMedia[0])">
        放大
      </button>
    </div>

    <component :is="clickable ? 'button' : 'div'" v-else-if="isSingleMedia" :type="clickable ? 'button' : undefined"
      class="block overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
      :class="[singleWrapperClass, clickable ? 'cursor-zoom-in text-left' : '']"
      @click="clickable ? handlePreviewClick($event, visibleMedia[0]) : undefined">
      <div v-if="isMediaFailed(visibleMedia[0])"
        class="flex min-h-[220px] items-center justify-center bg-slate-100 text-sm text-slate-400">
        图片加载失败
      </div>
      <img v-else :src="mediaSrc(visibleMedia[0])" :alt="visibleMedia[0].file_name || fallbackAlt" loading="lazy"
        class="block w-full bg-slate-100 object-contain" :class="singleImageClass"
        @error="markMediaFailed(visibleMedia[0])" />
    </component>

    <div v-else class="grid gap-2" :class="gridClass">
      <component :is="clickable ? 'button' : 'div'" v-for="(media, index) in visibleMedia" :key="mediaKey(media)"
        :type="clickable ? 'button' : undefined"
        class="relative aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
        :class="clickable && !isVideoMediaItem(media) ? 'cursor-zoom-in text-left' : ''"
        @click="clickable && !isVideoMediaItem(media) ? handlePreviewClick($event, media) : undefined">
        <template v-if="isVideoMediaItem(media)">
          <div v-if="isMediaFailed(media)"
            class="flex h-full items-center justify-center bg-slate-100 px-3 text-center text-xs text-slate-400">
            媒体加载失败
          </div>
          <video v-else :src="mediaSrc(media)" :title="media.file_name || fallbackAlt" controls playsinline
            preload="metadata" class="h-full w-full bg-slate-950 object-cover" @error="markMediaFailed(media)"
            @click.stop />

          <button v-if="clickable" type="button"
            class="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white transition hover:bg-black/75"
            @click="handleVideoPreviewClick($event, media)">
            放大
          </button>
        </template>

        <template v-else>
          <div v-if="isMediaFailed(media)"
            class="flex h-full items-center justify-center bg-slate-100 px-3 text-center text-xs text-slate-400">
            图片加载失败
          </div>
          <img v-else :src="mediaSrc(media)" :alt="media.file_name || fallbackAlt" loading="lazy"
            class="h-full w-full object-cover" @error="markMediaFailed(media)" />
        </template>

        <div
          v-if="!isVideoMediaItem(media) && showOverflowCount && index === visibleMedia.length - 1 && hiddenCount > 0"
          class="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-semibold text-white">
          +{{ hiddenCount }}
        </div>
      </component>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { isVideoMedia, resolveProtectedMediaUrl, sortPostMedia } from '@/utils/postUtils'

const emit = defineEmits(['preview-image', 'preview-video'])

const props = defineProps({
  media: {
    type: Array,
    default: () => []
  },
  previewLimit: {
    type: Number,
    default: 9
  },
  clickable: {
    type: Boolean,
    default: false
  },
  compact: {
    type: Boolean,
    default: false
  },
  fallbackAlt: {
    type: String,
    default: '帖子配图'
  },
  showOverflowCount: {
    type: Boolean,
    default: false
  }
})

const failedMediaKeys = ref(new Set())

const sortedMedia = computed(() => sortPostMedia(props.media || []))
const visibleMedia = computed(() => sortedMedia.value.slice(0, props.previewLimit))
const hiddenCount = computed(() => Math.max(0, sortedMedia.value.length - props.previewLimit))
const isSingleMedia = computed(() => visibleMedia.value.length === 1)

const gridClass = computed(() => {
  const count = visibleMedia.value.length

  if (count === 2 || count === 4) {
    return 'grid-cols-2 max-w-[260px] sm:max-w-[360px]'
  }

  return 'grid-cols-3 max-w-[360px] sm:max-w-[460px]'
})

const singleWrapperClass = computed(() => {
  return props.compact
    ? 'max-w-[260px] sm:max-w-[340px]'
    : 'max-w-[320px] sm:max-w-[460px]'
})

const singleImageClass = computed(() => {
  return props.compact ? 'max-h-[320px]' : 'max-h-[480px]'
})

const singleVideoClass = computed(() => {
  return props.compact ? 'max-h-[320px]' : 'max-h-[520px]'
})

function mediaKey(media) {
  return String(media?.id || media?.url || media?.file_name || Math.random())
}

function mediaSrc(media) {
  return resolveProtectedMediaUrl(media?.url || '')
}

function isVideoMediaItem(media) {
  return isVideoMedia(media)
}

function handlePreviewClick(event, media) {
  event?.preventDefault?.()
  event?.stopPropagation?.()

  const src = mediaSrc(media)
  if (!src) {
    return
  }

  emit('preview-image', {
    src,
    alt: media?.file_name || props.fallbackAlt
  })
}

function handleVideoPreviewClick(event, media) {
  event?.preventDefault?.()
  event?.stopPropagation?.()

  const src = mediaSrc(media)
  if (!src) {
    return
  }

  emit('preview-video', {
    src,
    title: media?.file_name || props.fallbackAlt
  })
}

function isMediaFailed(media) {
  return failedMediaKeys.value.has(mediaKey(media))
}

function markMediaFailed(media) {
  const next = new Set(failedMediaKeys.value)
  next.add(mediaKey(media))
  failedMediaKeys.value = next
}
</script>
