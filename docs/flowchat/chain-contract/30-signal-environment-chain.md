# 信号与环境传播链路

## 结论

信号环境链路从静态信号生成开始，经 receiver-neutral 信号事实、兼容环境工作集、回波/散射事实、receiver-bound 数字化观测、兼容 candidate 投影、软杀伤传播/响应，以及环境特征生成、维护和传播，产出当前步 signal/signature runtime row。

| # | 展示名 | Node | Owner output |
|---:|---|---|---|
| 55 | 静态信号 | `signal.static_generation.update` | `shared.signal.records`、调试镜像 `shared.signal_generation.records` |
| 56 | 信号事实 | `signal.fact.generate` | `shared.signal.entity_features`、`runtime.signal.parameterized_facts` |
| 57 | 软杀发射 | `device.softkill.emission.generate` | `runtime.softkill.emission.records` |
| 58 | 信号生命周期 | `environment.signal.lifecycle.manage` | 内存 `retained_signal_working_set` |
| 59 | 环境生成 | `environment.signal.generate` | 内存 `environment_signal_working_set` |
| 60 | 环境兼容回波 | `environment.signal.echo_generate` | 兼容内存 `echo_signal_working_set` |
| 61 | 回波事实 | `signal.echo.generate` | 内存 `signal_echo_fact_set` |
| 62 | 信号观测 | `signal.observable.materialize` | `runtime.signal.digitized_observables` |
| 63 | 传播转换 | `environment.signal.transform` | `runtime.environment.signal.propagated_local_candidates`、内存候选集 |
| 64 | 软杀传播 | `softkill.propagation.resolve` | `runtime.softkill.propagated_candidates` |
| 65 | 平台软杀 | `platform.softkill.effect.resolve` | 审计 no-op 或未来平台效果 |
| 66 | 设备软杀 | `device.softkill.effect.process` | 审计 no-op 或未来设备效果 |
| 67 | 特征生成 | `environment.signature.generate` | 内存 `environment_signature_generated_set` |
| 68 | 特征维护 | `environment.signature.lifecycle.manage` | `shared.environment.signature.records` |
| 69 | 特征传播 | `environment.signature.propagation.resolve` | `runtime.environment.signature.propagated_candidates` |

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
| 下游 | `signal.fact.generate` |

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

## `signal.fact.generate`

### 目的
从当前 `shared.signal.records` 生成 receiver-neutral `ParameterizedSignalFact`，并生成、恢复或合并 `shared.signal.entity_features`，为回波/散射和 receiver 绑定提供统一事实输入。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 信号事实 |
| 执行序号 | 56 |
| 阶段 | Post-commit core chain |
| 上游 | `signal.static_generation.update` |
| 下游 | `device.softkill.emission.generate` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| `shared.signal.records@k` | `signal.static_generation.update` | 是 | 静态信号权威池。 |
| `shared.signal.entity_features@k-1` 或当前 row | restore/current rows | 否 | 已恢复的实体信号特征，允许与当前信号源派生特征合并。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| `shared.signal.entity_features` | L5 authoritative row | 跨 tick | 信号域实体特征池，覆盖几何、散射中心、材料、姿态和响应摘要。 |
| `runtime.signal.parameterized_facts` | L5 runtime row | 当前 tick | receiver-neutral 参数化信号事实；即使为空也提交，供 custom node 区分“已执行为空”和“未产出”。 |

### 运行时契约
- @pre: `signal.static_generation.update` 已完成当前 tick 的静态信号投影。
- @post: 发布当前 tick 的 `runtime.signal.parameterized_facts`，并使 `shared.signal.entity_features` 显式可读。
- @invariant: 本节点不绑定 receiver；receiver 绑定属于 `signal.observable.materialize`。
- @failure: 输出指针为空、runtime handoff 提交失败或 payload 解码失败时按统一入口失败策略记录 `last_lifecycle_error_`。

### 回退策略
fixed implementation fallback：无静态信号时提交空 `runtime.signal.parameterized_facts`，保留或生成空实体特征集合。

