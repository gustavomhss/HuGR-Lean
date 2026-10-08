# SPDX-License-Identifier: MIT
def test_assertion_failure():
    actual = "HUGR_PYTEST_ASSERTION_ACTUAL café 雪 🧪"
    expected = "HUGR_PYTEST_ASSERTION_EXPECTED café 雪 🧪"
    assert actual == expected
