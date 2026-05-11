# 控制指令链路

## 结论

控制指令链路把所有标准 `DeviceControl` 输入先归一到统一 transient contract，再投影到导航、设备、信号、库存、监督、通信或打击业务链路。当前代码保留业务投影 rows 作为下游消费入口，但每条已识别标准控制指令都必须经过 `device.control.intake`、`device.control.maintain`、`device.control.resolve` 三个统一控制节点观测；`ControlSwitch`、`ControlExtend`、`ControlEmitBeam`、`ControlDispatch`、`ControlDischarge`、`ControlInform` 和 `ControlStrike` 还必须分别经过独立解析节点承接对应业务 contract。

## 节点顺序

| # | 展示名 | Canonical node id | 输入 | 输出 |
|---:|---|---|---|---|
| 1 | 控制传入 | `device.control.intake` | `transient.device.control.intake.*` | intake audit |
| 2 | 控制维护 | `device.control.maintain` | `transient.device.control.maintain.*` | lifecycle audit |
| 3 | 控制解析 | `device.control.resolve` | `transient.device.control.resolved.*` | resolved audit 与业务投影约束 |
| 4 | 开关解析 | `device.control.switch.resolve` | resolved switch rows | `transient.device.status.device.*` fallback audit |
| 5 | 伸缩解析 | `device.control.extend.resolve` | resolved extend rows | `transient.device.status.device.*.extension_change` fallback audit |
| 6 | 发波解析 | `device.control.emit_beam.resolve` | resolved emit_beam rows | `transient.sgen.device.*` fallback audit |
| 7 | 派出解析 | `device.control.dispatch.resolve` | resolved dispatch rows | `transient.p11.*` fallback audit |
| 8 | 放出解析 | `device.control.discharge.resolve` | resolved discharge rows | 库存 transient + `transient.p12.*` fallback audit |
| 9 | 通知解析 | `device.control.inform.resolve` | resolved inform rows | `transient.communication.request.inform.*` fallback audit |
| 10 | 打击解析 | `device.control.strike.resolve` | resolved strike rows | `transient.strike.request.*` route audit |

## 控制类型路由

| 控制类型 | 统一解析后的目标链路 | 当前业务投影 | 生命周期 / fallback 策略 |
|---|---|---|---|
| `ControlPathway` | `platform.navigation.command.maintain` | `transient.p05.navigation_cmd` | `retain_until_replaced_or_expired` |
| `ControlSwitch` | `device.status.update` | `transient.device.status.device.*` | `fallback(fixed_switch_projection)` |
| `ControlExtend` | `device.spatial_state.update` | `transient.device.status.device.*.extension_change` | `fallback(fixed_extend_projection)` |
| `ControlEmitBeam` | `signal.static_generation.update` | `transient.sgen.device.*` | `fallback(fixed_signal_generation_projection)` |
| `ControlDischarge` | `platform.supervise_tunnel.update` | 库存 transient + `transient.p12.*` | `fallback(fixed_discharge_projection)` |
| `ControlStrike` | `device.control.strike.resolve` -> `strike.route.resolve` | `transient.strike.request.*`；路由节点再写 `transient.strike.route.*` | `current_step_strike_request` |
| `ControlDispatch` | `platform.carriee_inventory.update` | `transient.p11.*` | `fallback(fixed_dispatch_projection)` |
| `ControlInform` | `communication.request.collect` | `transient.communication.request.inform.*` | `current_step` |

## ControlSwitch Fallback

- 同 tick 同设备多条 switch 指令采用最后一条。
- 统一入口不校验 `mode` 合法性；`mode` 是设备侧语义，由设备状态链路或设备实现自行处理。
- 入口只处理可解析 payload。缺少 `mode` 或 SDK mode 为 `-1` 时不覆盖工作模式。
- fallback 固定投影到 `transient.device.status.device.*`，权威状态仍由 `device.status.update` 维护。

## ControlExtend Fallback

- 同 tick 同设备多条 extend 指令采用最后一条。
- fixed fallback 的目标语义对齐旧版 `IterationExtend`：如果设备不可伸缩则跳过不更新；如果存在 `extensionRate`，本 tick `movement` 长度必须剪裁到 `extensionRate * iterStep` 后再执行。
- v2 在 `shared.device.performance` 中暴露 `has_extension_capability`、`removable`、`has_extension_rate`、`extension_rate`。`DeviceControl` 伸缩投影会在进入 `device.status.update` 前读取上一 tick 或初始化得到的能力快照，先完成跳过或剪裁，再输出 `extension_change`。
- 如果没有任何伸缩能力字段，fallback 保持默认行为：按原始 `movement` 投影为 `transient.device.status.device.*.extension_change`。
- 输出只作为 `device.spatial_state.update` / `device.performance.update` 的输入候选，不直接改写权威空间状态。

