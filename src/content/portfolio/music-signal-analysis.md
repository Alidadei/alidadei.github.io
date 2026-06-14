---
title: "Music timbre Analysis & Visualization / 音色量化分析&可视化"
excerpt: "本人爱好小提琴，一般小提琴音色的古法判断方法是依靠演奏者自己感受，受场地、演奏者水平和周围噪声影响较大，于是我便设计了一种音色分析系统，来实现客观量化的音色频率成分分析、乐器分类与旋律可视化等功能/The traditional method for judging the timbre of a violin relies on the combined experience of the performer , which is greatly influenced by the venue & performer's level. Therefore, I designed a timbre analysis system "
image: "/images/music-signal-analysis.png"
link: "/portfolio/music-signal-analysis.html"
categories: ["个人实践"]
---

[GitHub Repository](https://github.com/Alidadei/Music_signal_analysis) | [Live Demo (Hugging Face Spaces)](https://huggingface.co/spaces/LunarStar6564168/music-signal-analysis)

## 项目概览 / Overview

A complete audio analysis pipeline that takes a music file as input and produces comprehensive analytical reports with rich visualizations. It covers the full workflow from audio loading and preprocessing to feature extraction, machine learning-based classification, and publication-quality chart generation.

一套完整的音频分析管道，以音乐文件为输入，输出包含丰富可视化的综合分析报告。覆盖从音频加载、预处理到特征提取、机器学习分类和出版级图表生成的全流程。

**Pipeline:** Audio File → Load → Preprocess → Timbre Analysis → Instrument Classification → Melody Analysis → Report & Visualization

## 技术亮点 / Technical Highlights

### 混合乐器分类 / Hybrid Instrument Classification
- **Rule-based / 基于规则**: Frequency-domain heuristic rules (spectral centroid, bandwidth, zero-crossing rate) for zero-dependency inference / 频域启发式规则，零依赖推理
- **ML / 机器学习**: scikit-learn RandomForest with StandardScaler normalization / 随机森林 + 标准化
- **Auto-fallback / 自动回退**: Transparently falls back from ML to rules when model unavailable / 模型不可用时自动切换规则分类

Supports 7 categories / 支持 7 种乐器类别: Strings 弦乐, Bass 低音, Percussion 打击乐, Wind 管乐, Keyboard 键盘, Vocal 人声, Unknown 未知

### 全面的特征提取 / Comprehensive Feature Extraction
**14 distinct audio features / 14 种音频特征** across three domains / 跨三个域:

| Domain 域 | Features 特征 |
|--------|----------|
| Spectral 频谱域 | Spectral Centroid 质心, Bandwidth 带宽, Rolloff 滚降, Contrast 对比度, Chroma 色度, Tonnetz 音网, STFT/Mel Spectrogram 语谱图 |
| Temporal 时域 | RMS Energy 均方根能量, Short-time Energy 短时能量, Zero-Crossing Rate 过零率 |
| Cepstral 倒谱域 | MFCC (13 coefficients 梅尔频率倒谱系数), MFCC Delta 一阶差分, MFCC Delta-2 二阶差分 |

### 基于 PYIN 的旋律分析 / Melody Analysis with PYIN
- Pitch trajectory extraction (Hz → MIDI) / 音高轨迹提取
- Musical key detection (all 12 keys, major/minor) / 调性检测
- Interval statistics & dominant note extraction / 音程统计与主导音符提取
- Melody similarity via chroma correlation / 旋律相似度比较

### 跨平台音频 I/O / Cross-Platform Audio I/O
Three-tier fallback / 三层回退: soundfile (WAV/FLAC) → audioread (MP3/M4A/OGG) → librosa (universal 通用)

## 可视化 / Visualization

Generates **5 publication-quality charts / 5 张出版级图表** per run with CJK font support / 支持中文字体:

- **Timbre Analysis 音色分析** (3×2): Spectrogram, MFCC, Spectral Centroid, Bandwidth, Chroma, ZCR
- **Melody Analysis 旋律分析** (2×2): Pitch trajectory, Normalized contour, Chroma, Amplitude
- **Spectrogram 语谱图**: STFT magnitude in dB / STFT 幅度
- **Chroma Features 色度特征**: 12 pitch-class heatmap / 12 音级热力图
- **Melody Contour 旋律轮廓**: Pitch + Amplitude over time / 音高轨迹 + 振幅

## Tech Stack / 技术栈

**Audio:** librosa, scipy, soundfile, audioread | **ML:** scikit-learn, RandomForest | **Viz:** matplotlib | **Web:** Gradio | **Deploy:** Hugging Face Spaces, Docker | **Testing:** pytest (82 test cases)

## 收获 / What I Learned

- Audio signal processing: MFCC, STFT, spectral features, PYIN / 音频信号处理
- ML in production: hybrid classifier, graceful fallback, model serialization / 机器学习工程化
- Robustness engineering: multi-backend fallback / 健壮性工程
- Test-driven development: synthetic audio fixtures / 测试驱动开发
- Web deployment: scientific Python apps in containers / Web 部署与容器化
