import { build } from 'esbuild';
await build({entryPoints:['server/courtHttp.ts'],bundle:true,platform:'node',format:'esm',target:'node22',outfile:'dist-server/courtHttp.mjs',packages:'external'});
