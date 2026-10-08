"""Original MIT native doctest witness.

>>> 2 + 2
4
"""
# SPDX-License-Identifier: MIT
import warnings
import pytest


@pytest.mark.parametrize("item", range(1200))
def test_passing_parameter(item):
    assert item >= 0


def test_builtin_subtests(subtests):
    with subtests.test(case="alpha"):
        assert 2 + 2 == 4
    with subtests.test(case="beta"):
        assert "café".endswith("é")
    with subtests.test(case="skip"):
        pytest.skip("HUGR_PYTEST_SUBSKIP_SENTINEL café 雪 🧪")


@pytest.mark.skip(reason="HUGR_PYTEST_SKIP_SENTINEL café 雪 🧪")
def test_ordinary_skip():
    assert False


def test_warning_context():
    warnings.warn("HUGR_PYTEST_WARNING_CRITICAL_SENTINEL café 雪 🧪", UserWarning)
