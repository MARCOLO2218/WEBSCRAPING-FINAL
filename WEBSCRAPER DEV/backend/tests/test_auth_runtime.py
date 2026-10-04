import pytest
from catalog_api.auth_runtime import validate_origin, read_key, main


def test_runtime_requires_https_origin():
    assert validate_origin('https://catalog.example') == 'https://catalog.example'
    for origin in ['http://172.16.247.6:3030', 'https://catalog.example/path', 'https://user:pass@catalog.example']:
        with pytest.raises(ValueError): validate_origin(origin)


def test_runtime_reads_only_existing_private_key(tmp_path):
    key = tmp_path / 'hmac.key'
    with pytest.raises(FileNotFoundError): read_key(key)
    key.write_bytes(b'x' * 32); key.chmod(0o600)
    assert read_key(key) == b'x' * 32
    key.write_bytes(b'short')
    with pytest.raises(ValueError): read_key(key)


def test_runtime_refuses_launch_without_origin_and_key():
    with pytest.raises(SystemExit): main(['--db-host', '127.0.0.1'])
