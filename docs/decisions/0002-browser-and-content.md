# ADR 0002: Babylon WebGL and typed content

Accepted 2026-10-17. Use TypeScript/Vite and Babylon's WebGL engine for picking, scene graphs, materials and future animation. Three.js is a credible smaller renderer but needs more assembly. Godot's editor/export workflow is not currently needed. WebGPU is optional future work. Procedural original armor and animation avoid an early art pipeline.

Validated JSON defines abilities and form references; a finite typed effect enum handles current mechanics. Add scheduling/effects when actually used, not a generic scripting/plugin framework. Forms select kits rather than hardcoded class branches.

Official sources consulted 2026-10-17:
- [Babylon engine implementations](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUInternals/webGPUOverview.md).
- [Babylon instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/instances).
- [Babylon skeleton costs](https://doc.babylonjs.com/features/featuresDeepDive/mesh/bonesSkeletons).
- [Three.js fundamentals](https://threejs.org/manual/pages/fundamentals.html).

Consequences: production art needs measured draw-call, skeleton, VFX and texture budgets. Selecting a renderer does not solve 80-player rendering. Combat scheduling remains independent of rendering frames.
