"""Real disposable PostgreSQL connections; wait barriers use pg_blocking_pids.

Run only after local Supabase migrations/tests. Docker psql sessions are separate
backend connections, never a shared transaction or mocked Promise.all. Test-only
helpers/fixtures are created in an unexposed schema on the disposable database.
No connection string, key, customer payload or signing material is printed.
"""
from pathlib import Path
import json
import os
import queue
import subprocess
import threading
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = "supabase_db_elifora"
assert os.environ.get("CI") == "true", "Disposable CI database required"


class Session:
    def __init__(self):
        self.process = subprocess.Popen(
            ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )
        self.lines = queue.Queue()
        def collect():
            for line in self.process.stdout:
                self.lines.put(line.rstrip())
            self.lines.put(None)
        threading.Thread(target=collect, daemon=True).start()
        self.pid = int(self.execute("select pg_backend_pid();")[-1])

    def send(self, sql):
        self.end = "gate_barrier_" + uuid.uuid4().hex
        self.process.stdin.write(sql + "\n\\echo " + self.end + "\n")
        self.process.stdin.flush()

    def receive(self, timeout=30):
        result = []
        deadline = time.monotonic() + timeout
        while True:
            line = self.lines.get(timeout=max(.1, deadline-time.monotonic()))
            if line is None:
                raise AssertionError("Database session failed: " + "\n".join(result[-8:]))
            if line == self.end:
                return result
            result.append(line)

    def execute(self, sql):
        self.send(sql)
        return self.receive()

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.write("\\q\n")
            self.process.stdin.flush()
            self.process.wait(timeout=10)


def literal(value):
    return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"


def result(lines):
    return json.loads(next(line for line in reversed(lines) if line.startswith("{")))


def auth(session, user):
    session.execute(f"set role authenticated;set request.jwt.claim.sub='{user}';")


def prefix_fixture(name, stop, table):
    text=(ROOT/"supabase/tests"/name).read_text(encoding="utf-8").split(stop)[0]
    # Assertions in the original pgTAP files are independently executed by CI.
    # Here only fixture creation statements are retained. pg_temp helpers become
    # shared test helpers because concurrent connections cannot see each other's
    # temporary schema. No test helper is part of production migrations.
    lines=[line for line in text.splitlines() if not line.startswith(("begin;", "select no_plan", "select is(", "select ok(", "select throws_ok(", "select lives_ok("))]
    text="\n".join(lines).replace("create temporary table "+table, "create table gate_test."+table).replace("pg_temp.", "gate_test.")
    # Table creation already has schema; qualify remaining references.
    import re
    text=re.sub(r"\b(from|into|on)\s+"+table+r"\b", lambda match: match[1]+" gate_test."+table,text,flags=re.I)
    text=text.replace("gate_test. "+table,"gate_test."+table)
    return text+"\nreset role;"


