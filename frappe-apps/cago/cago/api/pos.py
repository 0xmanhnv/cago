# Copyright (c) 2026, AgriMate and contributors
# For license information, please see license.txt
"""POS bridge API (later milestone).

Thin helpers to open native ERPNext POS or POS Awesome from the staff screen, and
(if POS Awesome evaluation passes) to convert a wanted list into a POS cart. Must
stay thin: native POS is the mandatory fallback and no core business data may live
only in POS-specific code.

Intentionally empty in Milestone 0/1. See docs/20_POS_AWESOME_EVALUATION_NOTES.md.
"""
