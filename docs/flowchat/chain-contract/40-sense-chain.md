# 感知链路

## 结论

感知链路按 signature receive、signal intake、preprocess、detection、observation、track、awareness 的顺序执行；环境特征经 `sense.detection.from_signature` 汇入 detection，同构进入后续 observation/track/awareness。

| # | 展示名 | Node | Owner output |
|---:|---|---|---|
| 67 | 特征接收 | `device.signature.receive.process` | 内存 `device_signature_result_set` |
| 68 | 信号传入 | `sense.signal.intake` | 内存 `device_received_signal_bucket` |
| 69 | 信号预处理 | `sense.signal.preprocess` | `shared.sense.signal`、可选 `shared.sense.signal_interest`、内存 `preprocessed_signal_observation_set` |
| 70 | 信号成检 | `sense.detection.from_signal` | 内存 `signal_detection_set` |
| 71 | 特征成检 | `sense.detection.from_signature` | 内存 `signature_detection_set` |
| 72 | 假警维护 | `sense.detection.artifact.update` | 内存 `artifact_detection_set` |
| 73 | 探测更新 | `sense.detection.update` | `shared.sense.detection`、内存 `postprocessed_detection_set` |
| 74 | 探测成观 | `sense.observation.from_detection` | 内存 `observation_candidate_set` |
| 75 | 观测更新 | `sense.observation.update` | `shared.sense.observation` |
| 76 | 航迹更新 | `sense.track.update` | `shared.sense.track` |
| 77 | 态势融合 | `sense.awareness.update` | 内存 `awareness_working_set` |
| 78 | 态势维护 | `sense.awareness.maintain` | `shared.sense.awareness` |

## `device.signature.receive.process`

### 目的
统一入口先内部完成 environment signature receive/classify 分桶，再将候选交给设备签名感知处理。当前默认实现无设备计算资源时不输出设备结果，只追加审计。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 特征接收 |
| 执行序号 | 67 |
| 阶段 | Post-commit core chain |
| 上游 | `environment.signature.propagation.resolve` |
| 下游 | `sense.signal.intake` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | `runtime.environment.signature.propagated_candidates`、设备状态 | 是 | receive/classify 是统一入口内部逻辑，不作为独立 core chain。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | 内存 `device_signature_result_set` | 当前函数链 | 无设备计算资源时为空集合。 |

### 回退策略
no fallback：没有设备签名计算资源时不处理，不更新设备状态。

## `sense.signal.intake`

### 目的
按接收设备独立执行信号传入判定，形成接收桶。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 信号传入 |
| 执行序号 | 68 |
| 阶段 | Post-commit core chain |
| 上游 | `environment.signal.transform` |
| 下游 | `sense.signal.preprocess` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | `runtime.environment.signal.propagated_local_candidates`、设备状态、设备性能、平台姿态 | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | 内存 `device_received_signal_bucket` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
hard failure：缺少 executor 或 output 时失败。

### 状态与保留
接收桶仅当前步传给 preprocess；可通过审计观察。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessSenseSignalIntake / ISenseSignalPipelineExecutor::IntakeSignals` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 68 项为 `sense.signal.intake` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `sense.signal.preprocess`

### 目的
对接收桶中的信号执行顺序相关预处理，可调整、合并或丢弃信号。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 信号预处理 |
| 执行序号 | 69 |
| 阶段 | Post-commit core chain |
| 上游 | `sense.signal.intake` |
| 下游 | `sense.detection.from_signal` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | 内存 `device_received_signal_bucket`、可选 receive-side transient delta | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | `shared.sense.signal`、可选 `shared.sense.signal_interest`、内存 `preprocessed_signal_observation_set` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
no fallback：空桶输出 `no_signal_source` 或空预处理集合。

### 状态与保留
维护 `sense_signal_state_`；预处理集合仅当前步传给 detection。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessSenseSignalPreprocess / ISenseSignalPipelineExecutor::PreprocessSignals` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 69 项为 `sense.signal.preprocess` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `sense.detection.from_signal`

### 目的
把预处理信号转换为 in-memory detection set。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 信号成检 |
| 执行序号 | 70 |
| 阶段 | Post-commit core chain |
| 上游 | `sense.signal.preprocess` |
| 下游 | `sense.detection.from_signature` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | 内存 `preprocessed_signal_observation_set` | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | 内存 `signal_detection_set` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
hard failure：缺少 executor 或 output 时失败。

### 状态与保留
输出只在当前步传给 artifact/update。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessSenseDetectionFromSignal / ISenseSignalPipelineExecutor::BuildDetectionsFromSignal` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 70 项为 `sense.detection.from_signal` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `sense.detection.from_signature`

### 目的
把设备签名感知输出转成统一 detection candidate，使尾流、磁异常、热迹、化学痕迹等环境特征复用现有 detection -> observation -> track -> awareness 链路。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 特征成检 |
| 执行序号 | 71 |
| 阶段 | Post-commit core chain |
| 上游 | `sense.detection.from_signal` |
| 下游 | `sense.detection.artifact.update` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | 内存 `device_signature_result_set` | 是 | 由 `device.signature.receive.process` 生成。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | 内存 `signature_detection_set` | 当前函数链 | 与 `signal_detection_set` 合并后进入 artifact/update。 |

### 回退策略
minimum fallback：把设备签名输出按统一 object envelope 投影为 detection；空输入输出空集合。

## `sense.detection.artifact.update`

### 目的
生成、维护或删除假目标和虚警等 detection artifact。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 假警维护 |
| 执行序号 | 72 |
| 阶段 | Post-commit core chain |
| 上游 | `sense.detection.from_signature` |
| 下游 | `sense.detection.update` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | 内存 `signal_detection_set`、`signature_detection_set` | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | 内存 `artifact_detection_set` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
hard failure：缺少 executor 或 output 时失败。

### 状态与保留
artifact 生命周期由 pipeline executor 管理，最终合并到 detection 同构结构。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessSenseDetectionArtifactUpdate / ISenseSignalPipelineExecutor::UpdateDetectionArtifacts` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 72 项为 `sense.detection.artifact.update` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `sense.detection.update`

