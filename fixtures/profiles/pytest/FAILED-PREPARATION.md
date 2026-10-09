# Incomplete first capture attempt

First recipe invocation reached the first native process, then failed while writing
`serial-outcomes.txt` with:

```
OSError: [Errno 28] No space left on device: '/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-native-v2-R01/fixtures/profiles/pytest/serial-outcomes.txt'
```

No receipt or complete corpus resulted. That process's in-memory stdout was lost when
the recipe exited; temporary project was cleaned by its context manager. This is
failed preparation evidence, not a usable native capture. Later capture is a new run.
