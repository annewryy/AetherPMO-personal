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
// 0034 — 이원 로그인: 비밀번호(동작) / 아마란스 연동(연동 스펙 확보 시 활성 — 설계 0005 §H)
const method = ref<'password' | 'amaranth'>('password');
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

      <div class="method-tabs" role="tablist">
        <button class="mtab" :class="{ on: method === 'password' }" type="button" @click="method = 'password'">비밀번호 로그인</button>
        <button class="mtab" :class="{ on: method === 'amaranth' }" type="button" @click="method = 'amaranth'">아마란스 연동</button>
      </div>

      <div v-if="method === 'amaranth'" class="amaranth-note">
        <p><strong>아마란스 연동 로그인 — 준비중</strong></p>
        <p>아마란스 인증 연동(키 발급)이 연결되면 자사 직원은 아마란스 계정으로 로그인하고,
        전자결재 확인 등 아마란스 위임 기능을 바로 사용할 수 있습니다.</p>
        <p class="sub-note">지금은 비밀번호 로그인을 이용하세요 — 아마란스 위임 기능 외 모든 기능은 동일하게 동작합니다.
        비밀번호가 없는 자사 직원은 시스템 관리자에게 발급을 요청하세요.</p>
      </div>

      <form v-else @submit.prevent="submit">
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
.method-tabs {
  display: flex; gap: 4px; margin-bottom: 16px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 3px;
}
.mtab {
  flex: 1; border: 0; background: transparent; color: var(--muted);
  font-size: 13px; font-weight: 600; padding: 7px 0; border-radius: 6px; cursor: pointer; font-family: inherit;
}
.mtab.on { background: var(--accent); color: #fff; }
.amaranth-note {
  border: 1px dashed var(--border); border-radius: 10px; padding: 14px 16px;
  font-size: 13px; line-height: 1.6; color: var(--text); display: flex; flex-direction: column; gap: 8px;
}
.amaranth-note .sub-note { color: var(--muted); font-size: 12.5px; }
</style>
