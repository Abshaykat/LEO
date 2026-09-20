# L.E.O. PC-Free Verification Lab

This lab implements the three PC-independent verification stages requested for L.E.O.

## Stage 1 — Portable software verification
Runs deterministic checks that do not require Windows hardware:
- repository/source integrity checks
- TypeScript typecheck
- unit/integration test discovery
- security-boundary checks
- approval/permission invariants
- agent lifecycle invariants
- workflow persistence invariants
- RAG/memory contract checks
- MCP schema/registry checks
- deployment/configuration checks

Stage 1 never reports a feature as physically Windows-verified.

## Stage 2 — Windows behavior simulation
The simulator models the contracts L.E.O. expects from:
- PowerShell
- filesystem
- processes/windows
- keyboard/mouse
- browser
- Office/PDF
- screenshots

It verifies request -> permission -> approval -> execution -> post-condition -> audit behavior without touching a real desktop.

Simulation is not equivalent to real Windows validation.

## Stage 3 — Windows VM test lab
The PowerShell harness provisions/configures a Windows VM test plan and runs the same deterministic suite inside a disposable VM when a supported hypervisor is available.

The harness records:
- host test results
- VM test results
- artifacts
- screenshots/logs
- PASS/SKIP/FAIL state

Hardware-specific checks remain explicitly UNVERIFIED until physical Windows hardware is available.

## Status semantics

- GREEN = test actually executed and passed
- YELLOW = implemented/checked but environment-dependent
- ORANGE = simulated only
- RED = executed and failed
- SKIP = dependency/environment unavailable

Never convert SKIP/ORANGE into PASS.
