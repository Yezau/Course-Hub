<template>
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl sm:p-7">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <h3 class="text-xl font-semibold text-slate-900">{{ title }}</h3>
                    <p class="mt-1 text-sm text-slate-500">
                        支持文字 + 图片，或单个视频发布。图片与视频不能混合上传。
                    </p>
                </div>
                <button type="button"
                    class="rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    @click="emit('close')">
                    关闭
                </button>
            </div>

            <div v-if="errorMessage"
                class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {{ errorMessage }}
            </div>

            <form class="mt-5 space-y-5" @submit.prevent="handleSubmit">
                <div>
                    <label for="post-editor-title" class="mb-1 block text-sm font-medium text-slate-700">
                        标题（选填）
                    </label>
                    <input id="post-editor-title" v-model.trim="form.title" type="text" maxlength="80"
                        placeholder="例如：这道题这里我还有点没想明白" class="ui-input" />
                </div>

                <div>
                    <div class="mb-1 flex items-center justify-between gap-3">
                        <label for="post-editor-content" class="block text-sm font-medium text-slate-700">动态内容</label>
                        <span class="text-xs text-slate-400">{{ form.content.length }}/5000</span>
                    </div>
                    <MentionTextarea id="post-editor-content" v-model.trim="form.content" rows="7" maxlength="5000"
                        placeholder="写下你的问题、结论或说明，也可以只发图片或视频。" customClass="min-h-[180px] p-3" />
                </div>

                <div class="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h4 class="text-sm font-semibold text-slate-900">媒体附件</h4>
                            <p class="mt-1 text-xs leading-6 text-slate-500">
                                {{ mediaHintText }}
                            </p>
                        </div>

                        <div class="flex items-center gap-2">
                            <span class="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">
                                {{ mediaBadgeText }}
                            </span>

                            <button type="button" class="ui-button-secondary" @click="openImagePicker">
                                选择图片
                            </button>
                            <button type="button" class="ui-button-secondary" @click="openVideoPicker">
                                选择视频
                            </button>

                            <input ref="imageInput" type="file" accept="image/*" multiple class="hidden"
                                @change="handleImageFilesSelected" />
                            <input ref="videoInput" type="file" accept="video/*" class="hidden"
                                @change="handleVideoFileSelected" />
                        </div>
                    </div>

                    <div v-if="mediaCards.length === 0"
                        class="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">
                        还没有添加媒体
                    </div>

                    <div v-else class="mt-4">
                        <div v-if="hasVideoMedia"
                            class="max-w-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <div class="bg-slate-950">
                                <video :src="mediaCards[0].url" :title="mediaCards[0].name" controls playsinline
                                    preload="metadata"
                                    class="block max-h-[320px] w-full object-contain sm:max-h-[420px]" />
                            </div>
                            <div class="flex items-start justify-between gap-2 p-3">
                                <div class="min-w-0">
                                    <p class="truncate text-sm font-medium text-slate-700">{{ mediaCards[0].name }}</p>
                                    <p class="mt-1 text-xs text-slate-400">{{ mediaCards[0].originLabel }}</p>
                                </div>
                                <button type="button"
                                    class="rounded-md px-2 py-1 text-xs text-rose-600 transition hover:bg-rose-50"
                                    @click="removeMedia(mediaCards[0])">
                                    删除
                                </button>
                            </div>
                        </div>

                        <template v-else>
                            <div v-if="mediaCards.length === 1"
                                class="max-w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                <div class="bg-slate-100">
                                    <img :src="mediaCards[0].url" :alt="mediaCards[0].name"
                                        class="block max-h-[320px] w-full object-contain" />
                                </div>
                                <div class="flex items-start justify-between gap-2 p-3">
                                    <div class="min-w-0">
                                        <p class="truncate text-sm font-medium text-slate-700">{{ mediaCards[0].name }}
                                        </p>
                                        <p class="mt-1 text-xs text-slate-400">{{ mediaCards[0].originLabel }}</p>
                                    </div>
                                    <button type="button"
                                        class="rounded-md px-2 py-1 text-xs text-rose-600 transition hover:bg-rose-50"
                                        @click="removeMedia(mediaCards[0])">
                                        删除
                                    </button>
                                </div>
                            </div>

                            <div v-else class="grid gap-2" :class="previewGridClass">
                                <div v-for="media in mediaCards" :key="media.key"
                                    class="relative aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                    <img :src="media.url" :alt="media.name" class="h-full w-full object-cover" />
                                    <button type="button"
                                        class="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white transition hover:bg-black/75"
                                        @click="removeMedia(media)">
                                        删除
                                    </button>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <div class="flex flex-col gap-3 pt-1 sm:flex-row">
                    <button type="submit" :disabled="submitting"
                        class="ui-button-primary flex-1 disabled:cursor-not-allowed disabled:opacity-60">
                        {{ submitting ? '提交中...' : submitLabel }}
                    </button>
                    <button type="button" class="ui-button-secondary" @click="emit('close')">
                        取消
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { resolveProtectedMediaUrl, sortPostMedia } from '@/utils/postUtils'
import MentionTextarea from './MentionTextarea.vue'

