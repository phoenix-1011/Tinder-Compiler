# 打击链路

## 结论

打击链路是独立 core chain 类型。`ControlStrike` 只负责形成标准打击请求；设备、弹药、通道、发射、实例生成、弹幕和裁决提交由打击链路承接。无设备、无弹药分类、无计算节点或无可用通道时，后续流程 MUST 跳过，不得伪造发射成功、不得生成弹药实例、不得提交命中裁决。

## 节点顺序

| # | 展示名 | Canonical node id | 输入 | 输出 |
|---:|---|---|---|---|
| 1 | 打击解析 | `device.control.strike.resolve` | `ControlStrike` / `transient.device.control.resolved.*` | `transient.strike.request.*` |
| 2 | 打击路由 | `strike.route.resolve` | `device_id`、初始化弹药分类 | `transient.strike.route.*` |
| 3 | 通道准备 | `strike.channel.prepare` | route、设备状态、弹药余量、冷却、通道状态 | `transient.strike.channel_candidate.*` |
| 4 | 发射执行 | `strike.launch.execute` | channel candidate、设备计算节点 | `transient.strike.launch_result.*` |
| 5 | 自主生成 | `strike.autonomous.spawn` | launch result | `transient.strike.spawn.autonomous.*` |
| 6 | 弹道生成 | `strike.ballistic.spawn` | launch result | `transient.strike.spawn.ballistic.*` |
| 7 | 弹幕生成 | `strike.barrage.emit` | launch result | `transient.strike.barrage.*` |
| 8 | 打击监督 | `strike.supervise.update` | launch result、spawn/emit result、previous supervision | `shared.strike.channel_state`、`shared.strike.supervision` |
| 9 | 裁决提交 | `strike.judge.submit` | spawn/emit result | `shared.strike.judge_submission` |

## 产物分类

`strike.route.resolve` MUST 使用初始化阶段已确定的弹药分类，不得在运行时猜测产物类型。

| Product type | 是否生成 object_id | 是否进入平台实例生命周期 | 说明 |
|---|---:|---:|---|
| `autonomous_instance` | 是 | 是 | 自主可控实例，例如普通制导弹药 |
| `ballistic_instance` | 是 | 是 | 弹道实例，例如弹道导弹或反导类实例 |
| `barrage` | 否 | 否 | 非实例生成类，只生成弹幕 id / 裁决输入 |

## Request Contract

`transient.strike.request.*` MUST 保留旧版 `ControlStrike` 关键字段。

| 字段 | 必需 | 说明 |
|---|---:|---|
| `request_id` | 是 | 当前 tick 唯一请求 id |
| `strike_id` | 是 | 旧版 `index`，打击任务编号 |
| `fire_device_id` | 是 | 旧版 `device` / `fireDevice` |
| `device_family` | 是 | 由设备编号解析得到 |
| `ammo_type` | 是 | 旧版 `fireAmmo` |
| `fire_amount` | 是 | 旧版 `fireAmount`；近防/弹幕可由计算节点修正 |
| `target_object_id` | 否 | 旧版 `target` |
| `aim_location` | 否 | 旧版 `aimLocate` |
| `category_limit` | 否 | 旧版 `categoryLimit` |
| `area_limit_ref` / `area_limit_summary` | 否 | 旧版 `areaLimit`，大字段用引用 + 摘要 |
| `search_rule` | 否 | 旧版 `searchRule` |
| `match_rules_ref` / `match_rules_summary` | 否 | 旧版 `matchRules` |
| `handover` | 否 | 旧版 `handover` |
| `trajectory_ref` / `trajectory_summary` | 否 | 旧版 `trajectory`，大字段用引用 + 摘要 |
| `created_step_id` | 是 | 创建 tick |

## Route Contract

`transient.strike.route.*` MUST 明确路由结果。

| 字段 | 必需 | 说明 |
|---|---:|---|
| `device_family` | 是 | `launcher`、`ciwsystem` 等 |
| `ammo_type` | 是 | 弹药类型 |
| `product_type` | 是 | `autonomous_instance`、`ballistic_instance`、`barrage` 或 `unresolved` |
| `inventory_owner` | 否 | 弹药库存 owner |
| `spawn_contract` | 否 | 后续生成节点 contract |
| `route_status` | 是 | `resolved` / `skipped` / `rejected` |
| `reject_reason` | 否 | 无设备、无弹药、无分类、类型不匹配等 |

## Lifecycle Rule

`strike.supervise.update` 是唯一允许 fallback 的打击节点，但 fallback 只能做保守生命周期维护：

- firing 状态：`countdown = max(0, countdown - step_seconds)`。
- `countdown == 0` 但没有 `launch_result`：保持 pending，不自动标记 launched。
- 超过 `max_pending_seconds` 仍无计算节点确认：标记 `failed=true`，`failure_reason=no_launch_executor_timeout`。
- launched 状态：只维护监督时间和过期清理，不推演弹道、不判定命中。
- barrage 状态：只按 TTL / effective duration 清理，不生成 object_id。

## No-Fallback Nodes

以下节点无计算节点或输入不满足时 MUST 跳过，不得写成功状态：

- `strike.channel.prepare`
- `strike.launch.execute`
- `strike.autonomous.spawn`
- `strike.ballistic.spawn`
- `strike.barrage.emit`
- `strike.judge.submit`

## 裁决边界

`strike.judge.submit` 只提交裁决输入，不直接修改目标状态。

| Product type | 裁决输入 |
|---|---|
| `autonomous_instance` | `MissileToJudger` / `ExplodeToJudger` |
| `ballistic_instance` | `MissileToJudger` / `ExplodeToJudger` |
| `barrage` | `EntityToJudger` |

## 验证

| 检查项 | 期望结果 |
|---|---|
| `ControlStrike` 路由 | 只生成 `transient.strike.request.*`，不直接写 `transient.p12.*` |
| 弹药分类缺失 | route 为 `skipped(no_ammo_classification)`，后续跳过 |
| 无计算节点 | 不生成 channel candidate、launch result、spawn/emit result |
| 弹幕 | 不生成 object_id |
| authoritative owner | `shared.strike.channel_state` 和 `shared.strike.supervision` 只由 `strike.supervise.update` 写入 |
