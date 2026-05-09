# 运行时扩展节点

## 结论

运行时扩展节点不是 49 个 core chain 的一部分，但它们是 ordered execution 的合法调度项。文档必须明确它们和 core chain 的边界，避免把域运行时或 custom node 误写成 core chain。

## Builtin Domain Node

### 目的
域节点执行 Environment、Platform、Signal 三类 domain runtime。它们位于 core chain 边界之前，负责把外部域插件、L4 direct mount 或预提交逻辑的输出 staging 成 `transient.*`、truth delta 或 write intent。

### 运行时契约
- @pre: `Prepared()` 已完成 domain runtime 加载和节点启用计划。
- @post: 域节点输出进入当前 tick 的 pre-commit staging 集合。
- @invariant: core chain 边界之后不得再出现 builtin domain node。
- @failure: domain runtime 执行失败时当前 tick 失败。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `UnifiedModelEntry::ExecuteDomainPlan` |
| Domain runtimes | `EnvironmentDomainRuntime`、`PlatformDomainRuntime`、`SignalDomainRuntime` |

## Custom Invocation Node

### 目的
Custom invocation node 是 runtime config 显式声明的可插入计算节点。它可以出现在 core chain 前或 core chain 后，但必须由 ordered execution 显式排序。

### 运行时契约
- @pre: `custom_node_id` 已在 runtime config 的 `custom_nodes` 中声明。
- @post: 节点运行结果通过统一入口的 runtime contract 或 write intent 进入后续流程。
- @invariant: custom node 不改变 builtin core chain 的相对顺序。
- @failure: 未声明、重复排序或 runtime 加载失败时 `Prepared()` 或 tick 失败。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `UnifiedModelEntry::ExecuteCustomInvocationNode` |
| Runtime | `ICustomInvocationRuntime` |

## Communication Dispatch

### 目的
通信 dispatch 在 core chain 执行后消费 `shared.communication.outbox.*`，生成通信 dispatch 记录，并在 awareness 同步场景下写入通知 row。

### 运行时契约
- @pre: core chain 已提交 outbox row。
- @post: 写入 `shared.communication.dispatch.*`；必要时写入 `shared.sense.awareness_notify`。
- @invariant: dispatch 不拥有业务 outbox 的生成语义，只负责发送或调度结果。
- @failure: dispatch executor 失败时当前 tick 失败。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `UnifiedModelEntry::DispatchPendingCommunicationOutbox` |
| Executor | `ICommunicationDispatchExecutor` |
