import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './style.css';
import { restoreSession } from './lib/auth';

// 0031 — 저장 토큰으로 세션 복원 후 마운트(미인증/실패여도 진행 — dev는 게스트 허용).
restoreSession().finally(() => {
  createApp(App).use(router).mount('#app');
});
