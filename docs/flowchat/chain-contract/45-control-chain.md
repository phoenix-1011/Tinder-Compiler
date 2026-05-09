# 控制指令链路

## 结论

控制指令链路把所有标准 `DeviceControl` 输入先归一到统一 transient contract，再投影到导航、设备、信号、库存、监督或通信业务链路。当前代码保留业务投影 rows 作为兼容消费入口，但每条已识别标准控制指令都必须经过 `device.control.intake`、`device.control.maintain`、`device.control.resolve` 三个 core chain 节点观测。

## 节点顺序

| # | 展示名 | Canonical node id | 输入 | 输出 |
|---:|---|---|---|---|
| 1 | 控制传入 | `device.control.intake` | `transient.device.control.intake.*` | intake audit |
| 2 | 控制维护 | `device.control.maintain` | `transient.device.control.maintain.*` | lifecycle audit |
| 3 | 控制解析 | `device.control.resolve` | `transient.device.control.resolved.*` | resolved audit 与业务投影约束 |

## 控制类型路由

| 控制类型 | 统一解析后的目标链路 | 当前业务投影 | 生命周期策略 |
|---|---|---|---|
| `ControlPathway` | `platform.navigation.command.maintain` | `transient.p05.navigation_cmd` | `retain_until_replaced_or_expired` |
| `ControlSwitch` | `device.status.update` | `transient.device.status.device.*` | `project_to_device_status` |
| `ControlExtend` | `device.spatial_state.update` | `transient.device.status.device.*.extension_change` | `current_step` |
| `ControlEmitBeam` | `signal.static_generation.update` | `transient.sgen.device.*` | `current_step` |
| `ControlDischarge` | `platform.supervise_tunnel.update` | 库存 transient + `transient.p12.*` | `project_to_action_supervision` |
| `ControlStrike` | `platform.supervise_tunnel.update` | `transient.p12.*` | `project_to_action_supervision` |
| `ControlDispatch` | `platform.carriee_inventory.update` | `transient.p11.*` | `project_to_action_supervision` |
| `ControlInform` | `sense.awareness.maintain` 或通信 outbox | `event.receive_message_variant` | `current_step` |

## Runtime Contract

- @pre: `DeviceControl` 已完成 route gating，无法识别或无效 payload 已在入口拒绝。
- @post: 已识别标准控制指令必须生成统一 control transient rows；业务投影 rows 仍按现有下游 contract 生成。
- @invariant: 下游业务节点不得直接重新解释原始 SDK 指针；下游只消费 resolved contract 或兼容投影 rows。
- @failure: `device.control.intake`、`device.control.maintain`、`device.control.resolve` 无计算资源时记录 audit 并不阻断业务投影；payload 无效仍由 `DeviceControl` 入口拒绝。

## 后续收敛

后续可以把业务节点从兼容投影 rows 迁移为直接消费 `transient.device.control.resolved.*`。迁移必须逐类进行，优先级建议为开关/伸缩、发射波束、投放/打击/搭载、通信。

## 验证

| 检查项 | 期望结果 |
|---|---|
| `kCoreChainOrder` | 包含 3 个控制指令节点，且位于导航链路之前 |
| `xmake build test-l3-unified-entry` | 构建通过 |
| UTF-8 解码 | 文档无问号占位符和替换字符 |
