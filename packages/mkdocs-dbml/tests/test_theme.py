from mkdocs_dbml.theme import dark_scheme_of, initial_theme

TOGGLE = [{"scheme": "default"}, {"scheme": "slate"}]


def test_no_palette_names_no_dark_scheme():
    assert dark_scheme_of(None) is None


def test_a_palette_given_as_one_entry():
    assert dark_scheme_of({"scheme": "slate"}) == "slate"


def test_the_one_scheme_that_is_not_default_is_the_dark_one():
    assert dark_scheme_of([{"scheme": "default"}, {"scheme": "midnight"}]) == "midnight"


def test_two_candidates_are_not_guessed_between():
    assert (
        dark_scheme_of([{"scheme": "default"}, {"scheme": "a"}, {"scheme": "b"}])
        is None
    )


def test_entries_without_a_scheme_are_skipped():
    assert dark_scheme_of([{"primary": "red"}, {"scheme": "slate"}]) == "slate"


def test_the_block_decides_first():
    assert initial_theme("dark", "light", TOGGLE) == "dark"


def test_then_the_plugin_config():
    assert initial_theme(None, "dark", TOGGLE) == "dark"


def test_then_the_first_palette_entry():
    assert initial_theme(None, None, TOGGLE) == "light"
    assert initial_theme(None, None, list(reversed(TOGGLE))) == "dark"


def test_a_custom_dark_scheme_first_opens_dark():
    assert (
        initial_theme(None, None, [{"scheme": "midnight"}, {"scheme": "default"}])
        == "dark"
    )


def test_otherwise_light():
    assert initial_theme(None, None, None) == "light"
