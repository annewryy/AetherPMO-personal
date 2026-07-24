<script setup lang="ts">
// 0031 §D — 로그인 화면. 성공 시 이전 경로(query.redirect) 또는 대시보드로.
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { login } from '../lib/auth';

const router = useRouter();
const route = useRoute();

const loginId = ref('');
const password = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);

async function submit() {
  if (!loginId.value.trim() || !password.value) {
    error.value = '아이디와 비밀번호를 입력하세요.'; return;
  }
  submitting.value = true;
  error.value = null;
  try {
    await login(loginId.value.trim(), password.value);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
    router.replace(redirect);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="brand">
        <div class="logo">A</div>
        <div>
          <div class="brand-name">Aether<span class="pmo">PMO</span></div>
          <div class="brand-sub">사업관리 플랫폼</div>
        </div>
      </div>

      <h1 class="title">로그인</h1>
      <form @submit.prevent="submit">
        <label class="label">아이디 또는 이메일</label>
        <input v-model="loginId" class="input" type="text" autocomplete="username" :disabled="submitting" placeholder="admin" />
        <label class="label">비밀번호</label>
        <input v-model="password" class="input" type="password" autocomplete="current-password" :disabled="submitting" placeholder="••••••••" />
        <div v-if="error" class="err">{{ error }}</div>
        <button class="btn-login" type="submit" :disabled="submitting">
          {{ submitting ? '로그인 중…' : '로그인' }}
        </button>
      </form>
      <p class="hint">dev 계정: admin / exec / pm / worker / viewer · 비번 <code>pms1234!</code></p>
    </div>
  </div>
</template>

<style scoped>
.login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); }
.login-card {
  width: 360px; max-width: 90vw; background: var(--panel); border: 1px solid var(--border);
  border-radius: 14px; padding: 28px 28px 22px;
}
.brand { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; }
.logo {
  width: 42px; height: 42px; border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent);
  display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 22px;
}
.brand-name { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
.brand-name .pmo { color: var(--accent); }
.brand-sub { font-size: 11px; color: var(--muted); }
.title { font-size: 18px; margin: 0 0 16px; }
.label { display: block; font-size: 12.5px; color: var(--muted); margin: 12px 0 4px; }
.input {
  width: 100%; box-sizing: border-box; background: var(--bg); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-size: 14px; padding: 9px 12px; outline: none; font-family: inherit;
}
.input:focus { border-color: var(--accent); }
.err { color: var(--red); font-size: 13px; margin-top: 10px; }
.btn-login {
  width: 100%; margin-top: 18px; border: 0; border-radius: 8px; cursor: pointer;
  background: var(--accent); color: #fff; font-size: 14px; font-weight: 700; padding: 11px; font-family: inherit;
}
.btn-login:disabled { opacity: 0.6; cursor: default; }
.hint { font-size: 11.5px; color: var(--muted); margin: 16px 0 0; text-align: center; }
.hint code { background: var(--panel-2); padding: 1px 5px; border-radius: 4px; }
</style>
