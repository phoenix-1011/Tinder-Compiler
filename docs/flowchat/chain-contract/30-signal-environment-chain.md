# 信号与环境传播链路

## 结论

信号环境链路从静态信号生成开始，经软杀伤发射、环境信号生命周期、生成、回波、传播转换、软杀伤传播/响应，以及环境特征生成、维护和传播，产出当前步 signal/signature runtime row。

| # | 展示名 | Node | Owner output |
|---:|---|---|---|
| 55 | 静态信号 | `signal.static_generation.update` | `shared.signal.records`、调试镜像 `shared.signal_generation.records` |
| 56 | 软杀发射 | `device.softkill.emission.generate` | `runtime.softkill.emission.records` |
| 57 | 信号生命周期 | `environment.signal.lifecycle.manage` | 内存 `retained_signal_working_set` |
| 58 | 环境生成 | `environment.signal.generate` | 内存 `environment_signal_working_set` |
| 59 | 回波生成 | `environment.signal.echo_generate` | 内存 `echo_signal_working_set` |
| 60 | 传播转换 | `environment.signal.transform` | `runtime.environment.signal.propagated_local_candidates`、内存候选集 |
| 61 | 软杀传播 | `softkill.propagation.resolve` | `runtime.softkill.propagated_candidates` |
| 62 | 平台软杀 | `platform.softkill.effect.resolve` | 审计 no-op 或未来平台效果 |
| 63 | 设备软杀 | `device.softkill.effect.process` | 审计 no-op 或未来设备效果 |
| 64 | 特征生成 | `environment.signature.generate` | 内存 `environment_signature_generated_set` |
| 65 | 特征维护 | `environment.signature.lifecycle.manage` | `shared.environment.signature.records` |
| 66 | 特征传播 | `environment.signature.propagation.resolve` | `runtime.environment.signature.propagated_candidates` |

## `signal.static_generation.update`

### 目的
把设备或平台产生的静态信号记录投影到权威信号池。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 静态信号 |
| 执行序号 | 55 |
| 阶段 | Post-commit core chain |
| 上游 | `device.performance.update` |
| 下游 | `device.softkill.emission.generate` |

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
| 执行序号 | `02-ordered-execution.md` 中第 55 项为 `signal.static_generation.update` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `environment.signal.lifecycle.manage`

### 目的
管理环境信号生命周期，保留仍有效的工作集。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 信号生命周期 |
| 执行序号 | 57 |
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
| 执行序号 | `02-ordered-execution.md` 中第 57 项为 `environment.signal.lifecycle.manage` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `environment.signal.generate`

### 目的
生成环境传播中的信号工作集。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 环境生成 |
| 执行序号 | 58 |
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
| 执行序号 | `02-ordered-execution.md` 中第 58 项为 `environment.signal.generate` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `environment.signal.echo_generate`

### 目的
生成回波、反射或环境增强后的信号工作集。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 回波生成 |
| 执行序号 | 59 |
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
| 执行序号 | `02-ordered-execution.md` 中第 59 项为 `environment.signal.echo_generate` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `environment.signal.transform`

### 目的
将环境工作集转换为本地接收候选，并执行同类、同实例和接收端 quota。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 传播转换 |
| 执行序号 | 60 |
| 阶段 | Post-commit core chain |
| 上游 | `environment.signal.echo_generate` |
| 下游 | `softkill.propagation.resolve` |

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
| 执行序号 | `02-ordered-execution.md` 中第 60 项为 `environment.signal.transform` |
| Build | `xmake build test-l3-unified-entry` 通过 |


## 环境特征链路

环境特征链路覆盖尾流、磁异常、热迹、化学痕迹和自定义特征。它不写 `shared.signal.records`，而是使用独立的 `shared.environment.signature.records` 和 `runtime.environment.signature.propagated_candidates`。

### 节点约定

| Node | 展示名 | 输入 | 输出 | fallback |
|---|---|---|---|---|
| `environment.signature.generate` | 特征生成 | 平台、设备、环境状态 | 内存 `environment_signature_generated_set` | 默认不生成；有内建基础特征或未来计算资源时输出 |
| `environment.signature.lifecycle.manage` | 特征维护 | 上一步特征集合、`shared.environment.signature.records@k-1` | `shared.environment.signature.records` | 固定 fallback：TTL、衰减、过期删除 |
| `environment.signature.propagation.resolve` | 特征传播 | `shared.environment.signature.records`、设备状态 | `runtime.environment.signature.propagated_candidates` | 固定 fallback：范围、介质、强度阈值、设备可接收性简化分发 |

### 统一入口内部边界

- 不新增 `environment.signature.receive.classify` core chain。
- 统一入口在 `environment.signature.propagation.resolve` 之后内部完成 receive/classify，生成 in-memory `device_signature_receive_bucket`。
- `device_signature_receive_bucket` 只传给 `device.signature.receive.process`，不写 authoritative shared row。
- 复杂尾流、磁探、热迹等设备模型由 `device.signature.receive.process` 后续按设备计算资源处理。

### Contract

| Contract | Producer | Consumer | Lifetime |
|---|---|---|---|
| `shared.environment.signature.records` | `environment.signature.lifecycle.manage` | `environment.signature.propagation.resolve` | authoritative |
| `runtime.environment.signature.propagated_candidates` | `environment.signature.propagation.resolve` | 统一入口内部 receive/classify、post-commit custom nodes | 当前 tick |
| `device_signature_receive_bucket` | 统一入口内部 receive/classify | `device.signature.receive.process` | 当前函数链 |






