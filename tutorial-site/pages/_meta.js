export default {
  index: {
    title: '首页',
    theme: {
      layout: 'raw', // 落地页：去掉文档侧栏/目录，完全自定义
      sidebar: false,
      toc: false,
      breadcrumb: false,
      pagination: false,
      footer: false,
      timestamp: false,
    },
  },
  otSection: { type: 'separator', title: 'OT 篇' },
  stage0: 'Stage 0 · 全量广播',
  stage1: 'Stage 1 · 操作化',
  stage2: 'Stage 2 · 版本定序',
  stage3: 'Stage 3 · transform',
  stage4: 'Stage 4 · 光标与压测',
  stage5: 'Stage 5 · 持久化与 undo',
  crdtSection: { type: 'separator', title: 'CRDT 篇' },
  crdt1: 'C1 · 最简 CRDT',
  crdt2: 'C2 · 迷你 RGA',
  crdt3: 'C3 · 离线合并',
  crdt4: 'C4 · 上手 Yjs',
};