### 状态与保留
维护 `parameterized_signal_fact_state_` 和 `entity_signal_feature_state_`。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry_signal_sense_pipeline.cpp` |
| Primary function | `UnifiedModelEntry::ProcessSignalFactGenerate` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 56 项为 `signal.fact.generate` |
| Empty handoff | 无信号事实时仍写入空 `runtime.signal.parameterized_facts` |

### UI 策略
| 字段 | 值 |
|---|---|
| `resource_binding_policy` | `builtin_only` |
| `ui_tags` | 内建结构节点、T-007 |
| `ui_notice` | 该节点由统一入口生成信号事实和实体特征，不作为标准资源能力绑定目标。 |

## `environment.signal.lifecycle.manage`

### 目的
管理环境信号生命周期，保留仍有效的工作集。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 信号生命周期 |
| 执行序号 | 58 |
| 阶段 | Post-commit core chain |
| 上游 | `device.softkill.emission.generate` |
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
| 执行序号 | `02-ordered-execution.md` 中第 58 项为 `environment.signal.lifecycle.manage` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `environment.signal.generate`

### 目的
生成环境传播中的信号工作集。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 环境生成 |
| 执行序号 | 59 |
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
| 执行序号 | `02-ordered-execution.md` 中第 59 项为 `environment.signal.generate` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `environment.signal.echo_generate`

### 目的
执行兼容 environment working-set enrichment，生成给兼容候选投影使用的环境信号工作集。新主动回波、散射和反射事实不由本节点负责，统一归属 `signal.echo.generate`。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 环境兼容回波 |
| 执行序号 | 60 |
| 阶段 | Post-commit core chain |
| 上游 | `environment.signal.generate` |
| 下游 | `signal.echo.generate` |

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
| 执行序号 | `02-ordered-execution.md` 中第 60 项为 `environment.signal.echo_generate` |
| Build | `xmake build test-l3-unified-entry` 通过 |

### UI 策略
| 字段 | 值 |
|---|---|
| `resource_binding_policy` | `builtin_only` |
| `ui_tags` | 内建结构节点、兼容路径 |
| `ui_notice` | 该节点仅保留兼容 environment working-set enrichment，不作为新 echo/scatter 资源能力绑定目标。 |

## `signal.echo.generate`

### 目的
消费 `runtime.signal.parameterized_facts` 和 `shared.signal.entity_features`，生成主动探测、实体散射、反射或调制产生的 echo/scatter facts。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 回波事实 |
| 执行序号 | 61 |
| 阶段 | Post-commit core chain |
| 上游 | `environment.signal.echo_generate` |
| 下游 | `signal.observable.materialize` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| `runtime.signal.parameterized_facts` | `signal.fact.generate` | 是 | receiver-neutral 发射、噪声、干扰或散射源事实。 |
| `shared.signal.entity_features@k` | `signal.fact.generate` | 是 | 实体几何、散射中心、材料和响应摘要。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | 内存 `signal_echo_fact_set` | 当前函数链 | 由实体特征交互产生的 echo/scatter facts。 |

### 运行时契约
- @pre: `signal.fact.generate` 已发布当前 tick 的参数化事实和实体特征。
- @post: 主动/散射/反射语义只在本节点生成，后续由 `signal.observable.materialize` 绑定 receiver。
- @invariant: 本节点不写兼容 `echo_signal_working_set`，也不执行 receiver 绑定。
- @failure: 输出指针为空或事实转换失败时按统一入口失败策略记录 `last_lifecycle_error_`。

### 回退策略
fixed implementation fallback：没有 active/scatter interaction 时输出空 `signal_echo_fact_set`。

### 状态与保留
维护 `signal_echo_fact_state_`，仅当前 tick 下游消费。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry_signal_sense_pipeline.cpp` |
| Primary function | `UnifiedModelEntry::ProcessSignalEchoGenerate` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 61 项为 `signal.echo.generate` |
| Entity feature echo | echo fact 保留 emitter、scatterer 和 parent fact 关系 |

### UI 策略
| 字段 | 值 |
|---|---|
| `resource_binding_policy` | `builtin_only` |
| `ui_tags` | 内建结构节点、T-007 |
| `ui_notice` | 该节点统一生成 echo/scatter facts，不作为标准资源能力绑定目标。 |

## `signal.observable.materialize`

### 目的
把 parameterized facts 和 echo/scatter facts 绑定到所有 eligible receiver，生成可解析的 `DigitizedSignalObservable`。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 信号观测 |
| 执行序号 | 62 |
| 阶段 | Post-commit core chain |
| 上游 | `signal.echo.generate` |
| 下游 | `environment.signal.transform` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| `runtime.signal.parameterized_facts` | `signal.fact.generate` | 是 | 直接信号事实。 |
| 内存 `signal_echo_fact_set` | `signal.echo.generate` | 是 | echo/scatter facts。 |
| `shared.device.status`、平台坐标/空间关系 | device/platform state | 是 | receiver 可用性和接收路径关系。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| `runtime.signal.digitized_observables` | L5 runtime row | 当前 tick | receiver-bound 数字化 observable；即使为空也提交。 |

### 运行时契约
- @pre: `signal.fact.generate` 与 `signal.echo.generate` 已完成当前 tick 输出。
- @post: 每个可用 receiver 产生可解析 observable；echo observable 保留 A 发射、C 散射、B 接收路径关系。
- @invariant: digitized observable provenance 下游写入 `source_observable_ids`，不得混入 `source_candidate_ids`。
- @failure: runtime handoff 提交失败或输出指针为空时按统一入口失败策略记录 `last_lifecycle_error_`。

### 回退策略
fixed implementation fallback：没有 eligible receiver 时提交空 `runtime.signal.digitized_observables`。

### 状态与保留
维护 `digitized_signal_observable_state_`，当前 tick 供 `sense.signal.intake` 和 custom node 读取。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry_signal_sense_pipeline.cpp` |
| Primary function | `UnifiedModelEntry::ProcessSignalObservableMaterialize` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 62 项为 `signal.observable.materialize` |
| Empty handoff | 无 receiver 绑定时仍写入空 `runtime.signal.digitized_observables` |

### UI 策略
| 字段 | 值 |
|---|---|
| `resource_binding_policy` | `builtin_only` |
| `ui_tags` | 内建结构节点、T-007 |
| `ui_notice` | 该节点负责 receiver 绑定和数字化 observable materialize，不作为标准资源能力绑定目标。 |

## `environment.signal.transform`

### 目的
将兼容 environment working set 转换为本地接收候选，并执行同类、同实例和接收端 quota。该节点只保留兼容 candidate projection，不再承担 receiver 绑定或数字化语义。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 传播转换 |
| 执行序号 | 63 |
| 阶段 | Post-commit core chain |
| 上游 | `signal.observable.materialize` |
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
| 执行序号 | `02-ordered-execution.md` 中第 63 项为 `environment.signal.transform` |
| Build | `xmake build test-l3-unified-entry` 通过 |

### UI 策略
| 字段 | 值 |
|---|---|
| `resource_binding_policy` | `builtin_only` |
| `ui_tags` | 内建结构节点、兼容投影 |
| `ui_notice` | 该节点只保留兼容 candidate projection，不作为 receiver 绑定或数字化资源能力绑定目标。 |

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
