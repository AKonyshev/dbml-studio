from pathlib import Path

import pytest

from mkdocs_dbml.validate import (
    Finding,
    ValidationBlock,
    ValidatorFailed,
    find_node,
    run_validator,
)

# Stands in for dist/validate.mjs: speaks its protocol, checks one thing.
FINDS_NOPE = r"""
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const { blocks } = JSON.parse(raw);
  const findings = blocks
    .filter((block) => (block.tables ?? []).includes("nope"))
    .map((block) => ({ id: block.id, model: block.model, problem: "Table not found: nope" }));
  process.stdout.write(JSON.stringify({ findings }));
});
"""

# Answers with what it was sent, so the job's shape can be checked.
ECHOES_TABLES = r"""
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const { blocks } = JSON.parse(raw);
  process.stdout.write(JSON.stringify({ findings: blocks.map((block) => ({
    id: block.id, model: block.model, problem: JSON.stringify(block.tables),
  })) }));
});
"""

FAILS = 'process.stderr.write("could not parse the job\\n"); process.exit(3);'
GARBAGE = 'process.stdout.write("this is not json");'

# Always reports the same non-ASCII finding, regardless of the job sent.
NON_ASCII_FINDING = r"""
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const { blocks } = JSON.parse(raw);
  process.stdout.write(JSON.stringify({ findings: blocks.map((block) => ({
    id: block.id, model: block.model, problem: "нет таблицы «заказы»",
  })) }));
});
"""


@pytest.fixture
def node() -> str:
    found = find_node()
    assert found is not None, "node must be on PATH for these tests"
    return found


def script(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "validate.mjs"
    path.write_text(body, encoding="utf-8")
    return path


def block(id: str = "page.md, block 1", tables=None) -> ValidationBlock:
    return ValidationBlock(
        id=id, model="acl.dbml", text="Table a {\n  id int\n}\n", tables=tables
    )


def test_findings_come_back_with_the_id_untouched(node, tmp_path):
    blocks = [block("a.md, block 1", ("nope",)), block("b.md, block 2", ("fine",))]
    assert run_validator(node, script(tmp_path, FINDS_NOPE), blocks) == [
        Finding(id="a.md, block 1", model="acl.dbml", problem="Table not found: nope")
    ]


def test_a_clean_job_has_no_findings(node, tmp_path):
    assert run_validator(node, script(tmp_path, FINDS_NOPE), [block()]) == []


def test_no_filter_is_sent_as_null_and_a_filter_as_a_list(node, tmp_path):
    findings = run_validator(
        node, script(tmp_path, ECHOES_TABLES), [block("x", None), block("y", ("a",))]
    )
    assert [finding.problem for finding in findings] == ["null", '["a"]']


def test_a_validator_that_exits_non_zero_failed_rather_than_found_nothing(
    node, tmp_path
):
    with pytest.raises(ValidatorFailed, match="could not parse the job"):
        run_validator(node, script(tmp_path, FAILS), [block()])


def test_output_that_is_not_the_protocol_is_a_failure(node, tmp_path):
    with pytest.raises(ValidatorFailed):
        run_validator(node, script(tmp_path, GARBAGE), [block()])


def test_a_node_that_is_not_there_is_a_failure(tmp_path):
    with pytest.raises(ValidatorFailed):
        run_validator(
            str(tmp_path / "no-node-here"), script(tmp_path, FINDS_NOPE), [block()]
        )


def test_a_non_ascii_problem_comes_back_intact(node, tmp_path):
    findings = run_validator(node, script(tmp_path, NON_ASCII_FINDING), [block()])
    assert findings == [
        Finding(
            id="page.md, block 1",
            model="acl.dbml",
            problem="нет таблицы «заказы»",
        )
    ]
