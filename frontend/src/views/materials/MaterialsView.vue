<template>
  <AppShell :title="'\u8bfe\u4ef6\u8d44\u6599'" content-class="h-full">
    <main class="flex h-full overflow-hidden px-4 py-3 sm:px-6">
      <section
        class="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/70 bg-white/92 shadow-[0_18px_60px_rgba(15,23,42,0.08)]"
        @contextmenu="openBlankContextMenu($event)">
        <div class="flex h-full flex-col">
          <div class="border-b border-slate-200 px-4 py-4">
            <div class="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div class="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-600">
                <span class="mr-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">路径</span>
                <input v-model="pathInput" data-path-input type="text" spellcheck="false"
                  class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  placeholder="/输入路径后回车" @focus="isPathEditing = true" @blur="cancelPathEditing"
                  @keydown.enter.prevent="submitPathInput" @keydown.esc.prevent="cancelPathEditing" />
              </div>
              <input v-model.trim="searchKeyword" type="text" placeholder="搜索文件夹或文件"
                class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 md:w-[280px]" />
              <select v-model="sortOption"
                class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 md:w-[180px]">
                <option value="nameAsc">名称 A-Z</option>
                <option value="nameDesc">名称 Z-A</option>
                <option value="dateDesc">时间 新 → 旧</option>
                <option value="dateAsc">时间 旧 → 新</option>
                <option value="sizeDesc">大小 大 → 小</option>
                <option value="sizeAsc">大小 小 → 大</option>
              </select>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div class="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
                <span>显示 {{ directoryItemCount }} 项</span>
                <span>目录 {{ visibleFolderRows.length }}</span>
                <span>文件 {{ visibleFileRows.length }}</span>
                <span v-if="hasSelection" class="rounded-full bg-sky-50 px-3 py-1 text-sky-700">已选 {{
                  selectedEntries.length }} 项</span>
                <span v-if="authStore.isTeacher && hasClipboard" class="rounded-full px-3 py-1"
                  :class="clipboard.mode === 'cut' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'">{{
                    clipboard.mode === 'cut' ? '剪切板' : '复制板' }} {{ clipboard.entries.length }} 项</span>
              </div>
              <div class="ml-auto flex flex-wrap items-center gap-1.5">
                <button v-if="authStore.isTeacher && hasSelection" type="button"
                  class="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                  @click="deleteSelectedItems">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round"
                      d="M4.5 7.5h15m-12 0V6a1.5 1.5 0 011.5-1.5h6A1.5 1.5 0 0116.5 6v1.5m-9 0v10.5A1.5 1.5 0 009 19.5h6a1.5 1.5 0 001.5-1.5V7.5m-6 3v5m3-5v5" />
                  </svg>
                  <span
                    class="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition group-hover:opacity-100">删除</span>
                </button>
                <button v-if="authStore.isTeacher && hasSingleSelection" type="button"
                  class="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  @click="renameSelectedEntry">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round"
                      d="M4.5 19.5l3.75-.75L18 9l-3-3-9.75 9.75-.75 3.75zM13.5 6l3 3" />
                  </svg>
                  <span
                    class="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition group-hover:opacity-100">重命名</span>
                </button>
                <button v-if="authStore.isTeacher && hasSelection" type="button"
                  class="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  @click="copyEntriesToClipboardV2(selectedEntries, 'copy')">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <rect x="9" y="9" width="10.5" height="10.5" rx="2" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 15V6.75A2.25 2.25 0 018.25 4.5h8.25" />
                  </svg>
                  <span
                    class="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition group-hover:opacity-100">复制</span>
                </button>
                <button v-if="authStore.isTeacher && hasSelection" type="button"
                  class="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  @click="copyEntriesToClipboardV2(selectedEntries, 'cut')">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <circle cx="6.75" cy="17.25" r="2.25" />
                    <circle cx="6.75" cy="6.75" r="2.25" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.6 8.1L18.75 18.25M8.6 15.9L18.75 5.75" />
                  </svg>
                  <span
                    class="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition group-hover:opacity-100">剪切</span>
                </button>
                <button v-if="authStore.isTeacher && hasClipboard" type="button"
                  class="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  @click="pasteClipboardV2(currentFolderId)">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round"
                      d="M9 4.5h6M9.75 3h4.5A1.5 1.5 0 0115.75 4.5v1.5h1.5A2.25 2.25 0 0119.5 8.25v9A2.25 2.25 0 0117.25 19.5h-10.5A2.25 2.25 0 014.5 17.25v-9A2.25 2.25 0 016.75 6h1.5V4.5A1.5 1.5 0 019.75 3z" />
                  </svg>
                  <span
                    class="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition group-hover:opacity-100">粘贴</span>
                </button>
                <button v-if="selectedFiles.length" type="button"
                  class="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  @click="downloadSelectedFiles()">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round"
                      d="M12 4.5v10.5m0 0l4.5-4.5M12 15l-4.5-4.5M5.25 18.75h13.5" />
                  </svg>
                  <span
                    class="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition group-hover:opacity-100">下载</span>
                </button>
                <button v-if="authStore.isTeacher" type="button"
                  class="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-600 text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="uploadProgress.active" @click="openUploadPicker">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round"
                      d="M12 16.5V6m0 0l4.5 4.5M12 6l-4.5 4.5M5.25 18.75h13.5" />
                  </svg>
                  <span
                    class="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition group-hover:opacity-100">上传</span>
                </button>
                <button type="button"
                  class="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  @click="refreshView">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round"
                      d="M16.5 8.25h3.75V4.5M20.25 8.25A8.25 8.25 0 106.1 18.6" />
                  </svg>
                  <span
                    class="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition group-hover:opacity-100">刷新</span>
                </button>
              </div>
              <div v-if="uploadProgress.active" class="w-full rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2.5">
                <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-sky-800">
                  <p class="font-semibold">上传进度 {{ uploadProgress.processedFiles }} / {{ uploadProgress.totalFiles }}
                  </p>
                  <p>{{ uploadProgressPercent }}%</p>
                </div>
                <div class="mt-2 h-2 overflow-hidden rounded-full bg-sky-100">
                  <div class="h-full rounded-full bg-sky-600 transition-all duration-200"
                    :style="{ width: `${uploadProgressPercent}%` }" />
                </div>
                <p class="mt-2 break-all text-xs text-slate-600">
                  当前文件：{{ uploadProgress.currentFileName || '准备上传...' }}（{{ uploadProgress.currentFilePercent }}%）
                </p>
                <p class="mt-1 text-xs text-slate-500">
                  已处理 {{ formatFileSize(uploadProgress.processedBytes) }} / {{ formatFileSize(uploadProgress.totalBytes)
                  }}，成功 {{ uploadProgress.successFiles }}，失败 {{ uploadProgress.failedFiles }}
                </p>
              </div>
              <input ref="fileInput" type="file" multiple class="hidden" :disabled="uploadProgress.active"
                @change="handleFilesSelected" />
            </div>
          </div>

          <div class="flex min-h-0 flex-1 flex-col">
            <div
              class="hidden items-center gap-3 border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 md:grid md:grid-cols-[44px,minmax(0,3.1fr),1fr,0.9fr,1.2fr,70px]">
              <div class="flex items-center justify-center"><input ref="selectAllCheckbox" type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" :checked="allVisibleSelected"
                  :disabled="visibleRows.length === 0" @change="toggleSelectAll($event)" /></div>
              <span>名称</span><span>类型</span><span>大小</span><span>时间</span><span class="text-right">菜单</span>
            </div>
            <div v-if="isLoading" class="flex flex-1 items-center justify-center">
              <div class="text-center">
                <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-600">
                </div>
                <p class="mt-4 text-sm text-slate-500">正在加载目录内容...</p>
              </div>
            </div>
            <div v-else-if="directoryItemCount === 0" class="flex flex-1 items-center justify-center px-6">
              <div class="text-center">
                <p class="text-lg font-semibold text-slate-900">{{ normalizedSearchKeyword ? '没有匹配的项目' : '当前目录为空' }}</p>
                <p class="mt-2 text-sm text-slate-500">{{ normalizedSearchKeyword ? '尝试调整搜索关键词后再查看。' : '可上传文件或右键新建文件夹。'
                }}</p>
              </div>
            </div>
            <div v-else ref="listViewportRef" class="min-h-0 flex-1 overflow-auto"
              :class="marquee.visible ? 'select-none' : ''" @pointerdown="handleViewportPointerDown">
              <div ref="listContentRef" class="relative divide-y divide-slate-100">
                <div v-if="marquee.visible"
                  class="pointer-events-none absolute z-10 rounded-xl border border-sky-400/70 bg-sky-200/20 shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
                  :style="marqueeStyle"></div>
                <div v-for="row in displayRows" :key="makeRowKey(row)" :data-row-key="makeRowKey(row)"
                  :data-row-selectable="row.kind !== 'up' ? 'true' : 'false'"
                  class="grid w-full items-center gap-3 px-4 py-3 text-left transition md:grid-cols-[44px,minmax(0,3.1fr),1fr,0.9fr,1.2fr,70px]"
                  :class="rowClasses(row)" :draggable="authStore.isTeacher && row.kind !== 'up'" role="button"
                  tabindex="0" @click="selectItem(row, $event)" @dblclick="openItem(row)"
                  @keydown.enter.prevent="openItem(row)" @keydown.space.prevent="selectItem(row, $event)"
                  @contextmenu.stop.prevent="row.kind !== 'up' ? openContextMenu($event, row) : null"
                  @dragstart="handleRowDragStart($event, row)" @dragend="handleDragEnd"
                  @dragover.prevent="row.kind === 'folder' ? handleFolderDragOver(row.id) : undefined"
                  @drop.prevent="row.kind === 'folder' ? handleDropToFolder(row.id) : undefined">
                  <div class="flex items-center justify-center"><input v-if="row.kind !== 'up'" data-row-checkbox
                      type="checkbox" class="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      :checked="isSelected(row)" @click.stop @change="toggleSelection(row, $event.target.checked)" />
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-3">
                      <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                        :class="getItemBadgeClass(row)">
                        <svg v-if="row.kind === 'folder' || row.kind === 'up'" class="h-5 w-5" viewBox="0 0 24 24"
                          fill="currentColor">
                          <path v-if="row.kind === 'up'"
                            d="M13.5 6.75a.75.75 0 00-1.5 0v7.69l-2.47-2.47a.75.75 0 10-1.06 1.06l3.75 3.75a.75.75 0 001.06 0l3.75-3.75a.75.75 0 10-1.06-1.06L13.5 14.44V6.75z" />
                          <path v-else
                            d="M3 5.75A1.75 1.75 0 014.75 4h5.31c.47 0 .91.22 1.2.58l1.42 1.8c.1.13.25.2.42.2h6.17A1.75 1.75 0 0121 8.33v9.92A1.75 1.75 0 0119.25 20H4.75A1.75 1.75 0 013 18.25V5.75z" />
                        </svg>
                        <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                            d="M8.25 3.75h5.38a1.5 1.5 0 011.06.44l3.12 3.12a1.5 1.5 0 01.44 1.06v9.88A1.5 1.5 0 0116.75 19.75h-8.5a1.5 1.5 0 01-1.5-1.5v-13a1.5 1.5 0 011.5-1.5z" />
                        </svg>
                      </div>
                      <div class="min-w-0">
                        <p class="truncate text-sm font-semibold text-slate-900">{{ rowLabel(row) }}</p>
                        <p class="mt-1 truncate text-xs text-slate-500">{{ rowMeta(row) }}</p>
                      </div>
                    </div>
                  </div>
                  <div class="hidden text-sm text-slate-500 md:block">{{ rowTypeLabel(row) }}</div>
                  <div class="hidden text-sm text-slate-500 md:block">{{ row.kind === 'file' ?
                    formatFileSize(row.file_size) : '—' }}</div>
                  <div class="hidden text-sm text-slate-500 md:block">{{ formatDate(row.created_at) }}</div>
                  <div class="flex items-center justify-end"><button v-if="row.kind !== 'up'" type="button"
                      class="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                      data-context-trigger @click.stop="openMenuFromButton($event, row)"><svg class="h-4 w-4"
                        viewBox="0 0 24 24" fill="currentColor">
                        <path
                          d="M12 7.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                      </svg></button></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div v-if="contextMenu.visible"
        class="fixed z-[60] min-w-[220px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-slate-200 bg-white/98 p-1.5 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" data-context-menu @click.stop>
        <div class="p-1.5">
          <button v-for="action in contextMenuActions" :key="action.key" type="button"
            class="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium transition"
            :class="action.danger ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100'"
            @click.stop="handleContextActionV2(action.key)">{{ action.label }}</button>
        </div>
      </div>
      <div v-if="propertiesDialog.visible"
        class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
        @click="closePropertiesDialog">
        <div
          class="w-full max-w-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_26px_80px_rgba(15,23,42,0.2)]"
          @click.stop>
          <div class="border-b border-slate-200 px-6 py-4">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">属性</p>
                <h3 class="mt-1 break-words text-lg font-semibold text-slate-900">{{ propertiesDialogData.title }}</h3>
                <p class="mt-1 text-sm text-slate-500">{{ propertiesDialogData.subtitle }}</p>
              </div>
              <button type="button"
                class="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                @click="closePropertiesDialog">关闭</button>
            </div>
          </div>
          <div class="space-y-5 px-6 py-5">
            <section v-for="section in propertiesDialogData.sections" :key="section.title"
              class="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <h4 class="text-sm font-semibold text-slate-900">{{ section.title }}</h4>
              <div class="mt-4 grid gap-4 sm:grid-cols-2">
                <div v-for="field in section.fields" :key="field.label" :class="field.wide ? 'sm:col-span-2' : ''">
                  <p class="text-xs font-medium text-slate-400">{{ field.label }}</p>
                  <p class="mt-1 break-all text-sm text-slate-700">{{ field.value }}</p>
                </div>
              </div>
            </section>
          </div>
          <div class="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
            <button type="button"
              class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              @click="closePropertiesDialog">确定</button>
          </div>
        </div>
      </div>
      <div v-if="inlinePreview.visible"
        class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm"
        @click="closeInlinePreview">
        <div
          class="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950"
          @click.stop>
          <div class="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
            <p class="truncate text-sm font-medium">{{ inlinePreview.fileName || '在线预览' }}</p>
            <div class="flex items-center gap-2">
              <button v-if="inlinePreview.material" type="button"
                class="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs transition hover:bg-white/20"
                @click="downloadMaterial(inlinePreview.material)">
                下载
              </button>
              <button type="button"
                class="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs transition hover:bg-white/20"
                @click="closeInlinePreview">
                关闭
              </button>
            </div>
          </div>

          <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-4">
            <div v-if="inlinePreview.loading" class="text-sm text-slate-200">预览加载中...</div>
            <img v-else-if="inlinePreview.isImage" :src="inlinePreview.objectUrl"
              :alt="inlinePreview.fileName || '预览图片'"
              class="max-h-[84vh] w-auto max-w-full rounded-xl bg-slate-900 object-contain" />
            <iframe v-else :src="inlinePreview.objectUrl" class="h-[84vh] w-full rounded-xl bg-white" title="文件在线预览" />
          </div>
        </div>
      </div>
      <div v-if="toast"
        class="fixed bottom-5 right-5 z-50 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-lg"
        :class="toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'">{{ toast.message }}</div>
    </main>
  </AppShell>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import api, { resolveApiUrl } from '@/utils/api'
