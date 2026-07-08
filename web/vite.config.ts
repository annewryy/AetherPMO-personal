import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 신규 프론트는 /app 경로로 배포된다(동료 루트 버전은 / 유지).
//  - base '/app/'      : 번들 자산 경로를 /app 밑으로
//  - outDir '../app'   : 저장소 루트의 /app 로 빌드(Vercel outputDirectory '.'가 통째로 서빙)
//  - emptyOutDir true  : outDir이 프로젝트 루트 밖이라 명시 필요
export default defineConfig(({ command }) => ({
  // 빌드(배포)에서만 /app 하위로. dev는 루트(/)에서 바로 열리게.
  base: command === 'build' ? '/app/' : '/',
  plugins: [vue()],
  build: {
    outDir: '../app',
    emptyOutDir: true,
  },
}));
