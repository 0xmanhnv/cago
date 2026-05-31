import os
import sys

# Ensure the service root is importable so `from app import ...` works under pytest.
sys.path.insert(0, os.path.dirname(__file__))
