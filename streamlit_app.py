"""Streamlit Community Cloud entrypoint.

Cloud runs this file from the repository root, which keeps `ui` importable.
For local Docker use the same file (see docker/Dockerfile.streamlit).
"""
from ui.app import main

main()