import { formatUtc8DateTime, getUtc8Timestamp } from '@/utils/dateTime'
import { openProtectedFile, revokeObjectUrl } from '@/utils/fileDownload'
import AppShell from '@/components/AppShell.vue'

const ROOT_DROP_KEY = 'root'
const TEXT_PREVIEW_EXTENSIONS = new Set(['md', 'txt', 'json'])
const authStore = useAuthStore()
const createInlinePreviewState = () => ({
  visible: false,
  loading: false,
  objectUrl: '',
  fileName: '',
  isImage: false,
  material: null
})

const allFolders = ref([])
const materials = ref([])
const currentFolderId = ref(null)
const isLoading = ref(false)
const fileInput = ref(null)
const toast = ref(null)
const searchKeyword = ref('')
const sortOption = ref('nameAsc')
const pathInput = ref('/')
const isPathEditing = ref(false)
const moveTargetId = ref('')
const selectedKeys = ref([])
const activeSelectionKey = ref('')
const selectionAnchorKey = ref('')
const contextMenu = ref({ visible: false, x: 0, y: 0, rowKey: '', scope: 'blank' })
const clipboard = ref({ mode: 'copy', entries: [] })
const propertiesDialog = ref({ visible: false, scope: 'blank', row: null, entries: [] })
const dragSelectionKeys = ref([])
const dropTargetKey = ref('')
const selectAllCheckbox = ref(null)
const listViewportRef = ref(null)
const listContentRef = ref(null)
const suppressNextRowClick = ref(false)
const inlinePreview = ref(createInlinePreviewState())
const uploadProgress = ref({
  active: false,
  totalFiles: 0,
  processedFiles: 0,
  successFiles: 0,
  failedFiles: 0,
  currentFileName: '',
  currentFilePercent: 0,
  processedBytes: 0,
  totalBytes: 0
})
const marquee = ref({
  tracking: false,
  visible: false,
  additive: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  baseKeys: []
})

