"""Encrypted logical pilot backup primitives. No provider credentials in output.

The operator supplies fresh DSNs/passwords and a separately escrowed 32-byte key.
Keep the archive outside the checkout. This tool does not claim PITR, scheduling,
off-site custody or successful restore merely because encryption succeeded.
"""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import io
import json
import os
import subprocess
import re
import zipfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b'ELIFORA-PILOT-BACKUP-1\n'
SCHEMAS = ('public', 'app_private', 'auth', 'storage', 'supabase_migrations')
PLATFORM_HISTORY = ('auth.schema_migrations', 'storage.migrations', 'supabase_migrations.schema_migrations',
                    'storage.buckets_vectors', 'storage.vector_indexes')

def run(command, env, data=None):
    result = subprocess.run(command, input=data, env=env, capture_output=True, timeout=600)
    if result.returncode:
        # Tool stderr can contain connection/configuration or row payloads.
        error = result.stderr.decode(errors='replace')
        categories = ('permission denied', 'duplicate key value', 'violates foreign key', 'unrecognized configuration parameter', 'violates check constraint', 'must be owner', 'does not exist')
        category = next((x.replace(' ','_') for x in categories if x in error), 'unclassified')
        table = re.search(r'COPY failed for table "([a-z_]+)"', error)
        raise RuntimeError('POSTGRES_TOOL_FAILED_' + Path(command[0]).stem + '_' + category + ('_'+table[1] if table else ''))
    return result.stdout

def database_files(pg_dump, dsn, env):
    common = [str(pg_dump), '--dbname', dsn, '--no-owner']
    for schema in SCHEMAS:
        common += ['--schema', schema]
    schema = run(common + ['--schema-only'], env)
    args = common + ['--data-only', '--format=custom']
    for table in PLATFORM_HISTORY:
        args += ['--exclude-table-data', table]
    return {'database.schema.sql': schema, 'database.data.dump': run(args, env)}

def seal(files, key, path, context):
    if len(key) != 32:
        raise ValueError('BACKUP_KEY_REQUIRED')
    root = Path(__file__).resolve().parents[1]
    path = Path(path).resolve()
    if path.is_relative_to(root):
        raise ValueError('BACKUP_MUST_BE_OUTSIDE_CHECKOUT')
    manifest = {'schemaVersion': 1, 'capturedAt': datetime.now(timezone.utc).isoformat(),
                'context': context, 'files': {name: {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)} for name, data in files.items()}}
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            if name.startswith('/') or '..' in Path(name).parts:
                raise ValueError('INVALID_ARCHIVE_PATH')
            archive.writestr(name, data)
        archive.writestr('manifest.json', json.dumps(manifest))
    nonce = os.urandom(12)
    encrypted = MAGIC + nonce + AESGCM(key).encrypt(nonce, stream.getvalue(), MAGIC)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation prevents silently replacing an earlier recovery point.
    with path.open('xb') as output:
        output.write(encrypted)
    return {'archive': str(path), 'ciphertextSha256': hashlib.sha256(encrypted).hexdigest(),
            'capturedAt': manifest['capturedAt'], 'files': manifest['files']}

def unseal(path, key):
    encrypted = Path(path).read_bytes()
    if not encrypted.startswith(MAGIC):
        raise ValueError('INVALID_BACKUP')
    nonce = encrypted[len(MAGIC):len(MAGIC)+12]
    clear = AESGCM(key).decrypt(nonce, encrypted[len(MAGIC)+12:], MAGIC)
    with zipfile.ZipFile(io.BytesIO(clear)) as archive:
        manifest = json.loads(archive.read('manifest.json'))
        files = {name: archive.read(name) for name in manifest['files']}
    for name, entry in manifest['files'].items():
        if hashlib.sha256(files[name]).hexdigest() != entry['sha256'] or len(files[name]) != entry['bytes']:
            raise ValueError('BACKUP_INTEGRITY_FAILED')
    return files, manifest

def restore_data(psql, pg_restore, target_dsn, env, files):
    # Caller must independently verify this is the dedicated empty synthetic
    # restore project, matching migrated schema and disabled outbound providers.
    # The canonical source is never a valid target for this function.
    if os.environ.get('ELIFORA_ISOLATED_SYNTHETIC_RESTORE') != 'true':
        raise ValueError('ISOLATED_SYNTHETIC_RESTORE_REQUIRED')
    from urllib.parse import urlparse
    destination = urlparse(target_dsn)
    target = 'ynfsbgvilkyvmpyncufx'
    if destination.username != 'postgres.'+target and destination.hostname != 'db.'+target+'.supabase.co':
        raise ValueError('WRONG_RESTORE_TARGET')
    sql = """select string_agg(format('%I.%I',schemaname,tablename),',')
    from pg_tables where schemaname in ('public','app_private','auth','storage')
    and (schemaname,tablename) not in (('auth','schema_migrations'),('storage','migrations'),
      ('storage','buckets_vectors'),('storage','vector_indexes'));"""
    tables = run([str(psql), target_dsn, '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], env).decode().strip()
    if not tables:
        raise ValueError('MIGRATED_RESTORE_TARGET_REQUIRED')
    # A pooler may ignore startup PGOPTIONS. Set replication mode explicitly in
    # the SAME transaction/connection as COPY; otherwise Auth/domain triggers
    # can generate duplicate profiles, audit or ledger projections on restore.
    clear = run([str(pg_restore), '--data-only', '--no-owner', '--no-privileges', '--file=-'], env, files['database.data.dump'])
    prefix = ('set local session_replication_role=replica;\ntruncate table '+tables+' cascade;\n').encode()
    run([str(psql), target_dsn, '-X', '--single-transaction', '-v', 'ON_ERROR_STOP=1'], env, prefix+clear)

if __name__ == '__main__':
    raise SystemExit('Use the reviewed operator procedure in docs/pilot-recovery-closure.md; secrets are environment/memory inputs, never CLI arguments.')
