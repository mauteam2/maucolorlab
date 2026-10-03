"""Read-only official-source change check. Never verifies or publishes a catalog."""
import hashlib,json,shutil,subprocess
from pathlib import Path
from urllib.parse import urlparse

def check(manifest):
    results=[]
    for source in manifest['sources']:
        parsed=urlparse(source['sourceUrl'])
        if parsed.scheme!='https' or parsed.netloc!='dm.henkel-dam.com' or not parsed.path.startswith('/is/content/henkel/'):
            raise ValueError('Unqualified official source URL')
        curl=shutil.which('curl.exe') or shutil.which('curl')
        if not curl:
            raise RuntimeError('curl is required for the bounded official-source check')
        # curl supplies a total deadline, including DNS/TLS and streaming. It
        # does not follow redirects; no shell interpolates the source URL.
        data=subprocess.check_output([curl,'--fail','--silent','--show-error','--proto','=https','--connect-timeout','10','--max-time','45','--max-filesize',str(40*1024*1024),source['sourceUrl']],timeout=50)
        if len(data)>40*1024*1024 or not data.startswith(b'%PDF-'):
            raise ValueError('Expected bounded official PDF; redirects require fresh qualification')
        digest=hashlib.sha256(data).hexdigest()
        results.append({'sourceId':source['id'],'contentSha256':digest,'status':'UNCHANGED' if digest==source['contentSha256'] else 'CHANGED_NEW_DRAFT_REQUIRED'})
    return results

if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]
    manifest=json.loads((root/'contracts/catalogs/schwarzkopf-igora-royal-absolutes.json').read_text(encoding='utf-8'))
    print(json.dumps(check(manifest),indent=2))
