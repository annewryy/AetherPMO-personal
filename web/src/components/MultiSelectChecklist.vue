<script setup lang="ts">
// 0039 — 다중 매핑 공용 체크리스트(이슈↔태스크, 회의록↔이슈/태스크/산출물).
interface Opt { id: number; label: string; sub?: string | null }

const props = defineProps<{
  items: Opt[];
  modelValue: number[];
  disabled?: boolean;
  emptyText?: string;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: number[]): void }>();

function toggle(id: number) {
  if (props.disabled) return;
  const set = new Set(props.modelValue);
  if (set.has(id)) set.delete(id); else set.add(id);
  emit('update:modelValue', [...set]);
}
</script>

<template>
  <div class="msc">
    <p v-if="items.length === 0" class="empty">{{ emptyText || '선택 가능한 항목이 없습니다.' }}</p>
    <ul v-else class="list">
      <li v-for="it in items" :key="it.id">
        <label class="row">
          <input
            type="checkbox" :checked="modelValue.includes(it.id)" :disabled="disabled"
            @change="toggle(it.id)"
          />
          <span class="lbl">{{ it.label }}</span>
          <span v-if="it.sub" class="sub">{{ it.sub }}</span>
        </label>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.msc { border: 1px solid var(--border); border-radius: 8px; max-height: 160px; overflow-y: auto; background: var(--bg); }
.empty { margin: 0; padding: 10px; font-size: 12.5px; color: var(--muted); }
.list { list-style: none; margin: 0; padding: 4px; display: flex; flex-direction: column; }
.row { display: flex; align-items: center; gap: 7px; padding: 5px 6px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.row:hover { background: var(--panel); }
.lbl { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { color: var(--muted); font-size: 11.5px; flex-shrink: 0; }
</style>
