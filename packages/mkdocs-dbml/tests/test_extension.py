import markdown

from mkdocs_dbml.extension import DbmlExtension


def convert(text, render, extensions=("fenced_code",)):
    return markdown.markdown(text, extensions=[DbmlExtension(render), *extensions])


def test_our_block_becomes_what_render_returns():
    html = convert(
        "```dbml\nmodel: a.dbml\n```\n", lambda body: f'<div class="x">{body}</div>'
    )
    assert '<div class="x">model: a.dbml</div>' in html


def test_a_block_render_declines_stays_code():
    html = convert("```dbml\nTable a {\n}\n```\n", lambda body: None)
    assert "<code" in html
    assert "Table a" in html


def test_other_fences_are_left_to_the_highlighter():
    html = convert("```python\nx = 1\n```\n", lambda body: "NOT THIS")
    assert "NOT THIS" not in html
    assert "<code" in html


def test_every_block_on_a_page_is_rendered_in_order():
    seen = []

    def render(body):
        seen.append(body)
        return f"<p>{len(seen)}</p>"

    convert(
        "```dbml\nmodel: a.dbml\n```\n\ntext\n\n```dbml\nmodel: b.dbml\n```\n", render
    )
    assert seen == ["model: a.dbml", "model: b.dbml"]


def test_a_longer_fence_is_closed_only_by_one_as_long():
    seen = []
    convert(
        "````dbml\nmodel: a.dbml\n```\n````\n",
        lambda body: seen.append(body) or "<p></p>",
    )
    assert seen == ["model: a.dbml\n```"]


def test_an_unclosed_fence_is_left_alone():
    seen = []
    convert("```dbml\nmodel: a.dbml\n", lambda body: seen.append(body) or "<p></p>")
    assert seen == []


def test_it_gets_there_before_superfences():
    html = convert(
        "```dbml\nmodel: a.dbml\n```\n",
        lambda body: '<div class="x"></div>',
        extensions=("pymdownx.superfences",),
    )
    assert '<div class="x"></div>' in html


def test_a_dbml_example_inside_another_fence_is_left_verbatim():
    seen = []
    convert(
        "````markdown\n```dbml\nmodel: a.dbml\n```\n````\n",
        lambda body: seen.append(body) or "<p></p>",
    )
    assert seen == []


def test_a_dbml_example_inside_a_tilde_fence_is_left_verbatim():
    seen = []
    convert(
        "~~~text\n```dbml\nmodel: a.dbml\n```\n~~~\n",
        lambda body: seen.append(body) or "<p></p>",
    )
    assert seen == []


def test_a_real_block_after_a_closed_other_fence_is_still_claimed():
    seen = []
    convert(
        "~~~text\nsomething\n~~~\n\n```dbml\nmodel: a.dbml\n```\n",
        lambda body: seen.append(body) or "<p></p>",
    )
    assert seen == ["model: a.dbml"]
