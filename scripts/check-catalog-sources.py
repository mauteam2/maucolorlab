"""Read-only official-source change check. Never verifies or publishes a catalog."""
import hashlib,json
from pathlib import Path
from urllib.request import Request,urlopen,HTTPRedirectHandler,build_opener
from urllib.parse import urlparse

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        raise RuntimeError('Redirect requires separate official source qualification')

def check(manifest):
    results=[]
    for source in manifest['sources']:
        parsed=urlparse(source['sourceUrl'])
        if parsed.scheme!='https' or parsed.netloc!='dm.henkel-dam.com' or not parsed.path.startswith('/is/content/henkel/'):
            raise ValueError('Unqualified official source URL')
        request=Request(source['sourceUrl'],headers={'User-Agent':'ELIFORA-source-change-check/1.0'})
        with build_opener(NoRedirect).open(request,timeout=30) as response:
            data=response.read(40*1024*1024+1)
            if len(data)>40*1024*1024 or not data.startswith(b'%PDF-'):
                raise ValueError('Expected bounded official PDF')
        digest=hashlib.sha256(data).hexdigest()
        results.append({'sourceId':source['id'],'contentSha256':digest,'status':'UNCHANGED' if digest==source['contentSha256'] else 'CHANGED_NEW_DRAFT_REQUIRED'})
    return results

if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]
    manifest=json.loads((root/'contracts/catalogs/schwarzkopf-igora-royal-absolutes.json').read_text(encoding='utf-8'))
    print(json.dumps(check(manifest),indent=2))
