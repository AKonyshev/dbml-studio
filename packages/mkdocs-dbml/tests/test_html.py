from mkdocs_dbml.html import error_html, frame_html


def frame(**overrides):
    arguments = {
        "frame_url": "../_dbml/embed.html",
        "model_url": "../models/acl.dbml",
        "tables": None,
        "height": 500,
        "theme": "light",
        "title": "acl.dbml",
        "fixed_theme": False,
        "dark_scheme": None,
    }
    arguments.update(overrides)
    return frame_html(**arguments)


def test_the_wrapper_and_frame_the_host_script_expects():
    html = frame()
    assert html.startswith('<div class="dbml-diagram">')
    assert (
        '<iframe src="../_dbml/embed.html?model=..%2Fmodels%2Facl.dbml&amp;theme=light"'
        in html
    )
    assert 'width="100%"' in html
    assert 'height="500"' in html
    # A documentation page may carry several frames; none should load before
    # anyone has scrolled to it.
    assert 'loading="lazy"' in html


def test_tables_travel_in_the_query():
    assert "tables=analysis%2Cacl.liquid" in frame(tables=("analysis", "acl.liquid"))


def test_a_fixed_theme_marks_the_wrapper():
    assert frame(fixed_theme=True).startswith(
        '<div class="dbml-diagram" data-dbml-theme-fixed>'
    )


def test_the_dark_scheme_is_named_on_the_wrapper():
    assert 'data-dbml-dark-scheme="midnight"' in frame(dark_scheme="midnight")


def test_nothing_the_author_wrote_reaches_the_page_unescaped():
    html = frame(title='a"<b>.dbml', model_url='../m/"x".dbml')
    assert "<b>" not in html
    assert "a&quot;&lt;b&gt;.dbml" in html


def test_an_error_is_shown_escaped():
    html = error_html("unknown key `<x>`")
    assert "&lt;x&gt;" in html
    assert "dbml-diagram-error" in html