const normalizeFolderId = (value) => (value === undefined || value === null || value === '' ? null : Number(value))
const sameFolderId = (a, b) => normalizeFolderId(a) === normalizeFolderId(b)

const currentFolder = computed(() => allFolders.value.find((folder) => sameFolderId(folder.id, currentFolderId.value)) || null)
const currentFolderName = computed(() => currentFolder.value?.name || '全部文件')
const childFolders = computed(() => allFolders.value.filter((folder) => sameFolderId(folder.parent_id, currentFolderId.value)))
const currentDirectoryStorage = computed(() => materials.value.reduce((total, item) => total + (item.file_size || 0), 0))
const normalizedSearchKeyword = computed(() => searchKeyword.value.trim().toLowerCase())
const folderRows = computed(() => childFolders.value.map((folder) => ({ ...folder, kind: 'folder' })))
const fileRows = computed(() => materials.value.map((file) => ({ ...file, kind: 'file' })))
const currentRows = computed(() => [...folderRows.value, ...fileRows.value])
const rowLookup = computed(() => new Map(currentRows.value.map((row) => [makeRowKey(row), row])))
const visibleFolderRows = computed(() => sortFolders(folderRows.value.filter((folder) => !normalizedSearchKeyword.value || folder.name.toLowerCase().includes(normalizedSearchKeyword.value))))
const visibleFileRows = computed(() => sortMaterials(fileRows.value.filter((file) => !normalizedSearchKeyword.value || file.file_name.toLowerCase().includes(normalizedSearchKeyword.value))))
const visibleRows = computed(() => [...visibleFolderRows.value, ...visibleFileRows.value])
const directoryItemCount = computed(() => visibleRows.value.length)
const displayRows = computed(() => {
  const rows = []
  if (currentFolderId.value !== null) rows.push({ kind: 'up', id: 'up', name: '返回上级目录', parent_id: currentFolder.value?.parent_id ?? null, created_at: currentFolder.value?.created_at ?? null })
  rows.push(...visibleRows.value)
  return rows
})
const currentFolderPath = computed(() => resolveFolderPath(currentFolderId.value))
const marqueeStyle = computed(() => {
  const left = Math.min(marquee.value.startX, marquee.value.currentX)
  const top = Math.min(marquee.value.startY, marquee.value.currentY)
  const width = Math.abs(marquee.value.currentX - marquee.value.startX)
  const height = Math.abs(marquee.value.currentY - marquee.value.startY)

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`
  }
})
const selectedEntries = computed(() => selectedKeys.value.map((key) => rowLookup.value.get(key)).filter(Boolean))
const selectedFiles = computed(() => selectedEntries.value.filter((entry) => entry.kind === 'file'))
const selectedFolders = computed(() => selectedEntries.value.filter((entry) => entry.kind === 'folder'))
const selectedFileStorage = computed(() => selectedFiles.value.reduce((total, item) => total + (item.file_size || 0), 0))
const hasSelection = computed(() => selectedEntries.value.length > 0)
const hasClipboard = computed(() => clipboard.value.entries.length > 0)
const hasSingleSelection = computed(() => selectedEntries.value.length === 1)
const isBatchSelection = computed(() => selectedEntries.value.length > 1)
const selectedItem = computed(() => rowLookup.value.get(activeSelectionKey.value) || selectedEntries.value[0] || null)
const visibleRowKeys = computed(() => visibleRows.value.map((row) => makeRowKey(row)))
const selectableDisplayRowKeys = computed(() => displayRows.value.filter((row) => row.kind !== 'up').map((row) => makeRowKey(row)))
const allVisibleSelected = computed(() => visibleRowKeys.value.length > 0 && visibleRowKeys.value.every((key) => selectedKeys.value.includes(key)))
const partiallyVisibleSelected = computed(() => !allVisibleSelected.value && visibleRowKeys.value.some((key) => selectedKeys.value.includes(key)))
const normalizedMoveTargetId = computed(() => normalizeFolderId(moveTargetId.value))
const blockedMoveTargetIds = computed(() => {
  const blocked = new Set()
  for (const folder of selectedFolders.value) {
    for (const id of collectFolderBranchIds(folder.id)) blocked.add(id)
  }
  return blocked
})
const moveTargets = computed(() => allFolders.value.filter((folder) => !blockedMoveTargetIds.value.has(normalizeFolderId(folder.id))))
const moveAnalysis = computed(() => analyzeMove(selectedEntries.value, normalizedMoveTargetId.value))
const canMoveSelected = computed(() => hasSelection.value && moveAnalysis.value.movable.length > 0)
const moveActionLabel = computed(() => !hasSelection.value ? '移动' : isBatchSelection.value ? `移动所选 ${selectedEntries.value.length} 项` : selectedItem.value?.kind === 'folder' ? '移动目录' : '移动文件')
const uploadProgressPercent = computed(() => {
  if (uploadProgress.value.totalBytes > 0) {
    return Math.min(100, Math.round((uploadProgress.value.processedBytes / uploadProgress.value.totalBytes) * 100))
  }

  if (uploadProgress.value.totalFiles > 0) {
    return Math.min(100, Math.round((uploadProgress.value.processedFiles / uploadProgress.value.totalFiles) * 100))
  }

  return 0
})
const contextRow = computed(() => contextMenu.value.scope === 'row' ? rowLookup.value.get(contextMenu.value.rowKey) || null : null)
const isContextSelection = computed(() => Boolean(contextRow.value && isSelected(contextRow.value) && isBatchSelection.value))
const contextMenuActions = computed(() => {
  if (!contextMenu.value.visible) return []
  if (contextMenu.value.scope === 'blank' || !contextRow.value) {
    return [
      ...(authStore.isTeacher ? [{ key: 'new-folder', label: '新建文件夹' }, { key: 'upload-files', label: '上传文件' }, ...(hasClipboard.value ? [{ key: 'paste-here', label: `粘贴${clipboard.value.entries.length > 1 ? ` (${clipboard.value.entries.length})` : ''}` }] : [])] : []),
      { key: 'refresh-view', label: '刷新' },
      { key: 'show-properties', label: '属性' },
      ...(hasSelection.value ? [{ key: 'clear-selection', label: '清空选择' }] : [])
    ]
  }
  if (isContextSelection.value) {
    return [
      ...(authStore.isTeacher ? [{ key: 'copy-selected', label: `复制所选项目 (${selectedEntries.value.length})` }] : []),
      ...(authStore.isTeacher ? [{ key: 'cut-selected', label: `剪切所选项目 (${selectedEntries.value.length})` }] : []),
      ...(selectedFiles.value.length ? [{ key: 'download-selected', label: `下载所选文件 (${selectedFiles.value.length})` }] : []),
      ...(authStore.isTeacher ? [{ key: 'delete-selected', label: `删除所选项目 (${selectedEntries.value.length})`, danger: true }] : []),
      { key: 'show-properties', label: '属性' },
      { key: 'clear-selection', label: '清空选择' }
    ]
  }
  if (contextRow.value.kind === 'folder') {
    return [
      { key: 'open-folder', label: '打开文件夹' },
      ...(authStore.isTeacher ? [{ key: 'rename-folder', label: '重命名' }, { key: 'copy-row', label: '复制' }, { key: 'cut-row', label: '剪切' }, ...(hasClipboard.value ? [{ key: 'paste-into-folder', label: `粘贴到此处${clipboard.value.entries.length > 1 ? ` (${clipboard.value.entries.length})` : ''}` }] : []), { key: 'delete-row', label: '删除文件夹', danger: true }] : []),
      { key: 'show-properties', label: '属性' }
    ]
  }
  return [
    { key: 'open-file', label: isPreviewableRow(contextRow.value) ? '在线预览' : '打开文件' },
    ...(authStore.isTeacher ? [{ key: 'rename-file', label: '重命名' }, { key: 'copy-row', label: '复制' }, { key: 'cut-row', label: '剪切' }] : []),
    { key: 'download-file', label: '下载文件' },
    ...(authStore.isTeacher ? [{ key: 'delete-row', label: '删除文件', danger: true }] : []),
    { key: 'show-properties', label: '属性' }
  ]
})
const propertiesDialogData = computed(() => {
  const dialog = propertiesDialog.value

  if (dialog.scope === 'selection') {
    const entries = dialog.entries || []
    const files = entries.filter((entry) => entry.kind === 'file')
    const folders = entries.filter((entry) => entry.kind === 'folder')
    const totalSize = files.reduce((total, item) => total + (item.file_size || 0), 0)

    return {
      title: `${entries.length} 个项目`,
      subtitle: '多项选择属性',
      sections: [
        {
          title: '常规',
          fields: [
            { label: '项目数', value: `${entries.length}` },
            { label: '文件', value: `${files.length}` },
            { label: '目录', value: `${folders.length}` },
            { label: '文件总大小', value: formatFileSize(totalSize) },
            { label: '当前目录', value: currentFolderPath.value, wide: true }
          ]
        }
      ]
    }
  }

  if (dialog.scope === 'row' && dialog.row) {
    const row = dialog.row

    if (row.kind === 'folder') {
      return {
        title: `${rowLabel(row)} 属性`,
        subtitle: '文件夹',
        sections: [
          {
            title: '常规',
            fields: [
              { label: '名称', value: rowLabel(row), wide: true },
              { label: '位置', value: resolveFolderPath(row.parent_id), wide: true },
              { label: '子目录', value: `${row.child_count || 0}` },
              { label: '文件', value: `${row.material_count || 0}` },
              { label: '创建时间', value: formatDate(row.created_at), wide: true },
              { label: '编号', value: `#${row.id}` }
            ]
          }
        ]
      }
    }

    return {
      title: `${rowLabel(row)} 属性`,
      subtitle: formatCompactType(row.file_type),
      sections: [
        {
          title: '常规',
          fields: [
            { label: '名称', value: rowLabel(row), wide: true },
            { label: '位置', value: resolveFolderPath(row.folder_id), wide: true },
            { label: '类型', value: formatCompactType(row.file_type) },
            { label: '大小', value: formatFileSize(row.file_size) },
            { label: '上传时间', value: formatDate(row.created_at), wide: true },
            { label: '上传者', value: row.uploader_name || '未知用户', wide: true },
            { label: '编号', value: `#${row.id}` }
          ]
        }
      ]
    }
  }

  return {
    title: `${currentFolderName.value} 属性`,
    subtitle: '当前目录',
    sections: [
      {
        title: '常规',
        fields: [
          { label: '路径', value: currentFolderPath.value, wide: true },
          { label: '显示项目', value: `${directoryItemCount.value}` },
          { label: '目录', value: `${visibleFolderRows.value.length}` },
          { label: '文件', value: `${visibleFileRows.value.length}` },
          { label: '当前容量', value: formatFileSize(currentDirectoryStorage.value) },
          { label: '总目录', value: `${allFolders.value.length}` }
        ]
      }
    ]
  }
})

