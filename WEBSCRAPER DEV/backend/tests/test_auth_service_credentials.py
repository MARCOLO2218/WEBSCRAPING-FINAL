import os
from pathlib import Path
import pytest
from catalog_api import auth_runtime


def private_file(tmp_path, content):
    path = tmp_path / 'credential'
    path.write_bytes(content)
    path.chmod(0o600)
    return path


def test_password_file_preserves_exact_value_without_prompt(tmp_path, monkeypatch):
    path = private_file(tmp_path, 'clave con espacios á'.encode('utf-8'))
    def unexpected_prompt(*args):
        raise AssertionError('No debe pedir contraseña')
    monkeypatch.setattr(auth_runtime.getpass, 'getpass', unexpected_prompt)
    assert auth_runtime.load_password(path) == 'clave con espacios á'


def test_interactive_mode_is_preserved(monkeypatch):
    monkeypatch.setattr(auth_runtime.getpass, 'getpass', lambda *args: 'interactive')
    assert auth_runtime.load_password(None) == 'interactive'


@pytest.mark.parametrize('content', [b'', b'x' * 4097, b'invalid\x00password', b'\xff'])
def test_invalid_files_rejected(tmp_path, content):
    path = private_file(tmp_path, content)
    with pytest.raises((ValueError, UnicodeError)):
        auth_runtime.read_password(path)


@pytest.mark.skipif(os.name == 'nt', reason='Permisos POSIX; Windows usa ACL')
def test_world_readable_and_symlink_rejected(tmp_path):
    path = private_file(tmp_path, b'password')
    path.chmod(0o644)
    with pytest.raises(ValueError): auth_runtime.read_password(path)
    path.chmod(0o600)
    link = tmp_path / 'link'
    link.symlink_to(path)
    with pytest.raises(ValueError): auth_runtime.read_password(link)


def test_service_passes_only_file_references_not_password_environment():
    root = Path(__file__).resolve().parents[2]
    service = (root / 'deploy/ubuntu/facenco-auth-dev.service').read_text()
    assert 'LoadCredential=postgres-password:' in service
    assert '--password-file %d/postgres-password' in service
    assert '--hmac-file %d/auth-hmac' in service
    assert 'Restart=on-failure' in service
    assert 'PGPASSWORD' not in service
    assert 'DATABASE_URL' not in service


def test_systemd_readonly_group_permissions_are_scoped_to_credential_directory():
    directory = '/run/credentials/facenco-auth-dev.service'
    path = directory + '/auth-hmac'
    check = auth_runtime.systemd_credential_permissions
    assert check(path, directory, 0o440, 0o750, 1000, 0, 1000)
    assert check(path, directory, 0o440, 0o500, 0, 1000, 1000)
    assert not check(path, None, 0o440, 0o750, 1000, 0, 1000)
    assert not check('/home/user/key', '/home/user', 0o440, 0o700, 1000, 1000, 1000)
    assert not check(path, directory, 0o444, 0o750, 1000, 0, 1000)
    assert not check(path, directory, 0o440, 0o755, 1000, 0, 1000)
    assert not check(path, directory, 0o440, 0o770, 1000, 0, 1000)
    assert not check(path, directory, 0o440, 0o750, 2000, 0, 1000)
    assert not check('/run/credentials/other.service/key', directory, 0o440, 0o750, 1000, 0, 1000)


@pytest.mark.skipif(os.name == 'nt', reason='Permisos POSIX')
def test_normal_group_readable_file_still_rejected(tmp_path, monkeypatch):
    path = private_file(tmp_path, b'password')
    path.chmod(0o440)
    monkeypatch.setenv('CREDENTIALS_DIRECTORY', str(tmp_path))
    with pytest.raises(ValueError): auth_runtime.read_password(path)
