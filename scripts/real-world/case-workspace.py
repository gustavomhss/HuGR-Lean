"""Read-only source cloning; all child syscalls are relative to pinned directories."""
import base64, json
import contextlib, errno, secrets
import os, shutil, stat, sys
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
            def opened(name, flags, parent=None, mode=0o600, owner=stack):
                fd = os.open(name, flags, mode, dir_fd=parent)
                owner.callback(os.close, fd)
                return fd
            def entry(parent, name):
                return os.stat(name, dir_fd=parent, follow_symlinks=False)
            def check_source(parent, name, expected, fd=None):
                if version(os.fstat(fd) if fd is not None else entry(parent, name)) != version(expected):
                    reject("CASE_SOURCE_CHANGED", name)
            parent_path, source_name = os.path.split(source.rstrip("/"))
            parent = opened(parent_path or "/", directory_flags)
            before = entry(parent, source_name)
            src = opened(source_name, directory_flags, parent)
            check_source(parent, source_name, before, src)
            name = ".hugr-case-" + secrets.token_hex(16)
            os.mkdir(name, 0o700, dir_fd=parent)
            workspace = dict(source=source, cwd=os.path.join(parent_path, name), retained=True, sourceReadOnly=True)
            print(json.dumps(dict(workspace=workspace)), file=sys.stderr, flush=True)
            root_stat = entry(parent, name)
            dst = opened(name, directory_flags, parent)
            if identity(root_stat) != identity(os.fstat(dst)):
                reject("CASE_DESTINATION_CHANGED", name)
            sources, destinations = {"": before}, {"": os.fstat(dst)}
            def leaf(parent, name, relative, data, mode, reader=None):
                flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
                fd = os.open(name, flags, 0o600, dir_fd=parent)
                try:
                    with os.fdopen(fd, "wb", closefd=False) as output:
                        if reader is not None:
                            with os.fdopen(os.dup(reader), "rb") as input:
                                shutil.copyfileobj(input, output, 1024 * 1024)
                        output.write(data)
                    os.fchmod(fd, stat.S_IMODE(mode))
                    pinned = os.fstat(fd)
                    if identity(entry(parent, name)) != identity(pinned):
                        reject("CASE_DESTINATION_CHANGED", name)
                    destinations[relative] = pinned
                finally:
                    os.close(fd)
            def clone(s, d, prefix):
                initial = os.fstat(s)
                for n in os.listdir(s):
                    p = prefix + n
                    old = entry(s, n)
                    sources[p] = old
                    recipe = changes.pop(p, None)
                    if recipe and not recipe[0]:
                        reject("CASE_WOULD_OVERWRITE", p)
                    if recipe and (not stat.S_ISREG(old.st_mode) or old.st_nlink != 1):
                        reject("CASE_APPEND_NOT_SINGLE_REGULAR", p)
                    if stat.S_ISDIR(old.st_mode):
                        with contextlib.ExitStack() as scope:
                            child = opened(n, directory_flags, s, owner=scope)
                            check_source(s, n, old, child)
                            os.mkdir(n, 0o700, dir_fd=d)
                            new = entry(d, n)
                            owned = opened(n, directory_flags, d, owner=scope)
                            if identity(new) != identity(os.fstat(owned)):
                                reject("CASE_DESTINATION_CHANGED", p)
                            destinations[p] = os.fstat(owned)
                            clone(child, owned, p + "/")
                    elif stat.S_ISREG(old.st_mode):
                        fd = os.open(n, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=s)
                        try:
                            check_source(s, n, old, fd)
                            leaf(d, n, p, recipe[1] if recipe else b"", old.st_mode, fd)
                            check_source(s, n, old, fd)
                        finally:
                            os.close(fd)
                    elif stat.S_ISLNK(old.st_mode):
                        os.symlink(os.readlink(n, dir_fd=s), n, dir_fd=d)
                        destinations[p] = entry(d, n)
                    else:
                        reject("CASE_UNSUPPORTED_ENTRY", p)
                    check_source(s, n, old)
                for p in list(changes):
                    parent_name, _, n = p.rpartition("/")
                    if parent_name != prefix.rstrip("/"):
                        continue
                    append, data = changes.pop(p)
                    try:
                        entry(s, n)
                    except FileNotFoundError:
                        if append:
                            reject("CASE_APPEND_MISSING", p)
                    else:
                        reject("CASE_WOULD_OVERWRITE", p)
                    leaf(d, n, p, data, 0o644)
                check_source(None, prefix, initial, s)
                if prefix:
                    os.fchmod(d, stat.S_IMODE(initial.st_mode))
            clone(src, dst, "")
            if changes:
                reject("CASE_PARENT_NOT_DIRECTORY", next(iter(changes)))
            def verify(root, records, measure, error):
                for relative, expected in records.items():
                    fd, parts = root, relative.split("/") if relative else []
                    with contextlib.ExitStack() as scope:
                        for i, n in enumerate(parts[:-1]):
                            pinned = records["/".join(parts[:i + 1])]
                            if identity(entry(fd, n)) != identity(pinned):
                                reject(error, relative)
                            fd = opened(n, directory_flags, fd, owner=scope)
                            if identity(os.fstat(fd)) != identity(pinned):
                                reject(error, relative)
                        actual = entry(fd, parts[-1]) if parts else os.fstat(root)
                        if measure(actual) != measure(expected):
                            reject(error, relative)
            verify(src, sources, version, "CASE_SOURCE_CHANGED")
            verify(dst, destinations, identity, "CASE_DESTINATION_CHANGED")
            check_source(parent, source_name, before)
            if identity(entry(parent, name)) != identity(os.fstat(dst)):
                reject("CASE_DESTINATION_CHANGED", name)
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
