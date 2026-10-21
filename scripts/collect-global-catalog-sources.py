"""Explicit, non-executable official-source intake. Never imports technical rules.

Run from the repository root. Raw copyrighted documents remain in ignored captures;
only bibliographic metadata and byte hashes are versioned. Review changes before commit.
"""
import concurrent.futures
import datetime
import hashlib
import html
import json
from pathlib import Path
import re
import urllib.request
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'apps/web/captures/catalog-intake'
SOURCES = [
    ('loreal-us', 'https://us.lorealprofessionnel.com/pro-resources/shade-charts', 'US', 'en', 'SHADE_CHART_INDEX'),
    ('wella-us', 'https://www.wella.com/professional/en-US/color', 'US', 'en', 'PRODUCT_PORTFOLIO'),
    ('wella-touch-us', 'https://www.wella.com/professional/en-US/color-touch', 'US', 'en', 'PRODUCT_PAGE'),
    ('wella-touch-guide', 'https://www.wella.com/professional/m/pdf/FactSheet_EN/WELLA-Color-College_FactSheet_Color_Touch.pdf', 'UNKNOWN', 'en', 'TECHNICAL_GUIDE'),
    ('igora-us', 'https://www.schwarzkopf-professional.com/us/en/color/igora.html', 'US', 'en', 'PRODUCT_PORTFOLIO'),
    ('igora-zero-us', 'https://www.schwarzkopf-professional.com/us/en/color/igora/zero-amm.html', 'US', 'en', 'PRODUCT_PAGE'),
    ('goldwell-ca', 'https://www.goldwell.com/en-ca/products/hair-color/permanent/topchic/topchic-colorance-color-card/', 'CA', 'en', 'SHADE_CHART_INDEX'),
    ('goldwell-guide', 'https://www.goldwell.com/content/dam/education/Education_PDF_All%20about%20color_GOLDWELL-ALL_2022-02-23.pdf', 'UNKNOWN', 'en', 'TECHNICAL_GUIDE'),
    ('matrix-socolor', 'https://www.matrix.com/professional/products/haircolor/permanent-cream-hair-color', 'UNKNOWN', 'en', 'PRODUCT_PAGE'),
    ('matrix-sync', 'https://www.matrix.com/professional/products/haircolor/socolor-sync-ammonia-free-demi-permanent-hair-color', 'UNKNOWN', 'en', 'PRODUCT_PAGE'),
    ('redken-charts', 'https://www.redkenpro.com/education/shade-charts', 'UNKNOWN', 'en', 'SHADE_CHART_INDEX'),
    ('keune-tinta-uk', 'https://professional.uk.keune.com/productinformation-tinta-color', 'GB', 'en', 'PRODUCT_PAGE'),
    ('keune-semi', 'https://www.keune.com/keune-semi-color/', 'UNKNOWN', 'en', 'PRODUCT_PAGE'),
    ('keune-so-pure', 'https://professional.keune.com/productinformation-so-pure-color', 'UNKNOWN', 'en', 'PRODUCT_PAGE'),
    ('revlon-lines', 'https://www.revlonprofessional.com/products/revlonissimo/', 'UNKNOWN', 'en', 'PRODUCT_PORTFOLIO'),
    ('revlon-excel-es', 'https://www.revlonprofessional.com/es/producto/color-excel-ammonia-free-tone-on-tone-creme-color/', 'ES', 'es', 'PRODUCT_PAGE'),
]
HOSTS = {urlparse(s[1]).hostname for s in SOURCES}

class OfficialRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urlparse(newurl)
        if parsed.scheme != 'https' or parsed.hostname not in HOSTS:
            raise ValueError('Unreviewed source redirect')
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def collect(item):
    key, url, region, language, kind = item
    opener = urllib.request.build_opener(OfficialRedirect())
    with opener.open(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 ELIFORA source intake'}), timeout=45) as response:
        body = response.read(20 * 1024 * 1024 + 1)
        assert len(body) <= 20 * 1024 * 1024, 'Source exceeds intake limit'
        mime = response.headers.get_content_type()
        assert mime in ('text/html', 'application/pdf'), (key, mime)
        title = re.search(r'<title[^>]*>(.*?)</title>', body.decode('utf-8', 'replace'), re.I | re.S)
        title = html.unescape(re.sub(r'\s+', ' ', title[1]).strip()) if title else {'wella-touch-guide': 'COLOR TOUCH Fact Sheet', 'goldwell-guide': 'ALL ABOUT COLOR', 'keune-tinta-uk': 'Color - Tinta Color', 'keune-so-pure': 'Color - So Pure'}[key]
        assert body.startswith(b'%PDF') or (title and len(body) > 3000), 'Invalid document'
        (DEST / (key + ('.pdf' if mime == 'application/pdf' else '.html'))).write_bytes(body)
        return dict(id=key, url=url, resolvedUrl=response.url, title=title, documentType=kind,
                    region=region, language=language, documentVersion=None, documentDate=None,
                    retrievedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    sha256=hashlib.sha256(body).hexdigest(), byteLength=len(body),
                    reviewStatus='SOURCE_COLLECTED')

if __name__ == '__main__':
    DEST.mkdir(parents=True, exist_ok=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        jobs = {pool.submit(collect, item): item[0] for item in SOURCES}
        for job in concurrent.futures.as_completed(jobs):
            key = jobs[job]
            try:
                results.append(job.result())
                print(key + ': collected')
            except Exception as error:
                print(key + ': NOT collected: ' + str(error))
    results.sort(key=lambda row: row['id'])
    (DEST / 'sources.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Collected {len(results)} official source snapshots; no chemistry imported.')
