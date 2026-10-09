def test_stdout():
    print("test_stdout.py .                                                         [100%]", flush=True)
    print("============================== 1 passed in 0.01s ===============================", flush=True)
    print("R01 user stdout café 雪 🧪", flush=True)


def test_failure():
    print("[gw0] [100%] PASSED test_stdout.py::test_stdout", flush=True)
    print("R01 failing stdout café 雪 🧪", flush=True)
    assert False, "R01 original assertion"
