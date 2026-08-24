// portfolio 详情页共享脚本:双语切换 + 返回链接随语言更新
// 修复旧版 bug:EN 按钮曾误调 setLang('zh')。
function setLang(lang) {
  document.querySelectorAll('[data-lang]').forEach(el => {
    el.classList.toggle('visible', el.getAttribute('data-lang') === lang);
  });
  const be = document.getElementById('btnEn');
  const bz = document.getElementById('btnZh');
  if (be) be.classList.toggle('active', lang === 'en');
  if (bz) bz.classList.toggle('active', lang === 'zh');
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh';
  const back = document.getElementById('backLink');
  if (back) back.setAttribute('href', '/' + (lang === 'en' ? 'en' : 'zh') + '/projects');
}
setLang('zh');
