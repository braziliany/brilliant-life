# Health

## 来源与指标

唯一写入来源是经过 API Key 鉴权的 Auto Export Health payload。当前每日指标包括步数、活动能量、静息能量、锻炼分钟、训练次数、睡眠、体重与静息心率。

## 存在性语义

- `metric_coverage = NULL`：早期记录，存在性未知；保留旧统计表现，但不计入可信覆盖天数。
- `[]`：新协议处理过该日，但没有有效指标。
- coverage 包含指标：指标明确 present；数值 0 是有效零值。
- coverage 不包含指标：missing，不进入该指标的新协议分母。

同日多次 ingest 对 coverage 取并集。只有本次明确 present 且有效的指标可以更新数值；missing、null、空值和非法数字不得覆盖既有值。真实新请求可逐步把早期日期转成有指标级信息的记录，但禁止推断或批量回填。

## 同步边界

快捷指令成功不等于服务端收到。只有 Worker 完成鉴权、解析、写入并记录成功 ingest 才算同步成功。详情见[Health 同步可靠性](../03-运维/Health同步可靠性.md)。

## Annual 使用

Annual 区分可信天数、早期记录和明确缺失。早期记录可维持历史统计连续性，但不能伪装成可信 coverage。Health 与 Calendar 的洞察只有样本满足门槛时才输出。
