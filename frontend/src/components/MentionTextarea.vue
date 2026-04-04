<template>
    <div class="relative w-full">
        <textarea ref="textareaRef" :value="modelValue" :rows="rows" :maxlength="maxlength" :placeholder="placeholder"
            :class="['ui-input w-full', customClass]" @input="handleInput" @keydown="handleKeydown"
            @scroll="handleScroll" @blur="handleBlur"></textarea>

        <!-- Mention Dropdown -->
        <div v-if="showDropdown" ref="dropdownRef"
            class="absolute z-[100] w-48 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 max-h-60 overflow-y-auto"
            :style="{ top: `${dropdownPos.top}px`, left: `${dropdownPos.left}px` }">
            <div v-if="loadingUsers" class="px-4 py-2 text-sm text-zinc-500 text-center">
                加载中...
            </div>
            <div v-else-if="filteredUsers.length === 0" class="px-4 py-2 text-sm text-zinc-500 text-center">
                未找到用户
            </div>
            <button v-else v-for="(user, index) in filteredUsers" :key="user.id" type="button"
                class="w-full text-left px-4 py-2 text-sm hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none transition-colors duration-150"
                :class="{ 'bg-zinc-100 text-blue-600 font-medium': index === selectedIndex, 'text-zinc-700': index !== selectedIndex }"
                @mousedown.prevent="selectUser(user)" @mouseenter="selectedIndex = index">
                <div class="flex items-center gap-2">
                    <div v-if="user.avatar_url" class="w-6 h-6 rounded-full overflow-hidden shrink-0">
                        <img :src="resolveAssetUrl(user.avatar_url)" class="w-full h-full object-cover">
                    </div>
                    <div v-else
                        class="w-6 h-6 rounded-full bg-zinc-200 text-zinc-600 flex items-center justify-center shrink-0 text-xs font-semibold">
                        {{ user.username.charAt(0).toUpperCase() }}
                    </div>
                    <span class="truncate">{{ user.username }}</span>
                    <span v-if="user.real_name" class="text-xs text-zinc-400 truncate break-keep ml-1">({{
                        user.real_name }})</span>
                </div>
            </button>
        </div>

        <!-- Hidden dummy div to calculate cursor coordinates -->
        <div ref="dummyRef"
            class="absolute top-0 left-0 -z-10 invisible whitespace-pre-wrap break-words pointer-events-none text-left"
            aria-hidden="true"></div>
    </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import api, { resolveAssetUrl } from '../utils/api'

const props = defineProps({
    modelValue: {
        type: String,
        default: ''
    },
    rows: {
        type: [Number, String],
        default: 3
    },
    maxlength: {
        type: [Number, String],
        default: null
    },
    placeholder: {
        type: String,
        default: ''
    },
    customClass: {
        type: String,
        default: ''
    }
})

const emit = defineEmits(['update:modelValue'])

const textareaRef = ref(null)
const dropdownRef = ref(null)
const dummyRef = ref(null)

const showDropdown = ref(false)
const dropdownPos = ref({ top: 0, left: 0 })
const loadingUsers = ref(false)
const filteredUsers = ref([])
const selectedIndex = ref(0)
let searchTimeout = null

const mentionState = ref({
    isActive: false,
    startIndex: -1,
    query: ''
})

async function fetchUsersByQuery(query) {
    loadingUsers.value = true
    try {
        const data = await api.get(`/users/search?q=${encodeURIComponent(query)}`)
        filteredUsers.value = data || []
        selectedIndex.value = 0
    } catch (err) {
        console.error('Failed to search users for mentions', err)
        filteredUsers.value = []
    } finally {
        loadingUsers.value = false
    }
}

function filterUsers(query) {
    if (searchTimeout) clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
        fetchUsersByQuery(query)
    }, 300)
}

function handleInput(e) {
    const value = e.target.value
    emit('update:modelValue', value)

    checkMentionState(e.target)
}

function checkMentionState(textarea) {
    const value = textarea.value
    const selectionStart = textarea.selectionStart

    // Walk backward from cursor to find the last @
    let atPos = -1
    for (let i = selectionStart - 1; i >= 0; i--) {
        if (value[i] === '@') {
            // Must be at the beginning of text, or preceded by a space/newline
            if (i === 0 || /\s/.test(value[i - 1])) {
                atPos = i
                break
            }
        } else if (/\s/.test(value[i])) {
            break // Hit a space before finding @, so we are not in a mention
        }
    }

    if (atPos !== -1) {
        const query = value.slice(atPos + 1, selectionStart)
        if (!mentionState.value.isActive) {
            startMention(textarea, atPos, query)
        } else {
            updateMention(query)
        }
    } else {
        closeMention()
    }
}

