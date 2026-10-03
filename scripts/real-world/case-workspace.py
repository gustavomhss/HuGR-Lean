"""Read-only source cloning; all child syscalls are relative to pinned directories."""
import base64
import contextlib
import errno
import json
import os
import secrets
import stat
import sys


def reject(name, detail=""):
    raise ValueError(name + (": " + detail if detail else ""))


def identity(s):
    return s.st_dev, s.st_ino, stat.S_IFMT(s.st_mode)


def version(s):
    return identity(s), s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns


def build(request):
    workspace = None
    try:
        if os.name != "posix" or not all(f in os.supports_dir_fd for f in
                (os.open, os.stat, os.mkdir, os.readlink, os.symlink)):
            reject("CASE_WORKSPACE_UNSUPPORTED")
        source, recipes = request["source"], request["changes"]
        if not isinstance(source, str) or not os.path.isabs(source) or not isinstance(recipes, list):
            reject("CASE_INVALID_INPUT")
        changes = {}
        for r in recipes:
            p = r["path"]
            if not isinstance(p, str) or not p or "\0" in p or any(x in ("", ".", "..") for x in p.split("/")):
                reject("CASE_INVALID_PATH", repr(p))
            if p in changes:
                reject("CASE_DUPLICATE_CHANGE", p)
            if not isinstance(r["append"], bool):
                reject("CASE_INVALID_CHANGE", p)
            changes[p] = (r["append"], base64.b64decode(r["bytes"], validate=True))
        with contextlib.ExitStack() as stack:
            directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
            def opened(name, flags, parent=None, mode=0o600):
                fd = os.open(name, flags, mode, dir_fd=parent)
                stack.callback(os.close, fd)
                return fd
            def entry(parent, name):
                return os.stat(name, dir_fd=parent, follow_symlinks=False)
            parent_path, source_name = os.path.split(source.rstrip("/"))
            parent = opened(parent_path or "/", directory_flags)
            before = entry(parent, source_name)
            src = opened(source_name, directory_flags, parent)
            if version(before) != version(os.fstat(src)):
                reject("CASE_SOURCE_CHANGED", source)
            name = ".hugr-case-" + secrets.token_hex(16)
            os.mkdir(name, 0o700, dir_fd=parent)
            workspace = dict(source=source, cwd=os.path.join(parent_path, name), retained=True, sourceReadOnly=True)
            print(json.dumps(dict(workspace=workspace)), file=sys.stderr, flush=True)
            root_stat = entry(parent, name)
            dst = opened(name, directory_flags, parent)
            if identity(root_stat) != identity(os.fstat(dst)):
                reject("CASE_DESTINATION_CHANGED", name)
            sources, destinations = [(parent, source_name, before)], [(parent, name, os.fstat(dst))]
            dirs = {"": (src, dst)}
            def check_source(parent, name, expected):
                if version(entry(parent, name)) != version(expected):
                    reject("CASE_SOURCE_CHANGED", name)
            def leaf(parent, name, data, mode, reader=None):
                flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
                fd = os.open(name, flags, 0o600, dir_fd=parent)
                try:
                    with os.fdopen(fd, "wb", closefd=False) as output:
                        if reader is not None:
                            while True:
                                chunk = os.read(reader, 1024 * 1024)
                                if not chunk:
                                    break
                                output.write(chunk)
                        output.write(data)
                    os.fchmod(fd, stat.S_IMODE(mode))
                    pinned = os.fstat(fd)
                    if identity(entry(parent, name)) != identity(pinned):
                        reject("CASE_DESTINATION_CHANGED", name)
                    destinations.append((parent, name, pinned))
                finally:
                    os.close(fd)
            def clone(s, d, prefix):
                initial = os.fstat(s)
                for n in os.listdir(s):
                    p = prefix + n
                    old = entry(s, n)
                    sources.append((s, n, old))
                    recipe = changes.pop(p, None)
                    if recipe and not recipe[0]:
                        reject("CASE_WOULD_OVERWRITE", p)
                    if recipe and (not stat.S_ISREG(old.st_mode) or old.st_nlink != 1):
                        reject("CASE_APPEND_NOT_SINGLE_REGULAR", p)
                    if stat.S_ISDIR(old.st_mode):
                        child = opened(n, directory_flags, s)
                        if version(old) != version(os.fstat(child)):
                            reject("CASE_SOURCE_CHANGED", p)
                        os.mkdir(n, 0o700, dir_fd=d)
                        new = entry(d, n)
                        owned = opened(n, directory_flags, d)
                        if identity(new) != identity(os.fstat(owned)):
                            reject("CASE_DESTINATION_CHANGED", p)
                        destinations.append((d, n, os.fstat(owned)))
                        dirs[p] = (child, owned)
                        clone(child, owned, p + "/")
                    elif stat.S_ISREG(old.st_mode):
                        fd = os.open(n, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=s)
                        try:
                            if version(old) != version(os.fstat(fd)):
                                reject("CASE_SOURCE_CHANGED", p)
                            leaf(d, n, recipe[1] if recipe else b"", old.st_mode, fd)
                            if version(old) != version(os.fstat(fd)):
                                reject("CASE_SOURCE_CHANGED", p)
                        finally:
                            os.close(fd)
                    elif stat.S_ISLNK(old.st_mode):
                        os.symlink(os.readlink(n, dir_fd=s), n, dir_fd=d)
                        destinations.append((d, n, entry(d, n)))
                    else:
                        reject("CASE_UNSUPPORTED_ENTRY", p)
                    check_source(s, n, old)
                if version(initial) != version(os.fstat(s)):
                    reject("CASE_SOURCE_CHANGED", prefix)
            clone(src, dst, "")
            for p, (append, data) in changes.items():
                parent_name, _, n = p.rpartition("/")
                if parent_name not in dirs:
                    reject("CASE_PARENT_NOT_DIRECTORY", p)
                s, d = dirs[parent_name]
                try:
                    entry(s, n)
                except FileNotFoundError:
                    if append:
                        reject("CASE_APPEND_MISSING", p)
                else:
                    reject("CASE_WOULD_OVERWRITE", p)
                leaf(d, n, data, 0o644)
            for p, (_, d) in dirs.items():
                if p:
                    os.fchmod(d, stat.S_IMODE(os.fstat(dirs[p][0]).st_mode))
            for p, n, old in sources:
                check_source(p, n, old)
            for p, n, pinned in destinations:
                if identity(entry(p, n)) != identity(pinned):
                    reject("CASE_DESTINATION_CHANGED", n)
            # Read-only publication check: cwd must still name the pinned parent.
            if identity(os.stat(parent_path or "/", follow_symlinks=False)) != identity(os.fstat(parent)):
                reject("CASE_DESTINATION_CHANGED", parent_path)
        return dict(ok=True, workspace=workspace)
    except Exception as error:
        code = errno.errorcode.get(error.errno, "CASE_FILESYSTEM") if isinstance(error, OSError) else "CASE_INVALID_INPUT"
        message = str(error)
        if message.startswith("CASE_"):
            code = message.split(":", 1)[0]
        else:
            message = "CASE_FILESYSTEM: " + message if isinstance(error, OSError) else "CASE_INVALID_INPUT: " + message
        return dict(ok=False, workspace=workspace, error=dict(code=code, message=message))


if __name__ == "__main__":
    try:
        result = build(json.load(sys.stdin))
    except Exception as error:
        result = dict(ok=False, workspace=None, error=dict(code="CASE_INVALID_INPUT", message="CASE_INVALID_INPUT: " + str(error)))
    print(json.dumps(result), flush=True)
