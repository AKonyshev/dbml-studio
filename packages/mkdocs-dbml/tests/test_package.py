import importlib.metadata


def test_the_package_is_installed_under_its_published_name():
    assert importlib.metadata.version("mkdocs-dbml") == "0.1.0"
