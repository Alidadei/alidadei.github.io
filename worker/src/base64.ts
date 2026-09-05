// 纯 JS base64 编解码。
// 不用运行时 atob/btoa:各运行时对「二进制字符串 vs UTF-8 字符串」的语义不一致,
// 直接 atob 中文内容是否乱码取决于 workerd 实现细节。这里自己解码成字节,
// 再交给 TextDecoder/TextEncoder 显式按 UTF-8 处理,行为与运行时无关。
// 单测:tests/worker-base64.test.mjs

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Map<string, number>();
for (let i = 0; i < ALPHABET.length; i++) LOOKUP.set(ALPHABET[i], i);

export function bytesFromBase64(b64: string): Uint8Array {
  // 容忍 GitHub Contents API 返回内容里夹带的换行
  const clean = b64.replace(/\s/g, '');
  const len = clean.length;
  if (len % 4 !== 0) throw new Error('Invalid base64: bad length');
  if (len === 0) return new Uint8Array(0);

  let pad = 0;
  if (clean[len - 1] === '=') pad++;
  if (clean[len - 2] === '=') pad++;
  // 跳过结尾的 '=' 再校验字符合法性
  for (let i = len - 1 - pad; i >= 0; i--) {
    if (!LOOKUP.has(clean[i])) throw new Error(`Invalid base64 char at ${i}`);
  }

  const bytes = new Uint8Array((len / 4) * 3 - pad);
  let out = 0;
  for (let i = 0; i < len; i += 4) {
    // '=' 不在字符表里,?? 0 归零,pad 已决定输出字节数
    const n = (LOOKUP.get(clean[i])! << 18)
      | (LOOKUP.get(clean[i + 1])! << 12)
      | ((LOOKUP.get(clean[i + 2]) ?? 0) << 6)
      | (LOOKUP.get(clean[i + 3]) ?? 0);
    if (out < bytes.length) bytes[out++] = (n >> 16) & 0xff;
    if (out < bytes.length) bytes[out++] = (n >> 8) & 0xff;
    if (out < bytes.length) bytes[out++] = n & 0xff;
  }
  return bytes;
}

export function base64FromBytes(bytes: Uint8Array): string {
  let out = '';
  // 分块拼接,避免超长内容一次性大字符串
  const GROUP = 3 * 8192;
  for (let start = 0; start < bytes.length; start += GROUP) {
    let chunk = '';
    const end = Math.min(start + GROUP, bytes.length);
    for (let i = start; i < end; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      chunk += ALPHABET[b0 >> 2]
        + ALPHABET[((b0 & 3) << 4) | (b1 >> 4)]
        + (i + 1 < bytes.length ? ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '=')
        + (i + 2 < bytes.length ? ALPHABET[b2 & 63] : '=');
    }
    out += chunk;
  }
  return out;
}

// GitHub Contents API 的 content 字段(base64) → UTF-8 文本
export function decodeUtf8Base64(b64: string): string {
  return new TextDecoder().decode(bytesFromBase64(b64));
}

// UTF-8 文本 → base64(GitHub Contents API PUT 的 content 字段)
export function encodeUtf8Base64(text: string): string {
  return base64FromBytes(new TextEncoder().encode(text));
}
