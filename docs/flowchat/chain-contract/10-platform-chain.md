# 平台基础链路



## 结论



平台基础链路维护平台实体、状态、外观和环境上下文，是后续导航、设备、信号与感知链路的基础输入。



| # | 展示名 | Node | Owner output |

|---:|---|---|---|

| 1 | 实体维护 | `platform.entity.update` | `shared.platform.entity` |

| 2 | 外观维护 | `platform.outlook.update` | `shared.platform.outlook` |

| 3 | 环境维护 | `platform.environment.update` | `shared.platform.environment` |

| 49 | 状态汇总 | `platform.status.update` | `shared.platform.status` |



## `platform.entity.update`



### 目的

维护平台实体基础资料，将初始化数据和当前步输入归并为平台实体权威状态。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 实体维护 |

| 执行序号 | 1 |

| 阶段 | Post-commit core chain |

| 上游 | `core chain 边界` |

| 下游 | `platform.outlook.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows`、平台初始化上下文 | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.entity` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback：统一入口维护基础实体行。



### 状态与保留

维护 `entity_state_`；当前输入覆盖，否则沿用上一状态。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP01Entity` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 1 项为 `platform.entity.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.outlook.update`



### 目的

维护平台外观、朝向和展示侧可见状态。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 外观维护 |

| 执行序号 | 2 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.entity.update` |

| 下游 | `platform.environment.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `previous_shared_rows`、`StepContext` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.outlook` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback。



### 状态与保留

维护 `outlook_state_`；每步刷新可推导字段。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP03Outlook` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 2 项为 `platform.outlook.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.environment.update`



### 目的

维护平台侧环境上下文，供导航、信号和感知链路消费。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 环境维护 |

| 执行序号 | 3 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.outlook.update` |

| 下游 | `communication.network.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows`、`StepContext` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.environment` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback。



### 状态与保留

维护 `environment_state_`；每步刷新环境摘要。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP04Environment` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 3 项为 `platform.environment.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.status.update`



### 目的

维护平台运行状态汇总，是平台基础链路的状态收口节点。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 状态汇总 |

| 执行序号 | 49 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.supervise_tunnel.update` |

| 下游 | `device.status.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows`、`StepContext` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.status` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback。



### 状态与保留

维护 `status_state_`；每步提交平台状态。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP02Status` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 49 项为 `platform.status.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |

