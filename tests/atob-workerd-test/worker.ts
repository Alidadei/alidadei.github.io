// 实测 workerd 的 atob 语义(与浏览器标准「二进制字符串」是否一致)。
// '中文' 的 UTF-8 字节为 E4 B8 AD E6 96 87,base64 为 '5Lit5paH'。
// 若 atob 是标准语义:得到 6 个字符,码点 [0xE4,0xB8,0xAD,0xE6,0x96,0x87];
// 若 atob 做 UTF-8 解码(非标准):得到 2 个字符,码点 [0x4E2D,0x6587]。
export default {
  async fetch(): Promise<Response> {
    const s = atob('5Lit5paH');
    const charCodes = Array.from(s).map((c) => c.charCodeAt(0));
    const viaTextDecoder = new TextDecoder().decode(
      Uint8Array.from(s, (c) => c.charCodeAt(0)),
    );
    return Response.json({
      charCodes,
      viaTextDecoder,
      len: s.length,
    });
  },
};
