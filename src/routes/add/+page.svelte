<script lang="ts">
	import { faCopy, faCheck, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';
	import { base } from '$app/paths';

	import { EntryResolveType } from '../../model/EntryData.svelte';
	import { demangleMsvc } from '../../lib/msvcDemangle';
	import currentFunctions from '../../database/functions.json';
	import currentMetadata from '../../database/metadata.json';

	let classname = '';
	let classfuncname = '';
	let cppName = '';
	let symbol = '';
	let signature = '';
	let description = '';
	let isclass = true;
	let isvirtual = false;
	let voffset = 0;
	let type: EntryResolveType = EntryResolveType.DIRECT;
	let offset = 0;
	let refoffset = 0;
	let refsize = 4;

	const signaturePattern = /^([0-9A-Fa-f]{2}|\?\??)(\s([0-9A-Fa-f]{2}|\?\??))*$/;

	const VIRTUAL_ACCESS_CODES = ['E', 'F', 'M', 'N', 'U', 'V'];

	function parseMangled(sym: string) {
		if (!sym.startsWith('?')) return null;
		const parts = sym.slice(1).split('@');
		const funcname = parts[0];
		if (!funcname) return null;

		const qualifiers: string[] = [];
		let i = 1;
		while (i < parts.length && parts[i] !== '') {
			qualifiers.push(parts[i]);
			i++;
		}
		// parts[i] is the empty '@@' terminator; the encoding starts right after it
		const encoding = parts[i + 1] ?? '';
		const isMember = qualifiers.length > 0;

		return {
			funcname,
			classname: isMember ? qualifiers[0] : '',
			isMember,
			isvirtual: isMember && VIRTUAL_ACCESS_CODES.includes(encoding[0])
		};
	}

	$: if (symbol.trim().length > 0) {
		const parsed = parseMangled(symbol.trim());
		if (parsed) {
			classfuncname = parsed.funcname;
			isclass = parsed.isMember;
			classname = parsed.isMember ? parsed.classname : '';
			isvirtual = parsed.isvirtual;
		}
		const demangled = demangleMsvc(symbol.trim());
		if (demangled) cppName = demangled;
	}

	$: cleanSignature = signature.trim().replace(/\s+/g, ' ');
	$: signatureValid = cleanSignature.length === 0 || signaturePattern.test(cleanSignature);

	$: missing = [
		classfuncname.trim().length === 0 && 'function name',
		isclass && classname.trim().length === 0 && 'class name',
		cppName.trim().length === 0 && 'C++ signature',
		symbol.trim().length === 0 && 'mangled symbol',
		cleanSignature.length === 0 && 'byte signature',
		!signatureValid && 'a valid byte signature'
	].filter(Boolean);

	$: entry =
		missing.length === 0
			? {
					classfuncname: classfuncname.trim(),
					classname: classname.trim(),
					cpp_name: cppName.trim(),
					demangledname: cppName.trim(),
					isclass: isclass ? 1 : 0,
					isvirtual: isvirtual ? 1 : 0,
					offset: type === EntryResolveType.DIRECT ? Number(offset) || 0 : 0,
					refoffset: type === EntryResolveType.BY_REFERENCE ? Number(refoffset) || 0 : 0,
					refsize: type === EntryResolveType.BY_REFERENCE ? Number(refsize) || 0 : 0,
					signature: cleanSignature,
					symbol: symbol.trim(),
					type,
					voffset: isvirtual ? Number(voffset) || 0 : 0
			  }
			: null;

	$: cleanCppName = cppName.split('(')[0].trim();

	let queue: Record<string, unknown>[] = [];
	let metadataQueue: Record<string, { description: string }> = {};

	$: batchEntries = entry ? [...queue, entry] : queue;

	$: mergedFunctions = {
		functions: [...currentFunctions.functions, ...batchEntries],
		onames: currentFunctions.onames
	};
	$: mergedFunctionsJson = JSON.stringify(mergedFunctions, null, 2);

	$: pendingMetadata =
		entry && description.trim().length > 0 ? { [cleanCppName]: { description: description.trim() } } : {};
	$: batchMetadata = { ...metadataQueue, ...pendingMetadata };
	$: mergedMetadata = { ...currentMetadata, ...batchMetadata };
	$: mergedMetadataJson = JSON.stringify(mergedMetadata, null, 4);

	function resetForm() {
		classname = '';
		classfuncname = '';
		cppName = '';
		symbol = '';
		signature = '';
		description = '';
		isclass = true;
		isvirtual = false;
		voffset = 0;
		type = EntryResolveType.DIRECT;
		offset = 0;
		refoffset = 0;
		refsize = 4;
	}

	function addToBatch() {
		if (!entry) return;
		queue = [...queue, entry];
		if (description.trim().length > 0 && cleanCppName.length > 0) {
			metadataQueue = { ...metadataQueue, [cleanCppName]: { description: description.trim() } };
		}
		resetForm();
	}

	function removeFromBatch(index: number) {
		queue = queue.filter((_, i) => i !== index);
	}

	let copiedEntry = false;
	let copiedMetadata = false;
	async function copy(text: string, which: 'entry' | 'metadata') {
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			if (which === 'entry') {
				copiedEntry = true;
				setTimeout(() => (copiedEntry = false), 1500);
			} else {
				copiedMetadata = true;
				setTimeout(() => (copiedMetadata = false), 1500);
			}
		} catch (error) {
			console.error(error);
		}
	}

	function download(text: string, filename: string) {
		const blob = new Blob([text], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	function inputClass(valid = true) {
		return `w-full placeholder-text-color bg-white bg-opacity-5 rounded-xl p-2 px-3 ${
			valid ? '' : 'outline outline-2 outline-red-400'
		}`;
	}
</script>

<svelte:head>
	<title>Add a signature</title>
</svelte:head>

<main class="m-5 max-w-3xl mx-auto pb-16 h-screen overflow-y-auto">
	<div class="flex items-center space-x-3 mb-5">
		<a href="{base}/" aria-label="back"><Fa icon={faArrowLeft} /></a>
		<h1 class="text-3xl">Add a signature</h1>
	</div>

	<div class="w-full bg-white bg-opacity-5 rounded-xl p-5 mb-5">
		<p>
			Fill in the fields below for a function, then click <strong>Add another</strong> to queue it
			and start on the next one. Once you're done, the boxes at the bottom contain the
			<strong>entire, updated</strong>
			<code>functions.json</code> (and <code>metadata.json</code>, if you added descriptions) with
			your new entries merged into what's already there &mdash; download them and use them to
			replace the files in your clone of
			<a href="https://github.com/CloudWaddie/Signatures"><u>the repo</u></a>, then open a pull
			request.
		</p>
	</div>

	<div class="space-y-4">
		<div>
			<label for="symbol" class="block mb-1">Mangled symbol</label>
			<input
				id="symbol"
				bind:value={symbol}
				placeholder="?setNameTag@Actor@@QEAAXAEBV?$basic_string@DU?$char_traits@D@std@@V?$allocator@D@2@@std@@@Z"
				class={inputClass()}
			/>
			<p class="text-sm opacity-70 mt-1">
				Paste a mangled MSVC symbol here and the class name, function name, virtual flag and
				C++ signature below will be filled in automatically where possible (constructors,
				destructors, operators and free functions aren't supported and must be filled in by hand).
			</p>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="classname" class="block mb-1">Class name</label>
				<input
					id="classname"
					bind:value={classname}
					disabled={!isclass}
					placeholder="Actor"
					class={inputClass()}
				/>
			</div>
			<div>
				<label for="classfuncname" class="block mb-1">Function name</label>
				<input
					id="classfuncname"
					bind:value={classfuncname}
					placeholder="setNameTag"
					class={inputClass()}
				/>
			</div>
		</div>

		<div>
			<label for="cppname" class="block mb-1">C++ signature</label>
			<input
				id="cppname"
				bind:value={cppName}
				placeholder="void Actor::setNameTag(std::string const &)"
				class={inputClass()}
			/>
		</div>

		<div>
			<label for="signature" class="block mb-1">Byte signature</label>
			<input
				id="signature"
				bind:value={signature}
				placeholder="55 41 57 ? ? 56 57 53"
				class={inputClass(signatureValid)}
			/>
			<p class="text-sm opacity-70 mt-1">
				Space-separated hex bytes, use <code>?</code> for wildcard bytes.
			</p>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div class="flex items-center space-x-2">
				<input id="isclass" type="checkbox" bind:checked={isclass} />
				<label for="isclass">Member of a class</label>
			</div>
			<div class="flex items-center space-x-2">
				<input id="isvirtual" type="checkbox" bind:checked={isvirtual} />
				<label for="isvirtual">Virtual function</label>
			</div>
		</div>

		{#if isvirtual}
			<div>
				<label for="voffset" class="block mb-1">Vtable index</label>
				<input
					id="voffset"
					type="number"
					placeholder="0"
					value={voffset || ''}
					on:input={(e) => (voffset = Number(e.currentTarget.value) || 0)}
					class={inputClass()}
				/>
			</div>
		{/if}

		<div>
			<label for="type" class="block mb-1">Resolve type</label>
			<select id="type" bind:value={type} class={inputClass()}>
				<option value={EntryResolveType.DIRECT}>Direct (signature points to the function)</option
				>
				<option value={EntryResolveType.FUNCTION}>Function</option>
				<option value={EntryResolveType.BY_REFERENCE}
					>By reference (signature points to a pointer)</option
				>
				<option value={EntryResolveType.BY_VTABLE}>By vtable</option>
				<option value={EntryResolveType.NONE}>None</option>
			</select>
		</div>

		{#if type === EntryResolveType.DIRECT}
			<div>
				<label for="offset" class="block mb-1">Offset</label>
				<input id="offset" type="number" bind:value={offset} class={inputClass()} />
			</div>
		{/if}

		{#if type === EntryResolveType.BY_REFERENCE}
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="refoffset" class="block mb-1">Reference offset</label>
					<input id="refoffset" type="number" bind:value={refoffset} class={inputClass()} />
				</div>
				<div>
					<label for="refsize" class="block mb-1">Reference size (bytes)</label>
					<select id="refsize" bind:value={refsize} class={inputClass()}>
						<option value={1}>1</option>
						<option value={2}>2</option>
						<option value={4}>4</option>
						<option value={8}>8</option>
					</select>
				</div>
			</div>
		{/if}

		<div>
			<label for="description" class="block mb-1">Description (optional)</label>
			<textarea
				id="description"
				bind:value={description}
				placeholder="What does this function do?"
				class={inputClass()}
				rows="2"
			/>
		</div>
	</div>

	{#if missing.length > 0}
		<div class="w-full bg-red-400 bg-opacity-20 rounded-xl p-4 mt-6">
			Still missing: {missing.join(', ')}.
		</div>
	{:else}
		<div class="mt-6">
			<button
				class="flex items-center space-x-2 px-3 py-2 rounded-lg bg-secondary-color bg-opacity-80"
				on:click={addToBatch}
			>
				<span>Add another</span>
			</button>
		</div>
	{/if}

	{#if queue.length > 0}
		<div class="mt-6">
			<h2 class="text-xl mb-2">Queued ({queue.length})</h2>
			<ul class="space-y-1">
				{#each queue as q, i}
					<li
						class="flex justify-between items-center bg-black bg-opacity-10 rounded-lg px-3 py-1"
					>
						<code>{q.classname ? q.classname + '::' : ''}{q.classfuncname}</code>
						<button on:click={() => removeFromBatch(i)} aria-label="remove from batch">&times;</button
						>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if batchEntries.length > 0}
		<div class="mt-6">
			<div class="flex justify-between items-center mb-1">
				<h2 class="text-xl">functions.json ({currentFunctions.functions.length} + {batchEntries.length} new)</h2>
				<div class="flex space-x-2">
					<button
						class="flex items-center space-x-2 px-2 py-1 rounded-lg bg-black bg-opacity-10"
						on:click={() => copy(mergedFunctionsJson, 'entry')}
					>
						<Fa icon={copiedEntry ? faCheck : faCopy} />
						<span>{copiedEntry ? 'Copied' : 'Copy'}</span>
					</button>
					<button
						class="flex items-center space-x-2 px-2 py-1 rounded-lg bg-black bg-opacity-10"
						on:click={() => download(mergedFunctionsJson, 'functions.json')}
					>
						<span>Download</span>
					</button>
				</div>
			</div>
			<pre
				class="bg-black bg-opacity-10 rounded-xl p-3 overflow-x-auto max-h-64"><code
					>{mergedFunctionsJson}</code
				></pre>
		</div>
	{/if}

	{#if Object.keys(batchMetadata).length > 0}
		<div class="mt-6">
			<div class="flex justify-between items-center mb-1">
				<h2 class="text-xl">metadata.json</h2>
				<div class="flex space-x-2">
					<button
						class="flex items-center space-x-2 px-2 py-1 rounded-lg bg-black bg-opacity-10"
						on:click={() => copy(mergedMetadataJson, 'metadata')}
					>
						<Fa icon={copiedMetadata ? faCheck : faCopy} />
						<span>{copiedMetadata ? 'Copied' : 'Copy'}</span>
					</button>
					<button
						class="flex items-center space-x-2 px-2 py-1 rounded-lg bg-black bg-opacity-10"
						on:click={() => download(mergedMetadataJson, 'metadata.json')}
					>
						<span>Download</span>
					</button>
				</div>
			</div>
			<pre
				class="bg-black bg-opacity-10 rounded-xl p-3 overflow-x-auto max-h-64"><code
					>{mergedMetadataJson}</code
				></pre>
		</div>
	{/if}
</main>
