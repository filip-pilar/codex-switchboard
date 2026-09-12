import hashlib,json,pathlib,tarfile
root=pathlib.Path(__file__).resolve().parent.parent/'references'
for source in json.loads((root/'manifest.json').read_text())['sources']:
    archive=root/source['archive']
    assert hashlib.sha256(archive.read_bytes()).hexdigest()==source['sha256'],source['name']
    target=root/'extracted'
    with tarfile.open(archive) as tar:
        for member in tar.getmembers():
            path=pathlib.PurePosixPath(member.name)
            assert not path.is_absolute() and '..' not in path.parts,member.name
            assert member.isfile() or member.isdir(),f'Unsafe member: {member.name}'
        target.mkdir(parents=True,exist_ok=True)
        tar.extractall(target,filter='data')
    for entry in source.get('files',[]):
        assert hashlib.sha256((target/source['name']/entry['path']).read_bytes()).hexdigest()==entry['sha256'],entry['path']
    print(source['name']+': archive and recorded file hashes verified')
