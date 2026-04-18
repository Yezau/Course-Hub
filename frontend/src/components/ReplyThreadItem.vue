<template>
  <div :class="wrapperClass">
    <div class="flex items-start gap-3">
      <div class="ui-moment-avatar-sm">
        {{ getAuthorInitial(reply.author_name) }}
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
          <span class="font-medium text-slate-700">{{ reply.author_name || '匿名用户' }}</span>
          <span>{{ formatDate(reply.created_at) }}</span>
          <span class="rounded-full bg-white px-2 py-0.5 text-xs text-slate-400">#{{ reply.id }}</span>
        </div>

        <p v-if="reply.parent_author_name" class="mt-2 text-xs text-slate-400">
          回复 {{ reply.parent_author_name }}
        </p>

        <div class="discussion-markdown mt-3" v-html="renderedContent" @click="handleContentClick"></div>

        <div class="mt-3 flex items-center gap-3">
          <button type="button" class="text-xs font-medium text-slate-500 transition hover:text-slate-900"
            @click="$emit('reply', reply)">
            {{ isReplyingHere ? '收起回复' : '回复' }}
          </button>
          <button v-if="reply.can_delete" type="button"
            class="text-xs font-medium text-rose-600 transition hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="deleting" @click="$emit('delete', reply)">
            {{ deleting ? '删除中...' : '删除' }}
          </button>
        </div>

        <form v-if="isReplyingHere" class="mt-3" @submit.prevent="$emit('submit-reply', reply)">
          <div class="rounded-2xl border border-slate-200 bg-white p-3">
            <p class="text-xs text-slate-500">回复 {{ reply.author_name || '该评论' }}</p>
            <MentionTextarea :modelValue="draftContent" @update:modelValue="$emit('update:draftContent', $event)"
              :rows="4" maxlength="2000" placeholder="写下你的回复..." customClass="mt-3 min-h-[120px]" />
            <div class="mt-3 flex justify-end gap-2">
              <button type="button" class="ui-button-secondary" @click="$emit('cancel-reply')">
                取消
              </button>
              <button type="submit" :disabled="submitting"
                class="ui-button-primary disabled:cursor-not-allowed disabled:opacity-60">
                {{ submitting ? '提交中...' : '发送回复' }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import { getAuthorInitial } from '@/utils/postUtils'
import { formatUtc8DateTime } from '@/utils/dateTime'
import MentionTextarea from './MentionTextarea.vue'

const props = defineProps({
  reply: {
    type: Object,
    required: true
  },
  nested: {
    type: Boolean,
    default: false
  },
  activeReplyId: {
    type: [Number, String],
    default: null
  },
  draftContent: {
    type: String,
    default: ''
  },
  submitting: {
    type: Boolean,
    default: false
  },
  deleting: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['reply', 'delete', 'cancel-reply', 'update:draftContent', 'submit-reply', 'preview-image'])

const isReplyingHere = computed(() => Number(props.activeReplyId) === Number(props.reply?.id))
const renderedContent = computed(() => renderMarkdown(props.reply?.content || ''))
const wrapperClass = computed(() => {
  return props.nested
    ? 'rounded-2xl border border-slate-200 bg-white px-4 py-4'
    : 'rounded-2xl bg-slate-50 px-4 py-4'
})

const IMAGE_PREVIEW_LINK_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg)(?:$|[?#])/i
const PROTECTED_MEDIA_LINK_PATTERN = /^\/(?:api\/)?posts\/media\/\d+\/file(?:$|[?#])/i

function formatDate(dateString) {
  return formatUtc8DateTime(dateString, '')
}

function canPreviewFromHref(href) {
  const normalizedHref = String(href || '').trim()
  if (!normalizedHref || normalizedHref === '#') {
    return false
  }

  try {
    const parsed = new URL(normalizedHref, window.location.origin)
    return IMAGE_PREVIEW_LINK_PATTERN.test(`${parsed.pathname}${parsed.search}`)
      || PROTECTED_MEDIA_LINK_PATTERN.test(`${parsed.pathname}${parsed.search}`)
  } catch (error) {
    return false
  }
}

function handleContentClick(event) {
  const imageElement = event?.target?.closest?.('img')
  if (imageElement) {
    const src = imageElement.getAttribute('src') || ''
    if (!src) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    emit('preview-image', {
      src,
      alt: imageElement.getAttribute('alt') || '评论图片'
    })
    return
  }

  const anchorElement = event?.target?.closest?.('a[href]')
  const href = anchorElement?.getAttribute?.('href') || ''
  if (!anchorElement || !canPreviewFromHref(href)) {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  emit('preview-image', {
    src: href,
    alt: anchorElement.textContent?.trim() || '评论图片'
  })
}
</script>
