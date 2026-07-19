# Temperature 文章配图生成记录

日期：2026-07-19

## 生成方式

- 模式：`imagegen` skill 的 built-in `image_gen` 模式
- 用途：`src/content/posts/zh/temperature-math.md` 行内科学示意图
- 最终文件：`public/images/posts/temperature-softmax-distributions.webp`
- 最终规格：WebP，1440 × 720，26,078 bytes

## 最终 Prompt

```text
Use case: scientific-educational
Asset type: inline infographic for a Chinese technical blog about LLM sampling temperature
Primary request: Create a scientifically accurate three-panel comparison of Softmax probability distributions for the same logits [2.0, 1.0, 0.1] at three temperatures.
Scene/backdrop: clean warm off-white background, no texture.
Subject: three side-by-side vertical bar charts sharing the same 0% to 100% scale. Each panel has exactly three bars for Token 1, Token 2, Token 3. Panel data must be visually proportional and numerically correct: T = 0.1 has 99.995%, 0.0045%, approximately 0%; T = 1 has 65.9%, 24.2%, 9.9%; T = 10 has 36.6%, 33.1%, 30.3%.
Style/medium: precise flat vector-like scientific infographic, restrained editorial design, crisp lines, generous whitespace.
Composition/framing: landscape, three equal panels from left to right, aligned baselines and scales, suitable for display at about 760 CSS pixels wide.
Color palette: warm brown accent #B07D4F for Token 1, muted slate #657383 for Token 2, light beige-gray #C9B9A6 for Token 3; dark charcoal labels.
Text (verbatim): "T = 0.1", "T = 1", "T = 10", "Token 1", "Token 2", "Token 3", "99.995%", "0.0045%", "≈0%", "65.9%", "24.2%", "9.9%", "36.6%", "33.1%", "30.3%".
Constraints: render every supplied label and percentage exactly once in its correct panel; keep all text large and readable; accurate bar heights; no extra text, no legend, no logos, no watermark, no decorative objects, no 3D effects.
```

## 验证结果

- 三组标签、百分比和柱高均与指定数据一致。
- 原始 PNG 为 986,785 bytes；转为 1440 × 720 WebP 后为 26,078 bytes。
- Astro 构建成功，文章中的两张图片均被转换为 `/images/posts/...` 线上路径，两个图注均正常生成。
