"""Use the ASCC bundle importer for the APMC umbrella command."""

from common.management.commands.import_ascc_bundle import Command as AsccCommand


class Command(AsccCommand):
    help = "Import an ASCC bundle with the same review and maintenance options as ascc import."
