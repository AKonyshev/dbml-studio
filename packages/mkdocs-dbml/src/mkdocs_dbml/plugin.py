"""The MkDocs plugin: ```dbml blocks become diagram frames.

Everything that can be decided without MkDocs is decided elsewhere — block.py,
paths.py, theme.py, html.py, validate.py, vendor.py, extension.py. This file
only wires them to the build's events.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from mkdocs.config import base
from mkdocs.config import config_options as c
from mkdocs.config.defaults import MkDocsConfig
from mkdocs.exceptions import PluginError
from mkdocs.livereload import LiveReloadServer
from mkdocs.plugins import BasePlugin, get_plugin_logger
from mkdocs.structure.files import File, Files
from mkdocs.structure.pages import Page
from mkdocs.utils import get_relative_url

from mkdocs_dbml import validate, vendor
from mkdocs_dbml.block import BlockError, parse_block
from mkdocs_dbml.extension import DbmlExtension
from mkdocs_dbml.html import FRAME_PATH, error_html, frame_html
from mkdocs_dbml.paths import ExternalModels, PathError, resolve_model
from mkdocs_dbml.theme import dark_scheme_of, initial_theme

log = get_plugin_logger(__name__)

HOST_SCRIPT = "_dbml/frame-host.js"
HOST_STYLE = "_dbml/frame-host.css"


class DbmlConfig(base.Config):
    height = c.Type(int, default=500)
    theme = c.Optional(c.Choice(("light", "dark")))
    # Named `validate_`: `base.Config` (mkdocs 1.6.1) defines a `validate()`
    # method that `BasePlugin.load_config` calls on this very object, and a
    # same-named option descriptor on the subclass shadows it, breaking every
    # plugin config load with `TypeError: 'bool' object is not callable`. The
    # trailing underscore is mkdocs's own escape hatch (`BaseConfigOption.
    # __set_name__` strips it) — the option's key in mkdocs.yml stays `validate`.
    validate_ = c.Type(bool, default=True)


class DbmlPlugin(BasePlugin[DbmlConfig]):
    def __init__(self) -> None:
        self._reset()

    def _reset(self) -> None:
        self._page: Page | None = None
        self._ordinal = 0
        self._externals = ExternalModels(taken=set())
        self._to_validate: list[validate.ValidationBlock] = []
        self._docs_dir = Path()
        self._project_dir = Path()
        self._palette: object = None

    def on_config(self, config: MkDocsConfig) -> MkDocsConfig:
        # `build()` runs this on every build, and a caller that builds twice
        # from one config — a test does, and so might a tool — would otherwise
        # get two script tags and two copies of the extension.
        if not any(str(item) == HOST_SCRIPT for item in config.extra_javascript):
            config.extra_javascript.append(HOST_SCRIPT)
        if not any(str(item) == HOST_STYLE for item in config.extra_css):
            config.extra_css.append(HOST_STYLE)
        if not any(
            isinstance(ext, DbmlExtension) for ext in config.markdown_extensions
        ):
            config.markdown_extensions.append(DbmlExtension(self._render))
        log.debug(
            f"frame from DBML Studio {vendor.build_id(vendor.vendor_dir()) or '(unnamed build)'}"
        )
        return config

    def on_pre_build(self, *, config: MkDocsConfig) -> None:
        # Every build starts clean. `mkdocs serve` loads a fresh config, and so
        # a fresh plugin, for each rebuild — but `build()` may be called twice
        # with one config, as a test does, and a block or a model from the last
        # build must not be validated or copied again in this one.
        self._reset()
        self._docs_dir = Path(config.docs_dir)
        self._project_dir = Path(config.config_file_path).parent
        self._palette = config.theme.get("palette")

    def on_files(self, files: Files, /, *, config: MkDocsConfig) -> Files:
        try:
            shipped = vendor.frame_files(vendor.vendor_dir())
        except vendor.VendorMissing as error:
            raise PluginError(str(error)) from error

        taken = {file.dest_uri for file in files}
        for site_path, source in shipped:
            if site_path in taken:
                raise PluginError(
                    f"docs_dir already has `{site_path}`, where the diagram frame goes"
                )
            files.append(File.generated(config, site_path, abs_src_path=str(source)))

        self._externals = ExternalModels(taken=taken)
        return files

    def on_page_markdown(
        self, markdown: str, /, *, page: Page, config: MkDocsConfig, files: Files
    ) -> str:
        # The Markdown extension is handed no page; it reads this one.
        self._page = page
        self._ordinal = 0
        return markdown

    def _render(self, body: str) -> str | None:
        parsed = parse_block(body)
        if parsed is None:
            return None

        page = self._page
        assert page is not None, "a page is always being rendered when a block is"
        self._ordinal += 1
        where = f"{page.file.src_uri}, block {self._ordinal}"

        if isinstance(parsed, BlockError):
            return self._refuse(where, parsed.message)

        resolved = resolve_model(
            parsed.model, page.file.src_uri, self._docs_dir, self._project_dir
        )
        if isinstance(resolved, PathError):
            return self._refuse(where, resolved.message)

        clash = self._externals.add(resolved)
        if clash is not None:
            return self._refuse(where, clash.message)

        try:
            text = resolved.source.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return self._refuse(where, f"`{parsed.model}` is not UTF-8 text")

        self._to_validate.append(
            validate.ValidationBlock(
                id=where, model=parsed.model, text=text, tables=parsed.tables
            )
        )

        return frame_html(
            frame_url=get_relative_url(FRAME_PATH, page.url),
            model_url=get_relative_url(resolved.site_path, FRAME_PATH),
            tables=parsed.tables,
            height=parsed.height or self.config.height,
            theme=initial_theme(parsed.theme, self.config.theme, self._palette),
            title=Path(parsed.model).name,
            fixed_theme=parsed.theme is not None or self.config.theme is not None,
            dark_scheme=dark_scheme_of(self._palette),
        )

    def _refuse(self, where: str, message: str) -> str:
        # In the page, where the reader will see the gap, and in the log, where
        # `mkdocs build --strict` will refuse to publish it.
        log.warning(f"{where}: {message}")
        return error_html(message)

    def on_post_build(self, *, config: MkDocsConfig) -> None:
        site = Path(config.site_dir)
        for site_path, source in self._externals.items():
            target = site / site_path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)

        if not self.config.validate_ or not self._to_validate:
            return

        node = validate.find_node()
        script = vendor.validator_script(vendor.vendor_dir())
        if node is None or script is None:
            log.warning(
                "the DBML models were not checked: "
                + (
                    "`node` is not on PATH"
                    if node is None
                    else "the validator is not in the package"
                )
            )
            return

        try:
            findings = validate.run_validator(node, script, self._to_validate)
        except validate.ValidatorFailed as error:
            log.warning(f"the DBML models were not checked: {error}")
            return

        for finding in findings:
            log.warning(f"{finding.id}: {finding.model}: {finding.problem}")

    def on_serve(
        self, server: LiveReloadServer, /, *, config: MkDocsConfig, builder
    ) -> LiveReloadServer:
        # A model outside docs_dir is not something MkDocs watches. Only the
        # folders known after the first build are watched; a block that names a
        # new outside folder needs `mkdocs serve` restarted.
        for folder in sorted({source.parent for _, source in self._externals.items()}):
            server.watch(str(folder))
        return server
