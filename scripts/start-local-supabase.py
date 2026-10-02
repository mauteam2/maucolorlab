"""Start disposable local Supabase without exposing CLI credential output."""
import re
import subprocess
import sys


def redact(line: str) -> str:
    if re.search(r"\b(?:Secret Key|Publishable Key|anon key|service_role key|JWT secret)\b", line, re.I):
        return "[local credential output redacted]\n"
    line = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", "[redacted]", line)
    line = re.sub(r"\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+", "[redacted]", line)
    return re.sub(r"\b[a-fA-F0-9]{64}\b", "[redacted]", line)


def main() -> int:
    process = subprocess.Popen(["supabase", "start"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    assert process.stdout is not None
    for line in process.stdout:
        sys.stdout.write(redact(line))
        sys.stdout.flush()
    return process.wait()


if __name__ == "__main__":
    raise SystemExit(main())
