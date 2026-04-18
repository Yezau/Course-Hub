<template>
  <AppShell hide-header content-class="">
    <main class="ui-page max-w-[980px]">
      <section class="ui-surface-compact">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <button type="button" class="ui-button-secondary" @click="handleBack">
            返回讨论区
          </button>

          <div class="flex flex-wrap gap-2">
            <button v-if="canManagePin" type="button" :disabled="isPinning"
              class="rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
              :class="post?.is_pinned
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                " @click="handleTogglePin">
              {{ isPinning ? '处理中...' : post?.is_pinned ? '取消置顶' : '设为置顶' }}
            </button>
            <button v-if="canEditPost" type="button" class="ui-button-secondary" @click="showEditModal = true">
              编辑
            </button>
            <button v-if="canEditPost" type="button"
              class="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-700 transition hover:bg-rose-200"
              @click="handleDeletePost">
              删除
            </button>
          </div>
        </div>
      </section>

      <section v-if="isLoading" class="ui-empty-state">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
        <p class="mt-3 text-sm text-slate-500">动态加载中...</p>
      </section>

      <section v-else-if="!post" class="ui-empty-state">
        <h1 class="text-lg font-semibold text-slate-900">动态不存在或已删除</h1>
        <p class="mt-2 text-sm text-slate-500">返回讨论区查看其他内容。</p>
      </section>

      <section v-else class="ui-stack">
        <article class="ui-moment-card sm:px-6 sm:py-5">
          <div class="flex items-start gap-3 sm:gap-4">
            <div class="ui-moment-avatar">
              {{ getAuthorInitial(post.author_name) }}
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-base font-semibold text-slate-800">
                    {{ post.author_name || '匿名用户' }}
                  </p>
                  <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span>{{ formatDate(post.created_at) }}</span>
                    <span v-if="hasPostBeenEdited">编辑于 {{ formatDate(post.updated_at) }}</span>
                    <span>{{ post.view_count || 0 }} 次浏览</span>
                    <span>{{ replies.length }} 条回复</span>
                    <span v-if="post.is_pinned" class="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                      置顶
                    </span>
                  </div>
                </div>
              </div>

              <h1 v-if="hasPostTitle(post)" class="mt-3 text-xl font-semibold leading-8 text-slate-900">
                {{ post.title }}
              </h1>

              <div v-if="post.content" class="discussion-markdown mt-3 max-w-none" v-html="renderedPostContent"
                @click="handlePostContentClick"></div>

              <MomentMediaGrid v-if="displayMedia.length" class="mt-4" :media="displayMedia" :preview-limit="9"
                clickable @preview-image="openImagePreview" @preview-video="openVideoPreview" />

              <div class="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-400">
                发布时间：{{ formatRelativeTime(post.created_at) }}
              </div>
            </div>
          </div>
        </article>

        <section class="ui-surface-compact">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-slate-900">全部回复</h2>
            </div>

            <div class="flex items-center gap-3">
              <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                {{ replies.length }} 条
              </span>
              <button type="button" class="ui-button-secondary" @click="toggleReplyToPost">
                {{ isReplyingToPost ? '收起回复' : '回复楼主' }}
              </button>
            </div>
          </div>

          <form v-if="isReplyingToPost" class="mt-4" @submit.prevent="handleCreateReply">
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p class="text-sm font-medium text-slate-700">回复 {{ activeReplyLabel }}</p>
                  <p class="text-xs text-slate-400">{{ replyDraft.length }}/2000</p>
                </div>
              </div>

              <MentionTextarea v-model.trim="replyDraft" :rows="5" maxlength="2000" placeholder="写下你的回复..."
                customClass="mt-3 min-h-[140px]" />

              <div class="mt-3 flex justify-end gap-2">
                <button type="button" class="ui-button-secondary" @click="clearReplyTarget">
                  取消
                </button>
                <button type="submit" :disabled="isReplying"
                  class="ui-button-primary disabled:cursor-not-allowed disabled:opacity-60">
                  {{ isReplying ? '提交中...' : '发送回复' }}
                </button>
              </div>
            </div>
          </form>

          <div v-if="replyTree.length === 0"
            class="mt-6 rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            还没有回复，可以先回复楼主。
          </div>

          <ol v-else class="mt-6 space-y-4">
            <li v-for="reply in replyTree" :key="reply.id" class="space-y-3">
              <ReplyThreadItem :reply="reply" :active-reply-id="activeReplyId" :draft-content="replyDraft"
                :submitting="isReplying" :deleting="deletingReplyId === reply.id" @reply="toggleReplyToComment"
                @delete="handleDeleteReply" @cancel-reply="clearReplyTarget" @update:draftContent="replyDraft = $event"
                @submit-reply="handleCreateReply" @preview-image="openImagePreview" />

              <ol v-if="reply.children.length" class="space-y-3 border-l border-slate-200 pl-4 sm:pl-5">
                <li v-for="child in reply.children" :key="child.id">
                  <ReplyThreadItem :reply="child" nested :active-reply-id="activeReplyId" :draft-content="replyDraft"
                    :submitting="isReplying" :deleting="deletingReplyId === child.id" @reply="toggleReplyToComment"
                    @delete="handleDeleteReply" @cancel-reply="clearReplyTarget"
                    @update:draftContent="replyDraft = $event" @submit-reply="handleCreateReply"
                    @preview-image="openImagePreview" />
                </li>
              </ol>
            </li>
          </ol>
        </section>
      </section>
    </main>

    <div v-if="mediaPreview.visible" class="fixed inset-0 z-[90] bg-slate-950/85 p-4 backdrop-blur-sm"
      @click="closeMediaPreview">
      <button type="button"
        class="absolute right-4 top-4 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/20"
        @click.stop="closeMediaPreview">
        关闭
      </button>
      <div class="flex h-full items-center justify-center">
        <img v-if="mediaPreview.type === 'image'" :src="mediaPreview.src" :alt="mediaPreview.alt"
          class="max-h-[90vh] w-auto max-w-[92vw] rounded-2xl border border-white/20 bg-slate-900 object-contain shadow-2xl"
          @click.stop>

        <video v-else :src="mediaPreview.src" controls playsinline preload="metadata"
          class="max-h-[90vh] w-[92vw] max-w-4xl rounded-2xl border border-white/20 bg-slate-900 object-contain shadow-2xl"
          @click.stop />
      </div>
    </div>

    <PostEditorModal v-if="showEditModal && post" title="编辑动态" submit-label="保存修改" :submitting="isUpdating"
      :initial-value="editEditorSeed" @close="showEditModal = false" @submit="handleSubmitEdit" />
  </AppShell>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import MomentMediaGrid from '@/components/MomentMediaGrid.vue'
