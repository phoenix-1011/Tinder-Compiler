# 信号与环境传播链路

## 结论

信号环境链路从静态信号生成开始，经环境生命周期、生成、回波和传播转换，产出当前步本地接收候选 runtime row。

| # | 展示名 | Node | Owner output |
|---:|---|---|---|
| 35 | 静态信号 | `signal.static_generation.update` | `shared.signal.records`、调试镜像 `shared.signal_generation.records` |
| 36 | 信号生命周期 | `environment.signal.lifecycle.manage` | 内存 `retained_signal_working_set` |
| 37 | 环境生成 | `environment.signal.generate` | 内存 `environment_signal_working_set` |
| 38 | 回波生成 | `environment.signal.echo_generate` | 内存 `echo_signal_working_set` |
| 39 | 传播转换 | `environment.signal.transform` | `runtime.environment.signal.propagated_local_candidates`、内存候选集 |

## `signal.static_generation.update`

### 目的
把设备或平台产生的静态信号记录投影到权威信号池。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 静态信号 |
| 执行序号 | 35 |
| 阶段 | Post-commit core chain |
| 上游 | `device.performance.update` |
| 下游 | `environment.signal.lifecycle.manage` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | `current_rows`、设备和平台上下文、当前 step | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | `shared.signal.records`、调试镜像 `shared.signal_generation.records` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
fixed implementation fallback。

### 状态与保留
维护 `static_signal_pool_state_` 与 `signal_generation_state_`。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessSignalStaticGenerationUpdate` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 35 项为 `signal.static_generation.update` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `environment.signal.lifecycle.manage`

### 目的
管理环境信号生命周期，保留仍有效的工作集。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 信号生命周期 |
| 执行序号 | 36 |
| 阶段 | Post-commit core chain |
| 上游 | `signal.static_generation.update` |
| 下游 | `environment.signal.generate` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | `shared.signal.records@k`、当前 step | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | 内存 `retained_signal_working_set` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
hard failure：缺少 executor 或 output 时失败。

### 状态与保留
生命周期策略由 `IEnvironmentSignalExecutor` 实现。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessEnvironmentSignalLifecycle / IEnvironmentSignalExecutor::ManageSignalLifecycle` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 36 项为 `environment.signal.lifecycle.manage` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `environment.signal.generate`

### 目的
生成环境传播中的信号工作集。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 环境生成 |
| 执行序号 | 37 |
| 阶段 | Post-commit core chain |
| 上游 | `environment.signal.lifecycle.manage` |
| 下游 | `environment.signal.echo_generate` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | 内存 `retained_signal_working_set` | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | 内存 `environment_signal_working_set` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
hard failure：缺少 executor 或 output 时失败。

### 状态与保留
不直接写 `shared.*`。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessEnvironmentSignalGenerate / IEnvironmentSignalExecutor::GenerateEnvironmentSignals` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 37 项为 `environment.signal.generate` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `environment.signal.echo_generate`

### 目的
生成回波、反射或环境增强后的信号工作集。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 回波生成 |
| 执行序号 | 38 |
| 阶段 | Post-commit core chain |
| 上游 | `environment.signal.generate` |
| 下游 | `environment.signal.transform` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | 内存 `environment_signal_working_set` | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | 内存 `echo_signal_working_set` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
hard failure：缺少 executor 或 output 时失败。

### 状态与保留
不直接写 `shared.*`。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessEnvironmentSignalEcho / IEnvironmentSignalExecutor::GenerateSignalEchoes` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 38 项为 `environment.signal.echo_generate` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `environment.signal.transform`

### 目的
将环境工作集转换为本地接收候选，并执行同类、同实例和接收端 quota。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 传播转换 |
| 执行序号 | 39 |
| 阶段 | Post-commit core chain |
| 上游 | `environment.signal.echo_generate` |
| 下游 | `sense.signal.intake` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | 内存 `echo_signal_working_set`、`shared.device.status` | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | `runtime.environment.signal.propagated_local_candidates`、内存候选集 | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
hard failure：executor 失败时失败。

### 状态与保留
runtime row 仅当前步有效；候选数量受默认 quota 约束。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessEnvironmentSignalTransform / IEnvironmentSignalExecutor::TransformSignals` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 39 项为 `environment.signal.transform` |
| Build | `xmake build test-l3-unified-entry` 通过 |
