<template>
  <AppShell title="讨论区" content-class="">
    <template #header-actions>
      <button type="button" class="ui-button-primary" @click="showCreateModal = true">
        发布动态
      </button>
    </template>

    <main class="ui-page max-w-[980px]">
      <section class="ui-surface-compact">
        <div class="flex items-center gap-3">
          <div class="ui-moment-avatar">
            {{ currentUserInitial }}
          </div>
          <button type="button" class="ui-moment-trigger" @click="showCreateModal = true">
            分享这一刻，发个图文动态...
          </button>
          <button type="button" class="ui-button-primary hidden sm:inline-flex" @click="showCreateModal = true">
            发布动态
          </button>
        </div>
      </section>

      <section class="ui-surface-compact">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="w-full max-w-xl">
            <label for="post-search" class="sr-only">搜索讨论内容</label>
            <input id="post-search" v-model.trim="searchKeyword" type="search" placeholder="搜索内容、标题或作者"
              class="ui-input" />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button v-for="option in filterOptions" :key="option.value" type="button" class="ui-filter-chip" :class="activeFilter === option.value
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              " @click="activeFilter = option.value">
              {{ option.label }}
            </button>
          </div>
        </div>
      </section>

      <section v-if="isLoading" class="ui-empty-state">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
        <p class="mt-3 text-sm text-slate-500">动态加载中...</p>
      </section>

      <section v-else-if="posts.length === 0" class="ui-empty-state">
        <h2 class="text-lg font-semibold text-slate-900">还没有动态</h2>
        <p class="mt-2 text-sm text-slate-500">可以先发一条课堂动态，提问、贴图或者补充一段说明都可以。</p>
        <button type="button" class="ui-button-primary mt-5" @click="showCreateModal = true">
          立即发动态
        </button>
      </section>

      <section v-else-if="filteredPosts.length === 0" class="ui-empty-state">
        <h2 class="text-lg font-semibold text-slate-900">没有匹配的内容</h2>
        <p class="mt-2 text-sm text-slate-500">可以尝试缩短关键词，或切换筛选条件。</p>
        <button v-if="hasActiveFilters" type="button" class="ui-button-secondary mt-5" @click="resetFilters">
          清空筛选
        </button>
      </section>

      <section v-else class="ui-stack">
        <article v-for="post in filteredPosts" :key="post.id" role="button" tabindex="0"
          :aria-label="`查看动态 ${post.title || post.author_name || '讨论内容'}`"
          class="ui-moment-card cursor-pointer transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2"
          @click="handleOpenPost(post.id)" @keydown.enter.prevent="handleOpenPost(post.id)"
          @keydown.space.prevent="handleOpenPost(post.id)">
          <div class="flex items-start gap-3 sm:gap-4">
            <div class="ui-moment-avatar">
              {{ getAuthorInitial(post.author_name) }}
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-[15px] font-semibold text-slate-800">
                    {{ post.author_name || '匿名用户' }}
                  </p>
                  <p class="mt-1 text-xs text-slate-400">
                    {{ formatDate(post.created_at) }}
                  </p>
                </div>

                <span v-if="post.is_pinned"
                  class="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                  置顶
                </span>
              </div>

              <h2 v-if="hasPostTitle(post)" class="mt-3 text-[15px] font-semibold leading-7 text-slate-900">
                {{ post.title }}
              </h2>

              <p v-if="getPreviewText(post)"
                class="mt-2 whitespace-pre-line break-words text-[15px] leading-7 text-slate-700">
                {{ getPreviewText(post) }}
              </p>

              <MomentMediaGrid v-if="getMomentMedia(post).length" class="mt-3" :media="getMomentMedia(post)"
                :preview-limit="9" clickable compact show-overflow-count @preview-image="openImagePreview"
                @preview-video="openVideoPreview" />

              <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                <span>{{ formatRelativeTime(post.created_at) }}</span>
                <span>{{ post.reply_count || 0 }} 条回复</span>
                <span>{{ post.view_count || 0 }} 次浏览</span>
                <span v-if="post.media_count">{{ formatMediaCountLabel(post) }}</span>
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>

    <PostEditorModal v-if="showCreateModal" title="发布动态" submit-label="确认发布" :submitting="isCreating"
      :initial-value="createEditorSeed" @close="showCreateModal = false" @submit="handleCreate" />

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
  </AppShell>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import MomentMediaGrid from '@/components/MomentMediaGrid.vue'
