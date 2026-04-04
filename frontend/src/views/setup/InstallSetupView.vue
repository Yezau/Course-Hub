<template>
    <div class="ui-auth-shell flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div class="ui-auth-card space-y-6">
            <div class="space-y-3 text-center">
                <h2 class="text-3xl font-extrabold text-gray-900">
                    首次安装向导
                </h2>
                <p class="text-sm text-slate-500">
                    创建管理员账号后即可正常登录并开始使用系统
                </p>
            </div>

            <form class="space-y-5" @submit.prevent="handleSetup">
                <div v-if="error" class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
                    {{ error }}
                </div>

                <div v-if="!success && installStore.lastError"
                    class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700">
                    {{ installStore.lastError }}
                </div>

                <div v-if="success"
                    class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
                    安装完成。请选择下一步操作。
                </div>

                <div v-if="success && autoLoginError"
                    class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700">
                    {{ autoLoginError }}
                </div>

                <div v-if="!success" class="space-y-4">
                    <div>
                        <label for="admin_username" class="mb-1.5 block text-sm font-medium text-slate-700">
                            管理员用户名
                        </label>
                        <input id="admin_username" v-model="form.admin_username" type="text" required class="ui-input"
                            placeholder="默认 admin" />
                    </div>

                    <div>
                        <label for="admin_password" class="mb-1.5 block text-sm font-medium text-slate-700">
                            管理员密码
                        </label>
                        <input id="admin_password" v-model="form.admin_password" type="password" required
                            class="ui-input" placeholder="至少 8 位，包含两类字符" />
                    </div>

                    <div>
                        <label for="confirm_password" class="mb-1.5 block text-sm font-medium text-slate-700">
                            确认密码
                        </label>
                        <input id="confirm_password" v-model="form.confirm_password" type="password" required
                            class="ui-input" placeholder="请再次输入密码" />
                    </div>
                </div>

                <button v-if="!success" type="submit" :disabled="isLoading"
                    class="ui-button-primary flex w-full justify-center disabled:cursor-not-allowed disabled:bg-slate-300">
                    {{ isLoading ? '安装中...' : '完成安装' }}
                </button>

                <div v-else class="space-y-3">
                    <button type="button" class="ui-button-primary flex w-full justify-center"
                        @click="goToNextStep('/admin/settings')">
                        下一步：站点设置
                    </button>

                    <button type="button" class="ui-button-secondary flex w-full justify-center"
                        @click="goToNextStep('/admin/users/batch')">
                        下一步：批量创建用户
                    </button>

                    <button type="button" class="ui-button-secondary flex w-full justify-center"
                        @click="goToNextStep('/dashboard')">
                        直接完成安装并进入系统
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import { useInstallStore } from '@/stores/install'

const router = useRouter()
const authStore = useAuthStore()
const installStore = useInstallStore()

const form = ref({
    admin_username: 'admin',
    admin_password: '',
    confirm_password: ''
})

const error = ref('')
const success = ref(false)
const isLoading = ref(false)
const autoLoginError = ref('')

onMounted(async () => {
    const needsSetup = await installStore.checkStatus(true).catch(() => installStore.setupRequired)
    if (installStore.statusKnown && !needsSetup) {
        router.replace(authStore.isAuthenticated ? '/dashboard' : '/login')
    }
})

async function handleSetup() {
    error.value = ''

    if (form.value.admin_password.length < 8) {
        error.value = '管理员密码至少需要 8 位'
        return
    }

    if (form.value.admin_password !== form.value.confirm_password) {
        error.value = '两次输入的密码不一致'
        return
    }

    isLoading.value = true

    try {
        autoLoginError.value = ''

        await api.post('/install/setup', {
            admin_username: form.value.admin_username,
            admin_password: form.value.admin_password,
            confirm_password: form.value.confirm_password
        }, {
            timeout: 45000
        })

        success.value = true
        installStore.markCompletedLocally()
        installStore.checkStatus(true).catch(() => null)

        try {
            await authStore.login({
                account: form.value.admin_username,
                password: form.value.admin_password
            })
        } catch (loginError) {
            autoLoginError.value = '管理员账号已创建，但自动登录失败。点击下一步后将跳转登录页。'
        }

        form.value.admin_password = ''
        form.value.confirm_password = ''
    } catch (err) {
        if (`${err?.message || ''}`.toLowerCase().includes('timeout')) {
            error.value = '首次初始化较慢，请稍候重试（可再次点击“完成安装”）'
            return
        }

        error.value = err?.error || err?.message || '安装失败，请稍后重试'
    } finally {
        isLoading.value = false
    }
}

function goToNextStep(targetPath) {
    const fallbackTarget = typeof targetPath === 'string' && targetPath.startsWith('/')
        ? targetPath
        : '/dashboard'

    if (authStore.isAuthenticated) {
        router.replace(fallbackTarget).catch(() => {
            window.location.replace(fallbackTarget)
        })
        return
    }

    router.replace({
        path: '/login',
        query: {
            redirect: fallbackTarget,
            from_install: '1'
        }
    }).catch(() => {
        const encodedTarget = encodeURIComponent(fallbackTarget)
        window.location.replace(`/login?redirect=${encodedTarget}&from_install=1&reload=${Date.now()}`)
    })
}
</script>
