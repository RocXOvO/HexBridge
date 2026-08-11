<script setup lang="ts">
import { computed } from 'vue'
import LogoMark from './logo-mark.vue'
import { api, useRuntime } from './state'
const { state } = useRuntime()
const current = computed(() => state.value.candidates.find((item) => item.isCurrent))
const bench = computed(() => state.value.candidates.filter((item) => !item.isCurrent))
const metric = (value: number | null, rate = false) => value == null ? '—' : rate ? `${(value * 100).toFixed(1)}%` : `T${value}`
</script>

<template>
  <div class="panel-window" data-performance="eco">
    <header class="panel-title"><div><LogoMark /><b>HexBridge</b><span>选人助手</span></div><button @click="api.windowAction('close')">×</button></header>
    <section v-if="current" class="panel-current"><div class="panel-current-bg" :style="{ backgroundImage: `url(${current.splashUrl})` }" /><div class="panel-current-content"><img :src="current.iconUrl" /><div><small>当前英雄</small><h1>{{ current.name }}</h1><p>{{ current.roles.join(' · ') }}</p></div><span v-if="current.isBest">首选</span></div><div class="panel-metrics"><div><small>强度</small><b>{{ metric(current.tier) }}</b></div><div><small>胜率</small><b>{{ metric(current.winRate, true) }}</b></div></div></section>
    <section class="panel-bench"><header><b>备战席</b><small>已按推荐排序</small></header><TransitionGroup name="reorder" tag="div" class="panel-list"><article v-for="item in bench" :key="item.id" :class="{ best: item.isBest }"><img :src="item.iconUrl" /><div><b>{{ item.name }}</b><small>{{ item.roles[0] || '未知' }}</small></div><span>{{ metric(item.tier) }}</span><strong>{{ metric(item.winRate, true) }}</strong><em v-if="item.isBest">首选</em></article></TransitionGroup><div v-if="!bench.length" class="panel-empty">等待备战席英雄</div></section>
    <footer><i :class="{ ok: state.lcu.connected }" />{{ state.lcu.connected ? 'LCU 只读同步' : '等待 LCU' }}<span>{{ state.api.status === 'stale' ? '数据已过期' : '数据' }} {{ state.api.dataVersion || '—' }}</span></footer>
  </div>
</template>
