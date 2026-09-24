from pathlib import Path

import pytest

from mkdocs_dbml.paths import (
    EXTERNAL_PREFIX,
    ExternalModels,
    PathError,
    ResolvedModel,
    resolve_model,
)

MODEL = "Table a {\n  id integer\n}\n"


@pytest.fixture
def project(tmp_path: Path) -> Path:
    for path in (
        "docs/models/acl.dbml",
        "docs/guide/local.dbml",
        "models/to-be/ext.dbml",
        "models/a/dup.dbml",
        "models/b/dup.dbml",
    ):
        (tmp_path / path).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / path).write_text(MODEL)
    return tmp_path


def resolve(
    project: Path, model: str, page: str = "guide/page.md", served=lambda uri: True
):
    return resolve_model(model, page, project / "docs", project, served=served)


def test_a_leading_slash_starts_at_the_docs_root(project):
    assert resolve(project, "/models/acl.dbml") == ResolvedModel(
        (project / "docs/models/acl.dbml").resolve(), "models/acl.dbml", external=False
    )


def test_otherwise_the_path_starts_at_the_page_folder(project):
    assert resolve(project, "local.dbml").site_path == "guide/local.dbml"
    assert resolve(project, "../models/acl.dbml").site_path == "models/acl.dbml"


def test_a_page_at_the_docs_root(project):
    assert (
        resolve(project, "models/acl.dbml", page="index.md").site_path
        == "models/acl.dbml"
    )


def test_a_model_outside_docs_lands_under_the_plugins_folder(project):
    assert resolve(project, "/../models/to-be/ext.dbml") == ResolvedModel(
        (project / "models/to-be/ext.dbml").resolve(),
        EXTERNAL_PREFIX + "models/to-be/ext.dbml",
        external=True,
    )


def test_a_model_in_docs_the_site_leaves_out_is_copied_like_an_outside_one(project):
    assert resolve(
        project, "/models/acl.dbml", served=lambda uri: uri != "models/acl.dbml"
    ) == ResolvedModel(
        (project / "docs/models/acl.dbml").resolve(),
        EXTERNAL_PREFIX + "docs/models/acl.dbml",
        external=True,
    )


def test_a_path_that_leaves_the_project_is_refused_without_saying_where_it_went(
    project,
):
    result = resolve(project, "/../../secret.dbml")
    assert isinstance(result, PathError)
    assert "outside the project" in result.message
    # The page is published; the build machine's directories are nobody's business.
    assert str(project.parent) not in result.message


def test_a_missing_model_says_where_it_looked_relative_to_the_project(project):
    assert resolve(project, "/models/nope.dbml") == PathError(
        "no model at `docs/models/nope.dbml` (from `/models/nope.dbml`)"
    )


def test_a_directory_is_not_a_model(project):
    assert isinstance(resolve(project, "/models"), PathError)


def test_a_symlink_that_leads_out_of_the_project_is_refused(project, tmp_path_factory):
    elsewhere = tmp_path_factory.mktemp("elsewhere") / "x.dbml"
    elsewhere.write_text(MODEL)
    (project / "docs/models/link.dbml").symlink_to(elsewhere)
    assert isinstance(resolve(project, "/models/link.dbml"), PathError)


def test_the_same_external_model_named_twice_is_one_copy(project):
    externals = ExternalModels(taken=set())
    model = resolve(project, "/../models/to-be/ext.dbml")
    assert externals.add(model) is None
    assert externals.add(model) is None
    assert externals.items() == [(model.site_path, model.source)]


def test_a_model_inside_docs_is_not_the_plugins_to_copy(project):
    externals = ExternalModels(taken=set())
    assert externals.add(resolve(project, "/models/acl.dbml")) is None
    assert externals.items() == []


def test_an_external_model_may_not_land_on_a_file_the_site_already_has(project):
    model = resolve(project, "/../models/to-be/ext.dbml")
    error = ExternalModels(taken={model.site_path}).add(model)
    assert isinstance(error, PathError)
    assert model.site_path in error.message


def test_two_external_models_sharing_a_basename_get_distinct_site_paths(project):
    a = resolve(project, "/../models/a/dup.dbml")
    b = resolve(project, "/../models/b/dup.dbml")
    assert a.site_path != b.site_path
    assert a.site_path == EXTERNAL_PREFIX + "models/a/dup.dbml"
    assert b.site_path == EXTERNAL_PREFIX + "models/b/dup.dbml"

    externals = ExternalModels(taken=set())
    assert externals.add(a) is None
    assert externals.add(b) is None
    assert externals.items() == sorted(
        [(a.site_path, a.source), (b.site_path, b.source)]
    )
