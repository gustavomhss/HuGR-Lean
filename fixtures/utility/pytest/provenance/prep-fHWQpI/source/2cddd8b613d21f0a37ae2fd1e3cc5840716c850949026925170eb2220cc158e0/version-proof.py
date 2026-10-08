import json, platform, sys, pytest, pluggy
print(json.dumps({"python": platform.python_version(), "pythonFull": sys.version,
 "pythonExecutable": sys.executable, "pytest": pytest.__version__, "pluggy": pluggy.__version__,
 "pytestModule": pytest.__file__, "pluggyModule": pluggy.__file__}, ensure_ascii=False))