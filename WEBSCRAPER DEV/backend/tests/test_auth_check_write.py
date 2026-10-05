from fastapi.testclient import TestClient
from catalog_api.auth_app import create_auth_app
from catalog_api.auth_routes import CSRF_COOKIE, CSRF_HEADER
from catalog_api.access.dependencies import SESSION_COOKIE


class Repository:
    def __init__(self):
        self.calls = []
        self.valid = True

    def csrf_matches_session(self, token, csrf):
        self.calls.append((token, csrf))
        return self.valid


def test_check_write_checks_origin_cookie_and_database_without_mutating():
    repo = Repository()
    app = create_auth_app(repo, throttle=object(), allowed_origins=['https://testserver'])
    with TestClient(app, base_url='https://testserver') as client:
        client.cookies.set(SESSION_COOKIE, 'session')
        client.cookies.set(CSRF_COOKIE, 'csrf')
        assert client.post('/auth/check-write').status_code == 403
        assert repo.calls == []
        headers = {'Origin': 'https://testserver', CSRF_HEADER: 'wrong'}
        assert client.post('/auth/check-write', headers=headers).status_code == 403
        assert repo.calls == []
        headers[CSRF_HEADER] = 'csrf'
        response = client.post('/auth/check-write', headers=headers)
        assert response.status_code == 204
        assert response.headers['cache-control'] == 'no-store'
        assert repo.calls == [('session', 'csrf')]
        repo.valid = False
        assert client.post('/auth/check-write', headers=headers).status_code == 403


def test_check_write_hides_backend_errors():
    class Broken(Repository):
        def csrf_matches_session(self, *args):
            raise RuntimeError('private database detail')
    app = create_auth_app(Broken(), throttle=object(), allowed_origins=['https://testserver'])
    with TestClient(app, base_url='https://testserver') as client:
        client.cookies.set(CSRF_COOKIE, 'csrf')
        response = client.post('/auth/check-write', headers={
            'Origin': 'https://testserver', CSRF_HEADER: 'csrf'})
        assert response.status_code == 503
        assert 'private' not in response.text