const MAX_IMAGE_COUNT = 9
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024

const props = defineProps({
    initialValue: {
        type: Object,
        default: () => ({})
    },
    submitting: {
        type: Boolean,
        default: false
    },
    title: {
        type: String,
        default: '发布动态'
    },
    submitLabel: {
        type: String,
        default: '确认发布'
    }
})

const emit = defineEmits(['close', 'submit'])

const imageInput = ref(null)
const videoInput = ref(null)
const errorMessage = ref('')
const objectUrls = new Set()
const form = ref(createDefaultForm())

function createDefaultForm() {
    return {
        title: '',
        content: '',
        existingMedia: [],
        newMedia: []
    }
}

function normalizeMediaKindFromType(fileType = '') {
    const normalizedType = String(fileType || '').toLowerCase()

    if (normalizedType.startsWith('video/')) {
        return 'video'
    }

    if (normalizedType.startsWith('image/')) {
        return 'image'
    }

    return 'unknown'
}

function cleanupObjectUrls() {
    for (const url of objectUrls) {
        URL.revokeObjectURL(url)
    }
    objectUrls.clear()
}

function resetForm(seed = {}) {
    cleanupObjectUrls()

    const existingMedia = sortPostMedia(seed.media || []).map((media) => ({
        id: media.id,
        name: media.file_name || `media-${media.id}`,
        url: resolveProtectedMediaUrl(media.url),
        fileType: media.file_type || '',
        kind: normalizeMediaKindFromType(media.file_type || '')
    }))

    form.value = {
        title: seed.title || '',
        content: seed.content || '',
        existingMedia,
        newMedia: []
    }

    errorMessage.value = ''
}

watch(
    () => props.initialValue,
    (value) => {
        resetForm(value)
    },
    { immediate: true, deep: true }
)

const imageCount = computed(() => {
    const existingCount = form.value.existingMedia.filter((item) => item.kind === 'image').length
    const newCount = form.value.newMedia.filter((item) => item.kind === 'image').length
    return existingCount + newCount
})

const videoCount = computed(() => {
    const existingCount = form.value.existingMedia.filter((item) => item.kind === 'video').length
    const newCount = form.value.newMedia.filter((item) => item.kind === 'video').length
    return existingCount + newCount
})

const hasVideoMedia = computed(() => videoCount.value > 0)

const mediaCards = computed(() => {
    return [
        ...form.value.existingMedia.map((media) => ({
            key: `existing-${media.id}`,
            name: media.name,
            url: media.url,
            source: 'existing',
            originLabel: media.kind === 'video' ? '已保存视频' : '已保存图片',
            id: media.id,
            kind: media.kind
        })),
        ...form.value.newMedia.map((media) => ({
            key: `new-${media.clientId}`,
            name: media.file.name,
            url: media.previewUrl,
            source: 'new',
            originLabel: media.kind === 'video' ? '待上传视频' : '待上传图片',
            clientId: media.clientId,
            kind: media.kind
        }))
    ]
})

