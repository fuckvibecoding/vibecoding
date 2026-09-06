<script>
  import { t } from '../../lib/preferences.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Plus, Trash2 } from '@lucide/svelte';

  export let title = '';
  export let list = [];
  export let onAdd = () => {};
  export let onRemove = () => {};
  // Secret lists (auth tokens) render as password fields so credentials are not
  // shown in plain text or offered for browser autofill.
  export let type = 'text';
</script>

<div class="list-editor full">
  <div class="list-head">
    <span>{title}</span>
    <Button variant="ghost" size="icon-xs" type="button" onclick={onAdd} aria-label={$t('common.add')}>
      <Plus size={14} aria-hidden="true" />
    </Button>
  </div>
  {#each list as item, i (i)}
    <div class="inline-row">
      <Input {type} autocomplete={type === 'password' ? 'new-password' : undefined} bind:value={list[i]} />
      <Button variant="ghost" size="icon-xs" type="button" onclick={() => onRemove(i)} aria-label={$t('common.remove')}>
        <Trash2 size={14} aria-hidden="true" />
      </Button>
    </div>
  {/each}
</div>
