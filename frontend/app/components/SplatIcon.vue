<script setup lang="ts">
// Droplet arm drawn in local coords: narrow neck at the origin, flaring
// into a round bulb at the tip (pointing up, so -y).
const ARM = 'M-2.4 4Q-2.8-20-9.5-34A9.5 9.5 0 0 1 9.5-34Q2.8-20 2.4 4Z'

// Six arms make the asterisk; the jitter in angle and scale keeps it splattered
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
        r="5"
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