const mediaBadgeText = computed(() => {
    if (hasVideoMedia.value) {
        return `${videoCount.value}/1 视频`
    }

    return `${imageCount.value}/${MAX_IMAGE_COUNT} 图片`
})

const mediaHintText = computed(() => {
    if (hasVideoMedia.value) {
        return '已切换到视频模式：最多 1 个视频，大小不超过 100 MB。'
    }

    return '图片模式：最多 9 张，单张不超过 8 MB。也可改为单视频模式（最多 1 个）。'
})

const previewGridClass = computed(() => {
    return mediaCards.value.length === 2 || mediaCards.value.length === 4
        ? 'grid-cols-2 max-w-[320px]'
        : 'grid-cols-3 max-w-[460px]'
})

function removeMedia(media) {
    if (media.source === 'existing') {
        form.value.existingMedia = form.value.existingMedia.filter((item) => item.id !== media.id)
        errorMessage.value = ''
        return
    }

    const target = form.value.newMedia.find((item) => item.clientId === media.clientId)
    if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl)
        objectUrls.delete(target.previewUrl)
    }

    form.value.newMedia = form.value.newMedia.filter((item) => item.clientId !== media.clientId)
    errorMessage.value = ''
}

function openImagePicker() {
    imageInput.value?.click()
}

function openVideoPicker() {
    videoInput.value?.click()
}

function handleImageFilesSelected(event) {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''

    if (!selectedFiles.length) return

    errorMessage.value = ''

    if (videoCount.value > 0) {
        errorMessage.value = '已存在视频，不能再添加图片'
        return
    }

    const remainingSlots = Math.max(0, MAX_IMAGE_COUNT - imageCount.value)
    if (remainingSlots === 0) {
        errorMessage.value = `最多只能上传 ${MAX_IMAGE_COUNT} 张图片`
        return
    }

    const acceptedFiles = []

    for (const file of selectedFiles) {
        if (acceptedFiles.length >= remainingSlots) {
            break
        }

        if (!String(file.type || '').startsWith('image/')) {
            continue
        }

        if (Number(file.size || 0) > MAX_IMAGE_SIZE_BYTES) {
            continue
        }

        acceptedFiles.push(file)
    }

    if (!acceptedFiles.length) {
        errorMessage.value = '请选择图片文件，且单张不超过 8 MB'
        return
    }

    const nextMedia = acceptedFiles.map((file) => {
        const previewUrl = URL.createObjectURL(file)
        objectUrls.add(previewUrl)

        return {
            clientId: Math.random().toString(36).slice(2, 10),
            file,
            previewUrl,
            kind: 'image'
        }
    })

    form.value.newMedia = [...form.value.newMedia, ...nextMedia]
}

function handleVideoFileSelected(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    errorMessage.value = ''

    if (imageCount.value > 0) {
        errorMessage.value = '已存在图片，不能再添加视频'
        return
    }

    if (videoCount.value > 0) {
        errorMessage.value = '最多只能上传 1 个视频'
        return
    }

    if (!String(file.type || '').startsWith('video/')) {
        errorMessage.value = '请选择视频文件'
        return
    }

    if (Number(file.size || 0) > MAX_VIDEO_SIZE_BYTES) {
        errorMessage.value = '单个视频不能超过 100 MB'
        return
    }

    const previewUrl = URL.createObjectURL(file)
    objectUrls.add(previewUrl)

    form.value.newMedia = [
        {
            clientId: Math.random().toString(36).slice(2, 10),
            file,
            previewUrl,
            kind: 'video'
        }
    ]
}

function handleSubmit() {
    errorMessage.value = ''

    if (!form.value.content.trim() && mediaCards.value.length === 0) {
        errorMessage.value = '内容和媒体不能同时为空'
        return
    }

    emit('submit', {
        payload: {
            post_type: 'moment',
            title: form.value.title.trim(),
            summary: '',
            content: form.value.content.trim(),
            retained_media_ids: form.value.existingMedia.map((item) => item.id)
        },
        files: form.value.newMedia.map((item) => item.file)
    })
}

onBeforeUnmount(() => {
    cleanupObjectUrls()
})
</script>
