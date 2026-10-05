# Prints one cell of the terminal Claude Code runs in, in the units the terminal reports its size in: null where the
# terminal reports none, and where no ancestor holds a terminal, as under the desktop app.
import fcntl
import json
import os
import struct
import subprocess
import termios


def terminals(pid):
    while pid > 1:
        parent, tty = subprocess.run(['ps', '-o', 'ppid=,tty=', '-p', str(pid)], capture_output=True, text=True).stdout.split()
        if not tty.startswith('?'):
            yield tty
        pid = int(parent)


def cell(tty):
    terminal = os.open(f'/dev/{tty}', os.O_RDONLY | os.O_NOCTTY | os.O_NONBLOCK)
    rows, columns, width, height = struct.unpack('HHHH', fcntl.ioctl(terminal, termios.TIOCGWINSZ, bytes(8)))
    return {'width': width / columns, 'height': height / rows} if width > 0 else None


tty = next(terminals(os.getppid()), None)
print(json.dumps(tty and cell(tty)))
