# 目标动作与协同链路



## 结论



目标动作与协同链路覆盖协同消息、库存、发射/投放监督、通道监督和归港状态。



| # | 展示名 | Node | Owner output |

|---:|---|---|---|

| 12 | 协同同步 | `platform.cooperation.message_sync` | 内存 `p06_message_sync_state`、内存同步消息 |

| 13 | 长机更新 | `platform.cooperation.leader_update` | 内存 `p06_leader_state` |

| 14 | 成员更新 | `platform.cooperation.member_update` | `shared.platform.cooperation`、内存 `p06_member_state` |

| 15 | 协同通信 | `platform.cooperation.communication_record` | `shared.communication.outbox.p06` |

| 16 | 诱饵库存 | `platform.decoy_inventory.update` | `shared.platform.decoy` |

| 17 | 炮弹库存 | `platform.bullet_inventory.update` | `shared.platform.bullet` |

| 18 | 导弹库存 | `platform.missile_inventory.update` | `shared.platform.missile` |

| 19 | 弹药库存 | `platform.ammunitor_inventory.update` | `shared.platform.ammunitor` |

| 20 | 搭载库存 | `platform.carriee_inventory.update` | `shared.platform.carriee` |

| 21 | 搭载监督 | `platform.supervise_carriee.update` | `shared.platform.superviseCarriee` |

| 22 | 导弹监督 | `platform.supervise_missile.update` | `shared.platform.superviseMissile`、通道监督 launch handoff |

| 23 | 炮弹监督 | `platform.supervise_canonball.update` | `shared.platform.superviseCanonball`、通道监督 launch handoff |

| 29 | 归港维护 | `platform.homeport.update` | `shared.platform.homeport` |

| 30 | 通道监督 | `platform.supervise_tunnel.update` | `shared.platform.superviseTunnel` |



## `platform.cooperation.message_sync`



### 目的

归并当前步协同消息输入，形成本步同步消息上下文。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 协同同步 |

| 执行序号 | 12 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.coordinate.commit` |

| 下游 | `platform.cooperation.leader_update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | 内存 `p06_message_sync_state`、内存同步消息 | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

no fallback：失败或无输入时不产生新的同步消息。



### 状态与保留

只维护当前步内存上下文。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP06CooperationMessageSync` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 12 项为 `platform.cooperation.message_sync` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.cooperation.leader_update`



### 目的

基于协同消息更新队形或编队 leader 信息。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 长机更新 |

| 执行序号 | 13 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.cooperation.message_sync` |

| 下游 | `platform.cooperation.member_update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | 内存 `p06_message_sync_state`、`current_rows` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | 内存 `p06_leader_state` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

hard failure：缺少 message_sync 时失败。



### 状态与保留

只维护当前步 leader 中间态。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP06CooperationLeaderUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 13 项为 `platform.cooperation.leader_update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.cooperation.member_update`



### 目的

基于 leader 状态更新成员关系并提交协同权威行。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 成员更新 |

| 执行序号 | 14 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.cooperation.leader_update` |

| 下游 | `platform.cooperation.communication_record` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | 内存 `p06_leader_state`、`current_rows` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.cooperation`、内存 `p06_member_state` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

hard failure：缺少 leader_update 时失败。



### 状态与保留

维护 `cooperation_state_`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP06CooperationMemberUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 14 项为 `platform.cooperation.member_update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.cooperation.communication_record`



### 目的

将需要跨平台同步的协同消息转为通信 outbox。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 协同通信 |

| 执行序号 | 15 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.cooperation.member_update` |

| 下游 | `platform.decoy_inventory.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | 内存 `p06_member_state`、同步消息 | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.communication.outbox.p06` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

skip/no-op：无同步消息时不写 outbox。



### 状态与保留

不维护长期状态；outbox 由通信 dispatch 消费。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP06CooperationCommunicationRecord` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 15 项为 `platform.cooperation.communication_record` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.decoy_inventory.update`



### 目的

维护诱饵库存数量和定义引用。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 诱饵库存 |

| 执行序号 | 16 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.cooperation.communication_record` |

| 下游 | `platform.bullet_inventory.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.decoy` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

no fallback：无有效输入时保持当前库存状态。



### 状态与保留

维护 `decoy_state_`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP07DecoyInventoryUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 16 项为 `platform.decoy_inventory.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.bullet_inventory.update`



### 目的

维护炮弹库存数量和定义引用。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 炮弹库存 |

| 执行序号 | 17 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.decoy_inventory.update` |

| 下游 | `platform.missile_inventory.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.bullet` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

no fallback：无有效输入时保持当前库存状态。



### 状态与保留

维护 `bullet_state_`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP08BulletInventoryUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 17 项为 `platform.bullet_inventory.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.missile_inventory.update`



### 目的

维护导弹库存数量和定义引用。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 导弹库存 |

| 执行序号 | 18 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.bullet_inventory.update` |

| 下游 | `platform.ammunitor_inventory.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.missile` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

no fallback：无有效输入时保持当前库存状态。



### 状态与保留