function startMention(textarea, index, query) {
    mentionState.value.isActive = true
    mentionState.value.startIndex = index
    mentionState.value.query = query
    showDropdown.value = true

    filterUsers(query)

    updateDropdownPosition(textarea, index)
}

function updateMention(query) {
    mentionState.value.query = query
    filterUsers(query)
}

function closeMention() {
    mentionState.value.isActive = false
    mentionState.value.startIndex = -1
    mentionState.value.query = ''
    showDropdown.value = false
}

function selectUser(user) {
    if (!mentionState.value.isActive) return

    const value = props.modelValue
    const beforeMention = value.slice(0, mentionState.value.startIndex)
    const afterMention = value.slice(textareaRef.value.selectionStart)

    // Insert `@username ` (with an extra space)
    const newValue = `${beforeMention}@${user.username} ${afterMention}`
    emit('update:modelValue', newValue)

    const newCursorPos = mentionState.value.startIndex + user.username.length + 2

    closeMention()

    nextTick(() => {
        textareaRef.value.focus()
        textareaRef.value.setSelectionRange(newCursorPos, newCursorPos)
    })
}

function handleKeydown(e) {
    if (!showDropdown.value) return

    if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (selectedIndex.value < filteredUsers.value.length - 1) {
            selectedIndex.value++
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (selectedIndex.value > 0) {
            selectedIndex.value--
        }
    } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (filteredUsers.value.length > 0) {
            selectUser(filteredUsers.value[selectedIndex.value])
        } else {
            closeMention()
        }
    } else if (e.key === 'Escape') {
        e.preventDefault()
        closeMention()
    }
}

function handleBlur() {
    // Use a small timeout to allow clicking on dropdown items
    setTimeout(() => {
        closeMention()
    }, 150)
}

function handleScroll() {
    if (showDropdown.value && mentionState.value.isActive) {
        updateDropdownPosition(textareaRef.value, mentionState.value.startIndex)
    }
}

function copyStyles(src, dest) {
    const stylesToCopy = [
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
        'lineHeight', 'textTransform', 'wordSpacing', 'textIndent',
        'whiteSpace', 'wordBreak', 'paddingTop', 'paddingRight', 'paddingBottom',
        'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
        'borderLeftWidth', 'boxSizing'
    ];
    const computedStyle = window.getComputedStyle(src);
    for (const prop of stylesToCopy) {
        dest.style[prop] = computedStyle[prop];
    }
}

function updateDropdownPosition(textarea, index) {
    if (!textarea || !dummyRef.value) return

    // Copy styles
    copyStyles(textarea, dummyRef.value)
    dummyRef.value.style.width = `${textarea.offsetWidth}px`
    dummyRef.value.style.height = 'auto' // Let dummy expand vertically

    // To get the cursor pos, take the substring so far, replace trailing space with non-breaking so we don't collapse it
    const textBeforeCursor = textarea.value.substring(0, index + 1)

    dummyRef.value.textContent = textBeforeCursor

    // Now add a marker span
    const marker = document.createElement('span')
    marker.textContent = '|'
    dummyRef.value.appendChild(marker)

    nextTick(() => {
        const markerPos = {
            offsetTop: marker.offsetTop,
            offsetLeft: marker.offsetLeft
        }

        const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 20
        const scrollY = textarea.scrollTop

        // Position dropdown exactly below the cursor
        // top = marker offset - scroll + padding offset roughly
        let newTop = markerPos.offsetTop - scrollY + lineHeight
        let newLeft = markerPos.offsetLeft

        // Bounds check within textarea
        if (newTop > textarea.clientHeight - 30) {
            newTop = textarea.clientHeight - 30
        }

        dropdownPos.value = {
            top: newTop + 5, // 5px padding below text
            left: newLeft
        }
    })
}

// Re-check state if modelValue externally changes drastically 
watch(() => props.modelValue, (newVal) => {
    if (!textareaRef.value) return
    // Just let it be handled by user typing (handleInput).
    // If we change entirely from outside we might close.
})
</script>