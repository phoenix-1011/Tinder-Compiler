# Ordered Execution

## 结论

统一入口的 core chain 顺序必须逐项匹配 `kCoreChainOrder`。配置中缺少、重排或多出 builtin core chain 都必须在 `Prepared()` 阶段失败。

## 调度项类型

| Kind | 位置 | 说明 |
|---|---|---|
| `builtin_domain_node` | core chain 前 | 执行 Environment、Platform、Signal 三个域运行时节点。 |
| `custom_invocation_node` | core chain 前或后 | 由 runtime config 显式声明和排序。 |
| `builtin_core_chain` | core chain 边界后 | 本文档列出的 81 个 canonical 节点。 |

## Canonical Core Chain Order

| # | 展示名 | Node | Group | Upstream | Downstream |
|---:|---|---|---|---|---|
| 1 | 裁决影响 | `platform.judge.effect.resolve` | platform | `core chain 边界` | `device.judge.effect.process` |
| 2 | 设备裁决 | `device.judge.effect.process` | device | `platform.judge.effect.resolve` | `platform.entity.update` |
| 3 | 实体维护 | `platform.entity.update` | platform | `device.judge.effect.process` | `platform.outlook.update` |
| 4 | 外观维护 | `platform.outlook.update` | platform | `platform.entity.update` | `platform.environment.update` |
| 5 | 环境维护 | `platform.environment.update` | platform | `platform.outlook.update` | `communication.network.update` |
| 6 | 组网维护 | `communication.network.update` | communication | `platform.environment.update` | `communication.receive.intake` |
| 7 | 接收传入 | `communication.receive.intake` | communication | `communication.network.update` | `communication.receive.resolve` |
| 8 | 接收解析 | `communication.receive.resolve` | communication | `communication.receive.intake` | `device.control.intake` |
| 9 | 控制传入 | `device.control.intake` | control | `communication.receive.resolve` | `device.control.maintain` |
| 10 | 控制维护 | `device.control.maintain` | control | `device.control.intake` | `device.control.resolve` |
| 11 | 控制解析 | `device.control.resolve` | control | `device.control.maintain` | `device.control.switch.resolve` |
| 12 | 开关解析 | `device.control.switch.resolve` | control | `device.control.resolve` | `device.control.extend.resolve` |
| 13 | 伸缩解析 | `device.control.extend.resolve` | control | `device.control.switch.resolve` | `device.control.emit_beam.resolve` |
| 14 | 发波解析 | `device.control.emit_beam.resolve` | control | `device.control.extend.resolve` | `device.control.dispatch.resolve` |
| 15 | 派出解析 | `device.control.dispatch.resolve` | control | `device.control.emit_beam.resolve` | `device.control.discharge.resolve` |
| 16 | 放出解析 | `device.control.discharge.resolve` | control | `device.control.dispatch.resolve` | `device.control.inform.resolve` |
| 17 | 通知解析 | `device.control.inform.resolve` | control | `device.control.discharge.resolve` | `device.control.strike.resolve` |
| 18 | 打击解析 | `device.control.strike.resolve` | strike | `device.control.inform.resolve` | `strike.route.resolve` |
| 19 | 打击路由 | `strike.route.resolve` | strike | `device.control.strike.resolve` | `strike.channel.prepare` |
| 20 | 通道准备 | `strike.channel.prepare` | strike | `strike.route.resolve` | `strike.launch.execute` |
| 21 | 发射执行 | `strike.launch.execute` | strike | `strike.channel.prepare` | `strike.autonomous.spawn` |
| 22 | 自主生成 | `strike.autonomous.spawn` | strike | `strike.launch.execute` | `strike.ballistic.spawn` |
| 23 | 弹道生成 | `strike.ballistic.spawn` | strike | `strike.autonomous.spawn` | `strike.barrage.emit` |
| 24 | 弹幕生成 | `strike.barrage.emit` | strike | `strike.ballistic.spawn` | `strike.supervise.update` |
| 25 | 打击监督 | `strike.supervise.update` | strike | `strike.barrage.emit` | `strike.judge.submit` |
| 26 | 裁决提交 | `strike.judge.submit` | strike | `strike.supervise.update` | `platform.navigation.command.maintain` |
| 27 | 指令维护 | `platform.navigation.command.maintain` | navigation | `strike.judge.submit` | `platform.navigation.command.resolve` |
| 28 | 指令解析 | `platform.navigation.command.resolve` | navigation | `platform.navigation.command.maintain` | `device.mobile_navigation.execute` |
| 29 | 机动执行 | `device.mobile_navigation.execute` | navigation | `platform.navigation.command.resolve` | `navigation.perception_correction.update` |
| 30 | 导航修正 | `navigation.perception_correction.update` | navigation | `device.mobile_navigation.execute` | `platform.coordinate.commit` |
| 31 | 坐标提交 | `platform.coordinate.commit` | navigation | `navigation.perception_correction.update` | `platform.cooperation.message_sync` |
| 32 | 协同同步 | `platform.cooperation.message_sync` | cooperation | `platform.coordinate.commit` | `platform.cooperation.leader_update` |
| 33 | 长机更新 | `platform.cooperation.leader_update` | cooperation | `platform.cooperation.message_sync` | `platform.cooperation.member_update` |
| 34 | 成员更新 | `platform.cooperation.member_update` | cooperation | `platform.cooperation.leader_update` | `platform.cooperation.communication_record` |
| 35 | 协同通信 | `platform.cooperation.communication_record` | cooperation | `platform.cooperation.member_update` | `platform.decoy_inventory.update` |
| 36 | 诱饵库存 | `platform.decoy_inventory.update` | inventory | `platform.cooperation.communication_record` | `platform.bullet_inventory.update` |
| 37 | 炮弹库存 | `platform.bullet_inventory.update` | inventory | `platform.decoy_inventory.update` | `platform.missile_inventory.update` |
| 38 | 导弹库存 | `platform.missile_inventory.update` | inventory | `platform.bullet_inventory.update` | `platform.ammunitor_inventory.update` |
| 39 | 弹药库存 | `platform.ammunitor_inventory.update` | inventory | `platform.missile_inventory.update` | `platform.carriee_inventory.update` |
| 40 | 搭载库存 | `platform.carriee_inventory.update` | inventory | `platform.ammunitor_inventory.update` | `platform.supervise_carriee.update` |
| 41 | 搭载监督 | `platform.supervise_carriee.update` | supervision | `platform.carriee_inventory.update` | `platform.supervise_missile.update` |
| 42 | 导弹监督 | `platform.supervise_missile.update` | supervision | `platform.supervise_carriee.update` | `platform.supervise_canonball.update` |
| 43 | 炮弹监督 | `platform.supervise_canonball.update` | supervision | `platform.supervise_missile.update` | `platform.tracking_request.maintain` |
| 44 | 跟踪请求 | `platform.tracking_request.maintain` | tracking | `platform.supervise_canonball.update` | `platform.tracking_target_key.maintain` |
| 45 | 目标键维护 | `platform.tracking_target_key.maintain` | tracking | `platform.tracking_request.maintain` | `platform.tracking_device.resolve` |
| 46 | 跟踪设备 | `platform.tracking_device.resolve` | tracking | `platform.tracking_target_key.maintain` | `platform.tracking_fact.resolve` |
| 47 | 跟踪事实 | `platform.tracking_fact.resolve` | tracking | `platform.tracking_device.resolve` | `platform.supervise_tracking.update` |
| 48 | 跟踪监督 | `platform.supervise_tracking.update` | tracking | `platform.tracking_fact.resolve` | `platform.homeport.update` |
| 49 | 归港维护 | `platform.homeport.update` | supervision | `platform.supervise_tracking.update` | `platform.supervise_tunnel.update` |
| 50 | 通道监督 | `platform.supervise_tunnel.update` | supervision | `platform.homeport.update` | `platform.status.update` |
| 51 | 状态汇总 | `platform.status.update` | platform | `platform.supervise_tunnel.update` | `device.status.update` |
| 52 | 设备状态 | `device.status.update` | device | `platform.status.update` | `device.spatial_state.update` |
| 53 | 设备空间 | `device.spatial_state.update` | device | `device.status.update` | `device.performance.update` |
| 54 | 设备性能 | `device.performance.update` | device | `device.spatial_state.update` | `signal.static_generation.update` |
| 55 | 静态信号 | `signal.static_generation.update` | signal-environment | `device.performance.update` | `device.softkill.emission.generate` |
| 56 | 软杀发射 | `device.softkill.emission.generate` | signal-environment | `signal.static_generation.update` | `environment.signal.lifecycle.manage` |
| 57 | 信号生命周期 | `environment.signal.lifecycle.manage` | signal-environment | `device.softkill.emission.generate` | `environment.signal.generate` |
| 58 | 环境生成 | `environment.signal.generate` | signal-environment | `environment.signal.lifecycle.manage` | `environment.signal.echo_generate` |
| 59 | 回波生成 | `environment.signal.echo_generate` | signal-environment | `environment.signal.generate` | `environment.signal.transform` |
| 60 | 传播转换 | `environment.signal.transform` | signal-environment | `environment.signal.echo_generate` | `softkill.propagation.resolve` |
| 61 | 软杀传播 | `softkill.propagation.resolve` | signal-environment | `environment.signal.transform` | `platform.softkill.effect.resolve` |
| 62 | 平台软杀 | `platform.softkill.effect.resolve` | signal-environment | `softkill.propagation.resolve` | `device.softkill.effect.process` |
| 63 | 设备软杀 | `device.softkill.effect.process` | signal-environment | `platform.softkill.effect.resolve` | `environment.signature.generate` |
| 64 | 特征生成 | `environment.signature.generate` | signal-environment | `device.softkill.effect.process` | `environment.signature.lifecycle.manage` |
| 65 | 特征维护 | `environment.signature.lifecycle.manage` | signal-environment | `environment.signature.generate` | `environment.signature.propagation.resolve` |
| 66 | 特征传播 | `environment.signature.propagation.resolve` | signal-environment | `environment.signature.lifecycle.manage` | `device.signature.receive.process` |
| 67 | 特征接收 | `device.signature.receive.process` | sense | `environment.signature.propagation.resolve` | `sense.signal.intake` |
| 68 | 信号传入 | `sense.signal.intake` | sense | `device.signature.receive.process` | `sense.signal.preprocess` |
| 69 | 信号预处理 | `sense.signal.preprocess` | sense | `sense.signal.intake` | `sense.detection.from_signal` |
| 70 | 信号成检 | `sense.detection.from_signal` | sense | `sense.signal.preprocess` | `sense.detection.from_signature` |
| 71 | 特征成检 | `sense.detection.from_signature` | sense | `sense.detection.from_signal` | `sense.detection.artifact.update` |
| 72 | 假警维护 | `sense.detection.artifact.update` | sense | `sense.detection.from_signature` | `sense.detection.update` |
| 73 | 探测更新 | `sense.detection.update` | sense | `sense.detection.artifact.update` | `sense.observation.from_detection` |
| 74 | 探测成观 | `sense.observation.from_detection` | sense | `sense.detection.update` | `sense.observation.update` |
| 75 | 观测更新 | `sense.observation.update` | sense | `sense.observation.from_detection` | `sense.track.update` |
| 76 | 航迹更新 | `sense.track.update` | sense | `sense.observation.update` | `sense.awareness.update` |
| 77 | 态势融合 | `sense.awareness.update` | sense | `sense.track.update` | `sense.awareness.maintain` |
| 78 | 态势维护 | `sense.awareness.maintain` | sense | `sense.awareness.update` | `communication.request.collect` |
| 79 | 请求汇集 | `communication.request.collect` | communication | `sense.awareness.maintain` | `communication.send.resolve` |
| 80 | 发送解析 | `communication.send.resolve` | communication | `communication.request.collect` | `communication.dispatch.update` |
| 81 | 通信发送 | `communication.dispatch.update` | communication | `communication.send.resolve` | `core chain 结束` |
