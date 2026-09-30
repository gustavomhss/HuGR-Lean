import pytest


def test_arithmetic():
    assert 2 + 2 == 4


def test_café():
    assert len("🔥".encode("utf-8")) == 4


@pytest.mark.skip(reason="needs network 🔥")
def test_network():
    pass
