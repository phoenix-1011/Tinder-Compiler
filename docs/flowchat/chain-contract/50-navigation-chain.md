# 导航链路



## 结论



导航链路按 导航链路 五段执行：命令维护、命令解析、移动执行、误差修正、坐标提交。



| # | 展示名 | Node | Owner output |

|---:|---|---|---|

| 25 | 指令维护 | `platform.navigation.command.maintain` | `shared.platform.navigation_command`、内存 `NavigationCommand p05_command_request` |

| 26 | 指令解析 | `platform.navigation.command.resolve` | 内存 `NavigationCommand p05_executable_command` |

| 27 | 机动执行 | `device.mobile_navigation.execute` | 内存 `CoordinateDelta p05_actual_delta` |

| 28 | 导航修正 | `navigation.perception_correction.update` | `shared.navigation.error`、内存 `NavigationCorrectionResultState` |

| 29 | 坐标提交 | `platform.coordinate.commit` | `shared.platform.coordinate` |



## `platform.navigation.command.maintain`



### 目的

维护导航命令请求。新命令覆盖旧命令；无新命令时保留未过期命令；无有效命令时产生停止语义。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 指令维护 |

| 执行序号 | 25 |

| 阶段 | Post-commit core chain |

| 上游 | `strike.judge.submit` |

| 下游 | `platform.navigation.command.resolve` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows`、`StepContext` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.navigation_command`、内存 `NavigationCommand p05_command_request` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback：统一入口按内置命令保留和过期规则维护。



### 状态与保留

维护 `navigation_command_state_`；命令包含请求步、更新时间和过期步。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP05NavigationCommandMaintain` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 25 项为 `platform.navigation.command.maintain` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.navigation.command.resolve`



### 目的

将维护后的导航请求修正为本步可执行命令。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 指令解析 |

| 执行序号 | 26 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.navigation.command.maintain` |

| 下游 | `device.mobile_navigation.execute` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | 内存 `p05_command_request`、`StepContext` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | 内存 `NavigationCommand p05_executable_command` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback：无外部计算资源时使用内置命令解析。



### 状态与保留

不直接写 `shared.*`；执行命令仅供后续节点消费。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP05NavigationCommandResolve` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 26 项为 `platform.navigation.command.resolve` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `device.mobile_navigation.execute`



### 目的

按本步可执行命令计算真实移动增量。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 机动执行 |

| 执行序号 | 27 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.navigation.command.resolve` |

| 下游 | `navigation.perception_correction.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | 内存 `p05_executable_command`、`StepContext` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | 内存 `CoordinateDelta p05_actual_delta` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

no fallback：失败或无资源时不更新空间增量。



### 状态与保留

不直接维护 `shared.*`；只产生本步实际运动增量。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP05MobileNavigationExecute` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 27 项为 `device.mobile_navigation.execute` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `navigation.perception_correction.update`



### 目的

根据实际运动和辅助输入维护导航误差与感知修正。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 导航修正 |

| 执行序号 | 28 |

| 阶段 | Post-commit core chain |

| 上游 | `device.mobile_navigation.execute` |

| 下游 | `platform.coordinate.commit` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | 内存 `p05_actual_delta`、`StepContext`、`shared.navigation_auxiliary_input_set` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.navigation.error`、内存 `NavigationCorrectionResultState` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

skip/no-op：无实际运动增量时不更新导航误差。



### 状态与保留

维护 `navigation_error_state_`；定制设备可通过 shared 辅助输入影响误差。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP05NavigationPerceptionCorrectionUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 28 项为 `navigation.perception_correction.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.coordinate.commit`



### 目的

将真实运动增量和导航误差综合应用到世界真值和平台可见坐标。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 坐标提交 |

| 执行序号 | 29 |

| 阶段 | Post-commit core chain |

| 上游 | `navigation.perception_correction.update` |

| 下游 | `platform.cooperation.message_sync` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | 内存 `p05_actual_delta`、内存 `p05_correction_result`、`StepContext` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.coordinate` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback：统一入口合成真值与 `platform.coordinate`。



### 状态与保留

维护 `coordinate_state_`；同时管理 real/perceived 坐标。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP05PlatformCoordinateCommit` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 29 项为 `platform.coordinate.commit` |

| Build | `xmake build test-l3-unified-entry` 通过 |

