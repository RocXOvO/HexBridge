<template>
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path class="frame" d="M24 3 41 13v22L24 45 7 35V13Z" />
    <path class="bridge" d="M14 28c3-8 7-12 10-12s7 4 10 12M13 31h22" />
    <circle class="core" cx="24" cy="16" r="2.8" />
  </svg>
</template>

<style scoped>
svg { width: 100%; height: 100%; overflow: visible; }
.frame { fill: rgba(121,184,173,.08); stroke: #79b8ad; stroke-width: 1.7; }
.bridge { fill: none; stroke: #d4b66f; stroke-width: 2.1; stroke-linecap: round; }
.core { fill: #f1f3f2; }
</style>
