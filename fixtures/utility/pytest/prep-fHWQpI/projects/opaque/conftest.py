# SPDX-License-Identifier: MIT
def pytest_terminal_summary(terminalreporter, exitstatus, config):
    terminalreporter.write_line("HUGR_PYTEST_OPAQUE_TERMINAL_SUMMARY café 雪 🧪")
