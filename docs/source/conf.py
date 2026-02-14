from __future__ import annotations

from datetime import date

project = "SolarisEngine"
author = "SolarisEngine contributors"
copyright = f"{date.today().year}, {author}"

extensions = [
    "myst_parser",
]

# Keep this list small to avoid extra dependencies in the conda env.
myst_enable_extensions = [
    "deflist",
    "tasklist",
]
myst_heading_anchors = 3

# The README pages include links to repo files/folders (not Sphinx pages).
# Silence those warnings to keep builds clean.
suppress_warnings = ["myst.xref_missing"]

templates_path = ["_templates"]
exclude_patterns = ["_build", "build", "Thumbs.db", ".DS_Store"]

html_theme = "furo"
html_static_path = ["_static"]
html_title = project

# Support both Markdown and reStructuredText sources.
source_suffix = {
    ".rst": "restructuredtext",
    ".md": "markdown",
}