维护 `missile_state_`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP09MissileInventoryUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 18 项为 `platform.missile_inventory.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.ammunitor_inventory.update`



### 目的

维护弹药补给或装填相关库存。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 弹药库存 |

| 执行序号 | 19 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.missile_inventory.update` |

| 下游 | `platform.carriee_inventory.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.ammunitor` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

no fallback：无有效输入时保持当前库存状态。



### 状态与保留

维护 `ammunitor_state_`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP10AmmunitorInventoryUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 19 项为 `platform.ammunitor_inventory.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.carriee_inventory.update`



### 目的

维护搭载或投放对象库存，并记录引擎创建结果。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 搭载库存 |

| 执行序号 | 20 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.ammunitor_inventory.update` |

| 下游 | `platform.supervise_carriee.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.carriee` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback：可向后续搭载监督提供 deploy handoff。



### 状态与保留

维护 `carriee_state_` 与本步 handoff。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP11CarrieeInventoryUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 20 项为 `platform.carriee_inventory.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.supervise_carriee.update`



### 目的

维护搭载对象投放、回收和监督状态。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 搭载监督 |

| 执行序号 | 21 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.carriee_inventory.update` |

| 下游 | `platform.supervise_missile.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows`、搭载库存 handoff | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.superviseCarriee` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback：无显式输入时可消费 搭载库存 handoff。



### 状态与保留

维护 `carriee_supervision_state_`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP13SuperviseCarrieeUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 21 项为 `platform.supervise_carriee.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.supervise_missile.update`



### 目的

维护导弹发射监督状态，并将发射伴随事实交给 通道监督。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 导弹监督 |

| 执行序号 | 22 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.supervise_carriee.update` |

| 下游 | `platform.supervise_canonball.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.superviseMissile`、通道监督 launch handoff | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback：统一入口产生最小监督结构。



### 状态与保留

维护 `missile_supervision_state_`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP14SuperviseMissileUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 22 项为 `platform.supervise_missile.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.supervise_canonball.update`



### 目的

维护炮弹发射监督状态，并将发射伴随事实交给 通道监督。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 炮弹监督 |

| 执行序号 | 23 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.supervise_missile.update` |

| 下游 | `platform.tracking_request.maintain` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.superviseCanonball`、通道监督 launch handoff | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback：统一入口产生最小监督结构。



### 状态与保留

维护 `canonball_supervision_state_`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP15SuperviseCanonballUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 23 项为 `platform.supervise_canonball.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.homeport.update`



### 目的

维护归港和母港相关平台状态。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 归港维护 |

| 执行序号 | 29 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.supervise_tracking.update` |

| 下游 | `platform.supervise_tunnel.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows` | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.homeport` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback。



### 状态与保留

维护 `homeport_state_`。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP17Homeport` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 29 项为 `platform.homeport.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |



## `platform.supervise_tunnel.update`



### 目的

维护通道或管道类执行监督状态，是 channel state 的唯一权威写入节点。



### 位置

| 字段 | 值 |

|---|---|

| 展示名 | 通道监督 |

| 执行序号 | 30 |

| 阶段 | Post-commit core chain |

| 上游 | `platform.homeport.update` |

| 下游 | `platform.status.update` |



### 输入

| Contract | 来源 | 是否必需 | 说明 |

|---|---|---|---|

| 输入集合 | `current_rows`、`previous_shared_rows`、导弹监督/炮弹监督 launch handoff | 是 | 由统一入口按 ordered execution 准备。 |



### 输出

| Contract | 目标 | 生命周期 | 说明 |

|---|---|---|---|

| 输出集合 | `shared.platform.superviseTunnel` | 按 contract 类型 | 输出必须只由本节点或显式 joint commit owner 写入。 |



### 运行时契约

- @pre: 前序节点已按 ordered execution 成功执行，输入 contract 处于当前 tick 的一致快照。

- @post: 节点只更新自己拥有的输出 contract，并追加 `FieldChainAudit`。

- @invariant: 节点不得写入其他节点拥有的 `shared.*` row；in-memory 输出只传给 immediate consumer。

- @failure: 必要输入缺失、输出指针为空或 executor 失败时，按回退策略处理并更新 `last_lifecycle_error_`。



### 回退策略

fixed implementation fallback：无显式 通道监督 输入时可消费 launch supervision handoff。



### 状态与保留

维护 `tunnel_state_`；每步清理 handoff 标记。



### 实现映射

| 层级 | 文件 / 类型 / 函数 |

|---|---|

| C++ unified entry | `D:\Tinder\Model\Model-P-v2\src\l3\unified\unified_model_entry.cpp` |

| Primary function | `UnifiedModelEntry::ProcessP12SuperviseTunnelUpdate` |

| Header contract | `D:\Tinder\Model\Model-P-v2\include\model_p_v2\l3\unified\unified_model_entry.h` |



### 验证

| 检查项 | 期望结果 |

|---|---|

| 执行序号 | `02-ordered-execution.md` 中第 30 项为 `platform.supervise_tunnel.update` |

| Build | `xmake build test-l3-unified-entry` 通过 |
