# 云与太阳景深同步验证

- 日期：2026-07-20
- 分支：`feat/cloud-sun-depth-sync`
- 浏览器：Microsoft Edge 149.0.4022.80
- 改动前布局基线：`cloud-sun-before-default.png`
- 桌面遮挡记录：`cloud-sun-occlusion-edge.png`
- 手机端记录：`cloud-sun-mobile-edge.png`

## 自动回归结果

- 默认相机下，3D 投影后的太阳中心与原 CSS 轨迹中心误差：桌面 `(0px, 0px)`，手机 `(0px, 0px)`。
- 固定时间约 07:02、默认俯仰 `0.35` 时，云轮廓覆盖太阳圆盘约 `81.9%`；截图可见云下沿前方只露出太阳的金色弧边。
- 相机继续向下俯视后，太阳与取样云轮廓的 Y 位移分别约 `-308.0px`、`-146.3px`，方向一致。
- 页面滚动 500px 后触发时间更新，太阳没有跟随正文滚动发生跳变。
- 首页在 `320px`、`390px`、`430px` 下无横向溢出；锁定的桌面博客布局也未漂移。

## 验证命令

```powershell
npm.cmd run check:sky-depth
npm.cmd run check:sky-depth:edge
$env:MOBILE_OVERFLOW_ROUTES='/zh/'
$env:MOBILE_OVERFLOW_WIDTHS='320,390,430'
npm.cmd run check:mobile-overflow
npm.cmd exec astro build
```
