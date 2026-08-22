<script setup lang="ts">
// The mark reads as an 'O': a thick ink ring with droplet arms flung outward.
// Arms are drawn in local coords with the neck rooted inside the ring band and
// the bulb at the tip (pointing up, so -y).
const ARM = 'M-3 -20Q-3.4-28-7-36A7 7 0 0 1 7-36Q3.4-28 3-20Z'

// Ring geometry: the stroke band spans radius 18.5 -> 31.5.
const RING_R = 25
const RING_W = 13

// Six arms round the ring; the jitter in angle and scale keeps it splattered
// rather than mechanical.
const arms = [
  { angle: 0, scale: 1 },
  { angle: 61, scale: 0.93 },
  { angle: 118, scale: 1.04 },
  { angle: 180, scale: 0.97 },
  { angle: 242, scale: 1.02 },
  { angle: 299, scale: 0.91 }
]

// Flecks thrown off between the arms.
const specks = [
  { angle: 30, dist: 43, r: 3.2 },
  { angle: 90, dist: 42, r: 2.2 },
  { angle: 149, dist: 43, r: 3.2 },
  { angle: 211, dist: 41, r: 2.4 },
  { angle: 270, dist: 45, r: 2.5 },
  { angle: 330, dist: 40, r: 2 }
]
</script>

<template>
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g fill="currentColor">
      <circle
        cx="50"
        cy="50"
        :r="RING_R"
        fill="none"
        stroke="currentColor"
        :stroke-width="RING_W"
      />
      <path
        v-for="arm in arms"
        :key="arm.angle"
        :d="ARM"
        :transform="`translate(50 50) rotate(${arm.angle}) scale(${arm.scale})`"
      />
      <circle
        v-for="speck in specks"
        :key="speck.angle"
        cx="0"
        :cy="-speck.dist"
        :r="speck.r"
        :transform="`translate(50 50) rotate(${speck.angle})`"
      />
    </g>
  </svg>
</template>
