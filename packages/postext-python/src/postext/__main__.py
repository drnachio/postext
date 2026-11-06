"""``python -m postext pdf book.postext -o book.pdf``: the command line itself,
downloaded on first use like the functions'."""

import sys

from ._client import _main

sys.exit(_main())
