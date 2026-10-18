import preprocess from "svelte-preprocess";
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/kit/vite';

const dev = process.argv.includes('dev');

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: [vitePreprocess(), preprocess({
        postcss: true
    })],

	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: '404.html'
		}),
		paths: {
			// Served from the root of sigs.cloudwaddie.com. Set BASE_PATH (e.g. /Signatures) to host under a subpath.
			base: dev ? '' : (process.env.BASE_PATH ?? '')
		}
	}
};

export default config;
