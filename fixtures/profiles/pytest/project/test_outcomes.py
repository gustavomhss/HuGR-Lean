import pytest


@pytest.mark.parametrize("value", [0, 1], ids=["zero", "one"])
def test_parameterized(value):
    assert value in (0, 1)


@pytest.mark.parametrize("value", [pytest.param(0, marks=pytest.mark.xfail(reason="R01 expected café 雪 🧪")), pytest.param(1, marks=pytest.mark.xfail(reason="R01 unexpected pass", strict=False)), pytest.param(2, marks=pytest.mark.skip(reason="R01 worker skip"))], ids=["xfail", "xpass", "skip"])
def test_outcome(value):
    assert value == 1