function makeRowKey(row) { return row.kind === 'up' ? 'up' : `${row.kind}-${row.id}` }
function sortFolders(list) {
  const copied = [...list]
  if (sortOption.value === 'dateAsc') return copied.sort((a, b) => getUtc8Timestamp(a.created_at, 0) - getUtc8Timestamp(b.created_at, 0))
  if (sortOption.value === 'dateDesc') return copied.sort((a, b) => getUtc8Timestamp(b.created_at, 0) - getUtc8Timestamp(a.created_at, 0))
  if (sortOption.value === 'nameDesc') return copied.sort((a, b) => b.name.localeCompare(a.name, 'zh-CN'))
  return copied.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}
function sortMaterials(list) {
  const copied = [...list]
  if (sortOption.value === 'sizeAsc') return copied.sort((a, b) => (a.file_size || 0) - (b.file_size || 0))
  if (sortOption.value === 'sizeDesc') return copied.sort((a, b) => (b.file_size || 0) - (a.file_size || 0))
  if (sortOption.value === 'dateAsc') return copied.sort((a, b) => getUtc8Timestamp(a.created_at, 0) - getUtc8Timestamp(b.created_at, 0))
  if (sortOption.value === 'dateDesc') return copied.sort((a, b) => getUtc8Timestamp(b.created_at, 0) - getUtc8Timestamp(a.created_at, 0))
  if (sortOption.value === 'nameDesc') return copied.sort((a, b) => b.file_name.localeCompare(a.file_name, 'zh-CN'))
  return copied.sort((a, b) => a.file_name.localeCompare(b.file_name, 'zh-CN'))
}
function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / (1024 ** exponent)
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}
function formatDate(value) {
  return formatUtc8DateTime(value, '—')
}
function formatCompactType(type) {
  if (!type) return '目录/未知'
  if (type.includes('pdf')) return 'PDF'
  if (type.includes('presentation') || type.includes('powerpoint')) return 'PPT'
  if (type.includes('word') || type.includes('doc')) return 'Word'
  if (type.includes('sheet') || type.includes('excel')) return 'Excel'
  if (type.startsWith('image/')) return '图片'
  if (type.startsWith('text/')) return '文本'
  return type
}
function getFileExtension(fileName = '') {
  const normalizedName = `${fileName || ''}`.trim()
  if (!normalizedName.includes('.')) return ''
  return normalizedName.split('.').pop().toLowerCase()
}
function isPreviewableRow(row) {
  if (!row || row.kind !== 'file') return false
  const type = row.file_type || ''
  const fileName = row.file_name || ''
  const extension = getFileExtension(fileName)
  return type.startsWith('image/')
    || type.includes('pdf')
    || type.startsWith('text/')
    || TEXT_PREVIEW_EXTENSIONS.has(extension)
}
function resolveFolderPath(folderId) {
  if (folderId === null || folderId === undefined) return '/'
  const path = []
  let pointer = allFolders.value.find((folder) => sameFolderId(folder.id, folderId)) || null
  while (pointer) {
    path.unshift(pointer.name)
    pointer = allFolders.value.find((folder) => sameFolderId(folder.id, pointer.parent_id)) || null
  }
  return path.length ? `/${path.join('/')}` : '/'
}
function normalizePathValue(value) {
  const trimmed = `${value || ''}`.trim().replace(/\\/g, '/')
  if (!trimmed || trimmed === '/') return '/'
  const normalized = trimmed.replace(/\/+/g, '/').replace(/\/$/, '')
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}
function resolveFolderIdByPath(path) {
  const normalized = normalizePathValue(path)
  if (normalized === '/') return null

  let parentId = null
  const segments = normalized.split('/').filter(Boolean)

  for (const segment of segments) {
    const folder = allFolders.value.find((item) => sameFolderId(item.parent_id, parentId) && item.name === segment)
      || allFolders.value.find((item) => sameFolderId(item.parent_id, parentId) && item.name.toLowerCase() === segment.toLowerCase())

    if (!folder) return undefined
    parentId = normalizeFolderId(folder.id)
  }

  return parentId
}
function rowLabel(row) { return row.kind === 'up' ? row.name : row.kind === 'folder' ? row.name : row.file_name }
function rowTypeLabel(row) { return row.kind === 'up' ? '导航' : row.kind === 'folder' ? '文件夹' : formatCompactType(row.file_type) }
function rowMeta(row) {
  if (row.kind === 'up') return `返回到 ${resolveFolderPath(row.parent_id)}`
  if (row.kind === 'folder') return `${row.child_count || 0} 个子目录 · ${row.material_count || 0} 个文件 · ${formatDate(row.created_at)}`
  return `${formatCompactType(row.file_type)} · ${formatFileSize(row.file_size)} · ${formatDate(row.created_at)}`
}
function getItemBadgeClass(row) {
  if (row.kind === 'up') return 'bg-slate-100 text-slate-500'
  if (row.kind === 'folder') return 'bg-amber-100 text-amber-700'
  if ((row.file_type || '').includes('pdf')) return 'bg-rose-100 text-rose-700'
  if ((row.file_type || '').startsWith('image/')) return 'bg-sky-100 text-sky-700'
  return 'bg-slate-100 text-slate-600'
}
function rowClasses(row) {
  const classes = []
  if (row.kind === 'up') classes.push('bg-slate-50/80 hover:bg-slate-100/70')
  else if (isSelected(row)) classes.push('bg-sky-50 ring-1 ring-inset ring-sky-100')
  else classes.push('hover:bg-slate-50')
  if (row.kind === 'folder' && isDropTarget(row.id)) classes.push('bg-emerald-50 ring-1 ring-inset ring-emerald-200')
  if (isDraggedRow(row)) classes.push('opacity-70')
  return classes.join(' ')
}
function getMarqueePoint(event) {
  const viewport = listViewportRef.value
  if (!viewport) return null

  const rect = viewport.getBoundingClientRect()
  return {
    x: event.clientX - rect.left + viewport.scrollLeft,
    y: event.clientY - rect.top + viewport.scrollTop
  }
}
function resetMarquee() {
  marquee.value = {
    tracking: false,
    visible: false,
    additive: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    baseKeys: []
  }
}
function updateMarqueeSelection() {
  const content = listContentRef.value
  if (!content) return

  const selectionRect = {
    left: Math.min(marquee.value.startX, marquee.value.currentX),
    right: Math.max(marquee.value.startX, marquee.value.currentX),
    top: Math.min(marquee.value.startY, marquee.value.currentY),
    bottom: Math.max(marquee.value.startY, marquee.value.currentY)
  }

  const hitKeys = Array.from(content.querySelectorAll('[data-row-selectable="true"]'))
    .filter((element) => {
      const left = element.offsetLeft
      const right = left + element.offsetWidth
      const top = element.offsetTop
      const bottom = top + element.offsetHeight

      return !(selectionRect.right < left || selectionRect.left > right || selectionRect.bottom < top || selectionRect.top > bottom)
    })
    .map((element) => element.getAttribute('data-row-key'))
    .filter(Boolean)

  const nextKeys = marquee.value.additive
    ? Array.from(new Set([...marquee.value.baseKeys, ...hitKeys]))
    : hitKeys

  selectedKeys.value = nextKeys
  activeSelectionKey.value = nextKeys[0] || ''
  if (!marquee.value.additive || !selectionAnchorKey.value || !nextKeys.includes(selectionAnchorKey.value)) {
    selectionAnchorKey.value = nextKeys[0] || selectionAnchorKey.value
  }
}
function handleViewportPointerMove(event) {
  if (!marquee.value.tracking) return

  const point = getMarqueePoint(event)
  if (!point) return

  marquee.value.currentX = point.x
  marquee.value.currentY = point.y

  if (!marquee.value.visible) {
    const distance = Math.hypot(point.x - marquee.value.startX, point.y - marquee.value.startY)
    if (distance < 6) return
    marquee.value.visible = true
  }

  event.preventDefault()
  updateMarqueeSelection()
}
function handleViewportPointerUp() {
  if (!marquee.value.tracking) return

  const shouldSuppressClick = marquee.value.visible
  window.removeEventListener('pointermove', handleViewportPointerMove)
  window.removeEventListener('pointerup', handleViewportPointerUp)
  window.removeEventListener('pointercancel', handleViewportPointerUp)
  resetMarquee()

  if (shouldSuppressClick) {
    suppressNextRowClick.value = true
    window.setTimeout(() => {
      suppressNextRowClick.value = false
    }, 0)
  }
}
function handleViewportPointerDown(event) {
  if (event.button !== 0 || isLoading.value) return
  if (event.target.closest('button, input, select, textarea, label, a, [data-context-trigger], [data-context-menu], [data-row-checkbox], [data-path-input]')) return

  const targetRowElement = event.target.closest('[data-row-key]')
  const targetRowKey = targetRowElement?.getAttribute('data-row-key')
  const targetRow = targetRowKey ? rowLookup.value.get(targetRowKey) : null

  if (targetRow?.kind === 'up') return
  if (targetRow && authStore.isTeacher && isSelected(targetRow)) return

  const point = getMarqueePoint(event)
  if (!point) return

  closeContextMenu()
  marquee.value = {
    tracking: true,
    visible: false,
    additive: Boolean(event.ctrlKey || event.metaKey),
    startX: point.x,
    startY: point.y,
    currentX: point.x,
    currentY: point.y,
    baseKeys: event.ctrlKey || event.metaKey ? [...selectedKeys.value] : []
  }

  window.addEventListener('pointermove', handleViewportPointerMove)
  window.addEventListener('pointerup', handleViewportPointerUp)
  window.addEventListener('pointercancel', handleViewportPointerUp)
}
function cancelPathEditing() {
  isPathEditing.value = false
  pathInput.value = currentFolderPath.value
}
async function submitPathInput() {
  const normalizedPath = normalizePathValue(pathInput.value)
  const targetFolderId = resolveFolderIdByPath(normalizedPath)

  if (targetFolderId === undefined) {
    showToast(`路径不存在：${normalizedPath}`, 'error')
    cancelPathEditing()
    return
  }

  isPathEditing.value = false
  await goToFolder(targetFolderId)
}
function clearSelection() {
  selectedKeys.value = []
  activeSelectionKey.value = ''
  selectionAnchorKey.value = ''
}
function syncSelection() {
  const availableKeys = new Set(currentRows.value.map((row) => makeRowKey(row)))
  selectedKeys.value = selectedKeys.value.filter((key) => availableKeys.has(key))
  if (!selectedKeys.value.includes(activeSelectionKey.value)) activeSelectionKey.value = selectedKeys.value[0] || ''
  if (!selectedKeys.value.includes(selectionAnchorKey.value)) selectionAnchorKey.value = activeSelectionKey.value || selectedKeys.value[0] || ''
}
function setSingleSelection(row) {
  if (row.kind === 'up') return clearSelection()
  const key = makeRowKey(row)
  selectedKeys.value = [key]
  activeSelectionKey.value = key
  selectionAnchorKey.value = key
}
function toggleSelection(row, force) {
  if (row.kind === 'up') return
  const key = makeRowKey(row)
  const exists = selectedKeys.value.includes(key)
  const shouldSelect = force === undefined ? !exists : Boolean(force)
  if (shouldSelect && !exists) selectedKeys.value = [...selectedKeys.value, key]
  if (!shouldSelect && exists) selectedKeys.value = selectedKeys.value.filter((item) => item !== key)
  if (shouldSelect) {
    activeSelectionKey.value = key
    selectionAnchorKey.value = key
  } else {
    if (activeSelectionKey.value === key) activeSelectionKey.value = selectedKeys.value[0] || ''
    if (selectionAnchorKey.value === key) selectionAnchorKey.value = activeSelectionKey.value || selectedKeys.value[0] || ''
  }
}
function selectRangeToRow(row, additive = false) {
  if (row.kind === 'up') return

  const key = makeRowKey(row)
  const orderedKeys = selectableDisplayRowKeys.value
  const anchorKey = selectionAnchorKey.value && orderedKeys.includes(selectionAnchorKey.value)
    ? selectionAnchorKey.value
    : key
  const anchorIndex = orderedKeys.indexOf(anchorKey)
  const targetIndex = orderedKeys.indexOf(key)

  if (anchorIndex === -1 || targetIndex === -1) {
    return setSingleSelection(row)
  }

  const start = Math.min(anchorIndex, targetIndex)
  const end = Math.max(anchorIndex, targetIndex)
  const rangeKeys = orderedKeys.slice(start, end + 1)

  selectedKeys.value = additive
    ? Array.from(new Set([...selectedKeys.value, ...rangeKeys]))
    : rangeKeys
  activeSelectionKey.value = key
  if (!selectionAnchorKey.value) selectionAnchorKey.value = anchorKey
}
function toggleSelectAll(event) {
  const checked = Boolean(event.target.checked)
  if (checked) {
    const nextKeys = new Set(selectedKeys.value)
    for (const row of visibleRows.value) nextKeys.add(makeRowKey(row))
    selectedKeys.value = Array.from(nextKeys)
    activeSelectionKey.value = selectedKeys.value[0] || ''
    selectionAnchorKey.value = selectedKeys.value[0] || ''
    return
  }
  const visibleKeySet = new Set(visibleRowKeys.value)
  selectedKeys.value = selectedKeys.value.filter((key) => !visibleKeySet.has(key))
  if (!selectedKeys.value.includes(activeSelectionKey.value)) activeSelectionKey.value = selectedKeys.value[0] || ''
  if (!selectedKeys.value.includes(selectionAnchorKey.value)) selectionAnchorKey.value = activeSelectionKey.value || selectedKeys.value[0] || ''
}
function isSelected(row) { return row.kind !== 'up' && selectedKeys.value.includes(makeRowKey(row)) }
function selectItem(row, event) {
  if (suppressNextRowClick.value || marquee.value.tracking || marquee.value.visible) return
  closeContextMenu()
  if (row.kind === 'up') return clearSelection()
  if (event?.shiftKey) return selectRangeToRow(row, Boolean(event.ctrlKey || event.metaKey))
  if (event?.ctrlKey || event?.metaKey) return toggleSelection(row)
  setSingleSelection(row)
}
function openItem(row) {
  if (row.kind === 'up') return goToFolder(row.parent_id)
  if (row.kind === 'folder') return goToFolder(row.id)
  return openMaterial(row)
}
function collectFolderBranchIds(folderId) {
  const normalizedFolderId = normalizeFolderId(folderId)
  const blockedIds = new Set([normalizedFolderId])
  const stack = [normalizedFolderId]
  while (stack.length) {
    const currentId = stack.pop()
    const children = allFolders.value.filter((folder) => sameFolderId(folder.parent_id, currentId))
    for (const child of children) {
      const childId = normalizeFolderId(child.id)
      if (blockedIds.has(childId)) continue
      blockedIds.add(childId)
      stack.push(childId)
    }
  }
  return blockedIds
}
function isCircularFolderMove(folderId, targetFolderId) { return targetFolderId === null ? false : collectFolderBranchIds(folderId).has(normalizeFolderId(targetFolderId)) }
function analyzeMove(entries, targetFolderId) {
  const movable = []
  const skipped = []
  for (const entry of entries) {
    if (entry.kind === 'folder') {
      if (sameFolderId(entry.parent_id, targetFolderId)) skipped.push({ reason: `${entry.name} 已位于目标目录` })
      else if (isCircularFolderMove(entry.id, targetFolderId)) skipped.push({ reason: `${entry.name} 不能移动到自身或子目录中` })
      else movable.push(entry)
    } else if (sameFolderId(entry.folder_id, targetFolderId)) skipped.push({ reason: `${entry.file_name} 已位于目标目录` })
    else movable.push(entry)
  }
  return { movable, skipped }
}
function getDropKey(folderId) { return folderId === null ? ROOT_DROP_KEY : `folder-${folderId}` }
function isDropTarget(folderId) { return dropTargetKey.value === getDropKey(normalizeFolderId(folderId)) }
function isDraggedRow(row) { return row.kind !== 'up' && dragSelectionKeys.value.includes(makeRowKey(row)) }
function handleRowDragStart(event, row) {
  if (marquee.value.tracking || marquee.value.visible) return event.preventDefault()
  if (!authStore.isTeacher || row.kind === 'up') return event.preventDefault()
  if (!isSelected(row)) setSingleSelection(row)
  dragSelectionKeys.value = [...selectedKeys.value]
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', dragSelectionKeys.value.join(','))
  }
}
function handleDragEnd() { dragSelectionKeys.value = []; dropTargetKey.value = '' }
function getDraggedEntries() { return dragSelectionKeys.value.map((key) => rowLookup.value.get(key)).filter(Boolean) }
function handleFolderDragOver(folderId) {
  if (!authStore.isTeacher || !dragSelectionKeys.value.length) return
  const targetFolderId = normalizeFolderId(folderId)
  dropTargetKey.value = analyzeMove(getDraggedEntries(), targetFolderId).movable.length ? getDropKey(targetFolderId) : ''
}
async function handleDropToFolder(folderId) {
  if (!authStore.isTeacher || !dragSelectionKeys.value.length) return
  const entries = getDraggedEntries()
  const targetFolderId = normalizeFolderId(folderId)
  handleDragEnd()
  if (!entries.length) return
  await moveEntriesToFolder(entries, targetFolderId)
}
function closeContextMenu() { contextMenu.value = { visible: false, x: 0, y: 0, rowKey: '', scope: 'blank' } }
function clampMenuPosition(event) {
  const viewportPadding = 12
  const menuWidth = 260
  const menuHeight = 340
  return {
    x: Math.max(viewportPadding, Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding)),
    y: Math.max(viewportPadding, Math.min(event.clientY, window.innerHeight - menuHeight - viewportPadding))
  }
}
function openContextMenu(event, row) {
  if (!isSelected(row)) setSingleSelection(row)
  const position = clampMenuPosition(event)
  contextMenu.value = { visible: true, x: position.x, y: position.y, rowKey: makeRowKey(row), scope: 'row' }
}
function openMenuFromButton(event, row) { openContextMenu(event, row) }
function openBlankContextMenu(event) {
  if (event.target.closest('button, input, select, textarea, label, a, [data-context-trigger], [data-context-menu]')) {
    closeContextMenu()
    return
  }
  event.preventDefault()
  const position = clampMenuPosition(event)
  contextMenu.value = { visible: true, x: position.x, y: position.y, rowKey: '', scope: 'blank' }
}
function openUploadPicker() {
  closeContextMenu()
  if (uploadProgress.value.active) {
    showToast('当前有文件正在上传，请稍候', 'error')
    return
  }
  fileInput.value?.click()
}
function copyEntriesToClipboard(entries) {
  const normalizedEntries = (entries || []).filter((entry) => entry?.kind === 'file' || entry?.kind === 'folder')
  if (!normalizedEntries.length) return
  clipboard.value = {
    entries: normalizedEntries.map((entry) => ({
      id: Number(entry.id),
      kind: entry.kind,
      name: rowLabel(entry)
    }))
  }
  showToast(`已复制 ${normalizedEntries.length} 项，可在目标目录右键粘贴`, 'success')
}
async function pasteClipboard(targetFolderId = currentFolderId.value) {
  if (!authStore.isTeacher) return
  if (!clipboard.value.entries.length) return showToast('剪贴板为空', 'error')

  try {
    const response = await api.post('/materials/copy', {
      entries: clipboard.value.entries.map((entry) => ({ id: entry.id, kind: entry.kind })),
      target_folder_id: targetFolderId ?? undefined
    })
    showToast(response.message || `已粘贴 ${clipboard.value.entries.length} 项`, response.failed_count ? 'error' : 'success')
    await refreshView()
  } catch (error) {
    showToast(resolveErrorMessage(error, '粘贴失败'), 'error')
  }
}
function openPropertiesDialog(options = {}) {
  if (options.scope === 'selection') {
    propertiesDialog.value = {
      visible: true,
      scope: 'selection',
      row: null,
      entries: (options.entries || []).map((entry) => ({ ...entry }))
    }
    return
  }

  if (options.scope === 'row' && options.row) {
    propertiesDialog.value = {
      visible: true,
      scope: 'row',
      row: { ...options.row },
      entries: []
    }
    return
  }

  propertiesDialog.value = {
    visible: true,
    scope: 'blank',
    row: null,
    entries: []
  }
}
function closePropertiesDialog() {
  propertiesDialog.value = { visible: false, scope: 'blank', row: null, entries: [] }
}
async function handleContextAction(actionKey) {
  const row = contextRow.value ? { ...contextRow.value } : null
  const selectionEntries = isContextSelection.value ? selectedEntries.value.map((entry) => ({ ...entry })) : []
  closeContextMenu()
  if (actionKey === 'new-folder') return createFolder()
  if (actionKey === 'upload-files') return openUploadPicker()
  if (actionKey === 'copy-selected') return copyEntriesToClipboard(selectedEntries.value)
  if (actionKey === 'copy-row' && row) return copyEntriesToClipboard([row])
  if (actionKey === 'paste-here') return pasteClipboard(currentFolderId.value)
  if (actionKey === 'paste-into-folder' && row?.kind === 'folder') return pasteClipboard(row.id)
  if (actionKey === 'refresh-view') return refreshView()
  if (actionKey === 'show-properties') return openPropertiesDialog(selectionEntries.length > 1 ? { scope: 'selection', entries: selectionEntries } : row ? { scope: 'row', row } : { scope: 'blank' })
  if (actionKey === 'clear-selection') return clearSelection()
  if (actionKey === 'download-selected') return downloadSelectedFiles()
  if (actionKey === 'delete-selected') return deleteEntries(selectedEntries.value)
  if (actionKey === 'delete-row' && row) return deleteEntries([row])
  if (actionKey === 'open-folder' && row) return goToFolder(row.id)
  if (actionKey === 'rename-folder' && row) return renameFolder(row)
  if (actionKey === 'open-file' && row) return openMaterial(row)
  if (actionKey === 'download-file' && row) return downloadMaterial(row)
}
function resolveErrorMessage(error, fallback) { return error?.error || error?.message || fallback }
async function loadFoldersTree() {
  const response = await api.get('/materials/folders', { params: { all: 1 } })
  allFolders.value = response.folders || []
  if (currentFolderId.value !== null && !allFolders.value.some((folder) => sameFolderId(folder.id, currentFolderId.value))) {
    currentFolderId.value = null
    clearSelection()
  }
}
async function loadCurrentDirectory() {
  const response = await api.get('/materials', { params: { folder_id: currentFolderId.value ?? undefined } })
  materials.value = response.materials || []
  syncSelection()
}
async function refreshView() {
  closeContextMenu()
  isLoading.value = true
  try {
    await loadFoldersTree()
    await loadCurrentDirectory()
  } catch (error) {
    showToast(resolveErrorMessage(error, '加载目录失败'), 'error')
  } finally {
    isLoading.value = false
  }
}
async function goToFolder(folderId) {
  closeContextMenu()
  handleDragEnd()
  currentFolderId.value = normalizeFolderId(folderId)
  clearSelection()
  isLoading.value = true
  try {
    await loadCurrentDirectory()
  } catch (error) {
    showToast(resolveErrorMessage(error, '切换目录失败'), 'error')
  } finally {
    isLoading.value = false
  }
}
async function createFolder() {
  closeContextMenu()
  const name = window.prompt('请输入文件夹名称')
  if (!name?.trim()) return
  try {
    await api.post('/materials/folders', { name: name.trim(), parent_id: currentFolderId.value ?? undefined })
    showToast('文件夹创建成功', 'success')
    await refreshView()
  } catch (error) {
    showToast(resolveErrorMessage(error, '创建文件夹失败'), 'error')
  }
}
function renameFolder(folder) {
  closeContextMenu()
  const nextName = window.prompt('请输入新的文件夹名称', folder.name)
  if (!nextName?.trim()) return
  submitRename(folder.id, nextName.trim())
}
async function submitRename(id, name) {
  try {
    await api.patch(`/materials/folders/${id}`, { name })
    showToast('重命名成功', 'success')
    await refreshView()
  } catch (error) {
    showToast(resolveErrorMessage(error, '重命名失败'), 'error')
  }
}
async function downloadMaterial(material) {
  try {
    const url = await fetchDownloadUrl(material.id, 'attachment')
    window.open(url, '_blank', 'noopener')
  } catch (error) {
    showToast(resolveErrorMessage(error, '获取下载链接失败'), 'error')
  }
}

