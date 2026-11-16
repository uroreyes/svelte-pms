<script lang="ts">
	import { parseMoney, toDecimalString } from '$lib/shared/domain/money';
	let { cents = $bindable(), id, required = false, placeholder = '0.00' }: { cents: number | null; id?: string; required?: boolean; placeholder?: string } = $props();
	let text = $state(cents == null ? '' : toDecimalString(cents));
	function onInput(e: Event) {
		text = (e.currentTarget as HTMLInputElement).value;
		cents = text.trim() === '' ? null : parseMoney(text);
	}
</script>

<input {id} class="input" inputmode="decimal" {required} {placeholder} value={text} oninput={onInput} />
