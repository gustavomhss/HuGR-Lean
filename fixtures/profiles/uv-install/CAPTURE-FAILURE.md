# Initial collector failure — not an admitted capture

Initial collector expected exit 1 for the original no-build backend command. Native uv
returned exit 2. Terminal preserved this exact command-output excerpt (not a substitute
for the missing earlier raw packet, and not part of final captured cases):

```text
Using Python 3.14.5 environment at: pip-env
Resolved 1 package in 2ms
error: Failed to prepare distributions
  Caused by: Building source distributions is disabled, but attempted to build `p06-backend`
```

Collector exception:

```text
RuntimeError: P06-pip-no-build-backend-refusal: expected 1, got 2
```

Correction changed collector expectation to 2, not native command or output. Final
packet was recaptured in a new isolated root with per-case checkpointing. First attempt
ran no integrity negative control; final packet ran exactly one.
