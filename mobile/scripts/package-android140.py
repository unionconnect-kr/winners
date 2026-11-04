"""Package 1.41 security web assets over the hash-pinned 1.39 staging native shell.
No signing material is consumed; sign the result separately with its original key.
"""
from pathlib import Path
import zipfile,struct,re,hashlib,copy,json,argparse
p=argparse.ArgumentParser();p.add_argument('--base',required=True);p.add_argument('--assets',required=True);p.add_argument('--out',required=True);a=p.parse_args()
base=Path(a.base);assets=Path(a.assets);out=Path(a.out)
assert hashlib.sha256(base.read_bytes()).hexdigest()=='acd90c8028a5f878093f68aa3bf5e01effc3911f6c02289f585793791b8429ba','Unexpected baseline APK'
z=zipfile.ZipFile(base);m=bytearray(z.read('AndroidManifest.xml'));resources=[];off=8;version_changed=False
while off<len(m):
 typ,head,size=struct.unpack_from('<HHI',m,off);assert size>0
 if typ==0x180:resources=list(struct.unpack_from('<'+'I'*((size-head)//4),m,off+head))
 if typ==0x102:
  start,each,count=struct.unpack_from('<HHH',m,off+24)
  for i in range(count):
   at=off+16+start+i*each;name=struct.unpack_from('<I',m,at+4)[0]
   if name<len(resources) and resources[name]==0x0101021b:
    assert struct.unpack_from('<I',m,at+16)[0]==40
    struct.pack_into('<I',m,at+16,42);version_changed=True
 off+=size
assert version_changed
for encoding in ['utf-8','utf-16le']:
 old='1.39-sector1-4-test'.encode(encoding);new='1.41-sector1-4-test'.encode(encoding)
 if old in m:
  assert len(old)==len(new);m=m.replace(old,new);break
else:raise ValueError('Missing baseline version name')
config=json.loads(z.read('assets/capacitor.config.json'));config['android']['zoomEnabled']=False
info=json.loads((assets/'build-info.json').read_text());assert info['platform']=='android' and info['environment']=='staging' and info['versionCode']==42
html=(assets/'index.html').read_text()
for forbidden in ['__QA','sb_secret_','SOLAPI_API_SECRET','SOLAPI_API_KEY','fixture-only','40일','매니 1.39','manee_ios_push_context']:
 assert forbidden not in html,forbidden
assert "...smsProofPayload('signup_staff')" in html
assert (assets/'native.js').read_bytes().startswith(z.read('assets/public/native.js'))
changed=[];written=set();out.parent.mkdir(parents=True,exist_ok=True)
def put(archive,info,data):
 # Align every uncompressed entry. Native libraries receive 16 KiB alignment.
 info=copy.copy(info);info.extra=b''
 if info.compress_type==zipfile.ZIP_STORED:
  alignment=16384 if info.filename.endswith('.so') else 4
  pos=archive.fp.tell()+30+len(info.filename.encode('utf8'))
  if pos%alignment:
   pad=(-(pos+4))%alignment;info.extra=struct.pack('<HH',0xffff,pad)+b'\0'*pad
 archive.writestr(info,data)
with zipfile.ZipFile(out,'w') as w:
 for entry in z.infolist():
  n=entry.filename
  if n=='META-INF/MANIFEST.MF' or re.fullmatch(r'META-INF/[^/]+\.(SF|RSA|DSA|EC)',n):continue
  old=z.read(n);data=old
  if n=='AndroidManifest.xml':data=bytes(m)
  elif n=='assets/capacitor.config.json':data=(json.dumps(config,ensure_ascii=False,indent=2)+'\n').encode()
  elif n.startswith('assets/public/') and not n.endswith('/'):
   data=(assets/n[len('assets/public/'):]).read_bytes()
  if data!=old:changed.append(n)
  put(w,entry,data);written.add(n)
 for file in sorted(assets.rglob('*')):
  if not file.is_file():continue
  n='assets/public/'+file.relative_to(assets).as_posix()
  if n in written:continue
  entry=zipfile.ZipInfo(n);entry.compress_type=zipfile.ZIP_DEFLATED;put(w,entry,file.read_bytes());changed.append(n)
expected={'AndroidManifest.xml','assets/capacitor.config.json',*[f'assets/public/{n}' for n in ['index.html','social-auth.js','native.js','android-ui.css','build-info.json']]}
assert set(changed)==expected,changed
with zipfile.ZipFile(out) as check:
 assert check.testzip() is None
 for entry in check.infolist():
  if entry.compress_type!=zipfile.ZIP_STORED:continue
  with out.open('rb') as f:f.seek(entry.header_offset+26);name,extra=struct.unpack('<HH',f.read(4))
  offset=entry.header_offset+30+name+extra
  assert offset%(16384 if entry.filename.endswith('.so') else 4)==0,entry.filename
result={'versionName':info['versionName'],'versionCode':42,'packageName':'kr.co.manee.app.staging','backend':'manee-staging','changedEntries':changed,'nativeClassesAndResourcesUnchanged':True,'storedAlignmentVerified':True,'baselineSha256':hashlib.sha256(base.read_bytes()).hexdigest()}
out.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
