import uvicorn

from .config import load_settings


def main() -> None:
    settings = load_settings()
    uvicorn.run("catalog_api.main:app", host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
