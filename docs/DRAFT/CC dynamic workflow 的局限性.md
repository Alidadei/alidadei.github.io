# CC dynamic workflow 的局限性

## 特别消耗token

尤其对于写论文和搜索任务；

## 特定任务难以迁移复用

比如之前做的一个核查课程论文参考文献任务，dynamic workflow中有如下代码：

（位置：C:\Users\y7\.claude\projects\R--FDU-courses-------------\b6ad377c-e04f-468a-bb54-a56e8f79298f\workflows\scripts）

```
const contentDimensions = [
  {
    key: 'rigor',
    prompt: `## Dimension: Academic Rigor & Citation Accuracy

Review the paper for:
1. Are ALL 85 references real papers with verified DOIs/arXiv IDs? Flag any that look suspicious.
2. Are reference numbers correctly placed after claims they support?
3. Are arXiv preprints properly distinguished from peer-reviewed publications in the text?
4. Are any claims made without a citation that need one?
5. Check the GB/T 7714 citation format — author order, journal names in italics (English) or 楷体 (Chinese), volume/issue/pages.

Read the paper at: ${paperPath}`,
  },
  {
    key: 'coherence',
    prompt: `## Dimension: Argument Coherence

Review the paper for:
1. Does the central thesis ("进展在于理由可审查、可证伪、可复现") hold consistently across all 7 chapters?
2. Is the narrative arc (基础模型→copilot→多智能体→临床文本→挑战→结论) logically progressive?

```

其中 “ALL 85 references” 以及“Review the paper for:”下面的内容， 都是这篇课程论文特定的特点，放到其他的论文上就没法适用了。