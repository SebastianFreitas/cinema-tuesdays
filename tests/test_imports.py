import importlib
import pkgutil
import unittest

import bot.cogs

# bot.__main__ starts the bot, so it is never imported here.
MODULES = ["bot.config", "bot.db", "bot.export", "bot.tmdb", "bot.util"] + [
    f"bot.cogs.{m.name}" for m in pkgutil.iter_modules(bot.cogs.__path__)]


class ImportTests(unittest.TestCase):
    def test_every_module_imports(self):
        # Catches missing packages, e.g. tzdata on Windows (bot.util needs the Europe/Lisbon time zone).
        for name in MODULES:
            with self.subTest(module=name):
                importlib.import_module(name)


if __name__ == "__main__":
    unittest.main()
