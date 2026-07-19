import { attachSkyPreview } from '../scripts/sky-preview.mjs';

const cdpOrigin = process.env.SKY_PREVIEW_CDP ?? 'http://127.0.0.1:9230';
const previewUrl = process.env.SKY_PREVIEW_URL ?? 'http://127.0.0.1:4330/zh/?sky-day-preview=1';

const result = await attachSkyPreview({ cdpOrigin, previewUrl });
console.log(JSON.stringify(result));