import PostEditorModal from '@/components/PostEditorModal.vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/utils/api'
import { stripMarkdown } from '@/utils/markdown'
import { buildPostRequestBody, getAuthorInitial, getPostMediaKind, getPostMediaList, hasPostTitle } from '@/utils/postUtils'
import { formatUtc8DateTime, getUtc8Timestamp } from '@/utils/dateTime'

const router = useRouter()
const authStore = useAuthStore()

const posts = ref([])
const isLoading = ref(false)
const showCreateModal = ref(false)
const isCreating = ref(false)
const searchKeyword = ref('')
const activeFilter = ref('all')
const mediaPreview = ref({
  visible: false,
  type: 'image',
  src: '',
  alt: ''
})

const createEditorSeed = {
  title: '',
  content: '',
  media: []
}

const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'pinned', label: '置顶' },
  { value: 'mine', label: '我的' }
]

const currentUserInitial = computed(() => {
  return getAuthorInitial(authStore.user?.real_name || authStore.user?.username || '')
})

const normalizeText = (value) => String(value || '').trim().toLowerCase()

const filteredPosts = computed(() => {
  let result = posts.value

  if (activeFilter.value === 'pinned') {
    result = result.filter((post) => Boolean(post.is_pinned))
  }

  if (activeFilter.value === 'mine') {
    result = result.filter((post) => post.author_id === authStore.user?.id)
  }

  const keyword = normalizeText(searchKeyword.value)
  if (!keyword) return result

  return result.filter((post) => {
    const searchableText = [
      post.title,
      post.summary,
      post.content,
      post.author_name
    ]
      .map((item) => normalizeText(item))
      .join(' ')

    return searchableText.includes(keyword)
  })
})

const hasActiveFilters = computed(() => {
  return Boolean(searchKeyword.value.trim()) || activeFilter.value !== 'all'
})

function resetFilters() {
  searchKeyword.value = ''
  activeFilter.value = 'all'
}

function handleOpenPost(postId) {
  router.push(`/posts/${postId}`)
}

function getMomentMedia(post) {
  return getPostMediaList(post, 9)
}

function formatMediaCountLabel(post) {
  const mediaList = getMomentMedia(post)
  if (!mediaList.length) {
    return '0 个媒体'
  }

  const firstMediaKind = getPostMediaKind(mediaList[0])
  if (mediaList.length === 1 && firstMediaKind === 'video') {
    return '1 个视频'
  }

  return `${mediaList.length} 张图片`
}

function getPreviewText(post, limit = 260) {
  const plainText = stripMarkdown(post.summary || post.content || '')
  if (!plainText) return ''
  return plainText.length > limit ? `${plainText.slice(0, limit)}...` : plainText
}

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

function openImagePreview(payload) {
  openMediaPreview({
    type: 'image',
    src: payload?.src,
    alt: payload?.alt || '帖子图片'
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

function handleEscClose(event) {
  if (event.key === 'Escape' && mediaPreview.value.visible) {
    closeMediaPreview()
  }
}

async function loadPosts() {
  isLoading.value = true
  try {
    const response = await api.get('/posts')
    posts.value = response.posts || []
  } catch (error) {
    console.error('加载帖子失败:', error)
  } finally {
    isLoading.value = false
  }
}

async function handleCreate(submission) {
  isCreating.value = true

  try {
    await api.post('/posts', buildPostRequestBody(submission))
    showCreateModal.value = false
    await loadPosts()
  } catch (error) {
    alert(`发布失败: ${error.message || error.error || '未知错误'}`)
  } finally {
    isCreating.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleEscClose)
  loadPosts()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscClose)
})
</script>
