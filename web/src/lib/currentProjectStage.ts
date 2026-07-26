// 0031 — 현재 열람 중인 프로젝트 상세의 단계(stage) 공유 상태.
//   사이드바(App.vue)가 상세 라우트(/projects/:id)에서 입찰단계/수행단계 메뉴 활성을
//   프로젝트의 실제 단계로 표시하기 위해 ProjectDetailView가 세팅한다.
//   상세를 벗어나면 null로 초기화(목록 라우트 활성 로직만 동작).
import { ref } from 'vue';
import type { ProjectStage } from '../types';

export const currentProjectStage = ref<ProjectStage | null>(null);

export function setCurrentProjectStage(stage: ProjectStage | null): void {
  currentProjectStage.value = stage;
}