import PostEditorModal from '@/components/PostEditorModal.vue'
import MentionTextarea from '@/components/MentionTextarea.vue'
import ReplyThreadItem from '@/components/ReplyThreadItem.vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/utils/api'
import { renderMarkdown } from '@/utils/markdown'
import { buildPostRequestBody, getAuthorInitial, getPostMediaList, hasPostTitle } from '@/utils/postUtils'
import { formatUtc8DateTime, getUtc8Timestamp } from '@/utils/dateTime'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isLoading = ref(false)
const isUpdating = ref(false)
const isReplying = ref(false)
const isPinning = ref(false)
const showEditModal = ref(false)
const deletingReplyId = ref(null)

const post = ref(null)
const replies = ref([])
const replyDraft = ref('')
const activeReplyTarget = ref(null)
const mediaPreview = ref({
  visible: false,
  type: 'image',
  src: '',
  alt: ''
})
const IMAGE_PREVIEW_LINK_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg)(?:$|[?#])/i
const PROTECTED_MEDIA_LINK_PATTERN = /^\/(?:api\/)?posts\/media\/\d+\/file(?:$|[?#])/i

const canEditPost = computed(() => {
  if (!post.value || !authStore.user) return false
  return post.value.author_id === authStore.user.id || authStore.user.role === 'admin'
})

const canManagePin = computed(() => {
  if (!post.value || !authStore.user) return false
  return ['teacher', 'admin'].includes(authStore.user.role)
})

const hasPostBeenEdited = computed(() => {
  if (!post.value?.updated_at || !post.value?.created_at) return false

  const createdAt = getUtc8Timestamp(post.value.created_at)
  const updatedAt = getUtc8Timestamp(post.value.updated_at)

  if (Number.isNaN(createdAt) || Number.isNaN(updatedAt)) return false
  return updatedAt - createdAt >= 60000
})

const displayMedia = computed(() => getPostMediaList(post.value, 9))
const renderedPostContent = computed(() => renderMarkdown(post.value?.content || ''))
const isReplyingToPost = computed(() => activeReplyTarget.value?.type === 'post')
const activeReplyId = computed(() => {
  return activeReplyTarget.value?.type === 'reply' ? activeReplyTarget.value.id : null
})
const activeReplyLabel = computed(() => activeReplyTarget.value?.label || '楼主')

const replyTree = computed(() => {
  const nodeMap = new Map()
  const roots = []

  for (const reply of replies.value) {
    nodeMap.set(Number(reply.id), {
      ...reply,
      can_delete: canDeleteReply(reply),
      children: []
    })
  }

  const findRootId = (replyId) => {
    let current = nodeMap.get(Number(replyId))
    if (!current) return null

    let currentId = Number(current.id)
    let parentId = Number(current.parent_id || 0)

    while (parentId && nodeMap.has(parentId)) {
      currentId = parentId
      parentId = Number(nodeMap.get(parentId)?.parent_id || 0)
    }

    return currentId
  }

  for (const reply of replies.value) {
    const node = nodeMap.get(Number(reply.id))
    const parentId = Number(reply.parent_id || 0)

    if (!parentId || !nodeMap.has(parentId)) {
      roots.push(node)
      continue
    }

    const rootId = findRootId(reply.id)
    if (!rootId || rootId === Number(reply.id)) {
      roots.push(node)
      continue
    }

    nodeMap.get(rootId)?.children.push(node)
  }

  return roots
})

const editEditorSeed = computed(() => {
  if (!post.value) return null

  return {
    title: post.value.title || '',
    content: post.value.content || '',
    media: post.value.media || []
  }
})

function formatDate(dateString) {
  return formatUtc8DateTime(dateString, '')
}

function formatRelativeTime(dateString) {
  if (!dateString) return ''

  const now = Date.now()
  const targetTime = getUtc8Timestamp(dateString)
  if (!Number.isFinite(targetTime)) {
    return ''
  }
  const diffMinutes = Math.floor((now - targetTime) / 60000)

  if (diffMinutes < 1) return '刚刚发布'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小时前`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays} 天前`

  return formatDate(dateString)
}

function canDeleteReply(reply) {
  if (!reply || !authStore.user) return false
  return Number(reply.author_id) === Number(authStore.user.id) || ['teacher', 'admin'].includes(authStore.user.role)
}

function clearReplyTarget() {
  activeReplyTarget.value = null
  replyDraft.value = ''
}

function toggleReplyToPost() {
  if (!post.value) return

  if (activeReplyTarget.value?.type === 'post') {
    clearReplyTarget()
    return
  }

  activeReplyTarget.value = {
    type: 'post',
    id: post.value.id,
    label: post.value.author_name || '楼主'
  }
  replyDraft.value = ''
}

function toggleReplyToComment(reply) {
  if (!reply) return

  const isSameTarget = activeReplyTarget.value?.type === 'reply'
    && Number(activeReplyTarget.value.id) === Number(reply.id)

  if (isSameTarget) {
    clearReplyTarget()
    return
  }

  activeReplyTarget.value = {
    type: 'reply',
    id: reply.id,
    label: reply.author_name || '该评论'
  }
  replyDraft.value = ''
}

function handleBack() {
  router.push('/posts')
}

function openImagePreview(payload) {
  openMediaPreview({
    type: 'image',
    src: payload?.src,
    alt: payload?.alt || '评论图片'
  })
}

function openVideoPreview(payload) {
  openMediaPreview({
    type: 'video',
    src: payload?.src,
    alt: payload?.title || '帖子视频'
  })
}

function openMediaPreview(payload) {
  const source = payload?.src || ''
  if (!source) {
    return
  }

  mediaPreview.value = {
    visible: true,
    type: payload?.type === 'video' ? 'video' : 'image',
    src: source,
    alt: payload?.alt || '帖子媒体'
  }
}

function closeMediaPreview() {
  mediaPreview.value = {
    visible: false,
    type: 'image',
    src: '',
    alt: ''
  }
}

function handlePostContentClick(event) {
  const imageElement = event?.target?.closest?.('img')
  if (imageElement) {
    const src = imageElement.getAttribute('src') || ''
    if (!src) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    openImagePreview({
      src,
      alt: imageElement.getAttribute('alt') || '正文图片'
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

  openImagePreview({
    src: href,
    alt: anchorElement.textContent?.trim() || '正文图片'
  })
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

function handleEscClose(event) {
  if (event.key === 'Escape' && mediaPreview.value.visible) {
    closeMediaPreview()
  }
}

async function loadPostDetail() {
  isLoading.value = true

  try {
    const response = await api.get(`/posts/${route.params.id}`)
    post.value = response.post || null
    replies.value = response.replies || []
  } catch (error) {
    alert(error?.error || '加载动态失败')
    post.value = null
    replies.value = []
  } finally {
    isLoading.value = false
  }
}

async function handleSubmitEdit(submission) {
  if (!post.value) return

  isUpdating.value = true
  try {
    const response = await api.put(`/posts/${post.value.id}`, buildPostRequestBody(submission))
    post.value = response.post
    showEditModal.value = false
  } catch (error) {
    alert(error?.error || '更新失败')
  } finally {
    isUpdating.value = false
  }
}

async function handleDeletePost() {
  if (!post.value) return

  const confirmDelete = window.confirm('确认删除这条动态吗？删除后不可恢复。')
  if (!confirmDelete) return

  try {
    await api.delete(`/posts/${post.value.id}`)
    alert('删除成功')
    router.push('/posts')
  } catch (error) {
    alert(error?.error || '删除失败')
  }
}

async function handleTogglePin() {
  if (!post.value || !canManagePin.value) return

  isPinning.value = true
  const nextPinnedStatus = !Boolean(post.value.is_pinned)

  try {
    await api.put(`/posts/${post.value.id}/pin`, {
      is_pinned: nextPinnedStatus
    })
    post.value = {
      ...post.value,
      is_pinned: nextPinnedStatus
    }
  } catch (error) {
    alert(error?.error || '置顶操作失败')
  } finally {
    isPinning.value = false
  }
}

async function handleCreateReply() {
  if (!post.value) return
  if (!activeReplyTarget.value) {
    alert('请先选择回复对象')
    return
  }
  if (!replyDraft.value.trim()) {
    alert('回复内容不能为空')
    return
  }

  isReplying.value = true

  try {
    const response = await api.post(`/posts/${post.value.id}/replies`, {
      content: replyDraft.value.trim(),
      parent_id: activeReplyTarget.value.type === 'reply' ? activeReplyTarget.value.id : null
    })

    if (response.reply?.id) {
      replies.value = [...replies.value, response.reply]
      post.value = {
        ...post.value,
        reply_count: Number(post.value.reply_count || 0) + 1
      }
    } else {
      await loadPostDetail()
    }

    clearReplyTarget()
  } catch (error) {
    alert(error?.error || '回复失败')
  } finally {
    isReplying.value = false
  }
}

async function handleDeleteReply(reply) {
  if (!post.value || !reply?.id) return

  const confirmed = window.confirm('确认删除这条评论吗？')
  if (!confirmed) return

  deletingReplyId.value = Number(reply.id)

  try {
    const previousReplies = [...replies.value]
    const response = await api.delete(`/posts/${post.value.id}/replies/${reply.id}`)
    const deletedReplyId = Number(response.deleted_reply_id || reply.id)
    const deletedReply = previousReplies.find((item) => Number(item.id) === deletedReplyId)
    const nextParentId = deletedReply?.parent_id ?? response.reparent_to ?? null
    const nextParent = previousReplies.find((item) => Number(item.id) === Number(nextParentId))

    replies.value = previousReplies
      .filter((item) => Number(item.id) !== deletedReplyId)
      .map((item) => {
        if (Number(item.parent_id || 0) !== deletedReplyId) {
          return item
        }

        return {
          ...item,
          parent_id: nextParentId,
          parent_author_id: nextParent?.author_id || null,
          parent_author_name: nextParent?.author_name || null
        }
      })

    post.value = {
      ...post.value,
      reply_count: Math.max(0, Number(post.value.reply_count || 0) - 1)
    }

    if (activeReplyTarget.value?.type === 'reply' && Number(activeReplyTarget.value.id) === deletedReplyId) {
      clearReplyTarget()
    }
  } catch (error) {
    alert(error?.error || '删除评论失败')
  } finally {
    deletingReplyId.value = null
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleEscClose)
  loadPostDetail()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscClose)
})
</script>
