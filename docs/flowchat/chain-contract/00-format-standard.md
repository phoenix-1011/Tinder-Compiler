# 流程链路契约文档格式规范

## 目的

`D:\Tinder\Tinder-Compiler\docs\flowchat\chain-contract` 是 Model-P 流程链路文档的 SSOT。读者必须能从这里恢复 canonical 执行顺序、节点 contract、row 归属、fallback 策略和实现映射，而不需要阅读任务讨论记录。

## 适用范围

本规范适用于 `chain-contract/` 下的所有链路文档。Model-P-v2 仓库内的 `dev-docs` 可以保留任务过程和迁移历史，但不得作为长期链路契约来源。

## 目录布局

```text
chain-contract/
  00-format-standard.md
  01-overview.md
  02-ordered-execution.md
  03-row-taxonomy.md
  10-platform-chain.md
  20-device-chain.md
  30-signal-environment-chain.md
  40-sense-chain.md
  50-navigation-chain.md
  60-target-action-chain.md
  70-maintenance-chain.md
  80-runtime-extension-nodes.md
```

## 命名规则

- 节点标题必须使用 canonical node id。
- Runtime 代码、ordered execution 配置、测试和文档必须使用同一套 canonical node id。
- 契约文档不得新增旧名映射表，也不得保留双轨入口。

## 节点章节模板

每个节点章节必须包含：目的、位置、输入、输出、运行时契约、回退策略、状态与保留、实现映射、验证。

## Row Contract 规则

- `shared.*` 是跨提交边界可见的权威行。
- `runtime.*` 是当前步运行时行，必须说明是否允许同一步下游消费。
- `transient.*` 是当前步输入行，默认不跨 tick 保留。
- In-memory contract 必须说明 producer 和 immediate consumer。
- 节点不得写入其他节点拥有的 `shared.*` row，除非文档显式说明共同提交边界。

## Fallback 规则

- `no fallback`：失败或缺少计算资源时不更新节点拥有的输出。
- `skip/no-op`：节点有意不更新，但 ordered plan 继续执行。
- `fixed implementation fallback`：统一入口执行确定性的内置实现。
- `hard failure`：tick 失败或生命周期状态拒绝操作。

## 验收检查

- 文档只使用 canonical node id。
- 每个节点都有输入、输出、运行时契约、fallback、状态保留、实现映射和验证项。
- 每个 `shared.*` row 有唯一 owner 或显式 joint commit owner。
- Runtime 和 in-memory contract 声明可见性与生命周期。
- Ordered execution 列表与运行时代码顺序一致。
