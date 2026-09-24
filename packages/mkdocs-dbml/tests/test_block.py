from mkdocs_dbml.block import Block, BlockError, parse_block


def test_a_block_without_a_model_line_is_not_ours():
    # ```dbml has meant "highlight this DBML" on pages about the language for
    # as long as the language has existed. Those pages must not change.
    assert parse_block("Table users {\n  id integer [pk]\n}") is None


def test_model_part_way_along_a_line_does_not_make_it_ours():
    assert parse_block("Note: 'the model: users'") is None


def test_reads_every_key():
    assert parse_block(
        "model: /models/acl.dbml\n"
        "tables: analysis, analysis_liquid\n"
        "height: 600\n"
        "theme: dark"
    ) == Block(
        model="/models/acl.dbml",
        tables=("analysis", "analysis_liquid"),
        height=600,
        theme="dark",
    )


def test_only_model_is_required():
    assert parse_block("model: acl.dbml") == Block(
        model="acl.dbml", tables=None, height=None, theme=None
    )


def test_tables_as_a_yaml_list():
    assert parse_block("model: a.dbml\ntables: [x, y]").tables == ("x", "y")


def test_tables_keep_dotted_and_spaced_names():
    assert parse_block("model: a.dbml\ntables: acl.analysis, my table").tables == (
        "acl.analysis",
        "my table",
    )


def test_no_names_means_the_whole_model():
    assert parse_block("model: a.dbml\ntables:").tables is None
    assert parse_block("model: a.dbml\ntables: ' , '").tables is None
    assert parse_block("model: a.dbml\ntables: []").tables is None


def test_an_unknown_key_is_named():
    result = parse_block("model: a.dbml\ntabels: x")
    assert isinstance(result, BlockError)
    assert "`tabels`" in result.message


def test_a_key_given_twice_is_refused_rather_than_the_last_winning():
    # YAML keeps the last value without a word. An author who wrote `tables:`
    # twice meant one of them, and nobody can say which.
    assert parse_block("model: a.dbml\nmodel: b.dbml") == BlockError(
        "`model` is given more than once"
    )


def test_an_empty_model_is_an_error():
    assert isinstance(parse_block("model:"), BlockError)
    assert isinstance(parse_block("model: '  '"), BlockError)


def test_a_model_that_is_not_a_path_is_an_error():
    assert isinstance(parse_block("model: [a, b]"), BlockError)


def test_height_is_a_positive_whole_number_of_pixels():
    for line in (
        "height: 0",
        "height: -5",
        "height: 600px",
        "height: 1.5",
        "height: true",
    ):
        assert isinstance(parse_block(f"model: a.dbml\n{line}"), BlockError), line


def test_theme_is_light_or_dark():
    assert isinstance(parse_block("model: a.dbml\ntheme: solarized"), BlockError)
    # YAML 1.1 reads `yes` as true; that is not a theme either.
    assert isinstance(parse_block("model: a.dbml\ntheme: yes"), BlockError)


def test_tables_that_are_not_names_are_an_error():
    assert isinstance(parse_block("model: a.dbml\ntables: [1, 2]"), BlockError)
    assert isinstance(parse_block("model: a.dbml\ntables: {a: b}"), BlockError)


def test_broken_yaml_in_a_block_that_names_a_model_is_an_error_not_code():
    # It has a `model:` line, so it is ours: the author meant a diagram, and a
    # block of code where a diagram was meant is a mistake nobody would notice.
    assert isinstance(parse_block("model: a.dbml\ntables: [x"), BlockError)
