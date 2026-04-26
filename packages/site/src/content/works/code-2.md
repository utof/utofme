---
type: code
title: "Hello world utility"
date: 2026-03-15
tags: ["utility"]
stack: ["bun"]
repo: "https://github.com/utof/hello-world"
summary: "Production-visible code fixture."
---

Hello world body.

This utility started as a weekend experiment to verify that the build pipeline was producing the expected output. It reads a small configuration file, applies a set of transformations, and writes the result to stdout. The surface area is intentionally minimal so the binary stays under two hundred lines.

Automated tests cover the happy path, the empty-input edge case, and the error branch where the configuration file is missing. Each test runs in under fifty milliseconds so the full suite finishes in a single second on any modern machine.

The project uses Bun as its runtime and ships with a single dependency. The lockfile is committed so every contributor gets the same version without a resolution step. Pull requests that introduce new dependencies are reviewed carefully to keep the closure small.
