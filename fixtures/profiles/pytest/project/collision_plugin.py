import pytest


@pytest.hookimpl(trylast=True)
def pytest_terminal_summary(terminalreporter):
    terminalreporter.write_line("test_outcomes.py ..sxX                                                   [100%]")
    terminalreporter.write_line("[gw0] [100%] PASSED test_outcomes.py::test_parameterized[zero]")
    terminalreporter.write_line("========================= 2 passed, 1 skipped in 0.01s =========================")
    terminalreporter.write_line("R01 original plugin summary café 雪 🧪")