## ControlEmitBeam Fallback

- 发波指令保持 current-step 生命周期，不跨 tick 保留。
- 统一入口只做 payload 传递和来源标记，不重新解释 beam 结构；设备侧或后续 signal 节点负责 beam 语义校验。
- fixed fallback 投影到 `transient.sgen.device.*.signal_payload` 和 `.source_id`，由 `signal.static_generation.update` 生成 `shared.signal.records`。
- 如果同 tick 同设备多条发波指令进入当前业务投影，后续 `signal.static_generation.update` 按当前 rows 生成信号记录；不在控制解析节点内合并或去重。

## ControlDispatch Fallback

- 派出指令保持 current-step 生命周期，不跨 tick 保留。
- 统一入口只接收可解析 payload；缺少搭载设备或派出对象列表为空时由 `DeviceControl` 入口拒绝。
- fixed fallback 投影到 `transient.p11.*`，包括 `dispatch.allowed`、`generation_allowed`、`engine_create_success`、`inventory.count_delta`、`device_id`、`entity_index` 和 `store_relation_ref`。
- `platform.carriee_inventory.update` 负责权威库存更新和deploy handoff；控制解析节点不直接改写 `shared.platform.carriee`。
- 旧版 `UpdateCarrier` 还包含位置和速度约束；当前 v2 typed dispatch payload 只携带派出对象，因此位置、速度剪裁需要等 contract 显式增加字段后再进入本节点。

## ControlDischarge Fallback

- 放出指令保持 current-step 生命周期，不跨 tick 保留。
- 统一入口只接收可解析 payload；缺少 `object`、`amount` 或位置 / 速度字段不合法时由 `DeviceControl` 入口拒绝。
- fixed fallback 按设备族投影库存 transient：`discharger` 写入 `transient.p07.*`，`castor` 写入 `transient.p10.*`。
- fixed fallback 同时投影 `transient.p12.*`，包括 `queue`、`firing`、`occupying`、`pending_execution`、`executing`、`launched`、`failure_reason`、`countdown` 和 `binding_pending`。
- 库存权威 owner 仍是对应库存节点；通道权威 owner 仍是 `platform.supervise_tunnel.update`。控制解析节点只负责投影可观测性和 fallback audit，不直接改写 `shared.*`。

## ControlInform Target Contract

- `ControlInform` 是通信请求来源，不是 awareness 的快捷入口。
- `device.control.inform.resolve` MUST 输出 `transient.communication.request.inform.*`。
- `ControlInform` 不得直接发布 `event.receive_message_variant`，也不得直接写 `shared.sense.awareness`。
- 通信设备选择、链路可达性、发送结果和接收落地 MUST 由 `75-communication-chain.md` 定义的统一通信链路承接。
- 当前代码已移除直接 receive event 短路路径，`ControlInform` 只进入统一通信发送请求。

## ControlStrike Target Contract

- `ControlStrike` 是打击请求来源，不是通道监督的快捷入口。
- `device.control.strike.resolve` MUST 只输出 `transient.strike.request.*`。
- `strike.route.resolve` MUST 基于 `device_id` 和初始化弹药分类写入 `transient.strike.route.*`。
- `ControlStrike` 不得直接写 `transient.p12.*` 或 `shared.platform.superviseTunnel`。
- 通道、发射、实例生成、弹幕和裁决提交 MUST 由 `65-strike-chain.md` 定义的打击链路承接。

## Runtime Contract

- @pre: `DeviceControl` 已完成 route gating，无法识别或无效 payload 已在入口拒绝。
- @post: 已识别标准控制指令必须生成统一 control transient rows；业务投影 rows 仍按现有下游 contract 生成。
- @invariant: 下游业务节点不得直接重新解释原始 SDK 指针；下游只消费 resolved contract 或业务投影 rows。
- @failure: `device.control.intake`、`device.control.maintain`、`device.control.resolve`、`device.control.switch.resolve`、`device.control.extend.resolve`、`device.control.emit_beam.resolve`、`device.control.dispatch.resolve`、`device.control.discharge.resolve`、`device.control.inform.resolve`、`device.control.strike.resolve` 无计算资源时记录 audit 并不阻断业务投影；payload 无效仍由 `DeviceControl` 入口拒绝。

## 后续收敛

后续可以把业务节点从业务投影 rows 迁移为直接消费 `transient.device.control.resolved.*`。迁移必须逐类进行，优先级建议为开关 / 伸缩、发射波束、投放 / 打击 / 搭载、通信。

## 验证

| 检查项 | 期望结果 |
|---|---|
| `kCoreChainOrder` | 包含 10 个控制指令节点，且位于导航链路之前 |
| `xmake build test-l3-unified-entry` | 构建通过 |
| UTF-8 解码 | 文档无问号占位符和替换字符 |
