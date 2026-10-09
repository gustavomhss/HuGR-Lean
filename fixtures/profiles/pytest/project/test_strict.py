import pytest


@pytest.mark.xfail(reason="R01 strict xpass", strict=True)
def test_strict():
    assert True
