<template>
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path class="frame" d="M24 3 41 13v22L24 45 7 35V13Z" />
    <path class="bridge" d="M15 31V17m18 14V17M15 25c5-5 13-5 18 0M13 32h22" />
    <path class="core" d="m24 15 3 3-3 3-3-3Z" />
  </svg>
</template>

<style scoped>
svg { width: 100%; height: 100%; overflow: visible; }
.frame { fill: rgba(104,211,194,.07); stroke: #70d6c6; stroke-width: 1.6; }
.bridge { fill: none; stroke: #e7bc70; stroke-width: 2; stroke-linecap: round; }
.core { fill: #f5f2df; stroke: #70d6c6; stroke-width: .5; }
</style>