function releaseInlinePreviewObjectUrl() {
  if (inlinePreview.value.objectUrl?.startsWith('blob:')) {
    revokeObjectUrl(inlinePreview.value.objectUrl)
  }
}

function closeInlinePreview() {
  releaseInlinePreviewObjectUrl()
  inlinePreview.value = createInlinePreviewState()
}

async function openInlinePreview(material) {
  closeInlinePreview()

  inlinePreview.value = {
    ...createInlinePreviewState(),
    visible: true,
    loading: true,
    fileName: material.file_name || '在线预览',
    material
  }

  try {
    const result = await openProtectedFile(
      resolveApiUrl(`/materials/${material.id}/download?disposition=inline`),
      authStore.token,
      material.file_name || 'preview'
    )

    inlinePreview.value = {
      visible: true,
      loading: false,
      objectUrl: result.objectUrl,
      fileName: material.file_name || result.fileName || '在线预览',
      isImage: (result.contentType || material.file_type || '').startsWith('image/'),
      material
    }
  } catch (error) {
    closeInlinePreview()
    showToast(resolveErrorMessage(error, '加载预览失败'), 'error')
  }
}

async function openMaterial(material) {
  if (!material) return

  if (isPreviewableRow(material)) {
    await openInlinePreview(material)
    return
  }

  await downloadMaterial(material)
}
async function downloadSelectedFiles(entries = selectedFiles.value) {
  if (!entries.length) return
  let successCount = 0
  for (const file of entries) {
    try {
      const url = await fetchDownloadUrl(file.id, 'attachment')
      window.open(url, '_blank', 'noopener')
      successCount += 1
    } catch (error) {
      console.error('Download file error:', error)
    }
  }
  showToast(successCount === entries.length ? `已发起 ${successCount} 个文件下载` : `已发起 ${successCount}/${entries.length} 个文件下载`, successCount === entries.length ? 'success' : 'error')
}
async function moveEntriesToFolder(entries, targetFolderId) {
  const { movable, skipped } = analyzeMove(entries, targetFolderId)
  if (!movable.length) return showToast(skipped[0]?.reason || '没有可移动的项目', 'error')
  let successCount = 0
  let failedCount = 0
  for (const entry of movable) {
    try {
      if (entry.kind === 'folder') await api.patch(`/materials/folders/${entry.id}`, { parent_id: targetFolderId })
      else await api.patch(`/materials/${entry.id}`, { folder_id: targetFolderId })
      successCount += 1
    } catch (error) {
      failedCount += 1
      console.error('Move entry error:', error)
    }
  }
  clearSelection()
  await refreshView()
  if (failedCount) return showToast(`已移动 ${successCount} 项，失败 ${failedCount} 项`, 'error')
  if (skipped.length) return showToast(`已移动 ${successCount} 项，跳过 ${skipped.length} 项`, 'success')
  showToast(`已移动 ${successCount} 项`, 'success')
}
async function moveSelectedItems() {
  if (hasSelection.value) await moveEntriesToFolder(selectedEntries.value, normalizedMoveTargetId.value)
}
async function deleteFolderRequest(folderId) { await api.delete(`/materials/folders/${folderId}`) }
async function deleteMaterialRequest(fileId) { await api.delete(`/materials/${fileId}`) }
async function deleteEntries(entries) {
  if (!entries.length) return
  const hasFolderEntry = entries.some((entry) => entry.kind === 'folder')
  const label = entries.length > 1
    ? hasFolderEntry
      ? `确定要删除所选 ${entries.length} 项吗？其中的文件夹会连同子文件夹和文件一起删除。`
      : `确定要删除所选 ${entries.length} 项吗？`
    : entries[0].kind === 'folder'
      ? `确定要删除文件夹 ${rowLabel(entries[0])} 吗？其内所有子文件夹和文件都会一起删除。`
      : `确定要删除 ${rowLabel(entries[0])} 吗？`
  if (!window.confirm(label)) return
  const orderedEntries = [...entries].sort((a, b) => (a.kind === 'file' && b.kind === 'folder' ? -1 : a.kind === 'folder' && b.kind === 'file' ? 1 : 0))
  let successCount = 0
  let failedCount = 0
  let lastErrorMessage = ''
  for (const entry of orderedEntries) {
    try {
      if (entry.kind === 'folder') await deleteFolderRequest(entry.id)
      else await deleteMaterialRequest(entry.id)
      successCount += 1
    } catch (error) {
      failedCount += 1
      lastErrorMessage = resolveErrorMessage(error, '删除失败')
      console.error('Delete entry error:', error)
    }
  }
  clearSelection()
  await refreshView()
  if (failedCount && !successCount && lastErrorMessage) {
    showToast(lastErrorMessage, 'error')
    return
  }
  showToast(failedCount ? `已删除 ${successCount} 项，失败 ${failedCount} 项` : `已删除 ${successCount} 项`, failedCount ? 'error' : 'success')
}
async function deleteSelectedItems() { await deleteEntries(selectedEntries.value) }
async function handleFilesSelected(event) {
  closeContextMenu()
  const files = Array.from(event.target.files || [])
  if (!files.length) return

  const totalBytes = Math.max(
    files.reduce((sum, file) => sum + Math.max(file.size || 0, 1), 0),
    files.length
  )

  uploadProgress.value = {
    active: true,
    totalFiles: files.length,
    processedFiles: 0,
    successFiles: 0,
    failedFiles: 0,
    currentFileName: '',
    currentFilePercent: 0,
    processedBytes: 0,
    totalBytes
  }

  let successCount = 0
  let failedCount = 0
  let processedBytes = 0

  for (const file of files) {
    const fileSize = Math.max(file.size || 0, 1)
    uploadProgress.value = {
      ...uploadProgress.value,
      currentFileName: file.name,
      currentFilePercent: 0,
      processedBytes
    }

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (currentFolderId.value !== null) formData.append('folder_id', String(currentFolderId.value))

      await api.post('/materials', formData, {
        timeout: 180000,
        onUploadProgress: (progressEvent) => {
          const loaded = Math.max(0, Math.min(Number(progressEvent?.loaded) || 0, fileSize))
          const currentFilePercent = Math.min(100, Math.round((loaded / fileSize) * 100))

          uploadProgress.value = {
            ...uploadProgress.value,
            currentFilePercent,
            processedBytes: Math.min(processedBytes + loaded, totalBytes)
          }
        }
      })

      successCount += 1
    } catch (error) {
      failedCount += 1
      console.error('Upload file error:', error)
    } finally {
      processedBytes = Math.min(processedBytes + fileSize, totalBytes)
      uploadProgress.value = {
        ...uploadProgress.value,
        processedFiles: successCount + failedCount,
        successFiles: successCount,
        failedFiles: failedCount,
        processedBytes,
        currentFilePercent: 100
      }
    }
  }

  if (fileInput.value) fileInput.value.value = ''

  uploadProgress.value = {
    ...uploadProgress.value,
    active: false,
    currentFileName: '',
    currentFilePercent: 0,
    processedBytes: totalBytes
  }

  showToast(successCount === files.length ? `成功上传 ${successCount} 个文件` : `上传完成 ${successCount}/${files.length}`, successCount === files.length ? 'success' : 'error')
  await refreshView()
}
function renameSelectedEntry() {
  if (!hasSingleSelection.value) return
  const entry = selectedEntries.value[0]
  if (!entry) return
  if (entry.kind === 'folder') return renameFolder(entry)
  if (entry.kind === 'file') return renameMaterialV2(entry)
}
function renameMaterialV2(material) {
  closeContextMenu()
  const nextName = window.prompt('请输入新的文件名称', material.file_name)
  const normalizedName = `${nextName || ''}`.trim()
  if (!normalizedName || normalizedName === material.file_name) return
  submitMaterialRenameV2(material.id, normalizedName)
}
async function submitMaterialRenameV2(id, fileName) {
  try {
    await api.patch(`/materials/${id}`, { file_name: fileName })
    showToast('重命名成功', 'success')
    await refreshView()
  } catch (error) {
    showToast(resolveErrorMessage(error, '重命名失败'), 'error')
  }
}
async function fetchDownloadUrl(materialId, disposition = 'attachment') {
  const normalizedDisposition = disposition === 'inline' ? 'inline' : 'attachment'
  const tokenQuery = authStore.token
    ? `&token=${encodeURIComponent(authStore.token)}`
    : ''

  return resolveApiUrl(`/materials/${materialId}/download?disposition=${normalizedDisposition}${tokenQuery}`)
}
function buildClipboardEntries(entries) {
  return Array.from(
    new Map(
      (entries || [])
        .filter((entry) => entry?.kind === 'file' || entry?.kind === 'folder')
        .map((entry) => [
          `${entry.kind}-${Number(entry.id)}`,
          {
            id: Number(entry.id),
            kind: entry.kind,
            name: rowLabel(entry),
            file_name: entry.file_name || '',
            folder_id: normalizeFolderId(entry.folder_id),
            parent_id: normalizeFolderId(entry.parent_id)
          }
        ])
    ).values()
  )
}
function copyEntriesToClipboardV2(entries, mode = 'copy') {
  const clipboardEntries = buildClipboardEntries(entries)
  if (!clipboardEntries.length) return
  clipboard.value = {
    mode,
    entries: clipboardEntries
  }
  showToast(mode === 'cut' ? `已剪切 ${clipboardEntries.length} 项，可在目标目录粘贴` : `已复制 ${clipboardEntries.length} 项，可在目标目录粘贴`, 'success')
}
function clearClipboardV2() {
  clipboard.value = { mode: 'copy', entries: [] }
}
async function moveEntriesToFolderV2(entries, targetFolderId) {
  const { movable, skipped } = analyzeMove(entries, targetFolderId)
  if (!movable.length) {
    showToast(skipped[0]?.reason || '没有可移动的项目', 'error')
    return { successCount: 0, failedCount: 0, skipped }
  }

  let successCount = 0
  let failedCount = 0

  for (const entry of movable) {
    try {
      if (entry.kind === 'folder') await api.patch(`/materials/folders/${entry.id}`, { parent_id: targetFolderId })
      else await api.patch(`/materials/${entry.id}`, { folder_id: targetFolderId })
      successCount += 1
    } catch (error) {
      failedCount += 1
      console.error('Move entry error:', error)
    }
  }

  clearSelection()
  await refreshView()

  if (failedCount) showToast(`已移动 ${successCount} 项，失败 ${failedCount} 项`, 'error')
  else if (skipped.length) showToast(`已移动 ${successCount} 项，跳过 ${skipped.length} 项`, 'success')
  else showToast(`已移动 ${successCount} 项`, 'success')

  return { successCount, failedCount, skipped }
}
async function pasteClipboardV2(targetFolderId = currentFolderId.value) {
  if (!authStore.isTeacher) return
  if (!clipboard.value.entries.length) return showToast('剪贴板为空', 'error')

  const normalizedTargetFolderId = normalizeFolderId(targetFolderId)

  try {
    if (clipboard.value.mode === 'cut') {
      const result = await moveEntriesToFolderV2(clipboard.value.entries.map((entry) => ({ ...entry })), normalizedTargetFolderId)
      if (result.successCount > 0 && result.failedCount === 0 && result.skipped.length === 0) clearClipboardV2()
      return
    }

    const response = await api.post('/materials/copy', {
      entries: clipboard.value.entries.map((entry) => ({ id: entry.id, kind: entry.kind })),
      target_folder_id: normalizedTargetFolderId ?? undefined
    })

    showToast(response.message || `已粘贴 ${clipboard.value.entries.length} 项`, response.failed_count ? 'error' : 'success')
    await refreshView()
  } catch (error) {
    showToast(resolveErrorMessage(error, '粘贴失败'), 'error')
  }
}
async function handleContextActionV2(actionKey) {
  const row = contextRow.value ? { ...contextRow.value } : null
  const selectionEntries = isContextSelection.value ? selectedEntries.value.map((entry) => ({ ...entry })) : []
  closeContextMenu()

  if (actionKey === 'new-folder') return createFolder()
  if (actionKey === 'upload-files') return openUploadPicker()
  if (actionKey === 'copy-selected') return copyEntriesToClipboardV2(selectedEntries.value, 'copy')
  if (actionKey === 'cut-selected') return copyEntriesToClipboardV2(selectedEntries.value, 'cut')
  if (actionKey === 'copy-row' && row) return copyEntriesToClipboardV2([row], 'copy')
  if (actionKey === 'cut-row' && row) return copyEntriesToClipboardV2([row], 'cut')
  if (actionKey === 'paste-here') return pasteClipboardV2(currentFolderId.value)
  if (actionKey === 'paste-into-folder' && row?.kind === 'folder') return pasteClipboardV2(row.id)
  if (actionKey === 'refresh-view') return refreshView()
  if (actionKey === 'show-properties') return openPropertiesDialog(selectionEntries.length > 1 ? { scope: 'selection', entries: selectionEntries } : row ? { scope: 'row', row } : { scope: 'blank' })
  if (actionKey === 'clear-selection') return clearSelection()
  if (actionKey === 'download-selected') return downloadSelectedFiles()
  if (actionKey === 'delete-selected') return deleteEntries(selectedEntries.value)
  if (actionKey === 'delete-row' && row) return deleteEntries([row])
  if (actionKey === 'open-folder' && row) return goToFolder(row.id)
  if (actionKey === 'rename-folder' && row) return renameFolder(row)
  if (actionKey === 'rename-file' && row) return renameMaterialV2(row)
  if (actionKey === 'open-file' && row) return openMaterial(row)
  if (actionKey === 'download-file' && row) return downloadMaterial(row)
}
function showToast(message, type = 'success') {
  toast.value = { message, type }
  setTimeout(() => {
    if (toast.value?.message === message) toast.value = null
  }, 3000)
}
function isEditableTarget(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""], [data-path-input]'))
}
function handleGlobalPointerDown(event) {
  if (event.target.closest('[data-context-menu]') || event.target.closest('[data-context-trigger]')) return
  closeContextMenu()
}
function handleGlobalKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && !isEditableTarget(event.target)) {
    event.preventDefault()
    selectedKeys.value = [...visibleRowKeys.value]
    activeSelectionKey.value = selectedKeys.value[0] || ''
    selectionAnchorKey.value = selectedKeys.value[0] || ''
    return
  }
  if (event.key !== 'Escape') return
  closeContextMenu()
  closePropertiesDialog()
  closeInlinePreview()
}

watch([allVisibleSelected, partiallyVisibleSelected], ([, partial]) => {
  if (selectAllCheckbox.value) selectAllCheckbox.value.indeterminate = partial
})
watch(currentFolderPath, (value) => {
  if (!isPathEditing.value) pathInput.value = value
}, { immediate: true })
watch(() => selectedEntries.value.map((entry) => `${entry.kind}-${entry.id}`).join('|'), () => {
  if (!selectedEntries.value.length) return (moveTargetId.value = '')
  const baseFolderId = selectedEntries.value[0].kind === 'file' ? selectedEntries.value[0].folder_id : selectedEntries.value[0].parent_id
  moveTargetId.value = String(baseFolderId ?? '')
}, { immediate: true })

onMounted(() => {
  refreshView()
  window.addEventListener('pointerdown', handleGlobalPointerDown)
  window.addEventListener('keydown', handleGlobalKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', handleViewportPointerMove)
  window.removeEventListener('pointerup', handleViewportPointerUp)
  window.removeEventListener('pointercancel', handleViewportPointerUp)
  window.removeEventListener('pointerdown', handleGlobalPointerDown)
  window.removeEventListener('keydown', handleGlobalKeydown)
  closeInlinePreview()
})
</script>
