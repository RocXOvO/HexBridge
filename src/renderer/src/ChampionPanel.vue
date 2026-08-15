<script setup lang="ts">
import { computed } from 'vue'
import { describeMatchStatus } from '../../shared/match-status'
import LogoMark from './logo-mark.vue'
import { api, useRuntime } from './state'
const { state } = useRuntime()
const current = computed(() => state.value.candidates.find((item) => item.isCurrent))
const bench = computed(() => state.value.candidates.filter((item) => !item.isCurrent))
const recognizedChampionMissingData = computed(() =>
  state.value.snapshot.currentChampionId != null && !current.value,
)
const tencentRecommendation = computed(() => state.value.recommendation.source === 'tencent101')
const handoff = computed(() => state.value.snapshot.matchStage === 'launching')
const matchStatus = computed(() => describeMatchStatus(state.value.snapshot, state.value.lcu.connected))
const metric = (value: number | null, rate = false) => value == null
  ? '—'
  : rate ? `${(value * 100).toFixed(1)}%` : tencentRecommendation.value ? `#${value}` : `T${value}`
const championPickRate = (value: number | null | undefined) => value == null ? '暂无数据' : `${(value * 100).toFixed(1)}%`
</script>

<template>
  <div class="panel-window" data-performance="eco">
    <header class="panel-title"><div><LogoMark /><b>HexBridge</b><span>{{ handoff ? '进入游戏中' : '选人助手' }}</span></div><button @click="api.windowAction('close')">×</button></header>
    <section v-if="current" class="panel-current"><div class="panel-current-bg" :style="{ backgroundImage: `url(${current.splashUrl})` }" /><div class="panel-current-content"><img :src="current.iconUrl" /><div><small>当前英雄</small><h1>{{ current.name }}</h1><p>{{ current.title || '海克斯大乱斗' }}</p></div><span v-if="current.isBest">首选</span></div><div :class="['panel-metrics', { tencent: tencentRecommendation }]"><div><small>{{ tencentRecommendation ? '腾讯排名' : '强度' }}</small><b>{{ metric(current.tier) }}</b></div><div><small>{{ tencentRecommendation ? '腾讯榜胜率' : '胜率' }}</small><b>{{ metric(current.winRate, true) }}</b></div><div v-if="tencentRecommendation"><small>英雄选取率</small><b>{{ championPickRate(current.championPickRate) }}</b></div></div></section>
    <section v-else-if="recognizedChampionMissingData" class="panel-data-missing"><LogoMark /><div><small>已识别英雄</small><b>英雄 #{{ state.snapshot.currentChampionId }}</b><p>英雄数据目录未就绪，请在主窗口设置中刷新数据。</p></div></section>
    <section v-if="!handoff" class="panel-bench"><header><b>备战席</b><small>已按推荐排序</small></header><TransitionGroup name="reorder" tag="div" class="panel-list"><article v-for="item in bench" :key="item.id" :class="{ best: item.isBest }"><img :src="item.iconUrl" /><div><b>{{ item.name }}</b><small>{{ item.title || '可选英雄' }}</small></div><span>{{ metric(item.tier) }}</span><strong>{{ metric(item.winRate, true) }}</strong><small v-if="tencentRecommendation" class="panel-pick-rate">选取 {{ championPickRate(item.championPickRate) }}</small><em v-if="item.isBest">首选</em></article></TransitionGroup><div v-if="!bench.length" class="panel-empty">等待备战席英雄</div></section>
    <section v-else class="panel-handoff"><LogoMark /><div><small>游戏客户端交接中</small><b>选人已结束，本局英雄已保留</b><p>正在等待游戏客户端启动，不会因 LCU 交接清空当前英雄。</p></div></section>
    <footer><i :class="{ ok: state.lcu.connected || handoff }" />{{ matchStatus.label }}<span>{{ state.recommendation.source === 'tencent101' ? '腾讯数据站' : 'data.dtodo' }} {{ state.recommendation.statisticsDate || state.recommendation.dataVersion || '—' }}<template v-if="state.recommendation.stale"> · 缓存</template></span></footer>
  </div>
</template>
