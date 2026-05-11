# 设备链路



## 结论



设备链路采用状态候选、空间约束、性能联合提交三段式；`device.performance.update` 是 `shared.device.status` 与 `shared.device.performance` 的 joint commit owner。



| # | 展示名 | Node | Owner output |

|---:|---|---|---|

| 50 | 设备状态 | `device.status.update` | 内存 `DeviceStatusState next_status` |

| 51 | 设备空间 | `device.spatial_state.update` | 内存 `DeviceStatusState spatial_status` |

| 52 | 设备性能 | `device.performance.update` | `shared.device.status`、`shared.device.performance` |



## `device.status.update`



### 目的

生成本步设备基础状态候选，包括开关、工作模式、安装位置和转动或伸缩变化。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 设备状态 |

| 执行序号 | 50 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.status.update` |

| 下游 | `device.spatial_state.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows`、`StepContext`、设备初始化列表 | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | 内存 `DeviceStatusState next_status` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback：格式错误输入作为本节点 no-op 处理。



### 状态与保留

不直接写 `shared.*`；等待 `device.performance.update` 联合提交。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessDeviceStatusUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 50 项为 `device.status.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `device.spatial_state.update`



### 目的

约束设备相对平台的位移和转动，并投影出平台惯性系、真值和感知坐标。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 设备空间 |

| 执行序号 | 51 |

| 阶段 | Post-commit core chain |

| 上游 | `device.status.update` |

| 下游 | `device.performance.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | 内存 `next_status`、`shared.platform.coordinate`、`StepContext` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | 内存 `DeviceStatusState spatial_status` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback：统一入口使用平台坐标上下文执行空间投影。



### 状态与保留

不直接写 `shared.*`；作为设备联合提交前的中间状态。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessDeviceSpatialStateUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 51 项为 `device.spatial_state.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `device.performance.update`



### 目的

计算设备性能并联合提交设备状态和性能。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 设备性能 |

| 执行序号 | 52 |

| 阶段 | Post-commit core chain |

| 上游 | `device.spatial_state.update` |

| 下游 | `signal.static_generation.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | 内存 `spatial_status`、`current_rows`、`previous_shared_rows`、`StepContext` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.device.status`、`shared.device.performance` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入；`shared.device.performance` 包含伸缩能力字段 `has_extension_capability`、`removable`、`has_extension_rate`、`extension_rate`。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

hard failure：缺少前序状态节点时失败；内部计算使用固定实现。



### 状态与保留

维护 `device_status_state_` 与 `device_performance_state_`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessDevicePerformanceUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 52 项为 `device.performance.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |
