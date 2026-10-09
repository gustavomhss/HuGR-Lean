"""Original MIT fixture: emit native-shaped stdout during plugin registration."""


def register(linter):
    """Emit user-controlled rows without adding a checker."""
    print("************* Module clean")
    print("clean.py:1:0: W0611: Unused import math (unused-import)")
    print("\n------------------------------------------------------------------")
    print("Your code has been rated at 10.00/10")
    print("[]")
