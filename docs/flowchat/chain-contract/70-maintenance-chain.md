# 维护与跟踪链路



## 结论



维护与跟踪链路当前聚焦 跟踪链路：跟踪请求、目标 key、设备快照、事实解析和最终监督更新。



| # | 展示名 | Node | Owner output |

|---:|---|---|---|

| 42 | 跟踪请求 | `platform.tracking_request.maintain` | `shared.platform.tracking_request_scope`、内存请求上下文 |

| 43 | 目标键维护 | `platform.tracking_target_key.maintain` | `shared.platform.tracking_target_key_set`、内存 key set |

| 44 | 跟踪设备 | `platform.tracking_device.resolve` | 内存 `TrackingDeviceWorkingSnapshotState` |

| 45 | 跟踪事实 | `platform.tracking_fact.resolve` | 内存 `TrackingFactInputState` |

| 46 | 跟踪监督 | `platform.supervise_tracking.update` | `shared.platform.superviseTracking` |



## `platform.tracking_request.maintain`



### 目的

维护跟踪请求范围、目标类型和锁定增量。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 跟踪请求 |

| 执行序号 | 42 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.supervise_canonball.update` |

| 下游 | `platform.tracking_target_key.maintain` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.tracking_request_scope`、内存请求上下文 | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback。



### 状态与保留

维护 `tracking_request_scope_state_`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP16TrackingRequestMaintain` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 42 项为 `platform.tracking_request.maintain` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.tracking_target_key.maintain`



### 目的

维护需要跟踪的目标 key 集合。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 目标键维护 |

| 执行序号 | 43 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.tracking_request.maintain` |

| 下游 | `platform.tracking_device.resolve` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | 内存 tracking request、目标类型、事实引用来源 | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.tracking_target_key_set`、内存 key set | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

hard failure：缺少 request 节点时失败。



### 状态与保留

维护 `tracking_target_key_set_state_`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP16TrackingTargetKeyMaintain` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 43 项为 `platform.tracking_target_key.maintain` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.tracking_device.resolve`



### 目的

解析参与跟踪的设备快照。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 跟踪设备 |

| 执行序号 | 44 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.tracking_target_key.maintain` |

| 下游 | `platform.tracking_fact.resolve` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | 内存 tracking request、当前设备状态 | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | 内存 `TrackingDeviceWorkingSnapshotState` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

hard failure：缺少 target key 节点时失败。



### 状态与保留

不直接写 `shared.*`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP16TrackingDeviceResolve` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 44 项为 `platform.tracking_device.resolve` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.tracking_fact.resolve`



### 目的

把感知事实和跟踪请求对齐为监督输入。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 跟踪事实 |

| 执行序号 | 45 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.tracking_device.resolve` |

| 下游 | `platform.supervise_tracking.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows`、内存 request | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | 内存 `TrackingFactInputState` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

hard failure：缺少 device resolve 节点时失败。



### 状态与保留

不直接写 `shared.*`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP16TrackingFactResolve` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 45 项为 `platform.tracking_fact.resolve` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.supervise_tracking.update`



### 目的

更新平台级跟踪监督状态。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 跟踪监督 |

| 执行序号 | 46 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.tracking_fact.resolve` |

| 下游 | `platform.homeport.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `previous_shared_rows`、request、device snapshot、fact input、锁定增量 | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.superviseTracking` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback。



### 状态与保留

维护 `tracking_supervision_state_`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP16SuperviseTrackingUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 46 项为 `platform.supervise_tracking.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |

