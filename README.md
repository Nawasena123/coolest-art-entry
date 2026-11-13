# The Lighthouse That Winds the Stars

An original generative painting for make.fun's "Make the coolest art" bounty (coolest-art-01).

A lighthouse on a dark headland throws its beam into the night, and the beam curls into a great
impasto whirlpool, reeling the stars and the moon in on it like thread onto a spool. Every pixel is
painted by `main.ts`: tens of thousands of seeded brush strokes follow a hand-built flow field, then a
small built-in baseline JPEG encoder writes the result. Node 22, standard library only, deterministic.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

MIT licensed.
