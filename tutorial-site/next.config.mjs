import nextra from 'nextra';

const withNextra = nextra({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.jsx',
});

// GitHub Pages 是项目页（xxx.github.io/collab-edit-lab 子路径），需要 basePath；
// 本地开发和 Vercel 都在根路径，不需要 —— 由 CI 通过环境变量注入。
const basePath = process.env.PAGES_BASE_PATH || '';

export default withNextra({
  output: 'export', // 静态导出到 out/（本站无服务端依赖，全部可静态化）
  basePath,
  trailingSlash: true, // 生成 目录/index.html 结构，GitHub Pages 等静态托管解析最稳
  images: { unoptimized: true }, // 静态导出没有图片优化服务（本站暂无图片，防御性配置）
});
