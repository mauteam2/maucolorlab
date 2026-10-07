"""Avoid occupied auxiliary ports on disposable CI runners; keep the API origin fixed."""
import os,re,socket
from pathlib import Path

def configure(text, allocate):
    if 'project_id = "elifora"' not in text:
        raise ValueError('Only the ELIFORA disposable development project is supported')
    assignments={'db':{'port','shadow_port'},'studio':{'port'},'inbucket':{'port','smtp_port','pop3_port'}}
    section=''
    output=[]
    for line in text.splitlines(keepends=True):
        heading=re.fullmatch(r'\[([^]]+)\]\s*',line.strip())
        if heading:section=heading[1]
        entry=re.fullmatch(r'(\w+)\s*=\s*(\d+)\s*',line.strip())
        if entry and entry[1] in assignments.get(section,set()):
            line=f'{entry[1]} = {allocate()}\n'
        output.append(line)
    result=''.join(output)
    # Browser tests and app configuration intentionally use this exact API origin.
    if '[api]\n' not in result or 'port = 54321' not in result:
        raise ValueError('Expected fixed disposable API origin')
    return result

def main():
    if os.environ.get('CI')!='true':
        raise RuntimeError('Auxiliary port allocation is only allowed in disposable CI')
    root=Path(__file__).resolve().parents[1]
    path=root/'supabase/config.toml'
    used=set()
    def allocate():
        while True:
            with socket.socket() as handle:
                handle.bind(('127.0.0.1',0))
                port=handle.getsockname()[1]
            if port not in used:
                used.add(port)
                return port
    path.write_text(configure(path.read_text(),allocate))
    print('Configured disposable auxiliary ports; API stays on localhost:54321.')

if __name__=='__main__':main()
