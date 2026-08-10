import ThemeToggle from './components/ThemeToggle';

export default {
  logo: <strong>协同编辑实验室</strong>,
  project: { link: 'https://github.com/xiao-tiger/collab-edit-lab' }, // 顶栏 GitHub 图标
  darkMode: true,
  nextThemes: { defaultTheme: 'light' }, // 默认浅色，顶栏按钮一键切换
  navbar: {
    extraContent: <ThemeToggle />, // 主题切换按钮放在顶部导航栏
  },
  themeSwitch: { component: null }, // 隐藏页脚默认的主题下拉框
  sidebar: { toggleButton: false }, // 去掉右下角悬浮的侧栏按钮
  toc: { title: '本页目录' },
  footer: { component: null }, // 去掉页脚（MIT © Nextra）
};