### 目的
合并信号 detection 与 artifact detection，提交设备级 detection 权威行。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 探测更新 |
| 执行序号 | 73 |
| 阶段 | Post-commit core chain |
| 上游 | `sense.detection.artifact.update` |
| 下游 | `sense.observation.from_detection` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | 内存 `signal_detection_set`、`artifact_detection_set`、`current_rows`、`previous_shared_rows` | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | `shared.sense.detection`、内存 `postprocessed_detection_set` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
no fallback：无 detection 时保留或清空基线。

### 状态与保留
维护 `sense_detection_state_`；postprocessed set 当前步传给 observation。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessSenseDetectionUpdate / ISenseSignalPipelineExecutor::UpdateDetections` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 73 项为 `sense.detection.update` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `sense.observation.from_detection`

### 目的
将 postprocessed detection set 转换为 observation candidate set。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 探测成观 |
| 执行序号 | 74 |
| 阶段 | Post-commit core chain |
| 上游 | `sense.detection.update` |
| 下游 | `sense.observation.update` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | 内存 `postprocessed_detection_set` | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | 内存 `observation_candidate_set` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
hard failure：缺少前序 detection.update 时失败。

### 状态与保留
candidate set 仅当前步传给 observation/update/track/awareness。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessSenseObservationFromDetection / ISenseSignalPipelineExecutor::BuildObservationsFromDetection` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 74 项为 `sense.observation.from_detection` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `sense.observation.update`

### 目的
将 observation candidates 后处理为对象级 observation 权威状态。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 观测更新 |
| 执行序号 | 75 |
| 阶段 | Post-commit core chain |
| 上游 | `sense.observation.from_detection` |
| 下游 | `sense.track.update` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | 内存 `observation_candidate_set`、`current_rows`、`previous_shared_rows` | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | `shared.sense.observation` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
no fallback：无当前 detection 时按已有状态或基线处理。

### 状态与保留
维护 `sense_observation_state_`。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessSenseObservationUpdate / ISenseSignalPipelineExecutor::UpdateObservations` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 75 项为 `sense.observation.update` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `sense.track.update`

### 目的
按 object_id 维护航迹；允许没有航迹。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 航迹更新 |
| 执行序号 | 76 |
| 阶段 | Post-commit core chain |
| 上游 | `sense.observation.update` |
| 下游 | `sense.awareness.update` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | 内存 `observation_candidate_set`、`shared.sense.track@k-1` | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | `shared.sense.track` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
fixed implementation fallback：有 track 的 object_id 5 秒内自然外推，超过 5 秒删除。

### 状态与保留
维护 `sense_track_state_`；记录过期 object id。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessSenseTrackUpdate / ISenseSignalPipelineExecutor::UpdateTracks` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 76 项为 `sense.track.update` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `sense.awareness.update`

### 目的
融合 track、最终 observation、跨平台态势和当前 awareness，形成待维护工作集。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 态势融合 |
| 执行序号 | 77 |
| 阶段 | Post-commit core chain |
| 上游 | `sense.track.update` |
| 下游 | `sense.awareness.maintain` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | `shared.sense.track`、内存 `observation_candidate_set`、`shared.sense.awareness@k-1`、平台上下文 | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | 内存 `awareness_working_set` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
hard failure：缺少前序 observation.update 时失败。

### 状态与保留
工作集仅当前步传给 maintain。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessSenseAwarenessUpdate / ISenseSignalPipelineExecutor::UpdateAwareness` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 77 项为 `sense.awareness.update` |
| Build | `xmake build test-l3-unified-entry` 通过 |

## `sense.awareness.maintain`

### 目的
维护 awareness 数量、时间跨度和切片窗口，并提交最终态势。

### 位置
| 字段 | 值 |
|---|---|
| 展示名 | 态势维护 |
| 执行序号 | 78 |
| 阶段 | Post-commit core chain |
| 上游 | `sense.awareness.update` |
| 下游 | `communication.request.collect` |

### 输入
| Contract | 来源 | 是否必需 | 说明 |
|---|---|---|---|
| 输入集合 | 内存 `awareness_working_set`、`shared.sense.awareness@k-1` | 是 | 由统一入口按 ordered execution 准备。 |

### 输出
| Contract | 目标 | 生命周期 | 说明 |
|---|---|---|---|
| 输出集合 | `shared.sense.awareness` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |

### 运行时契约
- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。
- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。
- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。
- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。

### 回退策略
fixed implementation fallback：无计算节点时采用最近 5 次、2 秒 slice、最多保留 30 秒的内置维护策略。

### 状态与保留
维护 `sense_awareness_state_`；输出可被平台、通信和下游业务消费。

### 实现映射
| 层级 | 文件 / 类型 / 函数 |
|---|---|
| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |
| Primary function | `UnifiedModelEntry::ProcessSenseAwarenessMaintain / ISenseSignalPipelineExecutor::MaintainAwareness` |
| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |

### 验证
| 检查项 | 期望结果 |
|---|---|
| 执行序号 | `02-ordered-execution.md` 中第 78 项为 `sense.awareness.maintain` |
| Build | `xmake build test-l3-unified-entry` 通过 |
